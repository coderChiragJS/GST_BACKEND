const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

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

Handlebars.registerHelper('numberToWords', function (value) {
    const num = typeof value === 'number' ? value : Number(value || 0);

    if (num === 0) return 'Zero Rupees Only';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    function convertLessThanThousand(n) {
        if (n === 0) return '';

        let result = '';

        if (n >= 100) {
            result += ones[Math.floor(n / 100)] + ' Hundred ';
            n %= 100;
        }

        if (n >= 20) {
            result += tens[Math.floor(n / 10)] + ' ';
            n %= 10;
        } else if (n >= 10) {
            result += teens[n - 10] + ' ';
            return result.trim();
        }

        if (n > 0) {
            result += ones[n] + ' ';
        }

        return result.trim();
    }

    function convertNumber(n) {
        if (n === 0) return '';

        let crore = Math.floor(n / 10000000);
        let lakh = Math.floor((n % 10000000) / 100000);
        let thousand = Math.floor((n % 100000) / 1000);
        let remainder = n % 1000;

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

// Static test data for Sales Debit Note (matching exact reference PDF)
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
        mobile: '9876543210',
        email: 'satguru@example.com'
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
            transporterId: '545454',
            transporterName: 'vcvvc',
            mode: 'Road',
            docNo: '4345',
            docDate: '2026-02-12'
        },
        otherDetails: {
            reverseCharge: true,
            poNumber: 'PO-2026-001',
            poDate: '2026-02-12',
            challanNumber: 'CH-001',
            eWayBillNumber: 'EWB123456'
        },
        stampUrl: '',
        signatureUrl: ''
    },
    buyerAddress: 'Second Floor 106/3 Ava nti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    shippingAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    showShippingAddress: true,
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
                    lineTotal: 1000.00
                }
            }
        ],
        additionalCharges: [
            {
                name: 'handlng charge',
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
            taxAmount: 0,
            grandTotal: 1010.00
        }
    },
    bankDetails: {
        accountHolderName: 'CHIRAG',
        accountNumber: '67583245608',
        ifscCode: 'ICIC0006578',
        bankName: 'ICICI Bank',
        branch: 'MANASA'
    },
    hasBankDetails: true,
    termsAndConditions: [
        'This is an electronically generated document.',
        'All disputes are subject to seller city jurisdiction.'
    ]
};

function generateLocalHTML(templateType = 'sales-debit-note') {
    try {
        console.log(`\n🔧 Generating ${templateType} HTML preview locally...\n`);

        // Load template
        let templatePath;
        let templateData = testData;
        
        if (templateType === 'invoice') {
            templatePath = path.join(__dirname, 'src', 'templates', 'invoices', 'classic.html');
        } else if (templateType === 'sales-debit-note') {
            templatePath = path.join(__dirname, 'src', 'templates', 'sales-debit-notes', 'classic.html');
        } else if (templateType === 'delivery-challan') {
            templatePath = path.join(__dirname, 'src', 'templates', 'delivery-challans', 'classic.html');
            // For delivery challan, use challan object instead of invoice
            templateData = {
                ...testData,
                challan: {
                    challanNumber: testData.invoice.invoiceNumber,
                    challanDate: testData.invoice.invoiceDate,
                    buyerName: testData.invoice.buyerName,
                    buyerGstin: testData.invoice.buyerGstin,
                    buyerAddress: testData.invoice.buyerAddress,
                    shippingAddress: testData.invoice.shippingAddress,
                    transportInfo: testData.invoice.transportInfo,
                    otherDetails: testData.invoice.otherDetails,
                    stampUrl: testData.invoice.stampUrl,
                    signatureUrl: testData.invoice.signatureUrl
                }
            };
        } else {
            throw new Error('Invalid template type. Use "invoice", "sales-debit-note", or "delivery-challan"');
        }

        console.log('📄 Loading template from:', templatePath);
        const templateSource = fs.readFileSync(templatePath, 'utf8');
        const template = Handlebars.compile(templateSource);

        // Render HTML with test data
        console.log('🎨 Rendering HTML with test data...');
        const html = template(templateData);

        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'test-html-previews');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Save HTML file
        const outputPath = path.join(outputDir, `${templateType}-preview-${Date.now()}.html`);
        fs.writeFileSync(outputPath, html, 'utf8');

        console.log('\n✅ HTML preview generated successfully!');
        console.log('📁 Location:', outputPath);
        console.log('\n💡 Open this file in your browser to preview the template.');
        console.log('💡 You can use browser Print > Save as PDF to generate a PDF locally.\n');

        return outputPath;
    } catch (error) {
        console.error('\n❌ Error generating HTML:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Check command line arguments
const templateType = process.argv[2] || 'sales-debit-note';

if (!['invoice', 'sales-debit-note', 'delivery-challan'].includes(templateType)) {
    console.error('\n❌ Invalid template type!');
    console.log('Usage: node test-local-html.js [invoice|sales-debit-note|delivery-challan]');
    console.log('Example: node test-local-html.js delivery-challan');
    process.exit(1);
}

// Run the generator
generateLocalHTML(templateType);
