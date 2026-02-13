/**
 * End-to-End Calculation Test Script
 *
 * Validates calculation logic for Invoice, Quotation, Delivery Challan, and Sales Debit Note
 * against production API: https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
 *
 * What the backend calculates (invoiceCalculationService.js):
 * - Line items: baseAmount, discount (% or flat), taxableAmount, GST (inclusive or exclusive), lineTotal
 * - Additional charges: amount, GST (inclusive or exclusive), total
 * - Summary: taxableAmount, taxAmount, TCS (on taxable or final amount), grandTotal
 *
 * What the backend does NOT calculate (stored but not in computeInvoiceTotals):
 * - Cess (line item has cessType/cessValue but service does not compute cessAmount)
 * - Global discount (not applied in backend totals)
 * - CGST/SGST vs IGST split (single gstPercent/gstAmount; display is IGST or CGST+SGST in template)
 *
 * Usage: node test-calculation-e2e.js
 */

const axios = require('axios');
const { computeInvoiceTotals } = require('./src/services/invoiceCalculationService');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const timestamp = Date.now();
const TEST_EMAIL = `test.calc.${timestamp}@example.com`;
const TEST_PASSWORD = 'CalcTest123!';

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertEqual(actual, expected, label) {
    const a = round2(Number(actual));
    const e = round2(Number(expected));
    if (Math.abs(a - e) > 0.02) {
        throw new Error(`${label}: expected ${e}, got ${a}`);
    }
}

