#!/usr/bin/env node
/**
 * Integration test for Inventory APIs: settings, product stock, adjust stock, stock movements,
 * list products with lowStock filter, and invoice stock deduction/reversal.
 *
 * Usage:
 *   BASE_URL=https://your-api.com node scripts/test-inventory-api.js
 *   Or: TEST_EMAIL=... TEST_PASSWORD=... BASE_URL=... node scripts/test-inventory-api.js
 *
 * Requires: axios (already in package.json)
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const TEST_EMAIL = process.env.TEST_EMAIL || 'chirag@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test@33';

const timestamp = Date.now();
const errors = [];
let authClient;
let businessId;
let productId;
let invoiceId;

function ok(label, condition, detail = '') {
    if (!condition) {
        errors.push(`${label}: FAIL ${detail}`);
        return false;
    }
    console.log(`  ✓ ${label}`);
    return true;
}

async function main() {
    console.log('\n=== Inventory API Integration Test ===\n');
    console.log('BASE_URL:', BASE_URL);
    console.log('');

    const client = axios.create({ baseURL: BASE_URL, timeout: 20000 });

    try {
        let token;
        try {
            const loginRes = await client.post('/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
            token = loginRes.data.token;
            console.log('Logged in.');
        } catch (e) {
            if (e.response?.status === 401 || e.response?.status === 404) {
                await client.post('/auth/register', { name: 'Inventory Test User', email: TEST_EMAIL, password: TEST_PASSWORD });
                const loginRes = await client.post('/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
                token = loginRes.data.token;
                console.log('Registered and logged in.');
            } else throw e;
        }

        authClient = axios.create({
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
                firmName: 'Inventory Test Business',
                gstNumber: '29ABCDE1234F1Z5',
                address: { street: '123 St', city: 'City', state: 'State', pincode: '560001' }
            });
            businessId = createBiz.data.business?.businessId || createBiz.data.businessId || createBiz.data.id;
        }
        console.log('Business ID:', businessId);
        console.log('');

        // --- 1. GET inventory settings (defaults) ---
        console.log('1. GET inventory settings');
        const getSettingsRes = await authClient.get(`/business/${businessId}/settings/inventory`);
        ok('GET settings returns 200', getSettingsRes.status === 200);
        const settings = getSettingsRes.data.inventorySettings;
        ok('inventorySettings exists', settings && typeof settings === 'object');
        ok('reduceStockOn is string', typeof settings.reduceStockOn === 'string');
        ok('stockValueBasedOn is string', typeof settings.stockValueBasedOn === 'string');
        ok('allowNegativeStock is boolean', typeof settings.allowNegativeStock === 'boolean');
        console.log('');

        // --- 2. PUT inventory settings ---
        console.log('2. PUT inventory settings');
        const putPayload = { reduceStockOn: 'invoice', stockValueBasedOn: 'purchase', allowNegativeStock: false };
        const putSettingsRes = await authClient.put(`/business/${businessId}/settings/inventory`, putPayload);
        ok('PUT settings returns 200', putSettingsRes.status === 200);
        const updatedSettings = putSettingsRes.data.inventorySettings;
        ok('PUT returns inventorySettings', updatedSettings && updatedSettings.reduceStockOn === 'invoice');
        console.log('');

        // --- 3. Create product with maintainStock ---
        console.log('3. Create product with maintainStock');
        const productPayload = {
            name: `Inventory Test Product ${timestamp}`,
            type: 'product',
            unit: 'Nos',
            salesPrice: 100,
            purchasePrice: 60,
            maintainStock: true,
            openingStock: 20,
            lowStockAlertQty: 5
        };
        const createProductRes = await authClient.post(`/business/${businessId}/products`, productPayload);
        ok('Create product returns 201', createProductRes.status === 201);
        const product = createProductRes.data.product;
        productId = product.productId || product.id;
        ok('Product has productId', !!productId);
        ok('Product has maintainStock true', product.maintainStock === true);
        ok('Product has currentStock 20', Number(product.currentStock) === 20);
        console.log('  Product ID:', productId);
        console.log('');

        // --- 4. GET product (currentStock, stockValue) ---
        console.log('4. GET product (currentStock, stockValue)');
        const getProductRes = await authClient.get(`/business/${businessId}/products/${productId}`);
        ok('GET product returns 200', getProductRes.status === 200);
        const getProduct = getProductRes.data;
        ok('GET product has currentStock', typeof getProduct.currentStock === 'number' || typeof getProduct.currentStock === 'string');
        ok('GET product has stockValue', typeof getProduct.stockValue === 'number');
        const currentStockAfterCreate = Number(getProduct.currentStock) || 0;
        ok('currentStock is 20', currentStockAfterCreate === 20);
        console.log('');

        // --- 5. Adjust stock (add 5) ---
        console.log('5. Adjust stock (add 5)');
        const addStockRes = await authClient.post(`/business/${businessId}/products/${productId}/stock`, {
            quantityChange: 5,
            remark: 'Test add'
        });
        ok('POST stock returns 200', addStockRes.status === 200);
        const addStockData = addStockRes.data;
        ok('Response has movement', addStockData.movement && addStockData.movement.quantityChange === 5);
        ok('Response has product', addStockData.product && Number(addStockData.product.currentStock) === 25);
        console.log('');

        // --- 6. GET stock movements ---
        console.log('6. GET stock movements');
        const movementsRes = await authClient.get(`/business/${businessId}/products/${productId}/stock-movements?limit=10`);
        ok('GET stock-movements returns 200', movementsRes.status === 200);
        const movements = movementsRes.data.stockMovements || [];
        ok('stockMovements is array', Array.isArray(movements));
        ok('At least one movement (adjustment)', movements.length >= 1);
        const adjustment = movements.find((m) => m.activityType === 'adjustment' && m.quantityChange === 5);
        ok('Movement has adjustment +5', !!adjustment);
        console.log('');

        // --- 7. Adjust stock (reduce 3) ---
        console.log('7. Adjust stock (reduce 3)');
        const reduceStockRes = await authClient.post(`/business/${businessId}/products/${productId}/stock`, {
            quantityChange: -3,
            remark: 'Test reduce'
        });
        ok('POST stock reduce returns 200', reduceStockRes.status === 200);
        const afterReduce = Number(reduceStockRes.data.product?.currentStock) ?? 0;
        ok('currentStock after reduce is 22', afterReduce === 22);
        console.log('');

        // --- 8. List products (optional lowStock filter) ---
        console.log('8. List products (with and without lowStock)');
        const listAllRes = await authClient.get(`/business/${businessId}/products`);
        ok('GET products returns 200', listAllRes.status === 200);
        const allProducts = listAllRes.data.products || [];
        const ourProduct = allProducts.find((p) => (p.productId || p.id) === productId);
        ok('Our product in list with currentStock', ourProduct && (typeof ourProduct.currentStock === 'number' || typeof ourProduct.currentStock === 'string'));
        const lowStockRes = await authClient.get(`/business/${businessId}/products?lowStock=true`);
        ok('GET products?lowStock=true returns 200', lowStockRes.status === 200);
        const lowStockProducts = lowStockRes.data.products || [];
        ok('lowStock is array', Array.isArray(lowStockProducts));
        console.log('');

        // --- 9. Create invoice (stock deduction) ---
        console.log('9. Create invoice (stock deduction)');
        const todayStr = new Date().toISOString().split('T')[0];
        const seller = { firmName: 'Test Firm', gstNumber: '29ABCDE1234F1Z5', address: { street: '123', city: 'City', state: 'State', pincode: '560001' } };
        const invoicePayload = {
            invoiceNumber: `INV-INV-${timestamp}`,
            invoiceDate: todayStr,
            type: 'taxInvoice',
            status: 'saved',
            seller,
            buyerName: 'Test Buyer',
            buyerAddress: '456 St',
            items: [
                {
                    itemId: productId,
                    itemName: product.name,
                    hsnSac: '8471',
                    quantity: 4,
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
            tcsInfo: null
        };
        const createInvRes = await authClient.post(`/business/${businessId}/invoices`, invoicePayload);
        ok('Create invoice returns 201', createInvRes.status === 201);
        invoiceId = createInvRes.data.invoice?.invoiceId || createInvRes.data.invoiceId;
        ok('Invoice created', !!invoiceId);
        console.log('');

        // --- 10. GET product after invoice (stock should be 22 - 4 = 18) ---
        console.log('10. GET product after invoice (stock deducted)');
        const getAfterInvRes = await authClient.get(`/business/${businessId}/products/${productId}`);
        const stockAfterInv = Number(getAfterInvRes.data.currentStock) || 0;
        ok('currentStock after invoice is 18', stockAfterInv === 18, `got ${stockAfterInv}`);
        console.log('');

        // --- 11. Delete invoice (stock reversal) ---
        console.log('11. Delete invoice (stock reversal)');
        const deleteInvRes = await authClient.delete(`/business/${businessId}/invoices/${invoiceId}`);
        ok('Delete invoice returns 200 or 204', deleteInvRes.status === 200 || deleteInvRes.status === 204);
        const getAfterDelRes = await authClient.get(`/business/${businessId}/products/${productId}`);
        const stockAfterDel = Number(getAfterDelRes.data.currentStock) || 0;
        ok('currentStock after delete invoice is 22', stockAfterDel === 22, `got ${stockAfterDel}`);
        console.log('');

        // --- 12. Error cases: adjust stock with zero (validation), insufficient stock ---
        console.log('12. Error cases');
        try {
            await authClient.post(`/business/${businessId}/products/${productId}/stock`, { quantityChange: 0 });
            ok('quantityChange 0 returns 400', false);
        } catch (e) {
            ok('quantityChange 0 returns 400', e.response?.status === 400);
        }
        try {
            await authClient.post(`/business/${businessId}/products/${productId}/stock`, { quantityChange: -1000 });
            ok('Insufficient stock returns 400', false);
        } catch (e) {
            const code = e.response?.data?.code;
            ok('Insufficient stock returns 400 with code', e.response?.status === 400 && (code === 'INSUFFICIENT_STOCK' || code === 'STOCK_ERROR'));
        }
        console.log('');

        // --- Summary ---
        console.log('========================================');
        if (errors.length === 0) {
            console.log('All inventory tests PASSED.');
            process.exit(0);
        } else {
            console.log('FAILED:', errors.length, 'check(s)');
            errors.forEach((e) => console.log('  -', e));
            process.exit(1);
        }
    } catch (err) {
        console.error('Fatal error:', err.response ? JSON.stringify(err.response.data) : err.message);
        if (errors.length) errors.forEach((e) => console.error('  -', e));
        process.exit(1);
    }
}

main();
