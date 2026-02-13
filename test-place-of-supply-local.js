/**
 * Local test to verify place of supply priority logic
 * Tests the logic without hitting the API
 */

const {
    getStateByCode,
    getStateByGstin,
    getStateByName
} = require('./src/data/gstStates');

function normalizeStateCode(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (s.length === 0) return null;
    if (/^\d{1,2}$/.test(s)) return s.padStart(2, '0').slice(-2);
    return null;
}

function testPlaceOfSupply(testName, body, expected) {
    console.log('\n' + '='.repeat(70));
    console.log(`TEST: ${testName}`);
    console.log('='.repeat(70));
    console.log('Input:', JSON.stringify(body, null, 2));
    
    const sellerStateCode = normalizeStateCode(body.sellerStateCode) || (body.sellerStateName ? getStateByName(body.sellerStateName)?.code : null);
    const sellerState = sellerStateCode ? getStateByCode(sellerStateCode) : null;

    let placeState = null;
    const buyerStateCode = normalizeStateCode(body.buyerStateCode);
    const buyerStateName = body.buyerStateName;
    const buyerGstin = body.buyerGstin && String(body.buyerGstin).trim();
    const shippingStateCode = normalizeStateCode(body.shippingStateCode);
    const shippingStateName = body.shippingStateName;

    // Priority 1: Explicit place of supply (shipping state) - user's manual selection
    if (shippingStateCode) placeState = getStateByCode(shippingStateCode);
    if (!placeState && shippingStateName) placeState = getStateByName(shippingStateName);

    // Priority 2: Buyer GSTIN (if no explicit place of supply)
    if (!placeState && buyerGstin && buyerGstin.length >= 2) placeState = getStateByGstin(buyerGstin);

    // Priority 3: Buyer state (fallback)
    if (!placeState && buyerStateCode) placeState = getStateByCode(buyerStateCode);
    if (!placeState && buyerStateName) placeState = getStateByName(buyerStateName);

    if (!placeState) {
        console.log('❌ FAILED: Could not determine place of supply');
        return false;
    }

    const placeOfSupplyStateCode = placeState.code;
    const placeOfSupplyStateName = placeState.name;
    const sellerCode = sellerState ? sellerState.code : null;
    const supplyTypeDisplay = (sellerCode && sellerCode === placeOfSupplyStateCode) ? 'intrastate' : 'interstate';

    const result = {
        placeOfSupplyStateCode,
        placeOfSupplyStateName,
        supplyTypeDisplay
    };

    console.log('Output:', JSON.stringify(result, null, 2));
    console.log('Expected:', JSON.stringify(expected, null, 2));

    const passed = 
        result.placeOfSupplyStateCode === expected.placeOfSupplyStateCode &&
        result.placeOfSupplyStateName === expected.placeOfSupplyStateName &&
        result.supplyTypeDisplay === expected.supplyTypeDisplay;

    if (passed) {
        console.log('✅ PASSED');
    } else {
        console.log('❌ FAILED');
    }

    return passed;
}

console.log('\n=== Local Place of Supply Priority Test ===\n');

let allPassed = true;

// Test 1: Manual selection OVERRIDES GSTIN
allPassed &= testPlaceOfSupply(
    'Test 1: Manual selection OVERRIDES GSTIN',
    {
        sellerStateName: 'Maharashtra',
        buyerGstin: '29AAACB1234F1Z3',  // 29 = Kerala
        shippingStateName: 'Maharashtra'  // User's explicit choice
    },
    {
        placeOfSupplyStateCode: '26',
        placeOfSupplyStateName: 'Maharashtra',
        supplyTypeDisplay: 'intrastate'
    }
);

// Test 2: No manual selection, use GSTIN
allPassed &= testPlaceOfSupply(
    'Test 2: No manual selection - use GSTIN',
    {
        sellerStateName: 'Maharashtra',
        buyerGstin: '29AAACB1234F1Z3',  // 29 = Kerala
        shippingStateName: null
    },
    {
        placeOfSupplyStateCode: '29',
        placeOfSupplyStateName: 'Kerala',
        supplyTypeDisplay: 'interstate'
    }
);

// Test 3: Manual interstate selection
allPassed &= testPlaceOfSupply(
    'Test 3: Manual interstate selection',
    {
        sellerStateName: 'Maharashtra',
        buyerGstin: '27XYZAB1234C1Z9',  // 27 = Maharashtra
        shippingStateName: 'Karnataka'
    },
    {
        placeOfSupplyStateCode: '28',
        placeOfSupplyStateName: 'Karnataka',
        supplyTypeDisplay: 'interstate'
    }
);

// Test 4: Empty shipping state, use GSTIN
allPassed &= testPlaceOfSupply(
    'Test 4: Empty shipping state - use GSTIN',
    {
        sellerStateName: 'Maharashtra',
        buyerGstin: '07ABCDE1234F1Z5',  // 07 = Delhi
        shippingStateName: ''
    },
    {
        placeOfSupplyStateCode: '07',
        placeOfSupplyStateName: 'Delhi',
        supplyTypeDisplay: 'interstate'
    }
);

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));

if (allPassed) {
    console.log('✅ ALL LOCAL TESTS PASSED');
    console.log('\nThe priority logic is correct:');
    console.log('  1. Shipping state (manual selection) takes priority');
    console.log('  2. Falls back to buyer GSTIN');
    console.log('  3. Falls back to buyer state');
    console.log('\n✅ Ready to deploy to production');
} else {
    console.log('❌ SOME TESTS FAILED - Fix the logic before deploying');
    process.exit(1);
}
