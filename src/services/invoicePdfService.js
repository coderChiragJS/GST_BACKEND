const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { computeInvoiceTotals } = require('./invoiceCalculationService');
const {
    getStateByCode,
    getStateByGstin,
    getStateByName,
    getAllStates
} = require('../data/gstStates');

const s3Client = new S3Client({ region: process.env.REGION });
const BUCKET_NAME = process.env.UPLOADS_BUCKET;

// Preload and compile templates once per container
const TEMPLATE_IDS = ['classic', 'modern', 'minimal'];
const compiledTemplates = {};

// Quotation templates (separate from invoice; loaded on first use)
const QUOTATION_TEMPLATE_IDS = ['classic'];
const compiledQuotationTemplates = {};

// Sales Debit Note templates (very similar to invoice layout)
const SALES_DEBIT_NOTE_TEMPLATE_IDS = ['classic'];
const compiledSalesDebitNoteTemplates = {};

// Delivery Challan templates
const DELIVERY_CHALLAN_TEMPLATE_IDS = ['classic'];
const compiledDeliveryChallanTemplates = {};

// Payment Receipt templates
const RECEIPT_TEMPLATE_IDS = ['classic'];
const compiledReceiptTemplates = {};

function loadTemplatesOnce() {
    if (Object.keys(compiledTemplates).length > 0) return;

    TEMPLATE_IDS.forEach((id) => {
        const filePath = path.join(__dirname, '..', 'templates', 'invoices', `${id}.html`);
        try {
            const source = fs.readFileSync(filePath, 'utf8');
            compiledTemplates[id] = Handlebars.compile(source);
        } catch (err) {
            console.error(`Failed to load invoice template "${id}" from ${filePath}:`, err);
        }
    });

    // Basic helpers for formatting
    Handlebars.registerHelper('formatCurrency', function (value) {
        const num = typeof value === 'number' ? value : Number(value || 0);
        return num.toFixed(2);
    });

    Handlebars.registerHelper('inc', function (value) {
        return Number(value) + 1;
    });

    Handlebars.registerHelper('ifEq', function (a, b, options) {
        // eslint-disable-next-line eqeqeq
        return a == b ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('formatDate', function (value) {
        if (!value) return '';
        const str = String(value);
        const datePart = str.split('T')[0];
        const parts = datePart.split('-');
        if (parts.length !== 3) {
            return str;
        }
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    });

    Handlebars.registerHelper('numberToWords', function (value) {
        const num = typeof value === 'number' ? value : Number(value || 0);
        
        if (num === 0) return 'Zero Rupees Only';
        
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        
        function convertLessThanThousand(n) {
            if (n === 0) return '';
            if (n < 10) return ones[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) {
                const ten = Math.floor(n / 10);
                const one = n % 10;
                return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
            }
            const hundred = Math.floor(n / 100);
            const remainder = n % 100;
            return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + convertLessThanThousand(remainder) : '');
        }
        
        function convertNumber(n) {
            if (n === 0) return 'Zero';
            
            const crore = Math.floor(n / 10000000);
            n %= 10000000;
            const lakh = Math.floor(n / 100000);
            n %= 100000;
            const thousand = Math.floor(n / 1000);
            n %= 1000;
            const remainder = n;
            
            let result = '';
            
            if (crore > 0) {
                result += convertLessThanThousand(crore) + ' Crore ';
            }
            if (lakh > 0) {
                result += convertLessThanThousand(lakh) + ' Lakh ';
            }
            if (thousand > 0) {
                result += convertLessThanThousand(thousand) + ' Thousand ';
            }
            if (remainder > 0) {
                result += convertLessThanThousand(remainder);
            }
            
            return result.trim();
        }
        
        const rupees = Math.floor(num);
        const paise = Math.round((num - rupees) * 100);
        
        let result = convertNumber(rupees) + ' Rupees';
        
        if (paise > 0) {
            result += ' and ' + convertNumber(paise) + ' Paise';
        }
        
        result += ' Only';
        
        return result;
    });
}

/**
 * Build supply-type and place-of-supply context from doc (invoice/note/quotation/challan).
 * Use saved transportInfo.supplyTypeDisplay; do not recompute from buyer GSTIN.
 * Returns: isInterstate, showCgstSgst, summaryCgstAmount, summarySgstAmount, placeOfSupplyDisplay
 */
function getSupplyTypeContext(doc, seller, totals) {
    const transportInfo = doc.transportInfo || {};
    let isInterstate = transportInfo.supplyTypeDisplay === 'interstate';
    if (transportInfo.supplyTypeDisplay === 'intrastate') {
        isInterstate = false;
    } else if (
        transportInfo.supplyTypeDisplay !== 'interstate' &&
        transportInfo.placeOfSupplyStateCode &&
        seller.stateCode
    ) {
        const posCode = String(transportInfo.placeOfSupplyStateCode).trim().padStart(2, '0').slice(-2);
        const sellerCode = String(seller.stateCode).trim().padStart(2, '0').slice(-2);
        isInterstate = posCode !== sellerCode;
    } else {
        isInterstate = true;
    }
    const taxAmount = totals?.summary?.taxAmount ?? 0;
    const summaryCgstAmount = isInterstate ? 0 : Math.round((taxAmount / 2) * 100) / 100;
    const summarySgstAmount = isInterstate ? 0 : Math.round((taxAmount - summaryCgstAmount) * 100) / 100;
    const showCgstSgst = !isInterstate;
    const placeOfSupplyDisplay = transportInfo.placeOfSupply || transportInfo.placeOfSupplyStateName || '';
    return { isInterstate, showCgstSgst, summaryCgstAmount, summarySgstAmount, placeOfSupplyDisplay };
}

const COPY_TYPE_LABELS = {
    original: 'Original for Recipient',
    duplicate: 'Duplicate for Transporter',
    triplicate: 'Triplicate for Supplier'
};

function getCopyLabel(copyType) {
    const t = copyType && String(copyType).toLowerCase();
    return COPY_TYPE_LABELS[t] || COPY_TYPE_LABELS.original;
}

function getPdfKeySuffix(templateId, copyType) {
    const t = copyType && String(copyType).toLowerCase();
    if (t === 'duplicate' || t === 'triplicate') return `${templateId}_${t}.pdf`;
    return `${templateId}.pdf`;
}

/**
 * Parse state name (or code) from an address string for quotation place-of-supply.
 * Tries last line first; then tries matching known state names in the address.
 * Used only for quotation PDF when shippingAddress is present.
 */
function parseStateFromAddress(address) {
    if (!address || typeof address !== 'string') return null;
    const trimmed = address.trim();
    if (!trimmed) return null;
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        let state = getStateByName(lastLine);
        if (state) return state.name;
        const codeMatch = lastLine.match(/\b(\d{2})\b/);
        if (codeMatch) {
            state = getStateByCode(codeMatch[1]);
            if (state) return state.name;
        }
    }
    const allStates = getAllStates();
    let found = null;
    for (const s of allStates) {
        if (trimmed.toLowerCase().includes(s.name.toLowerCase())) {
            if (!found || s.name.length > found.length) found = s;
        }
    }
    return found ? found.name : null;
}

