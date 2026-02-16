#!/usr/bin/env node
/**
 * Test the Sales Debit Note classic template locally without deployment.
 *
 * Usage:
 *   node scripts/test-sales-debit-note-template-local.js [--html]
 *
 * Output:
 *   test-pdfs/sales-debit-note-classic-preview.html
 */

const fs = require('fs');
const path = require('path');

const htmlOnly = process.argv.includes('--html');

function getSampleNote() {
    return {
        invoiceNumber: 'SDN-2026-001',
        invoiceDate: '2026-02-16',
        buyerName: 'Demo GST Register Party',
        buyerGstin: '22AAICG8226H1ZO',
        buyerAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Chhattisgarh 492004',
        buyerStateCode: '22',
        buyerStateName: 'Chhattisgarh',
        transportInfo: {
            dateOfSupply: '2026-02-16',
            placeOfSupply: 'Chhattisgarh',
            placeOfSupplyStateName: 'Chhattisgarh',
            placeOfSupplyStateCode: '22',
            supplyTypeDisplay: 'interstate',
            vehicleNumber: 'MH12AB1234',
            transporterId: '22AAAAA0000A1Z5',
            transporterName: 'Demo Transporter',
            mode: 'Road',
            docNo: 'LR-12345',
            docDate: '2026-02-16'
        },
        otherDetails: {
            reverseCharge: 'No',
            challanNumber: 'CH-001'
        },
        roundOff: 0,
        bankDetails: {
            bankName: 'ICICI Bank',
            accountHolderName: 'Demo Account',
            accountNumber: '8602378087',
            ifscCode: 'ICIC0005769',
            branch: 'NARSINGI II'
        },
        termsAndConditions: [
            'This is an electronically generated document.',
            'All disputes are subject to seller city jurisdiction.'
        ],
        items: [
            {
                itemName: 'Demo Product',
                hsnSac: '0402',
                quantity: 100,
                unit: 'Nos',
                unitPrice: 25,
                discountType: 'percentage',
                discountValue: 2.5,
                gstPercent: 5,
                cessType: 'Percentage',
                cessValue: 1
            },
            {
                itemName: 'Widget A',
                hsnSac: '8471',
                quantity: 20,
                unit: 'Pcs',
                unitPrice: 150,
                discountType: 'percentage',
                discountValue: 5,
                gstPercent: 18,
                cessType: 'Percentage',
                cessValue: 0
            }
        ],
        additionalCharges: [],
        seller: {
            firmName: 'SATGURU ELECTRONICS AND FURNITURE',
            gstNumber: '23ALFPM7215H1ZA',
            mobile: '9876543210',
            address: {
                street: '2505 INFRONT OF GOVT.HOSPITAL, MAIN ROAD KALAPIPAL MANDI DIST.SHAJAPUR',
                city: 'Shajapur',
                state: 'Madhya Pradesh',
                pincode: '465337'
            }
        }
    };
}

async function main() {
    const projectRoot = path.join(__dirname, '..');
    const outputDir = path.join(projectRoot, 'test-pdfs');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const invoicePdfService = require(path.join(projectRoot, 'src', 'services', 'invoicePdfService'));

    console.log('\nRendering Sales Debit Note (classic) with sample data...\n');

    const note = getSampleNote();
    let html;
    try {
        html = await invoicePdfService.renderSalesDebitNoteHtml(note, 'classic');
    } catch (err) {
        console.error('Failed to render HTML:', err.message);
        process.exit(1);
    }

    const htmlPath = path.join(outputDir, 'sales-debit-note-classic-preview.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('HTML written:', htmlPath);
    console.log('Open this file in your browser to preview the template.\n');

    if (!htmlOnly) {
        try {
            const pdfBuffer = await invoicePdfService.generatePdfBuffer(html);
            const pdfPath = path.join(outputDir, 'sales-debit-note-classic-preview.pdf');
            fs.writeFileSync(pdfPath, pdfBuffer);
            console.log('PDF written:', pdfPath);
        } catch (err) {
            console.warn('PDF generation skipped:', err.message);
            console.warn('Use --html to skip PDF and only output HTML.\n');
        }
    }

    console.log('Done.\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
