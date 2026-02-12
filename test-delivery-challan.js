// End-to-end test script for:
// - register/login user
// - create business
// - create party
// - create product
// - create delivery challan (all fields, status: pending)
// - generate delivery challan PDF
// - update status to delivered
// - list delivery challans with filter
//
// Usage (from project root):
//   npm install axios
//   node test-delivery-challan.js

const axios = require('axios');

// Deployed/base API URL from Serverless output
const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';

// You can tweak these test credentials if you like
const TEST_EMAIL = 'test.deliverychallan@example.com';
const TEST_PASSWORD = 'StrongPass123';

if (!BASE_URL) {
    console.error('BASE_URL is not set in test-delivery-challan.js');
    process.exit(1);
}

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 20000
});

async function main() {
    console.log('BASE_URL =', BASE_URL);

    // 1) Register user (if not exists), then login
    const name = 'Delivery Challan Tester';

    // 1a. Try register
    try {
        const regRes = await client.post('/auth/register', {
            name,
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        console.log('Registered userId:', regRes.data.userId);
    } catch (err) {
        if (err.response && err.response.status === 409) {
            console.log('User already exists, will login.');
        } else {
            console.log(
                'Register error (can be ignored if already exists):',
                err.response?.data || err.message
            );
        }
    }

    // 1b. Login
    const loginRes = await client.post('/auth/login', {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
    });
    const token = loginRes.data.token;
    console.log('Logged in, token acquired.');

    const authClient = axios.create({
        baseURL: BASE_URL,
        timeout: 20000,
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    // 2) Create Business (full fields)
    const businessBody = {
        firmName: 'Delivery Challan Test Firm',
        gstNumber: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        mobile: '9876543210',
        email: 'firm-dc@example.com',
        address: {
            street: '123 MG Road',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560001'
        },
        dispatchAddress: {
            street: 'Warehouse 7, Industrial Area',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560048'
        },
        companyLogoUrl: 'https://example.com/logo.png',
        customFields: {
            industry: 'Trading',
            branchCode: 'BLR-DC'
        },
        bankAccounts: [
            {
                id: 'bank-acc-1',
                accountName: 'Delivery Challan Test Firm',
                bankName: 'State Bank of India',
                accountNumber: '12345678901',
                ifscCode: 'SBIN0001234',
                branch: 'MG ROAD',
                upiId: 'dcfirm@sbi',
                isDefault: true
            }
        ],
        transporters: [
            {
                id: 'trans-1',
                transporterId: 'TRANS123',
                name: 'Fast Transport Co',
                isDefault: true
            }
        ],
        termsTemplates: [
            {
                id: 'terms-1',
                name: 'Standard',
                terms: [
                    'Goods once sold will not be taken back.',
                    'Payment due within 30 days.'
                ],
                isDefault: true
            }
        ],
        defaultSignatureUrl: 'https://example.com/signature.png',
        defaultStampUrl: 'https://example.com/stamp.png'
    };

    const createBizRes = await authClient.post('/business', businessBody);
    const business = createBizRes.data.business;
    const businessId = business.businessId;
    console.log('Created businessId:', businessId);

    // 3) Create Party (full fields)
    const partyBody = {
        companyName: 'Test Buyer Pvt Ltd',
        gstNumber: '27ABCDE1234F1Z3',
        mobile: '9123456789',
        email: 'buyer@example.com',
        billingAddress: {
            street: '101 Buyer Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            gst: '27ABCDE1234F1Z3',
            companyName: 'Test Buyer Pvt Ltd'
        },
        sameAsBilling: false,
        shippingAddress: {
            street: 'Warehouse 3, Navi Mumbai',
            city: 'Navi Mumbai',
            state: 'Maharashtra',
            pincode: '410210',
            country: 'India',
            gst: '27ABCDE1234F1Z3',
            companyName: 'Test Buyer Pvt Ltd'
        },
        paymentTerms: 30,
        openingBalance: 10000,
        openingBalanceType: 'TO_RECEIVE',
        partyType: 'Company',
        gstTreatment: 'Regular',
        taxPreference: 'Exclusive',
        tdsApplicable: true,
        tcsApplicable: true
    };

    const partyRes = await authClient.post('/parties', partyBody);
    const party = partyRes.data.data;
    const partyId = party.partyId;
    console.log('Created partyId:', partyId);

    // 4) Create Product (full fields)
    const productBody = {
        name: 'Test Product A',
        type: 'product',
        description: 'High quality test product',
        hsnSac: '1001',
        unit: 'Nos',
        secondaryUnit: 'Box',
        conversionRate: 10,
        salesPrice: 500,
        taxInclusive: true,
        gstPercent: 18,
        cessType: 'Percentage',
        cessValue: 2,
        discountType: 'percentage',
        discountValue: 5,
        purchasePrice: 400,
        taxInclusivePurchase: true,
        wholesalePrice: 450,
        minWholesaleQty: 20,
        categoryId: 'default',
        imagePath: 'https://example.com/product-a.png',
        customFields: [
            { name: 'Color', value: 'Red' },
            { name: 'Size', value: 'L' }
        ]
    };

    const productRes = await authClient.post(
        `/business/${businessId}/products`,
        productBody
    );
    const product = productRes.data.product;
    const productId = product.productId;
    console.log('Created productId:', productId);

    // 5) Create Delivery Challan (all fields filled, status: pending)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const challanBody = {
        status: 'pending',
        challanNumber: 'DC-TEST-0001',
        challanDate: todayStr,
        seller: {
            firmName: business.firmName,
            gstNumber: business.gstNumber,
            address: business.address,
            dispatchAddress: business.dispatchAddress,
            mobile: business.mobile,
            email: business.email,
            stateCode: '29',
            logoUrl: business.companyLogoUrl
        },
        buyerId: partyId,
        buyerName: party.companyName,
        buyerGstin: party.gstNumber || '',
        buyerAddress: `${party.billingAddress.street}, ${party.billingAddress.city}, ${party.billingAddress.state} - ${party.billingAddress.pincode}`,
        shippingAddress: `${party.shippingAddress.street}, ${party.shippingAddress.city}, ${party.shippingAddress.state} - ${party.shippingAddress.pincode}`,
        items: [
            {
                itemId: productId,
                itemName: product.name,
                hsnSac: product.hsnSac || '1001',
                quantity: 10,
                unit: product.unit || 'Nos',
                unitPrice: product.salesPrice || 500,
                discountType: 'percentage',
                discountValue: 5,
                discountPercent: 5,
                gstPercent: product.gstPercent || 18,
                taxInclusive: true,
                cessType: 'Percentage',
                cessValue: 2
            }
        ],
        additionalCharges: [
            {
                name: 'Packing Charges',
                amount: 200,
                gstPercent: 18,
                hsnSac: '9985',
                isTaxInclusive: false
            }
        ],
        globalDiscountType: 'percentage',
        globalDiscountValue: 3,
        tcsInfo: {
            percentage: 1,
            basis: 'finalAmount'
        },
        transportInfo: {
            vehicleNumber: 'KA01AB1234',
            mode: 'By Road',
            transporterName: 'Fast Transport Co',
            transporterId: 'TRANS123',
            docNo: 'LR-00045',
            docDate: todayStr,
            approxDistance: 350,
            placeOfSupply: 'Karnataka',
            dateOfSupply: todayStr,
            placeOfSupplyStateCode: '29',
            placeOfSupplyStateName: 'Karnataka',
            supplyTypeDisplay: 'interstate'
        },
        bankDetails: {
            bankName: business.bankAccounts?.[0]?.bankName || 'State Bank of India',
            accountHolderName:
                business.bankAccounts?.[0]?.accountName || business.firmName,
            accountNumber:
                business.bankAccounts?.[0]?.accountNumber || '12345678901',
            ifscCode: business.bankAccounts?.[0]?.ifscCode || 'SBIN0001234',
            branch: business.bankAccounts?.[0]?.branch || 'MG ROAD',
            upiId: business.bankAccounts?.[0]?.upiId || 'dcfirm@sbi'
        },
        otherDetails: {
            reverseCharge: false,
            poNumber: 'PO-123456',
            poDate: todayStr,
            challanNumber: 'CH-7890',
            eWayBillNumber: 'EWB-000111222'
        },
        customFields: [
            { name: 'Order Ref', value: 'ORD-9988' },
            { name: 'Delivery Person', value: 'John Doe' }
        ],
        termsAndConditions: [
            'Goods to be returned if not accepted.',
            'All disputes subject to seller city jurisdiction.'
        ],
        notes: 'Thank you for your business!',
        signatureUrl:
            business.defaultSignatureUrl || 'https://example.com/signature.png',
        stampUrl: business.defaultStampUrl || 'https://example.com/stamp.png'
    };

    const challanRes = await authClient.post(
        `/business/${businessId}/delivery-challans`,
        challanBody
    );
    console.log('Delivery Challan create response:', JSON.stringify(challanRes.data, null, 2));

    const deliveryChallan = challanRes.data.deliveryChallan;
    // Resolve ID from multiple possible fields (deployed code currently keeps it in SK)
    let challanId =
        deliveryChallan.deliveryChallanId ||
        deliveryChallan.id ||
        (typeof deliveryChallan.SK === 'string' &&
            deliveryChallan.SK.split('DELIVERY_CHALLAN#')[1]);

    console.log('Created challanId (resolved):', challanId);

    if (!challanId) {
        throw new Error(
            'Could not resolve challanId from create response. Check backend mapping.'
        );
    }

    // 5b) Generate Delivery Challan PDF
    const challanPdfRes = await authClient.post(
        `/business/${businessId}/delivery-challans/${challanId}/pdf`,
        { templateId: 'classic' }
    );
    console.log('Delivery Challan PDF URL:', challanPdfRes.data.pdfUrl);

    // 6) Update status to delivered (Mark as Delivered)
    const updateRes = await authClient.put(
        `/business/${businessId}/delivery-challans/${challanId}`,
        { status: 'delivered' }
    );
    console.log('Updated challan status to:', updateRes.data.deliveryChallan.status);

    // 7) List delivery challans with status=delivered filter
    const listRes = await authClient.get(
        `/business/${businessId}/delivery-challans?status=delivered&limit=10`
    );
    console.log('List delivered challans count:', listRes.data.count);
    console.log('List response:', JSON.stringify(listRes.data, null, 2));

    console.log('DONE.');
}

main().catch((err) => {
    if (err.response) {
        console.error('HTTP Error:', err.response.status, err.response.data);
    } else {
        console.error('Error:', err.message);
    }
});
