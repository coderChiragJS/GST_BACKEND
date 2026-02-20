/**
 * Verifies deployed API: auth + Payment Receipt CRUD + PDF + invoice paidAmount.
 *
 * Usage (from project root):
 *   BASE_URL=https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev \
 *   EMAIL=chirag@gmail.com PASSWORD=test@33 \
 *   node scripts/verify_receipt_apis.js
 *
 * If EMAIL/PASSWORD are not set, defaults are the above.
 */

const https = require('https');

const API_URL =
    process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const userEmail = process.env.EMAIL || 'chirag@gmail.com';
const password = process.env.PASSWORD || 'test@33';

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const base = API_URL.replace(/\/$/, '');
        const url = path.startsWith('http')
            ? path
            : `${base}${path.startsWith('/') ? path : '/' + path}`;

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
    console.log('API base URL:', API_URL);
    console.log('Using email:', userEmail);

    const errors = [];
    let token;
    let businessId;
    let party;
    let invoice;
    let receipt;
    let previousPaidAmount = 0;

    function recordError(label, detail) {
        const msg = detail ? `${label}: ${detail}` : label;
        console.error('  [ERROR]', msg);
        errors.push(msg);
    }

    // 1. Health
    console.log('\n--- 1. Health ---');
    const health = await request('/health');
    if (health.status !== 200) {
        recordError('Health failed', String(health.status));
    } else {
        console.log('  OK', health.body);
    }

    // 2. Login
    console.log('\n--- 2. Login ---');
    const login = await request(
        '/auth/login',
        'POST',
        { email: userEmail, password },
        null
    );
    if (login.status !== 200 || !login.body || !login.body.token) {
        recordError('Login failed', `${login.status} ${JSON.stringify(login.body)}`);
        finish(errors);
        return;
    }
    token = login.body.token;
    console.log('  Login OK');

    // 3. Business
    console.log('\n--- 3. Resolve business ---');
    const bizList = await request('/business', 'GET', null, token);
    const businesses = Array.isArray(bizList.body)
        ? bizList.body
        : bizList.body?.businesses || bizList.body || [];
    businessId = businesses[0]?.businessId;
    if (!businessId) {
        recordError('No business found for user', JSON.stringify(bizList.body));
        finish(errors);
        return;
    }
    console.log('  Using businessId:', businessId);

    // 4. Party
    console.log('\n--- 4. Resolve party ---');
    const partiesRes = await request('/parties', 'GET', null, token);
    if (partiesRes.status !== 200) {
        recordError('List parties failed', `${partiesRes.status}`);
    } else {
        const parties = partiesRes.body?.data || [];
        if (parties.length > 0) {
            party = parties[0];
            console.log('  Using existing party:', party.companyName || party.partyName || party.name || party.id);
        } else {
            console.log('  No parties found, creating one...');
            const createPartyPayload = {
                companyName: 'Receipt Test Party',
                gstNumber: '27AABCA1234F1Z1',
                mobile: '9876543210',
                email: 'receipt-party@example.com',
                billingAddress: {
                    street: 'Test Street 1',
                    city: 'Pune',
                    state: 'MH',
                    pincode: '411001',
                    country: 'India'
                },
                sameAsBilling: true,
                shippingAddress: {
                    street: 'Test Street 1',
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
            const createParty = await request('/parties', 'POST', createPartyPayload, token);
            if (createParty.status !== 201) {
                recordError(
                    'Create party failed',
                    `${createParty.status} ${JSON.stringify(createParty.body)}`
                );
                finish(errors);
                return;
            }
            party = createParty.body?.data || createParty.body;
            console.log('  Created party id:', party.partyId || party.id);
        }
    }

    if (!party) {
        recordError('No party available', '');
        finish(errors);
        return;
    }

    // 5. Create invoice (saved)
    console.log('\n--- 5. Create test invoice ---');
    const ts = Date.now();
    const invoiceNumber = 'INV-RECEIPT-' + ts;
    const today = new Date().toISOString().split('T')[0];
    const invoicePayload = {
        invoiceNumber,
        invoiceDate: today,
        dueDate: today,
        type: 'taxInvoice',
        status: 'saved',
        seller: {
            firmName: 'Receipt Test Firm',
            gstNumber: '27AABCA1234F1Z1'
        },
        buyerId: null,
        buyerName: party.companyName || 'Receipt Test Buyer',
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
        notes: 'Invoice for receipt test',
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
        recordError(
            'Create invoice failed',
            `${createInvoice.status} ${JSON.stringify(createInvoice.body)}`
        );
        finish(errors);
        return;
    }
    invoice = createInvoice.body?.invoice || createInvoice.body;
    const invoiceId = invoice.invoiceId || invoice.id;
    console.log('  Invoice created:', invoiceId);

    // Get invoice before receipt to capture previous paidAmount
    const getInvBefore = await request(
        `/business/${businessId}/invoices/${invoiceId}`,
        'GET',
        null,
        token
    );
    if (getInvBefore.status !== 200) {
        recordError(
            'Get invoice before receipt failed',
            `${getInvBefore.status} ${JSON.stringify(getInvBefore.body)}`
        );
        finish(errors);
        return;
    }
    const invBefore = getInvBefore.body?.invoice || getInvBefore.body;
    previousPaidAmount = Number(invBefore.paidAmount || 0);
    console.log('  Invoice paidAmount before receipt:', previousPaidAmount);

    // 6. Create receipt
    console.log('\n--- 6. Create receipt ---');
    const receiptNumber = 'PR-TEST-' + ts;
    const amountCollected = 50;
    const allocatedAmount = 50;
    const receiptPayload = {
        receiptNumber,
        receiptDate: today,
        partyId: null,
        partyName: invBefore.buyerName || 'Receipt Test Buyer',
        amountCollected,
        paymentMode: 'Cash',
        accountId: null,
        accountName: 'Cash Account',
        notes: 'Receipt created by verify_receipt_apis.js',
        tdsAmount: 0,
        allocations: [
            {
                invoiceId,
                invoiceNumber: invoiceNumber,
                invoiceTotalAmount: 100,
                allocatedAmount
            }
        ]
    };

    const createReceipt = await request(
        `/business/${businessId}/receipts`,
        'POST',
        receiptPayload,
        token
    );
    if (createReceipt.status !== 201) {
        recordError(
            'Create receipt failed',
            `${createReceipt.status} ${JSON.stringify(createReceipt.body)}`
        );
        finish(errors);
        return;
    }
    receipt = createReceipt.body?.receipt || createReceipt.body;
    const receiptId = receipt.receiptId || receipt.id;
    console.log('  Receipt created:', receiptId);

    // 7. List receipts
    console.log('\n--- 7. List receipts ---');
    const listReceipts = await request(
        `/business/${businessId}/receipts`,
        'GET',
        null,
        token
    );
    if (listReceipts.status !== 200) {
        recordError('List receipts failed', `${listReceipts.status}`);
    } else {
        const rs = listReceipts.body?.receipts || [];
        const found = rs.some(
            (r) => (r.receiptId || r.id) === receiptId || r.receiptNumber === receiptNumber
        );
        if (!found) {
            recordError('Created receipt not found in list', '');
        } else {
            console.log('  List receipts OK, count:', rs.length);
        }
    }

    // 8. Get receipt
    console.log('\n--- 8. Get receipt ---');
    const getReceipt = await request(
        `/business/${businessId}/receipts/${receiptId}`,
        'GET',
        null,
        token
    );
    if (getReceipt.status !== 200) {
        recordError('Get receipt failed', `${getReceipt.status}`);
    } else {
        console.log('  Get receipt OK');
    }

    // 9. Invoice paidAmount after create
    console.log('\n--- 9. Invoice paidAmount after create ---');
    const getInvAfterCreate = await request(
        `/business/${businessId}/invoices/${invoiceId}`,
        'GET',
        null,
        token
    );
    if (getInvAfterCreate.status !== 200) {
        recordError(
            'Get invoice after create failed',
            `${getInvAfterCreate.status}`
        );
    } else {
        const invAfter = getInvAfterCreate.body?.invoice || getInvAfterCreate.body;
        const expectedPaid = previousPaidAmount + allocatedAmount;
        const actualPaid = Number(invAfter.paidAmount || 0);
        console.log('  Invoice paidAmount after receipt:', actualPaid);
        if (Math.abs(actualPaid - expectedPaid) > 0.01) {
            recordError(
                'Invoice paidAmount mismatch after receipt',
                `expected ~${expectedPaid}, got ${actualPaid}`
            );
        } else {
            console.log('  Invoice paidAmount updated correctly');
        }
    }

    // 10. Update receipt (notes)
    console.log('\n--- 10. Update receipt ---');
    const updateReceipt = await request(
        `/business/${businessId}/receipts/${receiptId}`,
        'PUT',
        { notes: 'Receipt updated by verify_receipt_apis.js' },
        token
    );
    if (updateReceipt.status !== 200) {
        recordError(
            'Update receipt failed',
            `${updateReceipt.status} ${JSON.stringify(updateReceipt.body)}`
        );
    } else {
        console.log('  Update receipt OK');
    }

    // 11. Duplicate receipt number (negative)
    console.log('\n--- 11. Duplicate receipt number (negative test) ---');
    const dupReceipt = await request(
        `/business/${businessId}/receipts`,
        'POST',
        receiptPayload,
        token
    );
    if (dupReceipt.status !== 409) {
        recordError(
            'Expected 409 on duplicate receipt number',
            `${dupReceipt.status} ${JSON.stringify(dupReceipt.body)}`
        );
    } else {
        console.log('  Duplicate receipt correctly rejected (409)');
    }

    // 12. Invalid allocation (negative)
    console.log('\n--- 12. Allocation exceeds balance (negative test) ---');
    const invalidAllocPayload = {
        ...receiptPayload,
        receiptNumber: 'PR-INVALID-' + ts,
        allocations: [
            {
                invoiceId,
                invoiceNumber: invoiceNumber,
                invoiceTotalAmount: 100,
                allocatedAmount: 1000000
            }
        ]
    };
    const invalidAlloc = await request(
        `/business/${businessId}/receipts`,
        'POST',
        invalidAllocPayload,
        token
    );
    if (invalidAlloc.status !== 400) {
        recordError(
            'Expected 400 on invalid allocation',
            `${invalidAlloc.status} ${JSON.stringify(invalidAlloc.body)}`
        );
    } else {
        console.log('  Invalid allocation correctly rejected (400)');
    }

    // 13. Receipt PDF
    console.log('\n--- 13. Receipt PDF ---');
    const pdfRes = await request(
        `/business/${businessId}/receipts/${receiptId}/pdf`,
        'POST',
        { templateId: 'classic' },
        token
    );
    if (pdfRes.status !== 200 || !pdfRes.body?.pdfUrl) {
        recordError(
            'Generate receipt PDF failed',
            `${pdfRes.status} ${JSON.stringify(pdfRes.body)}`
        );
    } else {
        console.log('  Receipt PDF generated, url:', pdfRes.body.pdfUrl);
    }

    // 14. Delete receipt
    console.log('\n--- 14. Delete receipt ---');
    const delReceipt = await request(
        `/business/${businessId}/receipts/${receiptId}`,
        'DELETE',
        null,
        token
    );
    if (delReceipt.status !== 204) {
        recordError('Delete receipt failed', `${delReceipt.status}`);
    } else {
        console.log('  Delete receipt OK (204)');
    }

    // 15. Invoice paidAmount after delete
    console.log('\n--- 15. Invoice paidAmount after delete ---');
    const getInvAfterDelete = await request(
        `/business/${businessId}/invoices/${invoiceId}`,
        'GET',
        null,
        token
    );
    if (getInvAfterDelete.status !== 200) {
        recordError(
            'Get invoice after delete failed',
            `${getInvAfterDelete.status}`
        );
    } else {
        const invAfterDel = getInvAfterDelete.body?.invoice || getInvAfterDelete.body;
        const actualPaid = Number(invAfterDel.paidAmount || 0);
        console.log('  Invoice paidAmount after delete:', actualPaid);
        if (Math.abs(actualPaid - previousPaidAmount) > 0.01) {
            recordError(
                'Invoice paidAmount mismatch after delete',
                `expected ~${previousPaidAmount}, got ${actualPaid}`
            );
        } else {
            console.log('  Invoice paidAmount reverted correctly');
        }
    }

    finish(errors);
}

function finish(errors) {
    if (errors.length) {
        console.log('\nReceipt API verification completed with errors:');
        for (const e of errors) {
            console.log(' -', e);
        }
        process.exitCode = 1;
    } else {
        console.log('\nAll Receipt API checks passed.');
        process.exitCode = 0;
    }
}

run().catch((e) => {
    console.error('Unexpected error in verify_receipt_apis:', e);
    process.exit(1);
});