/**
 * Resolve place-of-supply for quotation PDF only (per BACKEND_QUOTATION_PLACE_OF_SUPPLY).
 * Uses seller.state or seller GSTIN; if shippingAddress present uses delivery state from it,
 * else uses buyerStateName or buyerGstin. Returns null if cannot determine.
 */
function getQuotationPlaceOfSupply(quotation) {
    const seller = quotation.seller || {};
    const sellerStateName = (seller.state && String(seller.state).trim()) || null;
    let sellerState = sellerStateName ? getStateByName(sellerStateName) : null;
    if (!sellerState && seller.gstNumber && String(seller.gstNumber).trim().length >= 2) {
        sellerState = getStateByGstin(String(seller.gstNumber).trim());
    }
    if (!sellerState) return null;

    const shippingAddress = quotation.shippingAddress && String(quotation.shippingAddress).trim();
    const buyerStateName = quotation.buyerStateName && String(quotation.buyerStateName).trim();
    const buyerStateCode = quotation.buyerStateCode && String(quotation.buyerStateCode).trim();
    const buyerGstin = quotation.buyerGstin && String(quotation.buyerGstin).trim();

    let placeState = null;
    if (shippingAddress) {
        const parsedName = parseStateFromAddress(shippingAddress);
        if (parsedName) placeState = getStateByName(parsedName);
    }
    if (!placeState && buyerGstin && buyerGstin.length >= 2) {
        placeState = getStateByGstin(buyerGstin);
    }
    if (!placeState && buyerStateCode) {
        placeState = getStateByCode(buyerStateCode);
    }
    if (!placeState && buyerStateName) {
        placeState = getStateByName(buyerStateName);
    }
    if (!placeState) return null;

    const supplyTypeDisplay =
        sellerState.code === placeState.code ? 'intrastate' : 'interstate';
    return {
        placeOfSupplyStateCode: placeState.code,
        placeOfSupplyStateName: placeState.name,
        supplyTypeDisplay
    };
}

