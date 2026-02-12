const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const TEST_EMAIL = `test.sdn.${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';

let authToken = '';
let businessId = '';
let partyId = '';
let productId = '';

const createAuthClient = (token) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};

async function registerAndLogin() {
  console.log('\n=== REGISTER & LOGIN ===');
  try {
    // Register
    await axios.post(`${BASE_URL}/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Test User SDN'
    });
    console.log('✓ User registered');
    
    // Login
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    authToken = response.data.token;
    console.log('✓ Login successful');
    return authToken;
  } catch (error) {
    console.error('✗ Register/Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createBusiness(authClient) {
  console.log('\n=== CREATE BUSINESS ===');
  const businessData = {
    firmName: 'SATGURU ELECTRONICS AND FURNITURE',
    gstNumber: '23ALFPM7215H1ZA',
    address: {
      street: '2505 INFRONT OF GOVT.HOSPITAL,MAIN ROAD KALAPIPAL MANDI DIST.SHAJAPUR',
      city: 'Shajapur',
      state: 'Madhya Pradesh',
      pincode: '465337'
    },
    mobile: '9876543210',
    email: 'satguru@example.com',
    stateCode: '23'
  };

  try {
    const response = await authClient.post('/business', businessData);
    businessId = response.data.business.businessId || response.data.business.SK?.split('BUSINESS#')[1];
    console.log('✓ Business created:', businessId);
    return businessId;
  } catch (error) {
    console.error('✗ Business creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createParty(authClient) {
  console.log('\n=== CREATE PARTY ===');
  const partyData = {
    businessId: businessId,
    companyName: 'DEMO GST Register Party',
    gstin: '22AAICG8226H1ZO',
    billingAddress: {
      street: 'Second Floor 106/3 Ava nti Vihar Road Raipur Raipur Chhattisgarh 492004',
      city: 'Raipur',
      state: 'Chhattisgarh',
      pincode: '492004'
    },
    shippingAddress: {
      street: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004',
      city: 'Raipur',
      state: 'Chhattisgarh',
      pincode: '492004'
    },
    mobile: '9876543210',
    email: 'demo@example.com'
  };

  try {
    const response = await authClient.post('/parties', partyData);
    partyId = response.data.data?.partyId || response.data.data?.SK?.split('PARTY#')[1];
    console.log('✓ Party created:', partyId);
    return partyId;
  } catch (error) {
    console.error('✗ Party creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createProduct(authClient) {
  console.log('\n=== CREATE PRODUCT ===');
  const productData = {
    name: 'Demo Product',
    type: 'product',
    hsnSac: '0402',
    unit: 'Nos',
    salesPrice: 100.0,
    gstPercent: 0,
    taxInclusive: false
  };

  try {
    const response = await authClient.post(`/business/${businessId}/products`, productData);
    productId = response.data.product?.productId || response.data.product?.SK?.split('PRODUCT#')[1];
    console.log('✓ Product created:', productId);
    return productId;
  } catch (error) {
    console.error('✗ Product creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createSalesDebitNote(authClient) {
  console.log('\n=== CREATE SALES DEBIT NOTE ===');
  
  const salesDebitNoteBody = {
    status: 'saved',
    invoiceNumber: 'new1',
    invoiceDate: '2026-02-12',
    
    // Seller info
    seller: {
      firmName: 'SATGURU ELECTRONICS AND FURNITURE',
      gstNumber: '23ALFPM7215H1ZA',
      address: {
        street: '2505 INFRONT OF GOVT.HOSPITAL,MAIN ROAD KALAPIPAL MANDI DIST.SHAJAPUR',
        city: 'Shajapur',
        state: 'Madhya Pradesh',
        pincode: '465337'
      },
      stateCode: '23',
      mobile: '9876543210'
    },
    
    // Buyer info
    buyerId: partyId,
    buyerName: 'DEMO GST Register Party',
    buyerGstin: '22AAICG8226H1ZO',
    buyerAddress: 'Second Floor 106/3 Ava nti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    shippingAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    
    items: [
      {
        itemId: productId,
        itemName: 'Demo Product',
        hsnSac: '0402',
        quantity: 10,
        unit: 'Nos',
        unitPrice: 100.00,
        gstPercent: 0,
        taxInclusive: false,
        discountType: 'percentage',
        discountValue: 0,
        discountPercent: 0,
        cessType: 'Percentage',
        cessValue: 0
      }
    ],
    
    additionalCharges: [
      {
        name: 'handlng charge',
        amount: 10,
        gstPercent: 0,
        isTaxInclusive: false,
        hsnSac: '996511'
      }
    ],
    
    // Global discount
    globalDiscountType: 'flat',
    globalDiscountValue: 0,
    
    transportInfo: {
      vehicleNumber: '4343434',
      transporterName: 'vcvvc',
      transporterId: '545454',
      mode: 'Road',
      docNo: '4345',
      docDate: '2026-02-12',
      placeOfSupply: 'Andhra Pradesh',
      dateOfSupply: '2026-02-12',
      placeOfSupplyStateCode: '22',
      placeOfSupplyStateName: 'Andhra Pradesh'
    },
    
    otherDetails: {
      poNumber: 'PO-2026-001',
      poDate: '2026-02-12',
      challanNumber: 'CH-001',
      reverseCharge: true
    },
    
    termsAndConditions: [
      'This is an electronically generated document.',
      'All disputes are subject to seller city jurisdiction.'
    ]
  };

  try {
    const response = await authClient.post(
      `/business/${businessId}/sales-debit-notes`,
      salesDebitNoteBody
    );
    
    const salesDebitNote = response.data.salesDebitNote;
    const salesDebitNoteId = salesDebitNote.salesDebitNoteId || 
      salesDebitNote.id || 
      (typeof salesDebitNote.SK === 'string' && salesDebitNote.SK.split('SALES_DEBIT_NOTE#')[1]);
    
    console.log('✓ Sales Debit Note created:', salesDebitNoteId);
    return salesDebitNoteId;
  } catch (error) {
    console.error('✗ Sales Debit Note creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function generatePdf(authClient, salesDebitNoteId) {
  console.log('\n=== GENERATE PDF ===');
  
  try {
    const response = await authClient.post(
      `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}/pdf`,
      { templateId: 'classic' }
    );
    
    console.log('✓ PDF generated successfully');
    console.log('\n📄 CURRENT PRODUCTION PDF URL:');
    console.log(response.data.pdfUrl);
    console.log('\n✅ This is the CURRENT template (before your changes)');
    console.log('📋 Compare with your local preview to verify changes\n');
    
    return response.data.pdfUrl;
  } catch (error) {
    console.error('✗ PDF generation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('\n🔍 TESTING CURRENT PRODUCTION SALES DEBIT NOTE TEMPLATE\n');
    
    const token = await registerAndLogin();
    const authClient = createAuthClient(token);
    
    await createBusiness(authClient);
    await createParty(authClient);
    await createProduct(authClient);
    const salesDebitNoteId = await createSalesDebitNote(authClient);
    await generatePdf(authClient, salesDebitNoteId);
    
    console.log('✅ TEST COMPLETED\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

main();
