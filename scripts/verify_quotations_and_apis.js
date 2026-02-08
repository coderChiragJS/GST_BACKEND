/**
 * Verifies deployed API: health, auth, business, invoice (unchanged), quotation (new).
 * Usage: BASE_URL=https://your-api.execute-api.region.amazonaws.com/dev node scripts/verify_quotations_and_apis.js
 * Or with default: node scripts/verify_quotations_and_apis.js
 */
const https = require('https');

const API_URL = process.env.BASE_URL || 'https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev';
const timestamp = Date.now();
const userEmail = process.env.EMAIL || `quote_verify_${timestamp}@example.com`;
const password = process.env.PASSWORD || 'password123';
const useExistingUser = !!(process.env.EMAIL && process.env.PASSWORD);

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const base = API_URL.replace(/\/$/, '');
        const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;
        const options = {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    let token;
    let businessId;
    let quotationId;
    const errors = [];

    console.log('API base URL:', API_URL);
    console.log('--- 1. Health ---');
    const health = await request('/health');
    if (health.status !== 200) {
        errors.push(`Health failed: ${health.status}`);
    } else {
        console.log('OK', health.body);
    }

    console.log('\n--- 2. Register & Login ---');
    if (!useExistingUser) {
        const reg = await request('/auth/register', 'POST', { name: 'Quote Verify', email: userEmail, password });
        if (reg.status !== 201) {
            errors.push(`Register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
        } else {
            console.log('Register OK');
        }
    } else {
        console.log('Using existing credentials (EMAIL/PASSWORD env)');
    }
    const login = await request('/auth/login', 'POST', { email: userEmail, password });
    if (login.status !== 200 || !login.body.token) {
        errors.push(`Login failed: ${login.status}`);
    } else {
        token = login.body.token;
        console.log('Login OK');
    }

    if (!token) {
        console.log('Stopping: no token');
        console.log('Errors:', errors);
        process.exit(1);
    }

    console.log('\n--- 3. Get business (for scope) ---');
    const listRes = await request('/business', 'GET', null, token);
    const listBody = Array.isArray(listRes.body) ? listRes.body : (listRes.body.businesses || listRes.body) || [];
    businessId = listBody[0]?.businessId;
    if (!businessId && listRes.status === 200) {
        const bizCreate = await request('/business', 'POST', {
            firmName: 'Quote Test Firm',
            gstNumber: '27AABCA1234F1Z1',
            mobile: '9876543210',
            address: { city: 'Pune', state: 'MH' }
        }, token);
        if (bizCreate.status === 201) {
            businessId = bizCreate.body.business?.businessId || bizCreate.body.businessId;
            const list2 = await request('/business', 'GET', null, token);
            const list2Body = Array.isArray(list2.body) ? list2.body : (list2.body.businesses || list2.body) || [];
            if (!businessId) businessId = list2Body[0]?.businessId;
        }
    }
    if (businessId) console.log('Using businessId:', businessId);
    if (!businessId) {
        console.log('No businessId; skipping quotation tests. Errors:', errors);
        process.exit(errors.length ? 1 : 0);
    }

    console.log('\n--- 4. Quotation: create draft ---');
    const quotePayload = {
        quotationNumber: 'Q-' + timestamp,
        quotationDate: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'draft',
        seller: { firmName: 'Quote Test Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerName: '',
        items: [],
        additionalCharges: [],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        contactPersons: [{ name: 'Contact One', phone: '9999999999' }]
    };
    const createQuote = await request(`/business/${businessId}/quotations`, 'POST', quotePayload, token);
    if (createQuote.status !== 201) {
        errors.push(`Create quotation: ${createQuote.status} ${JSON.stringify(createQuote.body)}`);
    } else {
        quotationId = createQuote.body.quotation?.quotationId || createQuote.body.quotationId;
        console.log('Create quotation OK, id:', quotationId);
    }

    console.log('\n--- 5. Quotation: list ---');
    const listQuote = await request(`/business/${businessId}/quotations`, 'GET', null, token);
    if (listQuote.status !== 200) {
        errors.push(`List quotations: ${listQuote.status}`);
    } else {
        const qs = listQuote.body.quotations || [];
        console.log('List quotations OK, count:', qs.length);
    }

    if (quotationId) {
        console.log('\n--- 6. Quotation: get one ---');
        const getQuote = await request(`/business/${businessId}/quotations/${quotationId}`, 'GET', null, token);
        if (getQuote.status !== 200) errors.push(`Get quotation: ${getQuote.status}`);
        else console.log('Get quotation OK');

        console.log('\n--- 7. Quotation: update ---');
        const updateQuote = await request(`/business/${businessId}/quotations/${quotationId}`, 'PUT', { status: 'sent', buyerName: 'Test Buyer', items: [{ itemId: '1', itemName: 'Item A', quantity: 1, unit: 'Nos', unitPrice: 100, discountType: 'percentage', discountValue: 0, discountPercent: 0, gstPercent: 18, taxInclusive: false, cessType: 'Percentage', cessValue: 0 }] }, token);
        if (updateQuote.status !== 200) errors.push(`Update quotation: ${updateQuote.status}`);
        else console.log('Update quotation OK');

        console.log('\n--- 8. Quotation: delete ---');
        const delQuote = await request(`/business/${businessId}/quotations/${quotationId}`, 'DELETE', null, token);
        if (delQuote.status !== 204) errors.push(`Delete quotation: ${delQuote.status}`);
        else console.log('Delete quotation OK (204)');
    }

    console.log('\n--- 9. Invoice list (ensure unchanged) ---');
    const listInv = await request(`/business/${businessId}/invoices`, 'GET', null, token);
    if (listInv.status !== 200) errors.push(`List invoices: ${listInv.status}`);
    else console.log('List invoices OK');

    console.log('\n--- 10. GST/master (no regression) ---');
    const states = await request('/master/states', 'GET', null, token);
    if (states.status !== 200) errors.push(`Master states: ${states.status}`);
    else console.log('Master states OK');

    if (errors.length) {
        console.log('\nErrors:', errors);
        process.exit(1);
    }
    console.log('\nAll checks passed.');
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