/**
 * Build supply context for quotation PDF only. Uses getQuotationPlaceOfSupply (seller/shipping/buyer)
 * and item-level GST total. Do not use for invoice/challan/debit note.
 */
function getQuotationSupplyContext(quotation, totals) {
    const pos = getQuotationPlaceOfSupply(quotation);
    const taxAmount = totals?.summary?.taxAmount ?? 0;
    let isInterstate = true;
    let placeOfSupplyDisplay = '';
    if (pos) {
        isInterstate = pos.supplyTypeDisplay === 'interstate';
        placeOfSupplyDisplay = pos.placeOfSupplyStateName || '';
    }
    const summaryCgstAmount = isInterstate ? 0 : Math.round((taxAmount / 2) * 100) / 100;
    const summarySgstAmount = isInterstate ? 0 : Math.round((taxAmount - summaryCgstAmount) * 100) / 100;
    const showCgstSgst = !isInterstate;
    return {
        isInterstate,
        showCgstSgst,
        summaryCgstAmount,
        summarySgstAmount,
        placeOfSupplyDisplay
    };
}

async function renderInvoiceHtml(invoice, templateId, copyType = 'original') {
    loadTemplatesOnce();
    const template = compiledTemplates[templateId];
    if (!template) {
        throw new Error(`Template not found: ${templateId}`);
    }

    const copyLabel = getCopyLabel(copyType);
    const totals = computeInvoiceTotals(invoice);

    const seller = invoice.seller || {};
    const buyerAddress = invoice.buyerAddress || '';
    const shippingAddress = invoice.shippingAddress || buyerAddress;
    // Show shipping section if shippingAddress has value (even if same as billing)
    const showShippingAddress =
        !!(invoice.shippingAddress && String(invoice.shippingAddress).trim());

    const hasDispatchAddress = (() => {
        const d = seller.dispatchAddress;
        if (d == null) return false;
        if (typeof d === 'string') return d.trim() !== '';
        if (typeof d === 'object') return !!(d.street || d.city || d.state || d.pincode);
        return false;
    })();

    const bankDetails = invoice.bankDetails || {};
    const hasBankDetails = !!(
        bankDetails.bankName ||
        bankDetails.accountNumber ||
        bankDetails.ifscCode ||
        bankDetails.upiId
    );

    const transportInfo = invoice.transportInfo || {};
    const hasTransportInfo = !!(
        transportInfo.vehicleNumber ||
        transportInfo.mode ||
        transportInfo.transporterName ||
        transportInfo.transporterId ||
        transportInfo.docNo ||
        transportInfo.placeOfSupply ||
        transportInfo.placeOfSupplyStateName
    );

    const supplyContext = getSupplyTypeContext(invoice, seller, totals);

    const termsAndConditions = invoice.termsAndConditions || [];
    const customFields = invoice.customFields || [];

    const context = {
        invoice,
        seller,
        buyerAddress,
        shippingAddress,
        shippingName: invoice.shippingName || invoice.buyerName || '',
        shippingGstin: invoice.shippingGstin || invoice.buyerGstin || '',
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        ...supplyContext,
        termsAndConditions,
        customFields,
        totals,
        copyLabel
    };

    return template(context);
}

