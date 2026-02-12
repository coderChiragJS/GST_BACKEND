const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const TEST_EMAIL = 'chiragtankwa@gmail.com';
const TEST_PASSWORD = 'test@333';

let authToken = '';
let businessId = '';
let partyId = '';
let productId = '';

// Create axios instance with auth
const createAuthClient = (token) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};

async function loginUser() {
  console.log('\n=== LOGIN USER ===');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    authToken = response.data.token;
    console.log('✓ Login successful');
    return authToken;
  } catch (error) {
    console.error('✗ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getBusinesses(authClient) {
  console.log('\n=== GET BUSINESSES ===');
  try {
    const response = await authClient.get('/business');
    const businesses = response.data.businesses || [];
    console.log('✓ Found', businesses.length, 'business(es)');
    
    if (businesses.length > 0) {
      businessId = businesses[0].businessId || businesses[0].SK?.split('BUSINESS#')[1];
      console.log('Using businessId:', businessId);
      return businessId;
    }
    
    throw new Error('No businesses found');
  } catch (error) {
    console.error('✗ Get businesses failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getParties(authClient) {
  console.log('\n=== GET PARTIES ===');
  try {
    const response = await authClient.get('/parties');
    const parties = response.data.parties || [];
    console.log('✓ Found', parties.length, 'party/parties');
    
    if (parties.length > 0) {
      partyId = parties[0].partyId || parties[0].SK?.split('PARTY#')[1];
      console.log('Using partyId:', partyId);
      return partyId;
    }
    
    throw new Error('No parties found');
  } catch (error) {
    console.error('✗ Get parties failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getProducts(authClient) {
  console.log('\n=== GET PRODUCTS ===');
  try {
    const response = await authClient.get(`/business/${businessId}/products`);
    const products = response.data.products || [];
    console.log('✓ Found', products.length, 'product(s)');
    
    if (products.length > 0) {
      productId = products[0].productId || products[0].SK?.split('PRODUCT#')[1];
      console.log('Using productId:', productId);
      return productId;
    }
    
    throw new Error('No products found');
  } catch (error) {
    console.error('✗ Get products failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createSalesDebitNoteWithAllFields(authClient) {
  console.log('\n=== CREATE SALES DEBIT NOTE WITH ALL FIELDS ===');
  
  const salesDebitNoteBody = {
    status: 'saved',
    invoiceNumber: `SDN-TEST-${Date.now()}`,
    invoiceDate: '2026-02-12',
    partyId: partyId,
    
    // Items with all fields
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
    
    // Additional charges
    additionalCharges: [
      {
        name: 'handlng charge',
        amount: 10,
        gstPercent: 0,
        isTaxInclusive: false,
        hsnSac: '996511'
      }
    ],
    
    // Transport info with all fields
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
    
    // Other details
    otherDetails: {
      poNumber: 'PO-2026-001',
      poDate: '2026-02-12',
      challanNumber: 'CH-001',
      reverseCharge: true
    },
    
    // Terms and conditions
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
    
    console.log('✓ Sales Debit Note created successfully');
    const salesDebitNote = response.data.salesDebitNote;
    const salesDebitNoteId = salesDebitNote.salesDebitNoteId || 
      salesDebitNote.id || 
      (typeof salesDebitNote.SK === 'string' && salesDebitNote.SK.split('SALES_DEBIT_NOTE#')[1]);
    
    console.log('Sales Debit Note ID:', salesDebitNoteId);
    console.log('Invoice Number:', salesDebitNote.invoiceNumber);
    console.log('Status:', salesDebitNote.status);
    
    return salesDebitNoteId;
  } catch (error) {
    console.error('✗ Sales Debit Note creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function generateSalesDebitNotePdf(authClient, salesDebitNoteId) {
  console.log('\n=== GENERATE SALES DEBIT NOTE PDF ===');
  
  try {
    const response = await authClient.post(
      `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}/pdf`,
      {
        templateId: 'classic'
      }
    );
    
    console.log('✓ PDF generated successfully');
    console.log('PDF URL:', response.data.pdfUrl);
    console.log('\n📄 Open this URL in your browser to view the CURRENT PRODUCTION PDF:');
    console.log(response.data.pdfUrl);
    console.log('\n💡 This is the CURRENT template before your changes.');
    console.log('💡 Compare this with your local HTML preview to see the differences.\n');
    
    return response.data.pdfUrl;
  } catch (error) {
    console.error('✗ PDF generation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Testing CURRENT PRODUCTION Sales Debit Note Template');
    console.log('Base URL:', BASE_URL);
    console.log('Email:', TEST_EMAIL);
    console.log('\n⚠️  This will test the CURRENT deployed template (before your changes)\n');
    
    // Step 1: Login
    await loginUser();
    const authClient = createAuthClient(authToken);
    
    // Step 2: Get business
    await getBusinesses(authClient);
    
    // Step 3: Get party
    await getParties(authClient);
    
    // Step 4: Get product
    await getProducts(authClient);
    
    // Step 5: Create sales debit note with all fields
    const salesDebitNoteId = await createSalesDebitNoteWithAllFields(authClient);
    
    // Step 6: Generate PDF
    await generateSalesDebitNotePdf(authClient, salesDebitNoteId);
    
    console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
    console.log('\n📋 Next Steps:');
    console.log('1. Open the PDF URL above to see the CURRENT production template');
    console.log('2. Open your local HTML preview: test-html-previews/sales-debit-note-preview-*.html');
    console.log('3. Compare both to verify your changes are correct');
    console.log('4. If satisfied, run: serverless deploy');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
