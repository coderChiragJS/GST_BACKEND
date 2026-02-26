/**
 * Sales Debit Note and Credit Note - Production/Dev API Test
 *
 * Tests SDN and Credit Note CRUD, PDF generation, and validates calculations.
 *
 * Usage:
 *   BASE_URL=https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev \
 *   EMAIL=chirag@gmail.com PASSWORD=test@33 \
 *   node scripts/test-sdn-and-credit-note-production.js
 */

const https = require('https');

const BASE_URL = process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const EMAIL = process.env.EMAIL || 'chirag@gmail.com';
const PASSWORD = process.env.PASSWORD || 'test@33';

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const base = BASE_URL.replace(/\/$/, '');
        const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;
        const options = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
        if (token) options.headers.Authorization = `Bearer ${token}`;

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Use computeInvoiceTotals for calculation validation
const { computeInvoiceTotals } = require('../src/services/invoiceCalculationService');

function round2(v) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

async function run() {
    console.log('\n=== Sales Debit Note & Credit Note - Production Test ===');
    console.log('BASE_URL:', BASE_URL);
    console.log('EMAIL:', EMAIL);

    const ts = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const buyerName = 'Test Buyer Co';
    let token, businessId, sdnId, cnId;
    const errors = [];

    function ok(label, detail) {
        console.log('  [OK]', label, detail !== undefined ? String(detail) : '');
    }
    function fail(label, detail) {
        const msg = detail ? `${label}: ${detail}` : label;
        console.error('  [FAIL]', msg);
        errors.push(msg);
    }

    // --- 1. Login ---
    console.log('\n--- 1. Login ---');
    const login = await request('/auth/login', 'POST', { email: EMAIL, password: PASSWORD }, null);
    if (login.status !== 200 || !login.body?.token) {
        fail('Login', `${login.status} ${JSON.stringify(login.body)}`);
        console.log('\nStopping: no token.');
        process.exit(1);
    }
    token = login.body.token;
    ok('Login');

    // --- 2. Get Business ---
    console.log('\n--- 2. Business ---');
    const bizList = await request('/business', 'GET', null, token);
    const businesses = Array.isArray(bizList.body) ? bizList.body : bizList.body?.businesses || bizList.body?.data || [];
    businessId = businesses[0]?.businessId || businesses[0]?.id;
    if (!businessId) {
        fail('Business', 'No business found. Create one first.');
        process.exit(1);
    }
    ok('Business ID', businessId);

    // --- 3. Sales Debit Note ---
    console.log('\n--- 3. Sales Debit Note (CRUD + PDF + calculations) ---');
    const sdnNumber = `SDN-TEST-${ts}`;
    const sdnPayload = {
        invoiceNumber: sdnNumber,
        invoiceDate: today,
        dueDate: today,
        status: 'saved',
        seller: { firmName: 'Test Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerName,
        buyerGstin: '',
        buyerStateCode: '27',
        buyerStateName: 'Maharashtra',
        buyerAddress: 'Pune, MH',
        shippingName: '',
        shippingGstin: '',
        shippingAddress: '',
        items: [{
            itemId: '1',
            itemName: 'Product A',
            hsnSac: '1001',
            quantity: 2,
            unit: 'Nos',
            unitPrice: 100,
            discountType: 'percentage',
            discountValue: 10,
            discountPercent: 10,
            gstPercent: 18,
            taxInclusive: false,
            cessType: 'Percentage',
            cessValue: 0
        }],
        additionalCharges: [],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        tcsInfo: null,
        transportInfo: null,
        bankDetails: null,
        otherDetails: null,
        customFields: [],
        termsAndConditions: [],
        terms: [],
        roundOff: null,
        notes: 'SDN production test'
    };

    const createSDN = await request(`/business/${businessId}/sales-debit-notes`, 'POST', sdnPayload, token);
    if (createSDN.status !== 201) {
        fail('Create SDN', `${createSDN.status} ${JSON.stringify(createSDN.body)}`);
    } else {
        const sdn = createSDN.body?.salesDebitNote || createSDN.body?.data || createSDN.body;
        sdnId = sdn?.salesDebitNoteId || sdn?.id;
        ok('Create SDN', sdnId);

        // Validate SDN calculations
        const sdnTotals = computeInvoiceTotals(sdn);
        const expectedTaxable = 2 * 100 * 0.9; // qty * price * (1 - 10% discount) = 180
        const expectedTax = round2(expectedTaxable * 0.18);
        if (Math.abs(round2(sdnTotals.summary.taxableAmount) - expectedTaxable) > 0.02) {
            fail('SDN taxable amount', `expected ~${expectedTaxable}, got ${sdnTotals.summary.taxableAmount}`);
        } else {
            ok('SDN taxable amount', sdnTotals.summary.taxableAmount);
        }
        if (Math.abs(round2(sdnTotals.summary.taxAmount) - expectedTax) > 0.02) {
            fail('SDN tax amount', `expected ~${expectedTax}, got ${sdnTotals.summary.taxAmount}`);
        } else {
            ok('SDN tax amount', sdnTotals.summary.taxAmount);
        }
    }

    if (sdnId) {
        const getSDN = await request(`/business/${businessId}/sales-debit-notes/${sdnId}`, 'GET', null, token);
        if (getSDN.status !== 200) fail('Get SDN', getSDN.status);
        else ok('Get SDN');

        const pdfSDN = await request(`/business/${businessId}/sales-debit-notes/${sdnId}/pdf`, 'POST', { templateId: 'classic' }, token);
        if (pdfSDN.status !== 200 && pdfSDN.status !== 201) {
            fail('SDN PDF', `${pdfSDN.status} ${JSON.stringify(pdfSDN.body)}`);
        } else {
            ok('SDN PDF', pdfSDN.body?.pdfUrl ? 'URL returned' : 'no pdfUrl');
        }
    }

    // --- 4. Credit Note ---
    console.log('\n--- 4. Credit Note (CRUD + PDF + calculations) ---');
    const cnNumber = `CN-TEST-${ts}`;
    const cnPayload = {
        invoiceNumber: cnNumber,
        invoiceDate: today,
        dueDate: today,
        status: 'saved',
        seller: { firmName: 'Test Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerName,
        buyerGstin: '',
        buyerStateCode: '27',
        buyerStateName: 'Maharashtra',
        buyerAddress: 'Pune, MH',
        shippingName: '',
        shippingGstin: '',
        shippingAddress: '',
        items: [{
            itemId: '1',
            itemName: 'Product B',
            hsnSac: '1001',
            quantity: 1,
            unit: 'Nos',
            unitPrice: 50,
            discountType: 'flat',
            discountValue: 5,
            discountPercent: 0,
            gstPercent: 18,
            taxInclusive: false,
            cessType: 'Percentage',
            cessValue: 0
        }],
        additionalCharges: [],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        tcsInfo: null,
        transportInfo: null,
        bankDetails: null,
        otherDetails: null,
        customFields: [],
        termsAndConditions: [],
        terms: [],
        roundOff: null,
        notes: 'Credit Note production test'
    };

    const createCN = await request(`/business/${businessId}/credit-notes`, 'POST', cnPayload, token);
    if (createCN.status !== 201) {
        fail('Create Credit Note', `${createCN.status} ${JSON.stringify(createCN.body)}`);
    } else {
        const cn = createCN.body?.creditNote || createCN.body?.data || createCN.body;
        cnId = cn?.creditNoteId || cn?.id;
        ok('Create Credit Note', cnId);

        // Validate CN calculations: 1*50 - 5 = 45 taxable, 45*0.18 = 8.1 tax
        const cnTotals = computeInvoiceTotals(cn);
        const expectedCNTaxable = 50 - 5;
        const expectedCNTax = round2(expectedCNTaxable * 0.18);
        if (Math.abs(round2(cnTotals.summary.taxableAmount) - expectedCNTaxable) > 0.02) {
            fail('CN taxable amount', `expected ~${expectedCNTaxable}, got ${cnTotals.summary.taxableAmount}`);
        } else {
            ok('CN taxable amount', cnTotals.summary.taxableAmount);
        }
        if (Math.abs(round2(cnTotals.summary.taxAmount) - expectedCNTax) > 0.02) {
            fail('CN tax amount', `expected ~${expectedCNTax}, got ${cnTotals.summary.taxAmount}`);
        } else {
            ok('CN tax amount', cnTotals.summary.taxAmount);
        }
    }

    if (cnId) {
        const getCN = await request(`/business/${businessId}/credit-notes/${cnId}`, 'GET', null, token);
        if (getCN.status !== 200) fail('Get Credit Note', getCN.status);
        else ok('Get Credit Note');

        const pdfCN = await request(`/business/${businessId}/credit-notes/${cnId}/pdf`, 'POST', { templateId: 'classic' }, token);
        if (pdfCN.status !== 200 && pdfCN.status !== 201) {
            fail('Credit Note PDF', `${pdfCN.status} ${JSON.stringify(pdfCN.body)}`);
        } else {
            ok('Credit Note PDF', pdfCN.body?.pdfUrl ? 'URL returned' : 'no pdfUrl');
        }
    }

    // --- 5. Cleanup ---
    console.log('\n--- 5. Cleanup ---');
    if (cnId) {
        const delCN = await request(`/business/${businessId}/credit-notes/${cnId}`, 'DELETE', null, token);
        ok(delCN.status === 204 ? 'Delete Credit Note' : 'Delete Credit Note', delCN.status);
    }
    if (sdnId) {
        const delSDN = await request(`/business/${businessId}/sales-debit-notes/${sdnId}`, 'DELETE', null, token);
        ok(delSDN.status === 204 ? 'Delete SDN' : 'Delete SDN', delSDN.status);
    }

    // --- Summary ---
    console.log('\n--- Summary ---');
    if (errors.length) {
        console.log('Completed with errors:');
        errors.forEach((e) => console.log('  -', e));
        process.exit(1);
    } else {
        console.log('All Sales Debit Note and Credit Note tests passed.');
        process.exit(0);
    }
}

run().catch((e) => {
    console.error('Unexpected error:', e);
    process.exit(1);
});