function loadSalesDebitNoteTemplatesOnce() {
    if (Object.keys(compiledSalesDebitNoteTemplates).length > 0) return;
    loadTemplatesOnce();
    SALES_DEBIT_NOTE_TEMPLATE_IDS.forEach((id) => {
        const filePath = path.join(
            __dirname,
            '..',
            'templates',
            'sales-debit-notes',
            `${id}.html`
        );
        try {
            const source = fs.readFileSync(filePath, 'utf8');
            compiledSalesDebitNoteTemplates[id] = Handlebars.compile(source);
        } catch (err) {
            console.error(
                `Failed to load sales debit note template "${id}" from ${filePath}:`,
                err
            );
        }
    });
}

async function renderSalesDebitNoteHtml(note, templateId, copyType = 'original') {
    loadSalesDebitNoteTemplatesOnce();
    const template = compiledSalesDebitNoteTemplates[templateId];
    if (!template) {
        throw new Error(`Sales debit note template not found: ${templateId}`);
    }

    const copyLabel = getCopyLabel(copyType);
    // Reuse invoice totals logic – payload shape matches invoice.
    const totals = computeInvoiceTotals(note);

    const seller = note.seller || {};
    const buyerAddress = note.buyerAddress || '';
    const shippingAddress = note.shippingAddress || buyerAddress;
    // Show shipping section if shippingAddress has value (even if same as billing)
    const showShippingAddress =
        !!(note.shippingAddress && String(note.shippingAddress).trim());

    const hasDispatchAddress = (() => {
        const d = seller.dispatchAddress;
        if (d == null) return false;
        if (typeof d === 'string') return d.trim() !== '';
        if (typeof d === 'object')
            return !!(d.street || d.city || d.state || d.pincode);
        return false;
    })();

    const bankDetails = note.bankDetails || {};
    const hasBankDetails = !!(
        bankDetails.bankName ||
        bankDetails.accountNumber ||
        bankDetails.ifscCode ||
        bankDetails.upiId
    );

    const transportInfo = note.transportInfo || {};
    const hasTransportInfo = !!(
        transportInfo.vehicleNumber ||
        transportInfo.mode ||
        transportInfo.transporterName ||
        transportInfo.transporterId ||
        transportInfo.docNo ||
        transportInfo.placeOfSupply ||
        transportInfo.placeOfSupplyStateName
    );

    const supplyContext = getSupplyTypeContext(note, seller, totals);

    const termsAndConditions = note.termsAndConditions || [];
    const customFields = note.customFields || [];

    const context = {
        invoice: note,
        seller,
        buyerAddress,
        shippingAddress,
        shippingName: note.shippingName || note.buyerName || '',
        shippingGstin: note.shippingGstin || note.buyerGstin || '',
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        ...supplyContext,
        termsAndConditions,
        customFields,
        totals,
        copyLabel
    };

    return template(context);
}

function loadQuotationTemplatesOnce() {
    if (Object.keys(compiledQuotationTemplates).length > 0) return;
    loadTemplatesOnce();
    QUOTATION_TEMPLATE_IDS.forEach((id) => {
        const filePath = path.join(__dirname, '..', 'templates', 'quotations', `${id}.html`);
        try {
            const source = fs.readFileSync(filePath, 'utf8');
            compiledQuotationTemplates[id] = Handlebars.compile(source);
        } catch (err) {
            console.error(`Failed to load quotation template "${id}" from ${filePath}:`, err);
        }
    });
}

const QUOTATION_TEMPLATE_ALIAS = { compact: 'classic', modern: 'classic' };

