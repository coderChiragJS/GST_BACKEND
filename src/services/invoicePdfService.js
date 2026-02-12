const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { computeInvoiceTotals } = require('./invoiceCalculationService');

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

async function renderInvoiceHtml(invoice, templateId) {
    loadTemplatesOnce();
    const template = compiledTemplates[templateId];
    if (!template) {
        throw new Error(`Template not found: ${templateId}`);
    }

    const totals = computeInvoiceTotals(invoice);

    const seller = invoice.seller || {};
    const buyerAddress = invoice.buyerAddress || '';
    const shippingAddress = invoice.shippingAddress || buyerAddress;
    const showShippingAddress =
        !!(invoice.shippingAddress && String(invoice.shippingAddress).trim()) &&
        shippingAddress.trim() !== buyerAddress.trim();

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
        transportInfo.placeOfSupply
    );

    const termsAndConditions = invoice.termsAndConditions || [];
    const customFields = invoice.customFields || [];

    const context = {
        invoice,
        seller,
        buyerAddress,
        shippingAddress,
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        termsAndConditions,
        customFields,
        totals
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

async function renderSalesDebitNoteHtml(note, templateId) {
    loadSalesDebitNoteTemplatesOnce();
    const template = compiledSalesDebitNoteTemplates[templateId];
    if (!template) {
        throw new Error(`Sales debit note template not found: ${templateId}`);
    }

    // Reuse invoice totals logic – payload shape matches invoice.
    const totals = computeInvoiceTotals(note);

    const seller = note.seller || {};
    const buyerAddress = note.buyerAddress || '';
    const shippingAddress = note.shippingAddress || buyerAddress;
    const showShippingAddress =
        !!(note.shippingAddress && String(note.shippingAddress).trim()) &&
        shippingAddress.trim() !== buyerAddress.trim();

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
        transportInfo.placeOfSupply
    );

    const termsAndConditions = note.termsAndConditions || [];
    const customFields = note.customFields || [];

    const context = {
        invoice: note,
        seller,
        buyerAddress,
        shippingAddress,
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        termsAndConditions,
        customFields,
        totals
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

async function renderQuotationHtml(quotation, templateId) {
    loadQuotationTemplatesOnce();
    const resolvedId = QUOTATION_TEMPLATE_ALIAS[templateId] || templateId;
    const template = compiledQuotationTemplates[resolvedId];
    if (!template) {
        throw new Error(`Quotation template not found: ${templateId}`);
    }

    const totals = computeInvoiceTotals(quotation);
    const seller = quotation.seller || {};
    const buyerAddress = quotation.buyerAddress || '';
    const shippingAddress = quotation.shippingAddress || buyerAddress;
    const showShippingAddress =
        !!(quotation.shippingAddress && String(quotation.shippingAddress).trim()) &&
        shippingAddress.trim() !== buyerAddress.trim();
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
    const termsAndConditions = quotation.termsAndConditions || [];
    const customFields = quotation.customFields || [];
    const contactPersons = quotation.contactPersons || [];

    const context = {
        quotation,
        seller,
        buyerAddress,
        shippingAddress,
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        termsAndConditions,
        customFields,
        contactPersons,
        totals
    };

    return template(context);
}

async function uploadQuotationPdfToS3({ userId, businessId, quotationId, templateId, pdfBuffer }) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const key = `quotations/${userId}/${businessId}/${quotationId}/${templateId}.pdf`;
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

async function generateAndUploadQuotationPdf({ userId, businessId, quotation, templateId }) {
    const html = await renderQuotationHtml(quotation, templateId);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadQuotationPdfToS3({
        userId,
        businessId,
        quotationId: quotation.quotationId || quotation.id,
        templateId,
        pdfBuffer
    });
    return pdfUrl;
}

async function uploadSalesDebitNotePdfToS3({
    userId,
    businessId,
    salesDebitNoteId,
    templateId,
    pdfBuffer
}) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const key = `sales-debit-notes/${userId}/${businessId}/${salesDebitNoteId}/${templateId}.pdf`;
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
    business
}) {
    const noteWithDefaults = {
        ...salesDebitNote,
        signatureUrl: salesDebitNote.signatureUrl || business?.defaultSignatureUrl,
        stampUrl: salesDebitNote.stampUrl || business?.defaultStampUrl
    };
    const html = await renderSalesDebitNoteHtml(noteWithDefaults, templateId);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadSalesDebitNotePdfToS3({
        userId,
        businessId,
        salesDebitNoteId: salesDebitNote.salesDebitNoteId || salesDebitNote.id,
        templateId,
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

async function renderDeliveryChallanHtml(challan, templateId) {
    loadDeliveryChallanTemplatesOnce();
    const template = compiledDeliveryChallanTemplates[templateId];
    if (!template) {
        throw new Error(`Delivery challan template not found: ${templateId}`);
    }

    // Reuse invoice totals logic – payload shape matches invoice.
    const totals = computeInvoiceTotals(challan);

    const seller = challan.seller || {};
    const buyerAddress = challan.buyerAddress || '';
    const shippingAddress = challan.shippingAddress || buyerAddress;
    const showShippingAddress =
        !!(challan.shippingAddress && String(challan.shippingAddress).trim()) &&
        shippingAddress.trim() !== buyerAddress.trim();

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
        transportInfo.placeOfSupply
    );

    const termsAndConditions = challan.termsAndConditions || [];
    const customFields = challan.customFields || [];

    const context = {
        challan,
        seller,
        buyerAddress,
        shippingAddress,
        showShippingAddress,
        hasDispatchAddress,
        bankDetails,
        hasBankDetails,
        transportInfo,
        hasTransportInfo,
        termsAndConditions,
        customFields,
        totals
    };

    return template(context);
}

async function uploadDeliveryChallanPdfToS3({
    userId,
    businessId,
    deliveryChallanId,
    templateId,
    pdfBuffer
}) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }
    const key = `delivery-challans/${userId}/${businessId}/${deliveryChallanId}/${templateId}.pdf`;
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
    business
}) {
    const challanWithDefaults = {
        ...deliveryChallan,
        signatureUrl: deliveryChallan.signatureUrl || business?.defaultSignatureUrl,
        stampUrl: deliveryChallan.stampUrl || business?.defaultStampUrl
    };
    const html = await renderDeliveryChallanHtml(challanWithDefaults, templateId);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadDeliveryChallanPdfToS3({
        userId,
        businessId,
        deliveryChallanId: deliveryChallan.deliveryChallanId || deliveryChallan.id,
        templateId,
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

async function uploadPdfToS3({ userId, businessId, invoiceId, templateId, pdfBuffer }) {
    if (!BUCKET_NAME) {
        throw new Error('UPLOADS_BUCKET environment variable is not set');
    }

    const key = `invoices/${userId}/${businessId}/${invoiceId}/${templateId}.pdf`;

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

async function generateAndUploadInvoicePdf({ userId, businessId, invoice, templateId }) {
    const html = await renderInvoiceHtml(invoice, templateId);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadPdfToS3({
        userId,
        businessId,
        invoiceId: invoice.invoiceId || invoice.id,
        templateId,
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
    generateAndUploadDeliveryChallanPdf
};

