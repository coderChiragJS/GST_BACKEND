#!/usr/bin/env node
/**
 * Test script for Invoice, Quotation, Sales Debit Note, and Delivery Challan.
 * For each module: CREATE -> GET (before) -> UPDATE (additionalCharges, tcsInfo, globalDiscount, roundOff) -> GET (after) -> compare.
 * Verifies that updates are persisted and GET returns the same updated document.
 *
 * Usage:
 *   BASE_URL=https://your-api.com node scripts/test-all-modules-update-and-verify.js
 *   Or with login: TEST_EMAIL=... TEST_PASSWORD=... BASE_URL=... node scripts/test-all-modules-update-and-verify.js
 *
 * Requires: axios (npm install axios)
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const TEST_EMAIL = process.env.TEST_EMAIL || 'chirag@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test@33';

const timestamp = Date.now();
const seller = {
    firmName: 'Test Seller Firm',
    gstNumber: '29ABCDE1234F1Z5',
    address: { street: '123 Main St', city: 'Bangalore', state: 'Karnataka', pincode: '560001' }
};

const oneItem = [
    {
        itemId: 'item-1',
        itemName: 'Test Product',
        hsnSac: '8471',
        quantity: 10,
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
];

const todayStr = new Date().toISOString().split('T')[0];

// Fields we update and then verify (invoice, SDN, delivery challan support roundOff; quotation does not)
const updatePayloadFull = {
    additionalCharges: [
        { name: 'Handling Charge', amount: 100, gstPercent: 0, hsnSac: '', isTaxInclusive: false }
    ],
    tcsInfo: { percentage: 1, basis: 'finalAmount' },
    globalDiscountType: 'percentage',
    globalDiscountValue: 5,
    roundOff: 0.5
};
const updatePayloadQuotation = {
    additionalCharges: updatePayloadFull.additionalCharges,
    tcsInfo: updatePayloadFull.tcsInfo,
    globalDiscountType: updatePayloadFull.globalDiscountType,
    globalDiscountValue: updatePayloadFull.globalDiscountValue
};

function extractComparable(doc) {
    if (!doc) return null;
    return {
        additionalCharges: doc.additionalCharges ? [...doc.additionalCharges] : [],
        tcsInfo: doc.tcsInfo != null ? { ...doc.tcsInfo } : null,
        globalDiscountType: doc.globalDiscountType ?? null,
        globalDiscountValue: doc.globalDiscountValue ?? null,
        roundOff: doc.roundOff != null ? doc.roundOff : null
    };
}

function assertEqual(label, expected, actual, errors) {
    const e = JSON.stringify(expected);
    const a = JSON.stringify(actual);
    if (e !== a) {
        errors.push(`${label}: expected ${e}, got ${a}`);
    }
}

function runModuleTest(name, authClient, businessId, createFn, getUrl, updateUrl, updatePayload) {
    return new Promise((resolve) => {
        const result = { name, passed: false, before: null, after: null, errors: [], id: null };
        (async () => {
            try {
                const createRes = await createFn();
                const doc = createRes.data.invoice || createRes.data.quotation || createRes.data.salesDebitNote || createRes.data.deliveryChallan;
                result.id = doc.invoiceId || doc.quotationId || doc.salesDebitNoteId || doc.deliveryChallanId || doc.id;

                const getUrlWithId = typeof getUrl === 'function' ? getUrl(result.id) : getUrl.replace('{:id}', result.id);
                const updateUrlWithId = typeof updateUrl === 'function' ? updateUrl(result.id) : updateUrl.replace('{:id}', result.id);

                const getBeforeRes = await authClient.get(getUrlWithId);
                const beforeDoc = getBeforeRes.data.invoice || getBeforeRes.data.quotation || getBeforeRes.data.salesDebitNote || getBeforeRes.data.deliveryChallan;
                result.before = extractComparable(beforeDoc);

                await authClient.put(updateUrlWithId, updatePayload);

                const getAfterRes = await authClient.get(getUrlWithId);
                const afterDoc = getAfterRes.data.invoice || getAfterRes.data.quotation || getAfterRes.data.salesDebitNote || getAfterRes.data.deliveryChallan;
                result.after = extractComparable(afterDoc);

                const expected = extractComparable({ ...beforeDoc, ...updatePayload });
                assertEqual('additionalCharges length', expected.additionalCharges.length, result.after.additionalCharges.length, result.errors);
                if (expected.additionalCharges.length > 0) {
                    assertEqual('additionalCharges[0].name', expected.additionalCharges[0].name, result.after.additionalCharges[0]?.name, result.errors);
                }
                assertEqual('tcsInfo.percentage', expected.tcsInfo?.percentage, result.after.tcsInfo?.percentage, result.errors);
                assertEqual('globalDiscountType', expected.globalDiscountType, result.after.globalDiscountType, result.errors);
                assertEqual('globalDiscountValue', expected.globalDiscountValue, result.after.globalDiscountValue, result.errors);
                assertEqual('roundOff', expected.roundOff, result.after.roundOff, result.errors);

                result.passed = result.errors.length === 0;
            } catch (err) {
                result.errors.push(err.response ? `${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message);
            }
            resolve(result);
        })();
    });
}

async function main() {
    console.log('\n=== Test: Create -> GET (before) -> UPDATE -> GET (after) for all four modules ===\n');
    console.log('BASE_URL:', BASE_URL);
    console.log('');

    const client = axios.create({ baseURL: BASE_URL, timeout: 20000 });

    let token;
    let businessId;

    try {
        try {
            const loginRes = await client.post('/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
            token = loginRes.data.token;
            console.log('Logged in with existing user.');
        } catch (e) {
            if (e.response?.status === 401 || e.response?.status === 404) {
                await client.post('/auth/register', { name: 'Update Test User', email: TEST_EMAIL, password: TEST_PASSWORD });
                const loginRes = await client.post('/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
                token = loginRes.data.token;
                console.log('Registered and logged in.');
            } else throw e;
        }

        const authClient = axios.create({
            baseURL: BASE_URL,
            timeout: 20000,
            headers: { Authorization: `Bearer ${token}` }
        });

        const bizRes = await authClient.get('/business');
        const raw = bizRes.data;
        const businesses = Array.isArray(raw) ? raw : (raw?.businesses || []);
        const first = businesses[0];
        businessId = first?.businessId || first?.id || raw?.businessId;
        if (!businessId) {
            const createBiz = await authClient.post('/business', {
                firmName: 'Test Business',
                gstNumber: '29ABCDE1234F1Z5',
                address: { street: '123 St', city: 'City', state: 'State', pincode: '560001' }
            });
            businessId = createBiz.data.business?.businessId || createBiz.data.businessId || createBiz.data.id;
        }
        console.log('Business ID:', businessId);
        console.log('');

        const tests = [];

        // --- Invoice ---
        tests.push(
            runModuleTest(
                'Invoice',
                authClient,
                businessId,
                () =>
                    authClient.post(`/business/${businessId}/invoices`, {
                        invoiceNumber: `INV-${timestamp}`,
                        invoiceDate: todayStr,
                        type: 'taxInvoice',
                        status: 'saved',
                        seller,
                        buyerName: 'Test Buyer',
                        buyerAddress: '456 Buyer St',
                        items: oneItem,
                        additionalCharges: [],
                        globalDiscountType: 'percentage',
                        globalDiscountValue: 0,
                        tcsInfo: null
                    }),
                (id) => `/business/${businessId}/invoices/${id}`,
                (id) => `/business/${businessId}/invoices/${id}`,
                updatePayloadFull
            )
        );

        // --- Quotation ---
        tests.push(
            runModuleTest(
                'Quotation',
                authClient,
                businessId,
                () =>
                    authClient.post(`/business/${businessId}/quotations`, {
                        quotationNumber: `QT-${timestamp}`,
                        quotationDate: todayStr,
                        status: 'sent',
                        seller,
                        buyerName: 'Test Buyer',
                        buyerAddress: '456 Buyer St',
                        items: oneItem,
                        additionalCharges: [],
                        globalDiscountType: 'percentage',
                        globalDiscountValue: 0
                    }),
                (id) => `/business/${businessId}/quotations/${id}`,
                (id) => `/business/${businessId}/quotations/${id}`,
                updatePayloadQuotation
            )
        );

        // --- Sales Debit Note ---
        tests.push(
            runModuleTest(
                'Sales Debit Note',
                authClient,
                businessId,
                () =>
                    authClient.post(`/business/${businessId}/sales-debit-notes`, {
                        invoiceNumber: `SDN-${timestamp}`,
                        invoiceDate: todayStr,
                        status: 'saved',
                        seller,
                        buyerName: 'Test Buyer',
                        buyerAddress: '456 Buyer St',
                        items: oneItem,
                        additionalCharges: [],
                        globalDiscountType: 'percentage',
                        globalDiscountValue: 0,
                        tcsInfo: null
                    }),
                (id) => `/business/${businessId}/sales-debit-notes/${id}`,
                (id) => `/business/${businessId}/sales-debit-notes/${id}`,
                updatePayloadFull
            )
        );

        // --- Delivery Challan ---
        tests.push(
            runModuleTest(
                'Delivery Challan',
                authClient,
                businessId,
                () =>
                    authClient.post(`/business/${businessId}/delivery-challans`, {
                        challanNumber: `DC-${timestamp}`,
                        challanDate: todayStr,
                        status: 'delivered',
                        seller,
                        buyerName: 'Test Buyer',
                        buyerAddress: '456 Buyer St',
                        items: oneItem,
                        additionalCharges: [],
                        globalDiscountType: 'percentage',
                        globalDiscountValue: 0,
                        tcsInfo: null
                    }),
                (id) => `/business/${businessId}/delivery-challans/${id}`,
                (id) => `/business/${businessId}/delivery-challans/${id}`,
                updatePayloadFull
            )
        );

        const results = await Promise.all(tests);

        let allPassed = true;
        for (const r of results) {
            console.log('----------------------------------------');
            console.log(r.name, r.passed ? 'PASS' : 'FAIL');
            console.log('  ID:', r.id);
            console.log('  BEFORE (additionalCharges, tcsInfo, globalDiscount*, roundOff):', JSON.stringify(r.before, null, 2));
            console.log('  AFTER (expected updated):', JSON.stringify(r.after, null, 2));
            if (r.errors.length) {
                console.log('  ERRORS:', r.errors);
                allPassed = false;
            }
            console.log('');
        }

        console.log('========================================');
        console.log(allPassed ? 'All modules PASSED.' : 'One or more modules FAILED.');
        process.exit(allPassed ? 0 : 1);
    } catch (err) {
        console.error('Fatal error:', err.response ? err.response.data : err.message);
        process.exit(1);
    }
}

main();
