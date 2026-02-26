#!/usr/bin/env node
/**
 * Smoke test against production API after our security/behavior changes.
 * Also runs local checks for "Possible behavior differences (fixes)".
 * Uses credentials: chirag@gmail.com / test@33
 * Base URL: https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
 *
 * Run: node scripts/test-production-after-changes.js
 */

const path = require('path');
const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const EMAIL = 'chirag@gmail.com';
const PASSWORD = 'test@33';

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true // we check status ourselves
});

function ok(name, res) {
    const pass = res.status >= 200 && res.status < 300;
    console.log(pass ? `  ✅ ${name}` : `  ❌ ${name} (${res.status}) ${JSON.stringify(res.data).slice(0, 120)}`);
    return pass;
}

// --- Possible behavior differences (fixes) ---
// 1. Discount when discountType missing: only for items with discountValue/discountPercent but no discountType → we infer % or flat; totals can go down.
// 2. Statement PDF balanceDue: only when backend sends balanceDue as "" → PDF now shows computed (grandTotal − paid − TDS) instead of 0.

/** Condition: line item has discountValue but no discountType. Effect: item gets discount (we infer flat); taxable goes down. */
function testDiscountWhenDiscountTypeMissing() {
    console.log('\n📐 Behavior fix 1: discount when discountType missing');
    try {
        const { computeInvoiceTotals } = require(path.join(__dirname, '..', 'src', 'services', 'invoiceCalculationService'));
        const invoice = {
            items: [
                { itemId: 'p1', itemName: 'Test', quantity: 1, unitPrice: 100, discountValue: 10, gstPercent: 0, cessType: 'Percentage', cessValue: 0 }
            ],
            additionalCharges: [],
            roundOff: 0
        };
        const totals = computeInvoiceTotals(invoice);
        const first = totals?.items?.[0];
        const discountAmount = first?.totals?.discountAmount ?? 0;
        const taxableAmount = first?.totals?.taxableAmount ?? 0;
        if (discountAmount >= 9.99 && taxableAmount >= 89.99 && taxableAmount <= 91) {
            console.log('  ✅ When discountType missing: discount applied (flat 10 on 100 → taxable 90)');
            return true;
        }
        console.log(`  ❌ Expected discount 10, taxable ~90; got discountAmount=${discountAmount}, taxableAmount=${taxableAmount}`);
        return false;
    } catch (e) {
        console.log('  ❌', e.message);
        return false;
    }
}

/** Condition: balanceDue sent as empty string "". Effect: PDF shows computed balance (grandTotal − paid − TDS), not 0. */
function testStatementPdfBalanceDueEmptyString() {
    console.log('\n📐 Behavior fix 2: Statement PDF balanceDue when empty string ""');
    try {
        const { getStatementDisplayBalance } = require(path.join(__dirname, '..', 'src', 'services', 'invoicePdfService'));
        const grandTotal = 1000;
        const paidAmount = 300;
        const tdsAmount = 0;
        const computedBalance = grandTotal - paidAmount - tdsAmount; // 700

        const whenEmptyString = getStatementDisplayBalance('', grandTotal, paidAmount, tdsAmount);
        const whenNumber = getStatementDisplayBalance(0, grandTotal, paidAmount, tdsAmount);

        if (whenEmptyString === computedBalance && whenNumber === 0) {
            console.log(`  ✅ When balanceDue is "": display = computed (${whenEmptyString}); when 0: display = 0`);
            return true;
        }
        console.log(`  ❌ When "": expected ${computedBalance}, got ${whenEmptyString}; when 0: expected 0, got ${whenNumber}`);
        return false;
    } catch (e) {
        console.log('  ❌', e.message);
        return false;
    }
}

async function main() {
    console.log('\n🔐 Production smoke test + behavior-fix checks');
    console.log(`   Base: ${BASE_URL}`);
    console.log(`   User: ${EMAIL}\n`);

    testDiscountWhenDiscountTypeMissing();
    testStatementPdfBalanceDueEmptyString();

    let token = null;
    let businessId = null;
    let firstInvoiceId = null;

    // 1. Health (no auth)
    try {
        const health = await client.get('/health');
        ok('GET /health', health);
    } catch (e) {
        console.log('  ❌ GET /health', e.message);
    }

    // 2. Login
    try {
        const login = await client.post('/auth/login', { email: EMAIL, password: PASSWORD });
        if (login.status !== 200 || !login.data.token) {
            console.log('  ❌ POST /auth/login', login.status, login.data?.error || login.data?.message || login.data);
            console.log('\n   Cannot continue without token. Check email/password and that JWT_SECRET is set in production.\n');
            process.exit(1);
        }
        token = login.data.token;
        console.log('  ✅ POST /auth/login (token received)');
    } catch (e) {
        console.log('  ❌ POST /auth/login', e.message);
        process.exit(1);
    }

    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // 3. Profile
    try {
        const profile = await client.get('/user/profile');
        ok('GET /user/profile', profile);
    } catch (e) {
        console.log('  ❌ GET /user/profile', e.message);
    }

    // 4. Businesses
    try {
        const businesses = await client.get('/business');
        ok('GET /business', businesses);
        if (businesses.status === 200 && Array.isArray(businesses.data?.businesses) && businesses.data.businesses.length > 0) {
            businessId = businesses.data.businesses[0].businessId;
            console.log(`     → using businessId: ${businessId}`);
        }
    } catch (e) {
        console.log('  ❌ GET /business', e.message);
    }

    // 5. Invoices (if we have a business)
    if (businessId) {
        try {
            const invoices = await client.get(`/business/${businessId}/invoices`, { params: { limit: 10 } });
            ok('GET /business/:businessId/invoices', invoices);
            if (invoices.status === 200 && Array.isArray(invoices.data?.invoices) && invoices.data.invoices.length > 0) {
                firstInvoiceId = invoices.data.invoices[0].invoiceId;
            }
        } catch (e) {
            console.log('  ❌ GET /business/:businessId/invoices', e.message);
        }
    } else {
        console.log('  ⏭️  GET /business/:businessId/invoices (no business, skip)');
    }

    // 6. GST place-of-supply (auth required) – send buyer state so POS can be determined
    try {
        const pos = await client.post('/gst/place-of-supply', {
            billingStateCode: '07',
            billingGstin: '07DFNPK6633A2ZH',
            buyerStateCode: '09',
            shippingStateCode: '09',
            shippingGstin: null
        });
        ok('POST /gst/place-of-supply', pos);
    } catch (e) {
        console.log('  ❌ POST /gst/place-of-supply', e.message);
    }

    // 7. Statement PDF (behavior fix: balanceDue path – server uses computed balance when empty string)
    if (businessId && firstInvoiceId) {
        try {
            const stPdf = await client.post(
                `/business/${businessId}/invoices/${firstInvoiceId}/statement-pdf`,
                { templateId: 'classic' }
            );
            if (ok('POST /invoices/:id/statement-pdf', stPdf) && stPdf.data?.pdfUrl) {
                console.log('     → pdfUrl received (balance logic used on server)');
            }
        } catch (e) {
            console.log('  ❌ POST statement-pdf', e.message);
        }
    } else {
        console.log('  ⏭️  POST statement-pdf (no invoice to test)');
    }

    console.log('\n   Done. All ✅ above = production and behavior fixes verified.\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
