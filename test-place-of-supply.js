/**
 * Simple backend test for place-of-supply logic using PROD URL.
 *
 * Verifies both interstate and intrastate behaviour of:
 *   POST /api/gst/place-of-supply
 *
 * Usage:
 *   node test-place-of-supply.js
 */

const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';

async function main() {
    console.log('\n=== Place of Supply Backend Test ===');
    console.log('BASE_URL:', BASE_URL);

    const baseClient = axios.create({
        baseURL: BASE_URL,
        timeout: 20000
    });

    // Get an auth token (endpoint requires auth)
    const email = `test.pos.${Date.now()}@example.com`;
    const password = 'PosTest123!';
    try {
        await baseClient.post('/auth/register', {
            name: 'POS Tester',
            email,
            password
        });
    } catch (e) {
        if (!(e.response && e.response.status === 409)) throw e;
    }
    const loginRes = await baseClient.post('/auth/login', { email, password });
    const token = loginRes.data.token;

    const client = axios.create({
        baseURL: BASE_URL,
        timeout: 20000,
        headers: { Authorization: `Bearer ${token}` }
    });

    // Seller GST state 27 = Maharashtra
    const sellerStateCode = '27';

    // Case 1: INTERSTATE – buyer in Jharkhand (20)
    const interstateBody = {
        supplyType: 'goods',
        sellerStateCode,
        buyerStateCode: '20' // Jharkhand
        // no shippingStateCode => place of supply should be buyer state = 20
    };

    // Case 2: INTRASTATE – buyer in Maharashtra (27)
    const intrastateBody = {
        supplyType: 'goods',
        sellerStateCode,
        buyerStateCode: '27' // Maharashtra
    };

    try {
        const interstateRes = await client.post('/api/gst/place-of-supply', interstateBody);
        console.log('\n--- Interstate case (seller 27, buyer 20) ---');
        console.log(JSON.stringify(interstateRes.data, null, 2));

        const intrastateRes = await client.post('/api/gst/place-of-supply', intrastateBody);
        console.log('\n--- Intrastate case (seller 27, buyer 27) ---');
        console.log(JSON.stringify(intrastateRes.data, null, 2));

        const interstateType = interstateRes.data.supplyTypeDisplay;
        const intrastateType = intrastateRes.data.supplyTypeDisplay;

        if (interstateType !== 'interstate') {
            throw new Error(
                `Expected interstate case to return 'interstate', got '${interstateType}'`
            );
        }
        if (intrastateType !== 'intrastate') {
            throw new Error(
                `Expected intrastate case to return 'intrastate', got '${intrastateType}'`
            );
        }

        console.log('\nResult: ✅ Backend place-of-supply logic is correct for both cases.');
    } catch (err) {
        console.error('\nResult: ❌ Test failed.');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('Error:', err.message);
        }
        process.exit(1);
    }
}

main();