async function renderQuotationHtml(quotation, templateId, copyType = 'original') {
    loadQuotationTemplatesOnce();
    const resolvedId = QUOTATION_TEMPLATE_ALIAS[templateId] || templateId;
    const template = compiledQuotationTemplates[resolvedId];
    if (!template) {
        throw new Error(`Quotation template not found: ${templateId}`);
    }

    const copyLabel = getCopyLabel(copyType);
    const totals = computeInvoiceTotals(quotation);
    const seller = quotation.seller || {};
    const buyerAddress = quotation.buyerAddress || '';
    const shippingAddress = quotation.shippingAddress || buyerAddress;
    // Show shipping section if shippingAddress has value (even if same as billing)
    const showShippingAddress =
        !!(quotation.shippingAddress && String(quotation.shippingAddress).trim());
    const hasDispatchAddress = (() => {
        const d = seller.dispatchAddress;
        if (d == null) return false;
        if (typeof d === 'string') return d.trim() !== '';
        if (typeof d === 'object') return !!(d.street || d.city || d.state || d.pincode);
        return false;
    })();
    const bankDetails = quotation.bankDetails || {};
    const hasBankDetails = !!(
        bankDetails.bankName ||
        bankDetails.accountNumber ||
        bankDetails.ifscCode ||
        bankDetails.upiId
    );
    const transportInfo = quotation.transportInfo || {};
    const hasTransportInfo = !!(
        transportInfo.vehicleNumber ||
        transportInfo.mode ||
        transportInfo.transporterName ||
        transportInfo.transporterId ||
        transportInfo.docNo ||
        transportInfo.placeOfSupply ||
        transportInfo.placeOfSupplyStateName
    );
    // Quotation PDF: place-of-supply from seller/shipping/buyer (per BACKEND_QUOTATION_PLACE_OF_SUPPLY)
    const supplyContext = getQuotationSupplyContext(quotation, totals);
    const termsAndConditions = quotation.termsAndConditions || [];
    const customFields = quotation.customFields || [];
    const contactPersons = quotation.contactPersons || [];

    const context = {
        quotation,
        seller,
        buyerAddress,
        shippingAddress,
        shippingName: quotation.shippingName || quotation.buyerName || '',
        shippingGstin: quotation.shippingGstin || quotation.buyerGstin || '',
        shippingStateCode: quotation.shippingStateCode || null,
        shippingStateName: quotation.shippingStateName || null,
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        ...supplyContext,
        termsAndConditions,
        customFields,
        contactPersons,
        totals,
        copyLabel
    };

    return template(context);
}

async function uploadQuotationPdfToS3({ userId, businessId, quotationId, templateId, copyType, pdfBuffer }) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const fileName = getPdfKeySuffix(templateId, copyType);
    const key = `quotations/${userId}/${businessId}/${quotationId}/${fileName}`;
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ACL: 'public-read'
    };
    await s3Client.send(new PutObjectCommand(params));
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${key}`;
    return publicUrl;
}

async function generateAndUploadQuotationPdf({ userId, businessId, quotation, templateId, copyType = 'original' }) {
    const html = await renderQuotationHtml(quotation, templateId, copyType);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadQuotationPdfToS3({
        userId,
        businessId,
        quotationId: quotation.quotationId || quotation.id,
        templateId,
        copyType,
        pdfBuffer
    });
    return pdfUrl;
}

async function uploadSalesDebitNotePdfToS3({
    userId,
    businessId,
    salesDebitNoteId,
    templateId,
    copyType,
    pdfBuffer
}) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const fileName = getPdfKeySuffix(templateId, copyType);
    const key = `sales-debit-notes/${userId}/${businessId}/${salesDebitNoteId}/${fileName}`;
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ACL: 'public-read'
    };
    await s3Client.send(new PutObjectCommand(params));
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${key}`;
    return publicUrl;
}

async function generateAndUploadSalesDebitNotePdf({
    userId,
    businessId,
    salesDebitNote,
    templateId,
    copyType = 'original',
    business
}) {
    const noteWithDefaults = {
        ...salesDebitNote,
        signatureUrl: salesDebitNote.signatureUrl || business?.defaultSignatureUrl,
        stampUrl: salesDebitNote.stampUrl || business?.defaultStampUrl
    };
    const html = await renderSalesDebitNoteHtml(noteWithDefaults, templateId, copyType);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadSalesDebitNotePdfToS3({
        userId,
        businessId,
        salesDebitNoteId: salesDebitNote.salesDebitNoteId || salesDebitNote.id,
        templateId,
        copyType,
        pdfBuffer
    });
    return pdfUrl;
}

