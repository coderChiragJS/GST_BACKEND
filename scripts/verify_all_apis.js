/**
 * Comprehensive API verification: health, auth, business, party, product, invoice,
 * quotation, sales-debit-notes, delivery-challans, receipts, GST/master, invoice-templates.
 * Covers CRUD, PDF endpoints, and key negative cases (400, 401, 409).
 *
 * Usage:
 *   BASE_URL=https://your-api.execute-api.region.amazonaws.com/dev \
 *   EMAIL=chirag@gmail.com PASSWORD=test@33 \
 *   node scripts/verify_all_apis.js
 *
 * Defaults: BASE_URL=https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev,
 *           EMAIL=chirag@gmail.com, PASSWORD=test@33
 */

const https = require('https');

const BASE_URL =
    process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const EMAIL = process.env.EMAIL || 'chirag@gmail.com';
const PASSWORD = process.env.PASSWORD || 'test@33';

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const base = BASE_URL.replace(/\/$/, '');
        const url =
            path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;
        const options = {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers.Authorization = `Bearer ${token}`;

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
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
    console.log('API base URL:', BASE_URL);
    console.log('Using email:', EMAIL);

    const errors = [];
    let token;
    let businessId;
    let partyId;
    let productId;
    let invoiceId;
    let quotationId;
    let salesDebitNoteId;
    let challanId;
    let receiptId;
    const ts = Date.now();
    const today = new Date().toISOString().split('T')[0];

    function ok(label, detail) {
        console.log('  OK', label, detail !== undefined ? detail : '');
    }
    function fail(label, detail) {
        const msg = detail ? `${label}: ${detail}` : label;
        console.error('  [ERROR]', msg);
        errors.push(msg);
    }

    // --- 1. Health ---
    console.log('\n--- 1. Health ---');
    const health = await request('/health');
    if (health.status !== 200) fail('Health', String(health.status));
    else ok('Health', health.body?.status || '200');

    // --- 2. Auth: valid login ---
    console.log('\n--- 2. Auth (valid login) ---');
    const login = await request('/auth/login', 'POST', { email: EMAIL, password: PASSWORD }, null);
    if (login.status !== 200 || !login.body?.token) {
        fail('Login', `${login.status} ${JSON.stringify(login.body)}`);
        console.log('Stopping: no token. Set BASE_URL, EMAIL, PASSWORD and retry.');
        process.exit(errors.length ? 1 : 0);
        return;
    }
    token = login.body.token;
    ok('Login');

    // --- 2b. Auth: invalid login (401) ---
    console.log('\n--- 2b. Auth (invalid credentials → 401) ---');
    const badLogin = await request('/auth/login', 'POST', { email: EMAIL, password: 'wrong' }, null);
    if (badLogin.status !== 401) fail('Invalid login should return 401', String(badLogin.status));
    else ok('Invalid login 401');

    // --- 3. Business ---
    console.log('\n--- 3. Business ---');
    const bizList = await request('/business', 'GET', null, token);
    const businesses = Array.isArray(bizList.body)
        ? bizList.body
        : bizList.body?.businesses || bizList.body?.data || [];
    businessId = businesses[0]?.businessId || businesses[0]?.id;
    if (!businessId && bizList.status === 200) {
        const createBiz = await request(
            '/business',
            'POST',
            {
                firmName: 'Verify All APIs Firm',
                gstNumber: '27AABCA1234F1Z1',
                mobile: '9876543210',
                address: { city: 'Pune', state: 'MH' }
            },
            token
        );
        if (createBiz.status === 201) {
            businessId =
                createBiz.body?.business?.businessId ||
                createBiz.body?.businessId ||
                createBiz.body?.business?.id;
        }
        if (!businessId) {
            const list2 = await request('/business', 'GET', null, token);
            const list2Body = Array.isArray(list2.body)
                ? list2.body
                : list2.body?.businesses || list2.body?.data || [];
            businessId = list2Body[0]?.businessId || list2Body[0]?.id;
        }
    }
    if (!businessId) {
        fail('No business found');
        process.exit(errors.length ? 1 : 0);
        return;
    }
    ok('Business', businessId);

    // --- 4. Party: create, list, get, put, negative (invalid body → 400) ---
    console.log('\n--- 4. Party (CRUD + negative) ---');
    const partyPayload = {
        companyName: 'Verify All Party',
        gstNumber: '27AABCA1234F1Z1',
        mobile: '9876543210',
        email: 'verify-party@example.com',
        billingAddress: {
            street: 'Test St',
            city: 'Pune',
            state: 'MH',
            pincode: '411001',
            country: 'India'
        },
        sameAsBilling: true,
        shippingAddress: {
            street: 'Test St',
            city: 'Pune',
            state: 'MH',
            pincode: '411001',
            country: 'India'
        },
        paymentTerms: 0,
        openingBalance: 0,
        openingBalanceType: 'TO_RECEIVE',
        partyType: 'Company',
        gstTreatment: 'Regular',
        taxPreference: 'Inclusive',
        tdsApplicable: false,
        tcsApplicable: false
    };
    const createParty = await request('/parties', 'POST', partyPayload, token);
    if (createParty.status !== 201) {
        fail('Create party', `${createParty.status} ${JSON.stringify(createParty.body)}`);
    } else {
        const party = createParty.body?.data || createParty.body;
        partyId = party?.partyId || party?.id;
        ok('Create party', partyId);
    }

    const listParties = await request('/parties', 'GET', null, token);
    if (listParties.status !== 200) fail('List parties', String(listParties.status));
    else ok('List parties');

    if (partyId) {
        const getParty = await request(`/parties/${partyId}`, 'GET', null, token);
        if (getParty.status !== 200) fail('Get party', String(getParty.status));
        else ok('Get party');

        const updateParty = await request(`/parties/${partyId}`, 'PUT', { companyName: 'Verify All Party Updated' }, token);
        if (updateParty.status !== 200) fail('Update party', String(updateParty.status));
        else ok('Update party');
    }

    const invalidParty = await request(
        '/parties',
        'POST',
        { companyName: 'X', gstNumber: 'invalid', mobile: '9876543210', billingAddress: partyPayload.billingAddress, sameAsBilling: true },
        token
    );
    if (invalidParty.status !== 400) fail('Party invalid body should return 400', String(invalidParty.status));
    else ok('Party invalid body 400');

    const fakeId = '00000000-0000-0000-0000-000000000001';
    const getParty404 = await request(`/parties/${fakeId}`, 'GET', null, token);
    if (getParty404.status !== 404) fail('Get party with wrong id should return 404', String(getParty404.status));
    else ok('Party 404');

    // --- 5. Product: create, list, get, put, negative (missing name → 400) ---
    console.log('\n--- 5. Product (CRUD + negative) ---');
    const productPayload = { name: 'Verify Product', type: 'product', unit: 'Nos' };
    const createProduct = await request(
        `/business/${businessId}/products`,
        'POST',
        productPayload,
        token
    );
    if (createProduct.status !== 201) {
        fail('Create product', `${createProduct.status} ${JSON.stringify(createProduct.body)}`);
    } else {
        const product = createProduct.body?.data || createProduct.body?.product || createProduct.body;
        productId = product?.productId || product?.id;
        ok('Create product', productId);
    }

    const listProducts = await request(`/business/${businessId}/products`, 'GET', null, token);
    if (listProducts.status !== 200) fail('List products', String(listProducts.status));
    else ok('List products');

    if (productId) {
        const getProduct = await request(
            `/business/${businessId}/products/${productId}`,
            'GET',
            null,
            token
        );
        if (getProduct.status !== 200) fail('Get product', String(getProduct.status));
        else ok('Get product');

        const updateProduct = await request(
            `/business/${businessId}/products/${productId}`,
            'PUT',
            { name: 'Verify Product Updated' },
            token
        );
        if (updateProduct.status !== 200) fail('Update product', String(updateProduct.status));
        else ok('Update product');
    }

    const invalidProduct = await request(
        `/business/${businessId}/products`,
        'POST',
        { type: 'product' },
        token
    );
    if (invalidProduct.status !== 400) fail('Product missing name should return 400', String(invalidProduct.status));
    else ok('Product invalid body 400');

    const getProduct404 = await request(`/business/${businessId}/products/${fakeId}`, 'GET', null, token);
    if (getProduct404.status !== 404) fail('Get product with wrong id should return 404', String(getProduct404.status));
    else ok('Product 404');

    // Resolve party for invoice/receipt (use created party or first from list)
    let buyerName = 'Verify All Buyer';
    if (partyId) {
        const p = (listParties.body?.data || []).find((x) => (x.partyId || x.id) === partyId);
        if (p) buyerName = p.companyName || p.partyName || buyerName;
    }

    // --- 6. Invoice: create (saved), list, get, put, pdf, statement-pdf, negative 409 & 400 ---
    console.log('\n--- 6. Invoice (CRUD + PDF + negatives) ---');
    const invoiceNumber = 'INV-VERIFY-' + ts;
    const invoicePayload = {
        invoiceNumber,
        invoiceDate: today,
        dueDate: today,
        type: 'taxInvoice',
        status: 'saved',
        seller: { firmName: 'Verify Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerId: partyId || null,
        buyerName,
        buyerGstin: '',
        buyerStateCode: '27',
        buyerStateName: 'Maharashtra',
        buyerAddress: 'Pune, MH',
        shippingName: '',
        shippingGstin: '',
        shippingAddress: '',
        items: [
            {
                itemId: '1',
                itemName: 'Item A',
                hsnSac: '',
                quantity: 1,
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
        notes: 'Verify all APIs',
        signatureUrl: null,
        stampUrl: null
    };

    const createInvoice = await request(
        `/business/${businessId}/invoices`,
        'POST',
        invoicePayload,
        token
    );
    if (createInvoice.status !== 201) {
        fail('Create invoice', `${createInvoice.status} ${JSON.stringify(createInvoice.body)}`);
    } else {
        const inv = createInvoice.body?.invoice || createInvoice.body;
        invoiceId = inv?.invoiceId || inv?.id;
        ok('Create invoice', invoiceId);
    }

    const listInvoices = await request(`/business/${businessId}/invoices`, 'GET', null, token);
    if (listInvoices.status !== 200) fail('List invoices', String(listInvoices.status));
    else ok('List invoices');

    const listInvoicesStatus = await request(`/business/${businessId}/invoices?status=saved`, 'GET', null, token);
    if (listInvoicesStatus.status !== 200) fail('List invoices with status=saved', String(listInvoicesStatus.status));
    else ok('List invoices ?status=saved');

    const listInvoicesLimit = await request(`/business/${businessId}/invoices?limit=5`, 'GET', null, token);
    if (listInvoicesLimit.status !== 200) fail('List invoices with limit=5', String(listInvoicesLimit.status));
    else ok('List invoices ?limit=5');

    const listInvoicesBadStatus = await request(`/business/${businessId}/invoices?status=invalid`, 'GET', null, token);
    if (listInvoicesBadStatus.status !== 400) fail('List invoices with invalid status should return 400', String(listInvoicesBadStatus.status));
    else ok('List invoices ?status=invalid → 400');

    const getInvoice404 = await request(`/business/${businessId}/invoices/${fakeId}`, 'GET', null, token);
    if (getInvoice404.status !== 404) fail('Get invoice with wrong id should return 404', String(getInvoice404.status));
    else ok('Invoice 404');

    if (invoiceId) {
        const getInvoice = await request(
            `/business/${businessId}/invoices/${invoiceId}`,
            'GET',
            null,
            token
        );
        if (getInvoice.status !== 200) fail('Get invoice', String(getInvoice.status));
        else {
            ok('Get invoice');
            const invBody = getInvoice.body?.invoice || getInvoice.body;
            if (invBody && typeof invBody.paidAmount !== 'undefined') ok('Invoice has paidAmount');
        }

        const updateInvoice = await request(
            `/business/${businessId}/invoices/${invoiceId}`,
            'PUT',
            { notes: 'Updated by verify_all_apis' },
            token
        );
        if (updateInvoice.status !== 200) fail('Update invoice', String(updateInvoice.status));
        else ok('Update invoice');

        const pdfInv = await request(
            `/business/${businessId}/invoices/${invoiceId}/pdf`,
            'POST',
            { templateId: 'classic' },
            token
        );
        if (pdfInv.status !== 200 || !pdfInv.body?.pdfUrl) fail('Invoice PDF', `${pdfInv.status} ${JSON.stringify(pdfInv.body)}`);
        else ok('Invoice PDF');

        const stmtPdf = await request(
            `/business/${businessId}/invoices/${invoiceId}/statement-pdf`,
            'POST',
            { templateId: 'classic' },
            token
        );
        if (stmtPdf.status !== 200 && stmtPdf.status !== 201) fail('Invoice statement PDF', String(stmtPdf.status));
        else ok('Invoice statement PDF');
    }

    const dupInvoice = await request(
        `/business/${businessId}/invoices`,
        'POST',
        { ...invoicePayload, invoiceNumber },
        token
    );
    if (dupInvoice.status !== 409) fail('Duplicate invoice number should return 409', String(dupInvoice.status));
    else ok('Duplicate invoice 409');

    const invalidInvoice = await request(
        `/business/${businessId}/invoices`,
        'POST',
        { invoiceNumber: 'INV-BAD', status: 'invalid', buyerName: '' },
        token
    );
    if (invalidInvoice.status !== 400) fail('Invalid invoice body should return 400', String(invalidInvoice.status));
    else ok('Invalid invoice 400');

    // --- 7. Quotation: create, list, get, put, pdf, negative 400 ---
    console.log('\n--- 7. Quotation (CRUD + PDF + negative) ---');
    const quoteNumber = 'QTN-VERIFY-' + ts;
    const quotePayload = {
        quotationNumber: quoteNumber,
        quotationDate: today,
        validUntil: today,
        status: 'draft',
        seller: { firmName: 'Verify Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerName: '',
        items: [],
        additionalCharges: [],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        contactPersons: [{ name: 'Contact', phone: '9999999999' }]
    };
    const createQuote = await request(
        `/business/${businessId}/quotations`,
        'POST',
        quotePayload,
        token
    );
    if (createQuote.status !== 201) {
        fail('Create quotation', `${createQuote.status} ${JSON.stringify(createQuote.body)}`);
    } else {
        const q = createQuote.body?.quotation || createQuote.body?.data || createQuote.body;
        quotationId = q?.quotationId || q?.id;
        ok('Create quotation', quotationId);
    }

    const listQuotes = await request(`/business/${businessId}/quotations`, 'GET', null, token);
    if (listQuotes.status !== 200) fail('List quotations', String(listQuotes.status));
    else ok('List quotations');

    const listQuotesLimit = await request(`/business/${businessId}/quotations?limit=5`, 'GET', null, token);
    if (listQuotesLimit.status !== 200) fail('List quotations with limit=5', String(listQuotesLimit.status));
    else ok('List quotations ?limit=5');

    const getQuote404 = await request(`/business/${businessId}/quotations/${fakeId}`, 'GET', null, token);
    if (getQuote404.status !== 404) fail('Get quotation with wrong id should return 404', String(getQuote404.status));
    else ok('Quotation 404');

    if (quotationId) {
        const getQuote = await request(
            `/business/${businessId}/quotations/${quotationId}`,
            'GET',
            null,
            token
        );
        if (getQuote.status !== 200) fail('Get quotation', String(getQuote.status));
        else ok('Get quotation');

        const updateQuote = await request(
            `/business/${businessId}/quotations/${quotationId}`,
            'PUT',
            { notes: 'Updated by verify_all_apis' },
            token
        );
        if (updateQuote.status !== 200) fail('Update quotation', String(updateQuote.status));
        else ok('Update quotation');

        const pdfQuote = await request(
            `/business/${businessId}/quotations/${quotationId}/pdf`,
            'POST',
            { templateId: 'classic' },
            token
        );
        if (pdfQuote.status !== 200 && pdfQuote.status !== 201) fail('Quotation PDF', String(pdfQuote.status));
        else ok('Quotation PDF');
    }

    const invalidQuote = await request(
        `/business/${businessId}/quotations`,
        'POST',
        { quotationNumber: 'QTN-BAD', status: 'invalid' },
        token
    );
    if (invalidQuote.status !== 400) fail('Invalid quotation body should return 400', String(invalidQuote.status));
    else ok('Invalid quotation 400');

    // --- 8. Sales Debit Note: create, list, get, put, pdf, negative 409 ---
    console.log('\n--- 8. Sales Debit Note (CRUD + PDF + negative) ---');
    const sdnNumber = 'SDN-VERIFY-' + ts;
    const sdnPayload = {
        invoiceNumber: sdnNumber,
        invoiceDate: today,
        dueDate: today,
        status: 'saved',
        seller: { firmName: 'Verify Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerName,
        buyerGstin: '',
        buyerStateCode: '27',
        buyerStateName: 'Maharashtra',
        buyerAddress: 'Pune, MH',
        shippingName: '',
        shippingGstin: '',
        shippingAddress: '',
        items: [
            {
                itemId: '1',
                itemName: 'Item A',
                hsnSac: '',
                quantity: 1,
                unit: 'Nos',
                unitPrice: 50,
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
        notes: 'Verify all APIs SDN'
    };
    const createSDN = await request(
        `/business/${businessId}/sales-debit-notes`,
        'POST',
        sdnPayload,
        token
    );
    if (createSDN.status !== 201) {
        fail('Create sales debit note', `${createSDN.status} ${JSON.stringify(createSDN.body)}`);
    } else {
        const sdn = createSDN.body?.salesDebitNote || createSDN.body?.data || createSDN.body;
        salesDebitNoteId = sdn?.salesDebitNoteId || sdn?.id;
        ok('Create SDN', salesDebitNoteId);
    }

    const listSDN = await request(`/business/${businessId}/sales-debit-notes`, 'GET', null, token);
    if (listSDN.status !== 200) fail('List sales debit notes', String(listSDN.status));
    else ok('List SDN');

    const listSDNStatus = await request(`/business/${businessId}/sales-debit-notes?status=saved`, 'GET', null, token);
    if (listSDNStatus.status !== 200) fail('List SDN with status=saved', String(listSDNStatus.status));
    else ok('List SDN ?status=saved');

    const getSDN404 = await request(`/business/${businessId}/sales-debit-notes/${fakeId}`, 'GET', null, token);
    if (getSDN404.status !== 404) fail('Get SDN with wrong id should return 404', String(getSDN404.status));
    else ok('SDN 404');

    if (salesDebitNoteId) {
        const getSDN = await request(
            `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}`,
            'GET',
            null,
            token
        );
        if (getSDN.status !== 200) fail('Get SDN', String(getSDN.status));
        else ok('Get SDN');

        const updateSDN = await request(
            `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}`,
            'PUT',
            { notes: 'Updated by verify_all_apis' },
            token
        );
        if (updateSDN.status !== 200) fail('Update SDN', String(updateSDN.status));
        else ok('Update SDN');

        const pdfSDN = await request(
            `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}/pdf`,
            'POST',
            { templateId: 'classic' },
            token
        );
        if (pdfSDN.status !== 200 && pdfSDN.status !== 201) fail('SDN PDF', String(pdfSDN.status));
        else ok('SDN PDF');
    }

    const dupSDN = await request(
        `/business/${businessId}/sales-debit-notes`,
        'POST',
        { ...sdnPayload, invoiceNumber: sdnNumber },
        token
    );
    if (dupSDN.status !== 409) fail('Duplicate SDN number should return 409', String(dupSDN.status));
    else ok('Duplicate SDN 409');

    // --- 9. Delivery Challan: create, list, get, put, pdf, negative 409 ---
    console.log('\n--- 9. Delivery Challan (CRUD + PDF + negative) ---');
    const dcNumber = 'DC-VERIFY-' + ts;
    const dcPayload = {
        challanNumber: dcNumber,
        challanDate: today,
        status: 'pending',
        seller: { firmName: 'Verify Firm', gstNumber: '27AABCA1234F1Z1' },
        buyerName,
        buyerGstin: '',
        buyerStateCode: '27',
        buyerStateName: 'Maharashtra',
        buyerAddress: 'Pune, MH',
        shippingName: '',
        shippingGstin: '',
        shippingAddress: '',
        items: [
            {
                itemId: '1',
                itemName: 'Item A',
                hsnSac: '',
                quantity: 1,
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
        notes: 'Verify all APIs DC'
    };
    const createDC = await request(
        `/business/${businessId}/delivery-challans`,
        'POST',
        dcPayload,
        token
    );
    if (createDC.status !== 201) {
        fail('Create delivery challan', `${createDC.status} ${JSON.stringify(createDC.body)}`);
    } else {
        const dc = createDC.body?.deliveryChallan || createDC.body?.data || createDC.body;
        challanId = dc?.deliveryChallanId || dc?.challanId || dc?.id;
        ok('Create delivery challan', challanId);
    }

    const listDC = await request(`/business/${businessId}/delivery-challans`, 'GET', null, token);
    if (listDC.status !== 200) fail('List delivery challans', String(listDC.status));
    else ok('List delivery challans');

    const listDCStatus = await request(`/business/${businessId}/delivery-challans?status=pending`, 'GET', null, token);
    if (listDCStatus.status !== 200) fail('List delivery challans with status=pending', String(listDCStatus.status));
    else ok('List delivery-challans ?status=pending');

    const getDC404 = await request(`/business/${businessId}/delivery-challans/${fakeId}`, 'GET', null, token);
    if (getDC404.status !== 404) fail('Get delivery challan with wrong id should return 404', String(getDC404.status));
    else ok('Delivery challan 404');

    if (challanId) {
        const getDC = await request(
            `/business/${businessId}/delivery-challans/${challanId}`,
            'GET',
            null,
            token
        );
        if (getDC.status !== 200) fail('Get delivery challan', String(getDC.status));
        else ok('Get delivery challan');

        const updateDC = await request(
            `/business/${businessId}/delivery-challans/${challanId}`,
            'PUT',
            { notes: 'Updated by verify_all_apis' },
            token
        );
        if (updateDC.status !== 200) fail('Update delivery challan', String(updateDC.status));
        else ok('Update delivery challan');

        const pdfDC = await request(
            `/business/${businessId}/delivery-challans/${challanId}/pdf`,
            'POST',
            { templateId: 'classic' },
            token
        );
        if (pdfDC.status !== 200 && pdfDC.status !== 201) fail('Delivery challan PDF', String(pdfDC.status));
        else ok('Delivery challan PDF');
    }

    const dupDC = await request(
        `/business/${businessId}/delivery-challans`,
        'POST',
        { ...dcPayload, challanNumber: dcNumber },
        token
    );
    if (dupDC.status !== 409) fail('Duplicate challan number should return 409', String(dupDC.status));
    else ok('Duplicate challan 409');

    // --- 10. Receipt: create (with allocation to invoice), list, get, put, pdf, negative 409, 400 ---
    console.log('\n--- 10. Receipt (CRUD + PDF + negatives) ---');
    const receiptNumber = 'PR-VERIFY-' + ts;
    const invoiceTotal = 118;
    const allocatedAmount = 50;
    const receiptPayload = {
        receiptNumber,
        receiptDate: today,
        partyId: partyId || null,
        partyName: buyerName,
        amountCollected: allocatedAmount,
        paymentMode: 'Cash',
        accountId: null,
        accountName: 'Cash Account',
        notes: 'Verify all APIs receipt',
        tdsAmount: 0,
        allocations: invoiceId
            ? [
                  {
                      invoiceId,
                      invoiceNumber,
                      invoiceTotalAmount: invoiceTotal,
                      allocatedAmount
                  }
              ]
            : []
    };

    const createReceipt = await request(
        `/business/${businessId}/receipts`,
        'POST',
        receiptPayload,
        token
    );
    if (createReceipt.status !== 201) {
        fail('Create receipt', `${createReceipt.status} ${JSON.stringify(createReceipt.body)}`);
    } else {
        const rec = createReceipt.body?.receipt || createReceipt.body?.data || createReceipt.body;
        receiptId = rec?.receiptId || rec?.id;
        ok('Create receipt', receiptId);
    }

    const listReceipts = await request(`/business/${businessId}/receipts`, 'GET', null, token);
    if (listReceipts.status !== 200) fail('List receipts', String(listReceipts.status));
    else ok('List receipts');

    const listReceiptsLimit = await request(`/business/${businessId}/receipts?limit=5`, 'GET', null, token);
    if (listReceiptsLimit.status !== 200) fail('List receipts with limit=5', String(listReceiptsLimit.status));
    else ok('List receipts ?limit=5');

    const getReceipt404 = await request(`/business/${businessId}/receipts/${fakeId}`, 'GET', null, token);
    if (getReceipt404.status !== 404) fail('Get receipt with wrong id should return 404', String(getReceipt404.status));
    else ok('Receipt 404');

    if (receiptId) {
        const getReceipt = await request(
            `/business/${businessId}/receipts/${receiptId}`,
            'GET',
            null,
            token
        );
        if (getReceipt.status !== 200) fail('Get receipt', String(getReceipt.status));
        else ok('Get receipt');

        const updateReceipt = await request(
            `/business/${businessId}/receipts/${receiptId}`,
            'PUT',
            { notes: 'Updated by verify_all_apis' },
            token
        );
        if (updateReceipt.status !== 200) fail('Update receipt', String(updateReceipt.status));
        else ok('Update receipt');

        const pdfRec = await request(
            `/business/${businessId}/receipts/${receiptId}/pdf`,
            'POST',
            { templateId: 'classic' },
            token
        );
        if (pdfRec.status !== 200 || !pdfRec.body?.pdfUrl) fail('Receipt PDF', `${pdfRec.status} ${JSON.stringify(pdfRec.body)}`);
        else ok('Receipt PDF');
    }

    const dupReceipt = await request(
        `/business/${businessId}/receipts`,
        'POST',
        receiptPayload,
        token
    );
    if (dupReceipt.status !== 409) fail('Duplicate receipt number should return 409', String(dupReceipt.status));
    else ok('Duplicate receipt 409');

    const invalidAllocPayload = {
        ...receiptPayload,
        receiptNumber: 'PR-INVALID-ALLOC-' + ts,
        allocations: invoiceId
            ? [
                  {
                      invoiceId,
                      invoiceNumber,
                      invoiceTotalAmount: invoiceTotal,
                      allocatedAmount: 999999
                  }
              ]
            : []
    };
    const invalidAlloc = await request(
        `/business/${businessId}/receipts`,
        'POST',
        invalidAllocPayload,
        token
    );
    if (invalidAlloc.status !== 400) fail('Allocation exceeding balance should return 400', String(invalidAlloc.status));
    else ok('Invalid allocation 400');

    const invalidReceiptFormat = await request(
        `/business/${businessId}/receipts`,
        'POST',
        {
            receiptNumber: 'INVALID-NO-PR',
            receiptDate: today,
            partyName: buyerName,
            amountCollected: 10,
            paymentMode: 'Cash',
            accountName: 'Cash',
            notes: '',
            tdsAmount: 0,
            allocations: []
        },
        token
    );
    if (invalidReceiptFormat.status !== 400) fail('Receipt number must start with PR → 400', String(invalidReceiptFormat.status));
    else ok('Invalid receipt format 400');

    const invalidPaymentMode = await request(
        `/business/${businessId}/receipts`,
        'POST',
        {
            receiptNumber: 'PR-BAD-MODE-' + ts,
            receiptDate: today,
            partyName: buyerName,
            amountCollected: 10,
            paymentMode: 'InvalidMode',
            accountName: 'Cash',
            notes: '',
            tdsAmount: 0,
            allocations: []
        },
        token
    );
    if (invalidPaymentMode.status !== 400) fail('Invalid paymentMode should return 400', String(invalidPaymentMode.status));
    else ok('Invalid paymentMode 400');

    // --- 11. GST / Master ---
    console.log('\n--- 11. GST / Master (states) ---');
    const states = await request('/master/states', 'GET', null, token);
    if (states.status !== 200) fail('GET /master/states', String(states.status));
    else ok('GET /master/states');

    // --- 12. Invoice templates ---
    console.log('\n--- 12. Invoice templates ---');
    const templates = await request('/invoice-templates', 'GET');
    if (templates.status !== 200) fail('GET /invoice-templates', String(templates.status));
    else ok('GET /invoice-templates');

    // --- 13. Cleanup (DELETE in reverse order: receipt first so invoice paidAmount reverts) ---
    console.log('\n--- 13. Cleanup (DELETE) ---');
    if (receiptId) {
        const delReceipt = await request(`/business/${businessId}/receipts/${receiptId}`, 'DELETE', null, token);
        if (delReceipt.status !== 204) fail('DELETE receipt', String(delReceipt.status));
        else ok('DELETE receipt');
    }
    if (challanId) {
        const delDC = await request(`/business/${businessId}/delivery-challans/${challanId}`, 'DELETE', null, token);
        if (delDC.status !== 204) fail('DELETE delivery challan', String(delDC.status));
        else ok('DELETE delivery challan');
    }
    if (salesDebitNoteId) {
        const delSDN = await request(`/business/${businessId}/sales-debit-notes/${salesDebitNoteId}`, 'DELETE', null, token);
        if (delSDN.status !== 204) fail('DELETE sales debit note', String(delSDN.status));
        else ok('DELETE SDN');
    }
    if (quotationId) {
        const delQuote = await request(`/business/${businessId}/quotations/${quotationId}`, 'DELETE', null, token);
        if (delQuote.status !== 204) fail('DELETE quotation', String(delQuote.status));
        else ok('DELETE quotation');
    }
    if (invoiceId) {
        const delInvoice = await request(`/business/${businessId}/invoices/${invoiceId}`, 'DELETE', null, token);
        if (delInvoice.status !== 204) fail('DELETE invoice', String(delInvoice.status));
        else ok('DELETE invoice');
    }
    if (productId) {
        const delProduct = await request(`/business/${businessId}/products/${productId}`, 'DELETE', null, token);
        if (delProduct.status !== 204 && delProduct.status !== 200) fail('DELETE product', String(delProduct.status));
        else ok('DELETE product');
    }
    if (partyId) {
        const delParty = await request(`/parties/${partyId}`, 'DELETE', null, token);
        if (delParty.status !== 204 && delParty.status !== 200) fail('DELETE party', String(delParty.status));
        else ok('DELETE party');
    }

    // --- 14. Verify 404 after DELETE ---
    console.log('\n--- 14. Verify 404 after DELETE ---');
    if (receiptId) {
        const getReceiptAfterDel = await request(`/business/${businessId}/receipts/${receiptId}`, 'GET', null, token);
        if (getReceiptAfterDel.status !== 404) fail('Get deleted receipt should return 404', String(getReceiptAfterDel.status));
        else ok('Deleted receipt 404');
    }
    if (invoiceId) {
        const getInvAfterDel = await request(`/business/${businessId}/invoices/${invoiceId}`, 'GET', null, token);
        if (getInvAfterDel.status !== 404) fail('Get deleted invoice should return 404', String(getInvAfterDel.status));
        else ok('Deleted invoice 404');
    }

    // --- Summary ---
    console.log('\n--- Summary ---');
    if (errors.length) {
        console.log('Completed with errors:');
        errors.forEach((e) => console.log(' -', e));
        process.exit(1);
    } else {
        console.log('All API checks passed.');
        process.exit(0);
    }
}

run().catch((e) => {
    console.error('Unexpected error:', e);
    process.exit(1);
});
