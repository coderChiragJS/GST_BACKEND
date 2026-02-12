const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const TEST_EMAIL = `test.sdn.allfields.${Date.now()}@example.com`;
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
    await axios.post(`${BASE_URL}/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Test User SDN All Fields'
    });
    console.log('✓ User registered');
    
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
    stateCode: '23',
    // Additional business fields
    pan: 'ALFPM7215H',
    website: 'www.satguruelectronics.com'
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

async function createSalesDebitNoteWithAllFields(authClient) {
  console.log('\n=== CREATE SALES DEBIT NOTE WITH ALL FIELDS ===');
  
  const salesDebitNoteBody = {
    status: 'saved',
    invoiceNumber: 'SDN-ALL-FIELDS-001',
    invoiceDate: '2026-02-12',
    dueDate: '2026-03-14', // 30 days later
    
    // SELLER INFO - Complete
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
      mobile: '9876543210',
      email: 'satguru@example.com',
      pan: 'ALFPM7215H'
    },
    
    // BUYER INFO - Complete
    buyerId: partyId,
    buyerName: 'DEMO GST Register Party',
    buyerGstin: '22AAICG8226H1ZO',
    buyerAddress: 'Second Floor 106/3 Ava nti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    shippingAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004, Raipur, Chhattisgarh, 492004',
    
    // ITEMS - Multiple items with all fields
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
        discountValue: 5,
        discountPercent: 5,
        cessType: 'Percentage',
        cessValue: 1
      },
      {
        itemId: productId,
        itemName: 'Additional Item',
        hsnSac: '8471',
        quantity: 5,
        unit: 'Pcs',
        unitPrice: 200.00,
        gstPercent: 18,
        taxInclusive: false,
        discountType: 'flat',
        discountValue: 50,
        discountPercent: 0,
        cessType: 'Fixed',
        cessValue: 2
      }
    ],
    
    // ADDITIONAL CHARGES - Multiple charges
    additionalCharges: [
      {
        name: 'Handling Charge',
        amount: 10,
        gstPercent: 0,
        isTaxInclusive: false,
        hsnSac: '996511'
      },
      {
        name: 'Packaging Charge',
        amount: 25,
        gstPercent: 18,
        isTaxInclusive: false,
        hsnSac: '996519'
      }
    ],
    
    // GLOBAL DISCOUNT
    globalDiscountType: 'flat',
    globalDiscountValue: 0,
    
    // TRANSPORT INFO - All fields
    transportInfo: {
      vehicleNumber: 'DL01GC9293',
      transporterName: 'Chirag Transporter',
      transporterId: '545454',
      mode: 'Road',
      docNo: '4345',
      docDate: '2026-02-12',
      approxDistance: 250,
      placeOfSupply: 'Andhra Pradesh',
      dateOfSupply: '2026-02-12',
      placeOfSupplyStateCode: '22',
      placeOfSupplyStateName: 'Andhra Pradesh',
      supplyTypeDisplay: 'interstate'
    },
    
    // BANK DETAILS - All fields
    bankDetails: {
      bankName: 'ICICI Bank',
      accountHolderName: 'CHIRAG',
      accountNumber: '67583245608',
      ifscCode: 'ICIC0006578',
      branch: 'MANASA',
      upiId: 'chirag@icici'
    },
    
    // OTHER DETAILS - All fields
    otherDetails: {
      reverseCharge: true,
      poNumber: 'PO-2026-001',
      poDate: '2026-02-10',
      challanNumber: 'CH-2026-001',
      eWayBillNumber: 'EWB123456789012'
    },
    
    // TCS INFO
    tcsInfo: {
      percentage: 0.1,
      basis: 'finalAmount'
    },
    
    // CUSTOM FIELDS
    customFields: [
      {
        name: 'Project Code',
        value: 'PROJ-2026-001'
      },
      {
        name: 'Department',
        value: 'Sales & Marketing'
      },
      {
        name: 'Reference Number',
        value: 'REF-SDN-12345'
      }
    ],
    
    // TERMS AND CONDITIONS - Multiple terms
    termsAndConditions: [
      'This is an electronically generated document.',
      'All disputes are subject to Madhya Pradesh jurisdiction.',
      'Payment due within 30 days of invoice date.',
      'Goods once sold will not be taken back.',
      'Interest @ 18% p.a. will be charged on delayed payments.',
      'Subject to Shajapur jurisdiction only.'
    ],
    
    // NOTES
    notes: 'This is a comprehensive test of Sales Debit Note with all possible fields populated. Please verify all sections are displayed correctly in the PDF.',
    
    // SIGNATURE AND STAMP URLs (using placeholder URLs)
    signatureUrl: 'https://via.placeholder.com/200x80/000000/FFFFFF/?text=Signature',
    stampUrl: 'https://via.placeholder.com/120x120/FF0000/FFFFFF/?text=STAMP'
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
    
    console.log('✓ Sales Debit Note created with ALL fields');
    console.log('  ID:', salesDebitNoteId);
    console.log('  Number:', salesDebitNote.invoiceNumber);
    console.log('  Status:', salesDebitNote.status);
    console.log('  Items:', salesDebitNoteBody.items.length);
    console.log('  Additional Charges:', salesDebitNoteBody.additionalCharges.length);
    console.log('  Custom Fields:', salesDebitNoteBody.customFields.length);
    console.log('  Terms:', salesDebitNoteBody.termsAndConditions.length);
    
    return salesDebitNoteId;
  } catch (error) {
    console.error('✗ Sales Debit Note creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function generatePdf(authClient, salesDebitNoteId) {
  console.log('\n=== GENERATE PDF WITH ALL FIELDS ===');
  
  try {
    const response = await authClient.post(
      `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}/pdf`,
      { templateId: 'classic' }
    );
    
    console.log('✓ PDF generated successfully');
    console.log('\n' + '='.repeat(80));
    console.log('📄 PRODUCTION PDF URL (WITH ALL FIELDS):');
    console.log('='.repeat(80));
    console.log(response.data.pdfUrl);
    console.log('='.repeat(80));
    console.log('\n✅ This PDF includes ALL possible fields:');
    console.log('   ✓ Complete seller and buyer information');
    console.log('   ✓ Multiple line items with discounts and CESS');
    console.log('   ✓ Multiple additional charges');
    console.log('   ✓ Bank details (all fields)');
    console.log('   ✓ Transport information (all fields)');
    console.log('   ✓ Other details (PO, Challan, eWay Bill)');
    console.log('   ✓ TCS information');
    console.log('   ✓ Custom fields');
    console.log('   ✓ Multiple terms and conditions');
    console.log('   ✓ Notes');
    console.log('   ✓ Signature and Stamp URLs');
    console.log('   ✓ Due date');
    console.log('\n📋 Compare this with your reference PDF to verify the template.\n');
    
    return response.data.pdfUrl;
  } catch (error) {
    console.error('✗ PDF generation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 TESTING SALES DEBIT NOTE WITH ALL FIELDS');
    console.log('='.repeat(80));
    console.log('This test will create a Sales Debit Note with EVERY possible field');
    console.log('populated to verify the template displays all data correctly.');
    console.log('='.repeat(80) + '\n');
    
    const token = await registerAndLogin();
    const authClient = createAuthClient(token);
    
    await createBusiness(authClient);
    await createParty(authClient);
    await createProduct(authClient);
    const salesDebitNoteId = await createSalesDebitNoteWithAllFields(authClient);
    await generatePdf(authClient, salesDebitNoteId);
    
    console.log('✅ TEST COMPLETED SUCCESSFULLY\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

main();