async function main() {
    console.log('\n=== E2E Calculation Test ===');
    console.log('BASE_URL:', BASE_URL);

    const client = axios.create({ baseURL: BASE_URL, timeout: 30000 });

    // --- Auth ---
    try {
        await client.post('/auth/register', {
            name: 'Calculation Tester',
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
    } catch (e) {
        if (e.response?.status !== 409) throw e;
    }
    const { data: loginData } = await client.post('/auth/login', {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
    });
    const token = loginData.token;
    const authClient = axios.create({
        baseURL: BASE_URL,
        timeout: 30000,
        headers: { Authorization: `Bearer ${token}` }
    });

    // --- Business ---
    const bizRes = await authClient.post('/business', {
        firmName: 'Calc Test Firm',
        gstNumber: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        mobile: '9876543210',
        email: 'firm@test.com',
        address: { street: '1 St', city: 'Bangalore', state: 'Karnataka', pincode: '560001' }
    });
    const businessId = bizRes.data.business.businessId;

    // --- Party ---
    const partyRes = await authClient.post('/parties', {
        companyName: 'Buyer Co',
        mobile: '9123456789',
        billingAddress: {
            street: '2 St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India'
        },
        sameAsBilling: true
    });
    const partyId = partyRes.data.data.partyId;

    // --- Product ---
    const prodRes = await authClient.post(`/business/${businessId}/products`, {
        name: 'Product A',
        type: 'product',
        hsnSac: '1001',
        unit: 'Nos',
        salesPrice: 100,
        taxInclusive: false,
        gstPercent: 18
    });
    const productId = prodRes.data.product.productId;

    const today = new Date().toISOString().split('T')[0];
    const seller = {
        firmName: 'Calc Test Firm',
        gstNumber: '29ABCDE1234F1Z5',
        address: { street: '1 St', city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
        mobile: '9876543210',
        email: 'firm@test.com',
        stateCode: '29'
    };

    // --- Test payload: known numbers for manual expectation ---
    // Item1: 10 x 100 = 1000, 10% discount = 100, taxable = 900, 18% GST = 162, lineTotal = 1062
    // Item2: 5 x 200 = 1000, flat 50 = 50, taxable = 950, 12% GST = 114, lineTotal = 1064
    // Charge1: 200, 18% exclusive => taxable 200, gst 36, total 236
    // TCS: 1% on final (taxable+tax) => (1062+1064+236) * 0.01 = 23.62
    const invoicePayload = {
        invoiceNumber: `INV-CALC-${timestamp}`,
        invoiceDate: today,
        type: 'taxInvoice',
        status: 'saved',
        seller,
        buyerId: partyId,
        buyerName: 'Buyer Co',
        buyerGstin: '',
        buyerAddress: '2 St, Mumbai, Maharashtra - 400001',
        shippingAddress: '',
        items: [
            {
                itemId: productId,
                itemName: 'Product A',
                hsnSac: '1001',
                quantity: 10,
                unit: 'Nos',
                unitPrice: 100,
                discountType: 'percentage',
                discountValue: 10,
                discountPercent: 10,
                gstPercent: 18,
                taxInclusive: false,
                cessType: 'Percentage',
                cessValue: 0
            },
            {
                itemId: 'item2',
                itemName: 'Product B',
                hsnSac: '1002',
                quantity: 5,
                unit: 'Nos',
                unitPrice: 200,
                discountType: 'flat',
                discountValue: 50,
                discountPercent: 0,
                gstPercent: 12,
                taxInclusive: false,
                cessType: 'Fixed',
                cessValue: 0
            }
        ],
        additionalCharges: [
            {
                name: 'Packing',
                amount: 200,
                gstPercent: 18,
                hsnSac: '9985',
                isTaxInclusive: false
            }
        ],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        tcsInfo: { percentage: 1, basis: 'finalAmount' }
    };

    const expectedLine1 = {
        baseAmount: 1000,
        discountAmount: 100,
        taxableAmount: 900,
        gstAmount: 162,
        lineTotal: 1062
    };
    const expectedLine2 = {
        baseAmount: 1000,
        discountAmount: 50,
        taxableAmount: 950,
        gstAmount: 114,
        lineTotal: 1064
    };
    const expectedCharge = { taxableAmount: 200, gstAmount: 36, total: 236 };
    const expectedTaxable = 900 + 950 + 200; // 2050
    const expectedTax = 162 + 114 + 36;      // 312
    const expectedTcsBase = expectedTaxable + expectedTax; // 2362
    const expectedTcs = round2(expectedTcsBase * 0.01);     // 23.62
    const expectedGrand = expectedTaxable + expectedTax + expectedTcs;

    // --- Create Invoice ---
    const invRes = await authClient.post(`/business/${businessId}/invoices`, invoicePayload);
    const invoice = invRes.data.invoice;

    const totals = computeInvoiceTotals(invoice);
    const s = totals.summary;

    assertEqual(totals.items[0].totals.baseAmount, expectedLine1.baseAmount, 'Invoice line1 baseAmount');
    assertEqual(totals.items[0].totals.discountAmount, expectedLine1.discountAmount, 'Invoice line1 discountAmount');
    assertEqual(totals.items[0].totals.taxableAmount, expectedLine1.taxableAmount, 'Invoice line1 taxableAmount');
    assertEqual(totals.items[0].totals.gstAmount, expectedLine1.gstAmount, 'Invoice line1 gstAmount');
    assertEqual(totals.items[0].totals.lineTotal, expectedLine1.lineTotal, 'Invoice line1 lineTotal');

    assertEqual(totals.items[1].totals.baseAmount, expectedLine2.baseAmount, 'Invoice line2 baseAmount');
    assertEqual(totals.items[1].totals.discountAmount, expectedLine2.discountAmount, 'Invoice line2 discountAmount');
    assertEqual(totals.items[1].totals.taxableAmount, expectedLine2.taxableAmount, 'Invoice line2 taxableAmount');
    assertEqual(totals.items[1].totals.gstAmount, expectedLine2.gstAmount, 'Invoice line2 gstAmount');
    assertEqual(totals.items[1].totals.lineTotal, expectedLine2.lineTotal, 'Invoice line2 lineTotal');

    assertEqual(totals.additionalCharges[0].totals.taxableAmount, expectedCharge.taxableAmount, 'Invoice charge taxable');
    assertEqual(totals.additionalCharges[0].totals.gstAmount, expectedCharge.gstAmount, 'Invoice charge gst');
    assertEqual(totals.additionalCharges[0].totals.total, expectedCharge.total, 'Invoice charge total');

    assertEqual(s.taxableAmount, expectedTaxable, 'Invoice summary taxableAmount');
    assertEqual(s.taxAmount, expectedTax, 'Invoice summary taxAmount');
    assertEqual(s.tcsAmount, expectedTcs, 'Invoice summary tcsAmount');
    assertEqual(s.grandTotal, expectedGrand, 'Invoice summary grandTotal');

    console.log('Invoice calculations: OK');

    // --- Tax-inclusive line (back-calculate) ---
    // 118 inclusive, 18% => net = 118/1.18 = 100, gst = 18
    const inv2Payload = {
        ...invoicePayload,
        invoiceNumber: `INV-CALC2-${timestamp}`,
        items: [
            {
                itemId: productId,
                itemName: 'Product A',
                hsnSac: '1001',
                quantity: 1,
                unit: 'Nos',
                unitPrice: 118,
                discountType: 'flat',
                discountValue: 0,
                discountPercent: 0,
                gstPercent: 18,
                taxInclusive: true,
                cessType: 'Percentage',
                cessValue: 0
            }
        ],
        additionalCharges: [],
        tcsInfo: null
    };
    const inv2Res = await authClient.post(`/business/${businessId}/invoices`, inv2Payload);
    const tot2 = computeInvoiceTotals(inv2Res.data.invoice);
    assertEqual(tot2.items[0].totals.taxableAmount, 100, 'Tax-inclusive taxable');
    assertEqual(tot2.items[0].totals.gstAmount, 18, 'Tax-inclusive gst');
    assertEqual(tot2.items[0].totals.lineTotal, 118, 'Tax-inclusive lineTotal');
    assertEqual(tot2.summary.grandTotal, 118, 'Tax-inclusive grandTotal');
    console.log('Invoice tax-inclusive: OK');

    // --- TCS on taxable amount ---
    const inv3Payload = {
        ...invoicePayload,
        invoiceNumber: `INV-CALC3-${timestamp}`,
        items: [{ ...invoicePayload.items[0] }],
        additionalCharges: [],
        tcsInfo: { percentage: 1, basis: 'taxableAmount' }
    };
    const inv3Res = await authClient.post(`/business/${businessId}/invoices`, inv3Payload);
    const tot3 = computeInvoiceTotals(inv3Res.data.invoice);
    const expectedTcsTaxable = round2(900 * 0.01); // 9
    assertEqual(tot3.summary.tcsAmount, expectedTcsTaxable, 'TCS on taxableAmount');
    console.log('Invoice TCS (taxable basis): OK');

    // --- Quotation (same calculation service) ---
    const quotPayload = {
        quotationNumber: `QT-CALC-${timestamp}`,
        quotationDate: today,
        status: 'sent',
        seller,
        buyerId: partyId,
        buyerName: 'Buyer Co',
        buyerAddress: '2 St, Mumbai - 400001',
        shippingAddress: '',
        items: [invoicePayload.items[0]],
        additionalCharges: [invoicePayload.additionalCharges[0]],
        globalDiscountType: 'flat',
        globalDiscountValue: 0,
        tcsInfo: { percentage: 0.5, basis: 'finalAmount' }
    };
    const quotRes = await authClient.post(`/business/${businessId}/quotations`, quotPayload);
    const quotTotals = computeInvoiceTotals(quotRes.data.quotation);
    const qTaxable = 900 + 200;
    const qTax = 162 + 36;
    const qTcs = round2((qTaxable + qTax) * 0.005);
    assertEqual(quotTotals.summary.taxableAmount, qTaxable, 'Quotation taxable');
    assertEqual(quotTotals.summary.taxAmount, qTax, 'Quotation tax');
    assertEqual(quotTotals.summary.tcsAmount, qTcs, 'Quotation TCS');
    assertEqual(quotTotals.summary.grandTotal, qTaxable + qTax + qTcs, 'Quotation grandTotal');
    console.log('Quotation calculations: OK');

    // --- Delivery Challan ---
    const challanPayload = {
        challanNumber: `DC-CALC-${timestamp}`,
        challanDate: today,
        status: 'pending',
        seller,
        buyerId: partyId,
        buyerName: 'Buyer Co',
        buyerAddress: '2 St, Mumbai - 400001',
        shippingAddress: '',
        items: [invoicePayload.items[0], invoicePayload.items[1]],
        additionalCharges: [invoicePayload.additionalCharges[0]],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        tcsInfo: { percentage: 1, basis: 'finalAmount' }
    };
    const dcRes = await authClient.post(`/business/${businessId}/delivery-challans`, challanPayload);
    const dcTotals = computeInvoiceTotals(dcRes.data.deliveryChallan);
    assertEqual(dcTotals.summary.taxableAmount, expectedTaxable, 'Challan taxable');
    assertEqual(dcTotals.summary.taxAmount, expectedTax, 'Challan tax');
    assertEqual(dcTotals.summary.tcsAmount, expectedTcs, 'Challan TCS');
    assertEqual(dcTotals.summary.grandTotal, expectedGrand, 'Challan grandTotal');
    console.log('Delivery Challan calculations: OK');

    // --- Sales Debit Note ---
    const sdnPayload = {
        invoiceNumber: `SDN-CALC-${timestamp}`,
        invoiceDate: today,
        status: 'saved',
        seller,
        buyerId: partyId,
        buyerName: 'Buyer Co',
        buyerAddress: '2 St, Mumbai - 400001',
        shippingAddress: '',
        items: [invoicePayload.items[0]],
        additionalCharges: [],
        globalDiscountType: 'flat',
        globalDiscountValue: 0,
        tcsInfo: null
    };
    const sdnRes = await authClient.post(`/business/${businessId}/sales-debit-notes`, sdnPayload);
    const sdnTotals = computeInvoiceTotals(sdnRes.data.salesDebitNote);
    assertEqual(sdnTotals.summary.taxableAmount, 900, 'Debit note taxable');
    assertEqual(sdnTotals.summary.taxAmount, 162, 'Debit note tax');
    assertEqual(sdnTotals.summary.grandTotal, 1062, 'Debit note grandTotal');
    console.log('Sales Debit Note calculations: OK');

    // --- Additional charge tax-inclusive (118 incl 18% => 100 + 18) ---
    const inv4Payload = {
        ...invoicePayload,
        invoiceNumber: `INV-CALC4-${timestamp}`,
        items: [{ ...invoicePayload.items[0], quantity: 1, unitPrice: 100, discountValue: 0, discountPercent: 0 }],
        additionalCharges: [
            { name: 'Freight', amount: 118, gstPercent: 18, hsnSac: '9965', isTaxInclusive: true }
        ],
        tcsInfo: null
    };
    const inv4Res = await authClient.post(`/business/${businessId}/invoices`, inv4Payload);
    const tot4 = computeInvoiceTotals(inv4Res.data.invoice);
    assertEqual(tot4.items[0].totals.taxableAmount, 100, 'Inv4 line taxable');
    assertEqual(tot4.items[0].totals.lineTotal, 118, 'Inv4 line total');
    assertEqual(tot4.additionalCharges[0].totals.taxableAmount, 100, 'Charge tax-inclusive taxable');
    assertEqual(tot4.additionalCharges[0].totals.gstAmount, 18, 'Charge tax-inclusive gst');
    assertEqual(tot4.additionalCharges[0].totals.total, 118, 'Charge tax-inclusive total');
    assertEqual(tot4.summary.grandTotal, 236, 'Inv4 grandTotal');
    console.log('Additional charge tax-inclusive: OK');

    // --- PDF generation (smoke: no crash, totals used in template) ---
    const invoiceId = invRes.data.invoice.invoiceId;
    const pdfRes = await authClient.post(`/business/${businessId}/invoices/${invoiceId}/pdf`, { templateId: 'classic' });
    if (!pdfRes.data.pdfUrl) throw new Error('Invoice PDF URL missing');
    console.log('Invoice PDF generated: OK');

    console.log('\n=== All calculation checks passed ===');
    console.log('Covered: line discount %/flat, tax inclusive/exclusive, additional charges + TCS, all doc types.');
    console.log('Note: Cess, global discount, and CGST/SGST split are not computed in backend (see script header).');
}

main().catch((err) => {
    console.error('Test failed:', err.message);
    if (err.response) console.error('Response:', err.response.data);
    process.exit(1);
});
