/**
 * TDS Voucher end-to-end test against production API.
 *
 * Usage:
 *   BASE_URL=https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev \
 *   EMAIL=chirag@gmail.com PASSWORD='test@33' node scripts/test_tds_voucher_e2e.js
 *
 * Requires: axios
 */

const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev').replace(/\/$/, '');
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

function createClient(token) {
    return axios.create({
        baseURL: BASE_URL,
        timeout: 30000,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
}

async function main() {
    console.log('BASE_URL:', BASE_URL);
    if (!EMAIL || !PASSWORD) {
        console.error('Set EMAIL and PASSWORD env vars.');
        process.exit(1);
    }

    let token, businessId, partyId, partyName, invoiceId, invoiceNumber, balanceDue;

    // 1. Login
    console.log('\n--- 1. Login ---');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
    token = loginRes.data.token;
    console.log('Login OK');

    const client = createClient(token);

    // 2. Get business
    console.log('\n--- 2. Get business ---');
    const businessesRes = await client.get('/business');
    const businesses = Array.isArray(businessesRes.data) ? businessesRes.data : [];
    if (!businesses.length) {
        console.error('No business found. Create a business first.');
        process.exit(1);
    }
    businessId = businesses[0].businessId;
    console.log('businessId:', businessId);

    // 3. List invoices to find one with buyerId
    console.log('\n--- 3. List invoices ---');
    const invoicesRes = await client.get(`/business/${businessId}/invoices`, { params: { limit: 50 } });
    const invoices = invoicesRes.data.invoices || [];
    if (!invoices.length) {
        console.error('No invoices found. Create an invoice first.');
        process.exit(1);
    }
    const invWithBuyer = invoices.find((inv) => inv.buyerId);
    if (!invWithBuyer) {
        console.error('No invoice with buyerId. Use an invoice that has a customer/party linked.');
        process.exit(1);
    }
    partyId = invWithBuyer.buyerId;
    partyName = invWithBuyer.buyerName || 'Party';
    console.log('Using partyId:', partyId, 'partyName:', partyName);

    // 4. Invoices for party (Settle Invoice)
    console.log('\n--- 4. Invoices for party ---');
    const forPartyRes = await client.get(`/business/${businessId}/tds-vouchers/invoices-for-party`, {
        params: { partyId, limit: 20 }
    });
    const forPartyInvoices = forPartyRes.data.invoices || [];
    if (!forPartyInvoices.length) {
        console.error('No invoices returned for this party.');
        process.exit(1);
    }
    const first = forPartyInvoices[0];
    invoiceId = first.invoiceId;
    invoiceNumber = first.invoiceNumber;
    balanceDue = first.balanceDue;
    console.log('First invoice:', invoiceNumber, 'balanceDue:', balanceDue);

    // 5. Create TDS voucher
    const voucherNum = `TD-E2E-${Date.now()}`;
    const tdsAmount = balanceDue >= 1 ? 1 : balanceDue; // allocate 1 or full if < 1
    const tdsAllocated = Math.min(1, balanceDue);
    console.log('\n--- 5. Create TDS voucher ---');
    const createRes = await client.post(`/business/${businessId}/tds-vouchers`, {
        voucherNumber: voucherNum,
        voucherDate: new Date().toISOString().split('T')[0],
        partyId,
        partyName,
        tdsAmountCollected: tdsAmount,
        allocations: [
            { invoiceId, invoiceNumber, tdsAllocated }
        ]
    });
    const voucher = createRes.data.voucher;
    const voucherId = voucher.voucherId;
    console.log('Created voucher:', voucherId, voucherNum);

    // 6. List TDS vouchers
    console.log('\n--- 6. List TDS vouchers ---');
    const listRes = await client.get(`/business/${businessId}/tds-vouchers`, { params: { limit: 5 } });
    console.log('Count:', listRes.data.count);

    // 7. Get TDS voucher
    console.log('\n--- 7. Get TDS voucher ---');
    const getRes = await client.get(`/business/${businessId}/tds-vouchers/${voucherId}`);
    console.log('Get OK:', getRes.data.voucher.voucherNumber);

    // 8. Statement PDF (for invoice that now has TDS)
    console.log('\n--- 8. Generate statement PDF ---');
    const pdfRes = await client.post(`/business/${businessId}/invoices/${invoiceId}/statement-pdf`, {
        templateId: 'classic'
    });
    const pdfUrl = pdfRes.data.pdfUrl;
    console.log('\n========== STATEMENT PDF URL ==========');
    console.log(pdfUrl);
    console.log('========================================\n');

    console.log('TDS voucher e2e test completed successfully.');
}

main().catch((err) => {
    console.error('Error:', err.response ? { status: err.response.status, data: err.response.data } : err.message);
    process.exit(1);
});
