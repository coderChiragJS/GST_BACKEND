const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';

// Test credentials
const TEST_EMAIL = 'dctest' + Date.now() + '@example.com';
const TEST_PASSWORD = 'Test@123456';

let authToken = '';
let businessId = '';
let partyId = '';
let productId = '';

// Create axios client
function createAuthClient(token) {
    return axios.create({
        baseURL: BASE_URL,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
}

async function registerAndLogin() {
    try {
        console.log('\n=== REGISTER & LOGIN ===');
        console.log('📝 Registering new user...');
        
        await axios.post(`${BASE_URL}/auth/register`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            name: 'DC Test User'
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
            street: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004',
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
        name: 'LED TV 32 inch',
        hsnSac: '8528',
        type: 'product',
        salesPrice: 15000.00,
        taxInclusive: false,
        taxRate: 18.0,
        unit: 'PCS'
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

async function createDeliveryChallanWithAllFields(client, businessId, partyId, productId) {
    try {
        console.log('\n📄 Creating Delivery Challan with all fields...');
        
        const challanBody = {
            businessId: businessId,
            status: 'delivered',
            type: 'deliveryChallan',
            challanNumber: 'DC-TEST-' + Date.now(),
            challanDate: new Date().toISOString().split('T')[0],
            
            // Seller details
            seller: {
                firmName: 'SATGURU ELECTRONICS AND FURNITURE',
                address: {
                    street: '2505 INFRONT OF GOVT.HOSPITAL,MAIN ROAD KALAPIPAL',
                    city: 'Shajapur',
                    state: 'Madhya Pradesh',
                    pincode: '465337'
                },
                gstNumber: '23ALFPM7215H1ZA',
                stateCode: '23',
                mobile: '9876543210',
                email: 'satguru@example.com'
            },
            
            // Buyer details
            buyerId: partyId,
            buyerName: 'DEMO GST Register Party',
            buyerGstin: '22AAICG8226H1ZO',
            buyerAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004',
            shippingAddress: 'Second Floor 106/3 Avanti Vihar Road Raipur Raipur Chhattisgarh 492004',
            
            // Items
            items: [
                {
                    itemId: productId,
                    itemName: 'LED TV 32 inch',
                    hsnSac: '8528',
                    quantity: 2,
                    unit: 'PCS',
                    unitPrice: 15000.00,
                    discountType: 'percentage',
                    discountValue: 0,
                    discountPercent: 0,
                    gstPercent: 18.0,
                    taxInclusive: false,
                    cessType: 'Percentage',
                    cessValue: 0
                },
                {
                    itemId: productId,
                    itemName: 'Washing Machine',
                    hsnSac: '8450',
                    quantity: 1,
                    unit: 'PCS',
                    unitPrice: 25000.00,
                    discountType: 'percentage',
                    discountValue: 0,
                    discountPercent: 0,
                    gstPercent: 18.0,
                    taxInclusive: false,
                    cessType: 'Percentage',
                    cessValue: 0
                }
            ],
            
            // Additional charges
            additionalCharges: [
                {
                    name: 'Packing Charges',
                    amount: 500.00,
                    gstPercent: 18.0,
                    hsnSac: '',
                    isTaxInclusive: false
                },
                {
                    name: 'Loading Charges',
                    amount: 300.00,
                    gstPercent: 18.0,
                    hsnSac: '',
                    isTaxInclusive: false
                }
            ],
            
            // Discount
            globalDiscountType: 'percentage',
            globalDiscountValue: 0,
            
            // Transport information
            transportInfo: {
                vehicleNumber: 'MP09AB1234',
                mode: 'Road',
                transporterName: 'ABC Transport Services',
                transporterId: 'TRANS123',
                docNo: 'LR-2024-001',
                docDate: new Date().toISOString().split('T')[0],
                dateOfSupply: new Date().toISOString().split('T')[0],
                placeOfSupply: '22',
                placeOfSupplyStateName: 'Chhattisgarh',
                placeOfSupplyStateCode: '22'
            },
            
            // Bank details
            bankDetails: {
                accountHolderName: 'SATGURU ELECTRONICS',
                accountNumber: '1234567890',
                ifscCode: 'SBIN0001234',
                bankName: 'State Bank of India',
                branch: 'Kalapipal'
            },
            
            // Other details
            otherDetails: {
                poNumber: 'PO-2024-001',
                poDate: new Date().toISOString().split('T')[0],
                challanNumber: 'CH-2024-001',
                challanDate: new Date().toISOString().split('T')[0],
                eWayBillNumber: 'EWB-123456789012',
                reverseCharge: false
            },
            
            // TCS
            tcsInfo: {
                percentage: 0,
                basis: 'taxableAmount'
            },
            
            // Custom fields
            customFields: [
                {
                    label: 'Warranty Period',
                    value: '2 Years'
                },
                {
                    label: 'Installation',
                    value: 'Free'
                }
            ],
            
            // Terms and conditions
            termsAndConditions: [
                'Goods once sold will not be taken back',
                'Interest @ 18% p.a. will be charged if payment is not made within due date',
                'Subject to Shajapur Jurisdiction only'
            ],
            
            // Notes
            notes: 'Thank you for your business. Please check all items before accepting delivery.',
            
            // Signature and stamp
            signatureUrl: 'https://example.com/signature.png',
            stampUrl: 'https://example.com/stamp.png',
            
            // Due date
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };
        
        const response = await client.post(`/business/${businessId}/delivery-challans`, challanBody);
        
        const challanId = response.data.deliveryChallanId || 
                         response.data.data?.deliveryChallanId || 
                         response.data.data?.SK?.split('DELIVERY_CHALLAN#')[1];
        
        console.log('✓ Delivery Challan created:', challanId);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        return challanId;
    } catch (error) {
        console.error('✗ Delivery Challan creation failed:', error.response?.data || error.message);
        throw error;
    }
}

async function generateDeliveryChallanPdf(client, businessId, challanId) {
    try {
        console.log('\n📄 Generating Delivery Challan PDF...');
        
        const response = await client.post(`/business/${businessId}/delivery-challans/${challanId}/pdf`, {
            templateId: 'classic'
        });
        
        const pdfUrl = response.data.pdfUrl || response.data.data?.pdfUrl;
        console.log('✓ PDF generated successfully!');
        console.log('📎 PDF URL:', pdfUrl);
        return pdfUrl;
    } catch (error) {
        console.error('✗ PDF generation failed:', error.response?.data || error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🚀 Starting Delivery Challan Production Test\n');
        console.log('=' .repeat(60));
        
        // Register and Login
        authToken = await registerAndLogin();
        const client = createAuthClient(authToken);
        
        // Create business
        businessId = await createBusiness(client);
        
        // Create party
        partyId = await createParty(client);
        
        // Create product
        productId = await createProduct(client);
        
        // Create Delivery Challan with all fields
        const challanId = await createDeliveryChallanWithAllFields(client, businessId, partyId, productId);
        
        // Generate PDF
        const pdfUrl = await generateDeliveryChallanPdf(client, businessId, challanId);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST COMPLETED SUCCESSFULLY!');
        console.log('=' .repeat(60));
        console.log('\n📋 Summary:');
        console.log(`   Test Email: ${TEST_EMAIL}`);
        console.log(`   Business ID: ${businessId}`);
        console.log(`   Party ID: ${partyId}`);
        console.log(`   Product ID: ${productId}`);
        console.log(`   Delivery Challan ID: ${challanId}`);
        console.log(`   PDF URL: ${pdfUrl}`);
        console.log('\n💡 Open the PDF URL in your browser to view the Delivery Challan');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
