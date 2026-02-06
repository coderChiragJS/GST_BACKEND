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
        !!shippingAddress && shippingAddress.trim() !== buyerAddress.trim();

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
        await page.setContent(html, { waitUntil: 'networkidle0' });

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
    generateAndUploadInvoicePdf
};