function loadDeliveryChallanTemplatesOnce() {
    if (Object.keys(compiledDeliveryChallanTemplates).length > 0) return;
    loadTemplatesOnce();
    DELIVERY_CHALLAN_TEMPLATE_IDS.forEach((id) => {
        const filePath = path.join(
            __dirname,
            '..',
            'templates',
            'delivery-challans',
            `${id}.html`
        );
        try {
            const source = fs.readFileSync(filePath, 'utf8');
            compiledDeliveryChallanTemplates[id] = Handlebars.compile(source);
        } catch (err) {
            console.error(
                `Failed to load delivery challan template "${id}" from ${filePath}:`,
                err
            );
        }
    });
}

function loadReceiptTemplatesOnce() {
    if (Object.keys(compiledReceiptTemplates).length > 0) return;
    loadTemplatesOnce();
    RECEIPT_TEMPLATE_IDS.forEach((id) => {
        const filePath = path.join(__dirname, '..', 'templates', 'receipts', `${id}.html`);
        try {
            const source = fs.readFileSync(filePath, 'utf8');
            compiledReceiptTemplates[id] = Handlebars.compile(source);
        } catch (err) {
            console.error(`Failed to load receipt template "${id}" from ${filePath}:`, err);
        }
    });
}

async function renderReceiptHtml(receipt, business, templateId) {
    loadReceiptTemplatesOnce();
    const template = compiledReceiptTemplates[templateId];
    if (!template) {
        throw new Error(`Receipt template not found: ${templateId}`);
    }
    const allocations = receipt.allocations || [];
    const totalPaid = allocations.reduce((s, a) => s + (Number(a.allocatedAmount) || 0), 0);
    const totalInvoice = allocations.reduce((s, a) => s + (Number(a.invoiceTotalAmount) || 0), 0);
    const totalDue = allocations.reduce((s, a) => s + (Number(a.dueAmount) || 0), 0);
    const excessAmount = (Number(receipt.amountCollected) || 0) - totalPaid;
    const context = {
        receipt,
        business: business || {},
        totals: {
            totalPaid,
            totalInvoice,
            totalDue,
            paidAgainstInvoice: totalPaid,
            excessAmount
        }
    };
    return template(context);
}

async function uploadReceiptPdfToS3({ userId, businessId, receiptId, templateId, pdfBuffer }) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const key = `receipts/${userId}/${businessId}/${receiptId}/${templateId}.pdf`;
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ACL: 'public-read'
    };
    await s3Client.send(new PutObjectCommand(params));
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${key}`;
    return publicUrl;
}

async function generateAndUploadReceiptPdf({ userId, businessId, receipt, business, templateId = 'classic' }) {
    const html = await renderReceiptHtml(receipt, business, templateId);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadReceiptPdfToS3({
        userId,
        businessId,
        receiptId: receipt.receiptId,
        templateId,
        pdfBuffer
    });
    return pdfUrl;
}

async function renderDeliveryChallanHtml(challan, templateId, copyType = 'original') {
    loadDeliveryChallanTemplatesOnce();
    const template = compiledDeliveryChallanTemplates[templateId];
    if (!template) {
        throw new Error(`Delivery challan template not found: ${templateId}`);
    }

    const copyLabel = getCopyLabel(copyType);
    // Reuse invoice totals logic – payload shape matches invoice.
    const totals = computeInvoiceTotals(challan);

    const seller = challan.seller || {};
    const buyerAddress = challan.buyerAddress || '';
    const shippingAddress = challan.shippingAddress || buyerAddress;
    // Show shipping section if shippingAddress has value (even if same as billing)
    const showShippingAddress =
        !!(challan.shippingAddress && String(challan.shippingAddress).trim());

    const hasDispatchAddress = (() => {
        const d = seller.dispatchAddress;
        if (d == null) return false;
        if (typeof d === 'string') return d.trim() !== '';
        if (typeof d === 'object')
            return !!(d.street || d.city || d.state || d.pincode);
        return false;
    })();

    const bankDetails = challan.bankDetails || {};
    const hasBankDetails = !!(
        bankDetails.bankName ||
        bankDetails.accountNumber ||
        bankDetails.ifscCode ||
        bankDetails.upiId
    );

    const transportInfo = challan.transportInfo || {};
    const hasTransportInfo = !!(
        transportInfo.vehicleNumber ||
        transportInfo.mode ||
        transportInfo.transporterName ||
        transportInfo.transporterId ||
        transportInfo.docNo ||
        transportInfo.placeOfSupply ||
        transportInfo.placeOfSupplyStateName
    );

    const supplyContext = getSupplyTypeContext(challan, seller, totals);

    const termsAndConditions = challan.termsAndConditions || [];
    const customFields = challan.customFields || [];

    const context = {
        challan,
        seller,
        buyerAddress,
        shippingAddress,
        shippingName: challan.shippingName || challan.buyerName || '',
        shippingGstin: challan.shippingGstin || challan.buyerGstin || '',
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        ...supplyContext,
        termsAndConditions,
        customFields,
        totals,
        copyLabel
    };

    return template(context);
}

async function uploadDeliveryChallanPdfToS3({
    userId,
    businessId,
    deliveryChallanId,
    templateId,
    copyType,
    pdfBuffer
}) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const fileName = getPdfKeySuffix(templateId, copyType);
    const key = `delivery-challans/${userId}/${businessId}/${deliveryChallanId}/${fileName}`;
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ACL: 'public-read'
    };
    await s3Client.send(new PutObjectCommand(params));
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${key}`;
    return publicUrl;
}

