const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const timestamp = Date.now();

async function testShippingDisplay() {
    console.log('Testing Shipping Address Display Logic...\n');
    
    const client = axios.create({ baseURL: BASE_URL, timeout: 30000 });
    
    // Register & Login
    const email = `test.shipping.${timestamp}@example.com`;
    await client.post('/auth/register', {
        name: 'Shipping Test',
        email,
        password: 'Test123'
    }).catch(() => {});
    
    const loginRes = await client.post('/auth/login', { email, password: 'Test123' });
    const token = loginRes.data.token;
    
    const authClient = axios.create({
        baseURL: BASE_URL,
        timeout: 30000,
        headers: { Authorization: `Bearer ${token}` }
    });
    
    // Create Business
    const bizRes = await authClient.post('/business', {
        firmName: 'Test Firm',
        gstNumber: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        mobile: '9876543210',
        email: 'firm@test.com',
        address: { street: '123 St', city: 'Bangalore', state: 'Karnataka', pincode: '560001' }
    });
    const businessId = bizRes.data.business.businessId;
    
    // Create Product
    const prodRes = await authClient.post(`/business/${businessId}/products`, {
        name: 'Test Product',
        type: 'product',
        hsnSac: '1001',
        unit: 'Nos',
        salesPrice: 1000,
        taxInclusive: true,
        gstPercent: 18
    });
    const productId = prodRes.data.product.productId;
    
    const today = new Date().toISOString().split('T')[0];
    const seller = {
        firmName: 'Test Firm',
        gstNumber: '29ABCDE1234F1Z5',
        address: { street: '123 St', city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
        mobile: '9876543210',
        email: 'firm@test.com',
        stateCode: '29'
    };
    
    // TEST 1: Invoice with SAME shipping address as billing
    console.log('TEST 1: Invoice with shipping address SAME as billing');
    const sameAddress = '123 Main St, Mumbai, Maharashtra - 400001';
    const inv1 = await authClient.post(`/business/${businessId}/invoices`, {
        invoiceNumber: `INV-SAME-${timestamp}`,
        invoiceDate: today,
        type: 'taxInvoice',
        status: 'saved',
        seller,
        buyerName: 'Test Buyer',
        buyerAddress: sameAddress,
        shippingAddress: sameAddress,  // SAME as billing
        items: [{
            itemId: productId,
            itemName: 'Test Product',
            quantity: 1,
            unitPrice: 1000,
            discountType: 'flat',
            discountValue: 0,
            discountPercent: 0,
            gstPercent: 18,
            taxInclusive: true,
            cessType: 'Fixed',
            cessValue: 0
        }],
        globalDiscountType: 'flat',
        globalDiscountValue: 0
    });
    
    const pdf1 = await authClient.post(`/business/${businessId}/invoices/${inv1.data.invoice.invoiceId}/pdf`, {
        templateId: 'classic'
    });
    console.log('✅ Invoice created with SAME shipping address');
    console.log('   PDF URL:', pdf1.data.pdfUrl);
    console.log('   Expected: Should show "Details of Consignee | Shipped to" section\n');
    
    // TEST 2: Invoice with DIFFERENT shipping address
    console.log('TEST 2: Invoice with DIFFERENT shipping address');
    const inv2 = await authClient.post(`/business/${businessId}/invoices`, {
        invoiceNumber: `INV-DIFF-${timestamp}`,
        invoiceDate: today,
        type: 'taxInvoice',
        status: 'saved',
        seller,
        buyerName: 'Test Buyer',
        buyerAddress: '123 Main St, Mumbai, Maharashtra - 400001',
        shippingAddress: '456 Warehouse, Navi Mumbai, Maharashtra - 410210',  // DIFFERENT
        items: [{
            itemId: productId,
            itemName: 'Test Product',
            quantity: 1,
            unitPrice: 1000,
            discountType: 'flat',
            discountValue: 0,
            discountPercent: 0,
            gstPercent: 18,
            taxInclusive: true,
            cessType: 'Fixed',
            cessValue: 0
        }],
        globalDiscountType: 'flat',
        globalDiscountValue: 0
    });
    
    const pdf2 = await authClient.post(`/business/${businessId}/invoices/${inv2.data.invoice.invoiceId}/pdf`, {
        templateId: 'classic'
    });
    console.log('✅ Invoice created with DIFFERENT shipping address');
    console.log('   PDF URL:', pdf2.data.pdfUrl);
    console.log('   Expected: Should show "Details of Consignee | Shipped to" section\n');
    
    // TEST 3: Invoice with EMPTY shipping address
    console.log('TEST 3: Invoice with EMPTY shipping address');
    const inv3 = await authClient.post(`/business/${businessId}/invoices`, {
        invoiceNumber: `INV-EMPTY-${timestamp}`,
        invoiceDate: today,
        type: 'taxInvoice',
        status: 'saved',
        seller,
        buyerName: 'Test Buyer',
        buyerAddress: '123 Main St, Mumbai, Maharashtra - 400001',
        shippingAddress: '',  // EMPTY
        items: [{
            itemId: productId,
            itemName: 'Test Product',
            quantity: 1,
            unitPrice: 1000,
            discountType: 'flat',
            discountValue: 0,
            discountPercent: 0,
            gstPercent: 18,
            taxInclusive: true,
            cessType: 'Fixed',
            cessValue: 0
        }],
        globalDiscountType: 'flat',
        globalDiscountValue: 0
    });
    
    const pdf3 = await authClient.post(`/business/${businessId}/invoices/${inv3.data.invoice.invoiceId}/pdf`, {
        templateId: 'classic'
    });
    console.log('✅ Invoice created with EMPTY shipping address');
    console.log('   PDF URL:', pdf3.data.pdfUrl);
    console.log('   Expected: Should NOT show "Details of Consignee | Shipped to" section\n');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('TEST 1 (Same Address): Open PDF and verify shipping section is SHOWN');
    console.log('TEST 2 (Different Address): Open PDF and verify shipping section is SHOWN');
    console.log('TEST 3 (Empty Address): Open PDF and verify shipping section is NOT SHOWN');
    console.log('\n✅ All tests completed. Check PDFs to verify display logic.');
}

testShippingDisplay().catch(err => {
    console.error('Error:', err.response?.data || err.message);
});
