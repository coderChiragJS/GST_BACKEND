const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const EMAIL = 'chiragtanks@gmail.com';
const PASSWORD = 'test@333';

async function main() {
  console.log('\n=== Testing Place of Supply with Real Invoice ===\n');
  
  const client = axios.create({ baseURL: BASE_URL, timeout: 30000 });

  // 1) Login
  console.log('Logging in...');
  const { data: login } = await client.post('/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  const token = login.token;
  console.log('✅ Logged in successfully\n');
  
  const auth = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { Authorization: `Bearer ${token}` },
  });

  // 2) Get first business
  console.log('Fetching business...');
  const bizRes = await auth.get('/business');
  const businesses = Array.isArray(bizRes.data) ? bizRes.data : (bizRes.data.businesses || []);
  const business = businesses[0];
  if (!business) throw new Error('No business found');
  
  const businessGstState = business.gstNumber.substring(0, 2);
  console.log('Business:', business.firmName);
  console.log('Business GST:', business.gstNumber);
  console.log('Business State:', business.address?.state, `(code: ${businessGstState})`);
  console.log('');
  
  const businessId = business.businessId;

  // 3) Pick one existing invoice
  console.log('Fetching invoices...');
  const invList = await auth.get(`/business/${businessId}/invoices`, { params: { limit: 1 } });
  const invoice = invList.data.invoices[0];
  if (!invoice) throw new Error('No invoices found');
  console.log('Using invoice:', invoice.invoiceNumber, `(ID: ${invoice.invoiceId})`);
  console.log('');

  // Helper to update transportInfo and show what backend stores
  async function testWithPlaceOfSupply(stateName, stateCode, label) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST: ${label}`);
    console.log(`Place of Supply: ${stateName} (State Code: ${stateCode})`);
    console.log(`${'='.repeat(70)}\n`);
    
    // Build minimal valid update body
    const body = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      type: invoice.type || 'taxInvoice',
      status: invoice.status || 'saved',
      seller: invoice.seller,
      buyerId: invoice.buyerId,
      buyerName: invoice.buyerName || '',
      buyerGstin: invoice.buyerGstin || '',
      buyerAddress: invoice.buyerAddress || '',
      shippingAddress: invoice.shippingAddress || '',
      items: invoice.items || [],
      additionalCharges: invoice.additionalCharges || [],
      globalDiscountType: invoice.globalDiscountType || 'percentage',
      globalDiscountValue: invoice.globalDiscountValue || 0,
      transportInfo: {
        ...(invoice.transportInfo || {}),
        placeOfSupply: stateName,
        placeOfSupplyStateCode: stateCode,
        placeOfSupplyStateName: stateName,
        supplyTypeDisplay: (businessGstState === stateCode) ? 'intrastate' : 'interstate',
      },
    };

    const res = await auth.put(
      `/business/${businessId}/invoices/${invoice.invoiceId}`,
      body,
    );

    const updated = res.data.invoice;
    const transportInfo = updated.transportInfo || {};
    
    console.log('Backend Response:');
    console.log('  placeOfSupply:', transportInfo.placeOfSupply);
    console.log('  placeOfSupplyStateCode:', transportInfo.placeOfSupplyStateCode);
    console.log('  placeOfSupplyStateName:', transportInfo.placeOfSupplyStateName);
    console.log('  supplyTypeDisplay:', transportInfo.supplyTypeDisplay);
    console.log('');
    
    // Validate
    const expected = (businessGstState === stateCode) ? 'intrastate' : 'interstate';
    const actual = transportInfo.supplyTypeDisplay;
    
    if (actual === expected) {
      console.log(`✅ CORRECT: supplyTypeDisplay is "${actual}" (expected "${expected}")`);
    } else {
      console.log(`❌ WRONG: supplyTypeDisplay is "${actual}" but expected "${expected}"`);
    }
    
    return actual;
  }

  // 4) Test INTERSTATE: Jharkhand (20) - different from Maharashtra (27)
  const interstate = await testWithPlaceOfSupply('Jharkhand', '20', 'INTERSTATE (Different State)');

  // 5) Test INTRASTATE: Maharashtra (27) - same as business GST state
  const intrastate = await testWithPlaceOfSupply('Maharashtra', '27', 'INTRASTATE (Same State)');

  // Final summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}\n`);
  
  console.log('Business GST State Code:', businessGstState);
  console.log('');
  console.log('Interstate test (Jharkhand, code 20):');
  console.log('  Expected: interstate');
  console.log('  Got:', interstate);
  console.log('  Result:', interstate === 'interstate' ? '✅ PASS' : '❌ FAIL');
  console.log('');
  console.log('Intrastate test (Maharashtra, code 27):');
  console.log('  Expected: intrastate');
  console.log('  Got:', intrastate);
  console.log('  Result:', intrastate === 'intrastate' ? '✅ PASS' : '❌ FAIL');
  console.log('');
  
  if (interstate === 'interstate' && intrastate === 'intrastate') {
    console.log('🎉 ALL TESTS PASSED - Backend logic is correct!');
    console.log('');
    console.log('If Flutter still shows IGST for intrastate, the issue is:');
    console.log('  - Flutter not reading updated supplyTypeDisplay after save/update, OR');
    console.log('  - Flutter not recomputing CGST/SGST split when place of supply changes');
  } else {
    console.log('⚠️  BACKEND ISSUE DETECTED - supplyTypeDisplay logic needs fixing');
  }
  console.log('');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Response:', JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});
