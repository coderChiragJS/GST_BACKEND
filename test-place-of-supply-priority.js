/**
 * Test script to verify place of supply priority fix
 * 
 * Tests that shipping state (user's explicit choice) takes priority over buyer GSTIN
 * 
 * Usage: node test-place-of-supply-priority.js
 */

const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const EMAIL = 'chiragtanks@gmail.com';
const PASSWORD = 'test@333';

async function main() {
    console.log('\n=== Place of Supply Priority Test ===');
    console.log('BASE_URL:', BASE_URL);
    console.log('');

    const baseClient = axios.create({ baseURL: BASE_URL, timeout: 20000 });

    // Login to get auth token
    console.log('Logging in...');
    const loginRes = await baseClient.post('/auth/login', {
        email: EMAIL,
        password: PASSWORD
    });
    const token = loginRes.data.token;
    console.log('✅ Logged in successfully\n');

    const client = axios.create({
        baseURL: BASE_URL,
        timeout: 20000,
        headers: { Authorization: `Bearer ${token}` }
    });

    let allPassed = true;

    // Test 1: Manual selection OVERRIDES GSTIN
    console.log('='.repeat(70));
    console.log('TEST 1: Manual Place of Supply OVERRIDES Buyer GSTIN');
    console.log('='.repeat(70));
    console.log('Scenario: Buyer GSTIN is Kerala (29), but user manually selects Maharashtra');
    console.log('Expected: Place of supply = Maharashtra (intrastate with Maharashtra seller)');
    console.log('');

    try {
        const test1 = await client.post('/api/gst/place-of-supply', {
            sellerStateName: 'Maharashtra',
            buyerGstin: '29AAACB1234F1Z3',  // 29 = Kerala
            shippingStateName: 'Maharashtra'  // User's explicit choice
        });

        console.log('Response:', JSON.stringify(test1.data, null, 2));
        
        if (test1.data.placeOfSupplyStateCode === '27' && 
            test1.data.placeOfSupplyStateName === 'Maharashtra' &&
            test1.data.supplyTypeDisplay === 'intrastate') {
            console.log('✅ TEST 1 PASSED - Manual selection correctly overrides GSTIN');
        } else {
            console.log('❌ TEST 1 FAILED');
            console.log('   Expected: placeOfSupplyStateCode=27, stateName=Maharashtra, supplyTypeDisplay=intrastate');
            console.log('   Got:', test1.data);
            allPassed = false;
        }
    } catch (err) {
        console.log('❌ TEST 1 FAILED - API Error');
        console.error('Error:', err.response?.data || err.message);
        allPassed = false;
    }

    console.log('');

    // Test 2: No manual selection, use GSTIN
    console.log('='.repeat(70));
    console.log('TEST 2: No Manual Selection - Use Buyer GSTIN');
    console.log('='.repeat(70));
    console.log('Scenario: Buyer GSTIN is Kerala (29), no manual place of supply');
    console.log('Expected: Place of supply = Kerala (interstate with Maharashtra seller)');
    console.log('');

    try {
        const test2 = await client.post('/api/gst/place-of-supply', {
            sellerStateName: 'Maharashtra',
            buyerGstin: '29AAACB1234F1Z3',  // 29 = Kerala
            shippingStateName: null  // No manual selection
        });

        console.log('Response:', JSON.stringify(test2.data, null, 2));
        
        if (test2.data.placeOfSupplyStateCode === '29' && 
            test2.data.placeOfSupplyStateName === 'Kerala' &&
            test2.data.supplyTypeDisplay === 'interstate') {
            console.log('✅ TEST 2 PASSED - Correctly falls back to GSTIN when no manual selection');
        } else {
            console.log('❌ TEST 2 FAILED');
            console.log('   Expected: placeOfSupplyStateCode=29, stateName=Kerala, supplyTypeDisplay=interstate');
            console.log('   Got:', test2.data);
            allPassed = false;
        }
    } catch (err) {
        console.log('❌ TEST 2 FAILED - API Error');
        console.error('Error:', err.response?.data || err.message);
        allPassed = false;
    }

    console.log('');

    // Test 3: Manual interstate selection
    console.log('='.repeat(70));
    console.log('TEST 3: Manual Interstate Place of Supply');
    console.log('='.repeat(70));
    console.log('Scenario: Buyer GSTIN is Maharashtra (27), user manually selects Karnataka');
    console.log('Expected: Place of supply = Karnataka (interstate)');
    console.log('');

    try {
        const test3 = await client.post('/api/gst/place-of-supply', {
            sellerStateName: 'Maharashtra',
            buyerGstin: '27XYZAB1234C1Z9',  // 27 = Maharashtra
            shippingStateName: 'Karnataka'   // User manually selected different state
        });

        console.log('Response:', JSON.stringify(test3.data, null, 2));
        
        if (test3.data.placeOfSupplyStateCode === '29' && 
            test3.data.placeOfSupplyStateName === 'Karnataka' &&
            test3.data.supplyTypeDisplay === 'interstate') {
            console.log('✅ TEST 3 PASSED - Manual interstate selection works correctly');
        } else {
            console.log('❌ TEST 3 FAILED');
            console.log('   Expected: placeOfSupplyStateCode=29, stateName=Karnataka, supplyTypeDisplay=interstate');
            console.log('   Got:', test3.data);
            allPassed = false;
        }
    } catch (err) {
        console.log('❌ TEST 3 FAILED - API Error');
        console.error('Error:', err.response?.data || err.message);
        allPassed = false;
    }

    console.log('');

    // Test 4: Empty shipping state, use GSTIN
    console.log('='.repeat(70));
    console.log('TEST 4: Empty Shipping State - Use GSTIN');
    console.log('='.repeat(70));
    console.log('Scenario: Buyer GSTIN is Delhi (07), shipping state is empty string');
    console.log('Expected: Place of supply = Delhi (interstate with Maharashtra seller)');
    console.log('');

    try {
        const test4 = await client.post('/api/gst/place-of-supply', {
            sellerStateName: 'Maharashtra',
            buyerGstin: '07ABCDE1234F1Z5',  // 07 = Delhi
            shippingStateName: ''  // Empty string
        });

        console.log('Response:', JSON.stringify(test4.data, null, 2));
        
        if (test4.data.placeOfSupplyStateCode === '07' && 
            test4.data.placeOfSupplyStateName === 'Delhi' &&
            test4.data.supplyTypeDisplay === 'interstate') {
            console.log('✅ TEST 4 PASSED - Empty string correctly falls back to GSTIN');
        } else {
            console.log('❌ TEST 4 FAILED');
            console.log('   Expected: placeOfSupplyStateCode=07, stateName=Delhi, supplyTypeDisplay=interstate');
            console.log('   Got:', test4.data);
            allPassed = false;
        }
    } catch (err) {
        console.log('❌ TEST 4 FAILED - API Error');
        console.error('Error:', err.response?.data || err.message);
        allPassed = false;
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));

    if (allPassed) {
        console.log('🎉 ALL TESTS PASSED');
        console.log('');
        console.log('The place of supply priority fix is working correctly:');
        console.log('  1. Manual selection (shipping state) takes priority');
        console.log('  2. Falls back to buyer GSTIN when no manual selection');
        console.log('  3. Handles both intrastate and interstate scenarios');
        console.log('  4. Empty strings are treated as no selection');
        console.log('');
        console.log('✅ Ready for Flutter integration');
    } else {
        console.log('❌ SOME TESTS FAILED');
        console.log('');
        console.log('Please review the failed tests above and fix the issues.');
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('\n❌ Test script failed with error:');
    console.error(err.message);
    if (err.response) {
        console.error('Status:', err.response.status);
        console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
});
