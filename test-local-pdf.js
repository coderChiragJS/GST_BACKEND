const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const puppeteer = require('puppeteer');

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', function (value) {
    const num = typeof value === 'number' ? value : Number(value || 0);
    return num.toFixed(2);
});

Handlebars.registerHelper('inc', function (value) {
    return Number(value) + 1;
});

Handlebars.registerHelper('divide', function (value, divisor) {
    const num = typeof value === 'number' ? value : Number(value || 0);
    const div = typeof divisor === 'number' ? divisor : Number(divisor || 1);
    return div !== 0 ? (num / div).toFixed(2) : 0;
});

Handlebars.registerHelper('formatDate', function (dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
});

// Static test data for Sales Debit Note
const testData = {
    seller: {
        firmName: 'SATGURU ELECTRONICS AND FURNITURE',
        address: {
            street: '2505 INFRONT OF GOVT.HOSPITAL,MAIN ROAD KALAPIPAL MANDI DIST.SHAJAPUR',
            city: 'Shajapur',
            state: 'Madhya Pradesh',
            pincode: '465337'
        },
        gstNumber: '23ALFPM7215H1ZA',
        stateCode: '23',
        mobile: '9876543210'
    },
    invoice: {
        invoiceNumber: 'new1',
        invoiceDate: '2026-02-12',
        buyerName: 'DEMO GST Register Party',
        buyerGstin: '22AAICG8226H1ZO',
        buyerAddress: 'Second Floor 106/3 Ava nti Vihar Road Raipur Raipur Chhattisgarh 492004',
        shippingAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004',
        transportInfo: {
            dateOfSupply: '2026-02-12',
            placeOfSupply: 'Andhra Pradesh',
            placeOfSupplyStateName: 'Andhra Pradesh',
            placeOfSupplyStateCode: '22',
            vehicleNumber: '4343434',
            transporterId: '54454',
            transporterName: 'vcvvc',
            mode: 'Road',
            docNo: '4345',
            docDate: '2026-02-12'
        },
        otherDetails: {
            reverseCharge: true,
            poNumber: 'PO-2026-001',
            poDate: '2026-02-12'
        },
        stampUrl: '',
        signatureUrl: ''
    },
    buyerAddress: 'Second Floor 106/3 Ava nti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    shippingAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    showShippingAddress: false,
    totals: {
        items: [
            {
                itemName: 'Demo Product',
                hsnSac: '0402',
                quantity: 10,
                unit: 'Nos',
                unitPrice: 100.00,
                totals: {
                    taxableAmount: 1000.00,
                    gstPercent: 18,
                    gstAmount: 180.00,
                    lineTotal: 1180.00
                }
            }
        ],
        additionalCharges: [
            {
                name: 'handling charge',
                totals: {
                    taxableAmount: 10.00,
                    gstPercent: 0,
                    gstAmount: 0,
                    total: 10.00
                }
            }
        ],
        summary: {
            taxableAmount: 1010.00,
            taxAmount: 180.00,
            grandTotal: 1010.00
        }
    },
    bankDetails: {
        accountHolderName: 'CHIRAG',
        accountNumber: '67583245608',
        ifscCode: 'ICIC0008578',
        bankName: 'ICICI Bank',
        branch: 'MANASA'
    },
    hasBankDetails: true,
    termsAndConditions: [
        'This is an electronically generated document.',
        'All disputes are subject to seller city jurisdiction.'
    ]
};

async function generateLocalPDF(templateType = 'sales-debit-note') {
    try {
        console.log(`\n🔧 Generating ${templateType} PDF locally...\n`);

        // Load template
        let templatePath;
        if (templateType === 'invoice') {
            templatePath = path.join(__dirname, 'src', 'templates', 'invoices', 'classic.html');
        } else if (templateType === 'sales-debit-note') {
            templatePath = path.join(__dirname, 'src', 'templates', 'sales-debit-notes', 'classic.html');
        } else {
            throw new Error('Invalid template type. Use "invoice" or "sales-debit-note"');
        }

        console.log('📄 Loading template from:', templatePath);
        const templateSource = fs.readFileSync(templatePath, 'utf8');
        const template = Handlebars.compile(templateSource);

        // Render HTML with test data
        console.log('🎨 Rendering HTML with test data...');
        const html = template(testData);

        // Generate PDF using Puppeteer
        console.log('🖨️  Generating PDF...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'test-pdfs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate PDF
        const outputPath = path.join(outputDir, `${templateType}-test-${Date.now()}.pdf`);
        await page.pdf({
            path: outputPath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            }
        });

        await browser.close();

        console.log('\n✅ PDF generated successfully!');
        console.log('📁 Location:', outputPath);
        console.log('\n💡 You can open this file to preview the template locally.\n');

        return outputPath;
    } catch (error) {
        console.error('\n❌ Error generating PDF:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Check command line arguments
const templateType = process.argv[2] || 'sales-debit-note';

if (!['invoice', 'sales-debit-note'].includes(templateType)) {
    console.error('\n❌ Invalid template type!');
    console.log('Usage: node test-local-pdf.js [invoice|sales-debit-note]');
    console.log('Example: node test-local-pdf.js sales-debit-note');
    process.exit(1);
}

// Run the generator
generateLocalPDF(templateType);
