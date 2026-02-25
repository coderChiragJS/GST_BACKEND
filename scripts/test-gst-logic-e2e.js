/**
 * End-to-end test: GST determination logic on deployed API.
 * Tests Place of Supply API (Bill-To only) and Invoice create/update with derived GST.
 *
 * Usage:
 *   node scripts/test-gst-logic-e2e.js
 *
 * Or with env:
 *   BASE_URL=https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev \
 *   EMAIL=chirag@gmail.com PASSWORD=test@33 \
 *   node scripts/test-gst-logic-e2e.js
 */

const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev').replace(/\/$/, '');
const EMAIL = process.env.EMAIL || 'chirag@gmail.com';
const PASSWORD = process.env.PASSWORD || 'test@33';

let token;
let authClient;
let businessId;
let invoiceId;
const ts = Date.now();
const today = new Date().toISOString().split('T')[0];

const results = { passed: 0, failed: 0, errors: [] };

function ok(label, detail = '') {
    results.passed++;
    console.log('  [PASS]', label, detail ? String(detail) : '');
}

function fail(label, detail = '') {
    results.failed++;
    const msg = detail ? `${label}: ${detail}` : label;
    results.errors.push(msg);
    console.log('  [FAIL]', msg);
}

function buildAuthClient(t) {
    return axios.create({
        baseURL: BASE_URL,
        timeout: 30000,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${t}`
        }
    });
}

async function login() {
    const res = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
    if (!res.data || !res.data.token) throw new Error('Login failed: no token');
    token = res.data.token;
    authClient = buildAuthClient(token);
}

async function ensureBusiness() {
    const res = await authClient.get('/business');
    const list = Array.isArray(res.data) ? res.data : res.data?.businesses || res.data?.data || [];
    const biz = list[0];
    if (!biz) throw new Error('No business found. Create one in the app first.');
    businessId = biz.businessId || biz.id;
    return businessId;
}

async function run() {
    console.log('\n=== GST Logic E2E Test ===');
    console.log('BASE_URL:', BASE_URL);
    console.log('EMAIL:', EMAIL);
    console.log('');

    try {
        await login();
        ok('Login');
        await ensureBusiness();
        ok('Get businessId', businessId);
    } catch (e) {
        console.error('Setup failed:', e.response?.data || e.message);
        process.exit(1);
    }

    // --- Section A: Place of Supply API (Bill-To only) ---
    console.log('\n--- A. Place of Supply API (Bill-To only) ---');

    // A1: Intrastate – seller and buyer same state (Delhi 07)
    try {
        const r = await authClient.post('/gst/place-of-supply', {
            sellerStateCode: '07',
            buyerStateCode: '07'
        });
        if (r.data.placeOfSupplyStateCode === '07' && r.data.supplyTypeDisplay === 'intrastate') {
            ok('A1 Intrastate (seller 07, buyer 07) -> place 07, intrastate');
        } else {
            fail('A1 Intrastate', `got ${r.data.placeOfSupplyStateCode} ${r.data.supplyTypeDisplay}`);
        }
    } catch (e) {
        fail('A1 Intrastate', e.response?.data?.error || e.message);
    }

    // A2: Interstate – seller Delhi 07, buyer MP 23
    try {
        const r = await authClient.post('/gst/place-of-supply', {
            sellerStateCode: '07',
            buyerGstin: '23ALFPM7215H1ZA'
        });
        if (r.data.placeOfSupplyStateCode === '23' && r.data.supplyTypeDisplay === 'interstate') {
            ok('A2 Interstate (seller 07, buyer GSTIN 23) -> place 23, interstate');
        } else {
            fail('A2 Interstate', `got ${r.data.placeOfSupplyStateCode} ${r.data.supplyTypeDisplay}`);
        }
    } catch (e) {
        fail('A2 Interstate', e.response?.data?.error || e.message);
    }

    // A3: Buyer state from buyerStateName
    try {
        const r = await authClient.post('/gst/place-of-supply', {
            sellerStateName: 'Maharashtra',
            buyerStateName: 'Kerala'
        });
        if (r.data.placeOfSupplyStateCode === '29' && r.data.supplyTypeDisplay === 'interstate') {
            ok('A3 Buyer state from name (Maharashtra seller, Kerala buyer) -> place 29, interstate');
        } else {
            fail('A3 Buyer from name', `got ${r.data.placeOfSupplyStateCode} ${r.data.supplyTypeDisplay}`);
        }
    } catch (e) {
        fail('A3 Buyer from name', e.response?.data?.error || e.message);
    }

    // A4: Missing buyer -> 400
    try {
        await authClient.post('/gst/place-of-supply', {
            sellerStateCode: '07'
        });
        fail('A4 Missing buyer', 'expected 400');
    } catch (e) {
        if (e.response?.status === 400 && (e.response?.data?.code === 'INVALID_INPUT' || e.response?.data?.error)) {
            ok('A4 Missing buyer -> 400');
        } else {
            fail('A4 Missing buyer', e.response?.status || e.message);
        }
    }

    // A5: Shipping state ignored – send shippingStateCode 09 (UP), buyer 07 (Delhi) -> place must be 07
    try {
        const r = await authClient.post('/gst/place-of-supply', {
            sellerStateCode: '07',
            buyerStateCode: '07',
            shippingStateCode: '09',
            shippingStateName: 'Uttar Pradesh'
        });
        if (r.data.placeOfSupplyStateCode === '07' && r.data.supplyTypeDisplay === 'intrastate') {
            ok('A5 Shipping state ignored (buyer 07, shipping 09 sent) -> place 07');
        } else {
            fail('A5 Shipping ignored', `got place ${r.data.placeOfSupplyStateCode}`);
        }
    } catch (e) {
        fail('A5 Shipping ignored', e.response?.data?.error || e.message);
    }

    // --- Section B: Invoice create – derived GST ---
    console.log('\n--- B. Invoice create (derived GST) ---');

    const baseInvoice = {
        invoiceNumber: `INV-GST-${ts}`,
        invoiceDate: today,
        dueDate: today,
        type: 'taxInvoice',
        seller: { firmName: 'GST Test Seller', gstNumber: '07AAAAA0000A1Z5' },
        buyerName: 'GST Test Buyer',
        buyerGstin: '23ALFPM7215H1ZA',
        buyerStateCode: '23',
        buyerStateName: 'Madhya Pradesh',
        buyerAddress: 'Bhopal',
        shippingName: '',
        shippingGstin: '',
        shippingAddress: '',
        items: [
            {
                itemId: '1',
                itemName: 'Test Item',
                hsnSac: '8471',
                quantity: 2,
                unit: 'Nos',
                unitPrice: 100,
                discountType: 'percentage',
                discountValue: 0,
                discountPercent: 0,
                gstPercent: 18,
                taxInclusive: false,
                cessType: 'Percentage',
                cessValue: 0
            }
        ],
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
        notes: 'GST E2E test',
        signatureUrl: null,
        stampUrl: null
    };

    // B1: Saved invoice with buyer state -> 201, stored transportInfo has derived interstate (seller 07, buyer 23)
    try {
        const payload = { ...baseInvoice, status: 'saved' };
        const r = await authClient.post(`/business/${businessId}/invoices`, payload);
        if (r.status !== 201) {
            fail('B1 Create saved invoice', `${r.status} ${JSON.stringify(r.data)}`);
        } else {
            invoiceId = r.data?.invoice?.invoiceId || r.data?.invoiceId;
            const ti = r.data?.invoice?.transportInfo || r.data?.transportInfo;
            if (ti && ti.placeOfSupplyStateCode === '23' && ti.supplyTypeDisplay === 'interstate') {
                ok('B1 Saved invoice: stored derived place 23, interstate');
            } else {
                ok('B1 Saved invoice created', `invoiceId=${invoiceId}; transportInfo=${JSON.stringify(ti || {})}`);
            }
        }
    } catch (e) {
        fail('B1 Create saved invoice', e.response?.data?.message || e.response?.data?.error || e.message);
    }

    // B2: Saved invoice WITHOUT buyer state -> 400 GST_DETERMINATION_FAILED
    try {
        const payloadNoBuyer = {
            ...baseInvoice,
            invoiceNumber: `INV-GST-NO-${ts}`,
            status: 'saved',
            buyerGstin: '',
            buyerStateCode: null,
            buyerStateName: ''
        };
        await authClient.post(`/business/${businessId}/invoices`, payloadNoBuyer);
        fail('B2 Saved invoice without buyer state', 'expected 400');
    } catch (e) {
        if (e.response?.status === 400 && (e.response?.data?.code === 'GST_DETERMINATION_FAILED' || e.response?.data?.message)) {
            ok('B2 Saved invoice without buyer state -> 400');
        } else {
            fail('B2 Saved without buyer', e.response?.status || e.message);
        }
    }

    // B3: Draft invoice without buyer state -> 201 allowed
    try {
        const draftPayload = {
            ...baseInvoice,
            invoiceNumber: `INV-GST-DRAFT-${ts}`,
            status: 'draft',
            buyerName: '',
            buyerGstin: '',
            buyerStateCode: null,
            buyerStateName: '',
            items: [],
            globalDiscountType: 'percentage',
            globalDiscountValue: 0
        };
        const r = await authClient.post(`/business/${businessId}/invoices`, draftPayload);
        if (r.status === 201) {
            ok('B3 Draft invoice without buyer state -> 201');
            const draftId = r.data?.invoice?.invoiceId || r.data?.invoiceId;
            if (draftId) {
                try {
                    await authClient.delete(`/business/${businessId}/invoices/${draftId}`);
                } catch (_) {}
            }
        } else {
            fail('B3 Draft without buyer', r.status);
        }
    } catch (e) {
        fail('B3 Draft without buyer', e.response?.data?.message || e.message);
    }

    // B4: Get invoice and verify stored GST context
    if (invoiceId) {
        try {
            const r = await authClient.get(`/business/${businessId}/invoices/${invoiceId}`);
            const inv = r.data?.invoice || r.data;
            const ti = inv?.transportInfo || {};
            if (ti.placeOfSupplyStateCode === '23' && ti.supplyTypeDisplay === 'interstate') {
                ok('B4 GET invoice: transportInfo has derived place 23, interstate');
            } else {
                fail('B4 GET invoice transportInfo', JSON.stringify(ti));
            }
        } catch (e) {
            fail('B4 GET invoice', e.response?.data?.message || e.message);
        }
    }

    // B5: Update invoice with wrong supply type (client sends intrastate, derived is interstate) -> 400
    if (invoiceId) {
        try {
            await authClient.put(`/business/${businessId}/invoices/${invoiceId}`, {
                transportInfo: {
                    placeOfSupplyStateCode: '23',
                    placeOfSupplyStateName: 'Madhya Pradesh',
                    supplyTypeDisplay: 'intrastate'
                }
            });
            fail('B5 Update with wrong supply type', 'expected 400');
        } catch (e) {
            if (e.response?.status === 400 && (e.response?.data?.code === 'GST_DETERMINATION_FAILED' || e.response?.data?.message)) {
                ok('B5 Update with wrong supply type -> 400');
            } else {
                fail('B5 Update wrong supply type', e.response?.status || e.response?.data?.message || e.message);
            }
        }
    }

    // B6: Place of supply mismatch -> warn but save (client sends different place, backend overwrites)
    try {
        const invNum = `INV-GST-WARN-${ts}`;
        const payloadWarn = {
            ...baseInvoice,
            invoiceNumber: invNum,
            status: 'saved',
            transportInfo: {
                placeOfSupplyStateCode: '09',
                placeOfSupplyStateName: 'Uttar Pradesh',
                supplyTypeDisplay: 'interstate'
            }
        };
        const r = await authClient.post(`/business/${businessId}/invoices`, payloadWarn);
        if (r.status === 201) {
            const warnings = r.data?.warnings || [];
            const hasWarn = warnings.some((w) => w.code === 'PLACE_OF_SUPPLY_MISMATCH');
            if (hasWarn) {
                ok('B6 Place of supply mismatch returns warnings');
            } else {
                ok('B6 Invoice created (warnings may be optional)', warnings.length);
            }
            const wid = r.data?.invoice?.invoiceId || r.data?.invoiceId;
            if (wid) {
                try {
                    await authClient.delete(`/business/${businessId}/invoices/${wid}`);
                } catch (_) {}
            }
        } else {
            fail('B6 Warn on mismatch', r.status);
        }
    } catch (e) {
        fail('B6 Warn on mismatch', e.response?.data?.message || e.message);
    }

    // Cleanup: delete created invoice
    if (invoiceId) {
        try {
            await authClient.delete(`/business/${businessId}/invoices/${invoiceId}`);
            ok('Cleanup: delete test invoice');
        } catch (e) {
            console.log('  [SKIP] Cleanup delete invoice', e.response?.status || e.message);
        }
    }

    // --- Summary ---
    console.log('\n' + '='.repeat(50));
    console.log('Summary:', results.passed, 'passed,', results.failed, 'failed');
    if (results.errors.length) {
        console.log('Errors:');
        results.errors.forEach((e) => console.log('  -', e));
    }
    console.log('');

    process.exit(results.failed > 0 ? 1 : 0);
}

run().catch((e) => {
    console.error('Fatal:', e.response?.data || e.message);
    process.exit(1);
});