async function generateAndUploadDeliveryChallanPdf({
    userId,
    businessId,
    deliveryChallan,
    templateId,
    copyType = 'original',
    business
}) {
    const challanWithDefaults = {
        ...deliveryChallan,
        signatureUrl: deliveryChallan.signatureUrl || business?.defaultSignatureUrl,
        stampUrl: deliveryChallan.stampUrl || business?.defaultStampUrl
    };
    const html = await renderDeliveryChallanHtml(challanWithDefaults, templateId, copyType);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadDeliveryChallanPdfToS3({
        userId,
        businessId,
        deliveryChallanId: deliveryChallan.deliveryChallanId || deliveryChallan.id,
        templateId,
        copyType,
        pdfBuffer
    });
    return pdfUrl;
}

async function generatePdfBuffer(html) {
    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        // Wait for external images (e.g. seal/signature from S3) to load so they appear in the PDF
        const waitForImages = page.evaluate(() =>
            Promise.all(
                Array.from(document.images)
                    .filter((img) => img.src && !img.complete)
                    .map((img) => new Promise((res) => { img.onload = img.onerror = res; }))
            )
        );
        await Promise.race([waitForImages, new Promise((r) => setTimeout(r, 5000))]).catch(() => {});

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            }
        });

        return pdfBuffer;
    } finally {
        await browser.close();
    }
}

async function uploadPdfToS3({ userId, businessId, invoiceId, templateId, copyType, pdfBuffer }) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }

    const fileName = getPdfKeySuffix(templateId, copyType);
    const key = `invoices/${userId}/${businessId}/${invoiceId}/${fileName}`;

    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ACL: 'public-read'
    };

    await s3Client.send(new PutObjectCommand(params));

    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${key}`;
    return publicUrl;
}

async function generateAndUploadInvoicePdf({ userId, businessId, invoice, templateId, copyType = 'original' }) {
    const html = await renderInvoiceHtml(invoice, templateId, copyType);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadPdfToS3({
        userId,
        businessId,
        invoiceId: invoice.invoiceId || invoice.id,
        templateId,
        copyType,
        pdfBuffer
    });
    return pdfUrl;
}

module.exports = {
    renderInvoiceHtml,
    generatePdfBuffer,
    uploadPdfToS3,
    generateAndUploadInvoicePdf,
    renderSalesDebitNoteHtml,
    uploadSalesDebitNotePdfToS3,
    generateAndUploadSalesDebitNotePdf,
    renderQuotationHtml,
    uploadQuotationPdfToS3,
    generateAndUploadQuotationPdf,
    renderDeliveryChallanHtml,
    uploadDeliveryChallanPdfToS3,
    generateAndUploadDeliveryChallanPdf,
    renderReceiptHtml,
    uploadReceiptPdfToS3,
    generateAndUploadReceiptPdf
};

