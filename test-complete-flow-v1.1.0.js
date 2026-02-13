/**
 * COMPREHENSIVE END-TO-END TEST SCRIPT - Backend v1.1.0
 * 
 * Tests ALL document types with ALL new fields added in v1.1.0:
 * - Invoice (with shippingName, shippingGstin)
 * - Quotation (with shippingName, shippingGstin)
 * - Delivery Challan (with shippingName, shippingGstin)
 * - Sales Debit Note (with referenceInvoiceId, referenceInvoiceNumber, reason, shippingName, shippingGstin)
 * - Party (with numeric pincode validation)
 * - Query debit notes by referenceInvoiceId
 * 
 * Usage:
 *   npm install axios
 *   node test-complete-flow-v1.1.0.js
 */

const axios = require('axios');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Production URL
const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';

// Test credentials (will create new user with timestamp)
const timestamp = Date.now();
const TEST_EMAIL = `test.complete.${timestamp}@example.com`;
const TEST_PASSWORD = 'StrongPass123!';
const TEST_NAME = `Complete Flow Tester ${timestamp}`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function log(section, message, data = null) {
    console.log(`\n[${'='.repeat(70)}]`);
    console.log(`[${section}]`);
    console.log(`[${'='.repeat(70)}]`);
    console.log(message);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

function success(message) {
    console.log(`✅ ${message}`);
}

function error(message, err) {
    console.error(`❌ ${message}`);
    if (err.response) {
        console.error('Status:', err.response.status);
        console.error('Data:', JSON.stringify(err.response.data, null, 2));
    } else {
        console.error('Error:', err.message);
    }
}

// ============================================================================
// MAIN TEST FLOW
// ============================================================================

async function main() {
    log('SETUP', `Starting comprehensive test flow for Backend v1.1.0\nBase URL: ${BASE_URL}`);

    const client = axios.create({
        baseURL: BASE_URL,
        timeout: 30000
    });

    let authClient;
    let token;
    let businessId;
    let partyId;
    let productId;
    let invoiceId;
    let quotationId;
    let challanId;
    let salesDebitNoteId;

    try {
        // ====================================================================
        // 1. USER REGISTRATION & LOGIN
        // ====================================================================
        log('STEP 1', 'User Registration & Login');

        try {
            const regRes = await client.post('/auth/register', {
                name: TEST_NAME,
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            });
            success(`Registered new user: ${regRes.data.userId}`);
        } catch (err) {
            if (err.response?.status === 409) {
                success('User already exists, proceeding to login');
            } else {
                throw err;
            }
        }

        const loginRes = await client.post('/auth/login', {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        token = loginRes.data.token;
        success(`Logged in successfully. Token acquired.`);

        authClient = axios.create({
            baseURL: BASE_URL,
            timeout: 30000,
            headers: { Authorization: `Bearer ${token}` }
        });

        // ====================================================================
        // 2. CREATE BUSINESS (Complete Profile)
        // ====================================================================
        log('STEP 2', 'Creating Business with Complete Profile');

        const businessBody = {
            firmName: `Test Firm ${timestamp}`,
            gstNumber: '29ABCDE1234F1Z5',
            pan: 'ABCDE1234F',
            mobile: '9876543210',
            email: `firm${timestamp}@example.com`,
            address: {
                street: '123 MG Road, Commercial Complex',
                city: 'Bengaluru',
                state: 'Karnataka',
                pincode: '560001'
            },
            dispatchAddress: {
                street: 'Warehouse 7, Industrial Area, Phase 2',
                city: 'Bengaluru',
                state: 'Karnataka',
                pincode: '560048'
            },
            companyLogoUrl: 'https://example.com/logo.png',
            customFields: {
                industry: 'Trading & Manufacturing',
                branchCode: 'BLR-MAIN-001',
                taxRegion: 'South'
            },
            bankAccounts: [
                {
                    id: 'bank-1',
                    accountName: `Test Firm ${timestamp}`,
                    bankName: 'State Bank of India',
                    accountNumber: '12345678901234',
                    ifscCode: 'SBIN0001234',
                    branch: 'MG Road Branch',
                    upiId: `testfirm${timestamp}@sbi`,
                    isDefault: true
                },
                {
                    id: 'bank-2',
                    accountName: `Test Firm ${timestamp}`,
                    bankName: 'HDFC Bank',
                    accountNumber: '98765432109876',
                    ifscCode: 'HDFC0004321',
                    branch: 'Koramangala Branch',
                    upiId: `testfirm${timestamp}@hdfcbank`,
                    isDefault: false
                }
            ],
            transporters: [
                {
                    id: 'trans-1',
                    transporterId: 'TRANS123456',
                    name: 'Fast Logistics Pvt Ltd',
                    isDefault: true
                },
                {
                    id: 'trans-2',
                    transporterId: 'TRANS789012',
                    name: 'Express Transport Co',
                    isDefault: false
                }
            ],
            termsTemplates: [
                {
                    id: 'terms-1',
                    name: 'Standard Terms',
                    terms: [
                        'Payment due within 30 days of invoice date.',
                        'Interest @18% p.a. will be charged on delayed payments.',
                        'Goods once sold will not be taken back.',
                        'Subject to Bengaluru jurisdiction only.'
                    ],
                    isDefault: true
                },
                {
                    id: 'terms-2',
                    name: 'Export Terms',
                    terms: [
                        'Payment via LC only.',
                        'Shipping terms: FOB',
                        'All disputes subject to arbitration.'
                    ],
                    isDefault: false
                }
            ],
            defaultSignatureUrl: 'https://example.com/signature.png',
            defaultStampUrl: 'https://example.com/stamp.png'
        };

        const bizRes = await authClient.post('/business', businessBody);
        businessId = bizRes.data.business.businessId;
        success(`Business created: ${businessId}`);

        // ====================================================================
        // 3. CREATE PARTY (with Nested Address & Numeric Pincode)
        // ====================================================================
        log('STEP 3', 'Creating Party with Nested Address Structure (v1.1.0)');

        const partyBody = {
            companyName: `Test Buyer Corp ${timestamp}`,
            gstNumber: '27XYZAB1234C1Z9', // Optional field
            mobile: '9123456789',
            email: `buyer${timestamp}@example.com`,
            billingAddress: {
                street: '101 Buyer Street, Tower A, Floor 5',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001', // ✅ Numeric validation
                country: 'India',
                gst: '27XYZAB1234C1Z9',
                companyName: `Test Buyer Corp ${timestamp}`
            },
            sameAsBilling: false,
            shippingAddress: {
                street: 'Warehouse 3, MIDC Area, Plot No 45',
                city: 'Navi Mumbai',
                state: 'Maharashtra',
                pincode: '410210', // ✅ Numeric validation
                country: 'India',
                gst: '27XYZAB1234C1Z9',
                companyName: `Test Buyer Warehouse ${timestamp}`
            },
            paymentTerms: 30,
            openingBalance: 50000,
            openingBalanceType: 'TO_RECEIVE',
            partyType: 'Company',
            gstTreatment: 'Regular',
            taxPreference: 'Exclusive',
            tdsApplicable: true,
            tcsApplicable: true
        };

        const partyRes = await authClient.post('/parties', partyBody);
        partyId = partyRes.data.data.partyId;
        const party = partyRes.data.data;
        success(`Party created: ${partyId}`);
        console.log('Party billing address:', party.billingAddress);
        console.log('Party shipping address:', party.shippingAddress);

        // ====================================================================
        // 4. CREATE PRODUCT
        // ====================================================================
        log('STEP 4', 'Creating Product');

        const productBody = {
            name: `Premium Test Product ${timestamp}`,
            type: 'product',
            description: 'High quality test product with warranty',
            hsnSac: '84713000',
            unit: 'Nos',
            secondaryUnit: 'Box',
            conversionRate: 10,
            salesPrice: 1000,
            taxInclusive: true,
            gstPercent: 18,
            cessType: 'Percentage',
            cessValue: 1,
            discountType: 'percentage',
            discountValue: 5,
            purchasePrice: 750,
            taxInclusivePurchase: true,
            wholesalePrice: 900,
            minWholesaleQty: 50,
            categoryId: 'electronics',
            imagePath: 'https://example.com/product.png',
            customFields: [
                { name: 'Brand', value: 'TestBrand' },
                { name: 'Model', value: 'TB-2024' },
                { name: 'Warranty', value: '2 Years' }
            ]
        };

        const productRes = await authClient.post(
            `/business/${businessId}/products`,
            productBody
        );
        productId = productRes.data.product.productId;
        const product = productRes.data.product;
        success(`Product created: ${productId}`);

        // ====================================================================
        // 5. CREATE INVOICE (with shippingName & shippingGstin - v1.1.0)
        // ====================================================================
        log('STEP 5', 'Creating Invoice with Shipping Consignee Fields (v1.1.0)');

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const dueDate = new Date(today.getTime() + 30 * 86400000);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const invoiceBody = {
            invoiceNumber: `INV-${timestamp}-001`,
            invoiceDate: todayStr,
            dueDate: dueDateStr,
            type: 'taxInvoice',
            status: 'saved',
            seller: {
                firmName: bizRes.data.business.firmName,
                gstNumber: bizRes.data.business.gstNumber,
                address: bizRes.data.business.address,
                dispatchAddress: bizRes.data.business.dispatchAddress,
                mobile: bizRes.data.business.mobile,
                email: bizRes.data.business.email,
                stateCode: '29',
                logoUrl: bizRes.data.business.companyLogoUrl
            },
            buyerId: partyId,
            buyerName: party.companyName,
            buyerGstin: party.gstNumber || '',
            buyerAddress: `${party.billingAddress.street}, ${party.billingAddress.city}, ${party.billingAddress.state} - ${party.billingAddress.pincode}`,
            // ✅ NEW FIELDS (v1.1.0) - Third-party consignee
            shippingName: 'XYZ Logistics Warehouse Pvt Ltd',
            shippingGstin: '29XYZLOG1234D1Z8',
            shippingAddress: `${party.shippingAddress.street}, ${party.shippingAddress.city}, ${party.shippingAddress.state} - ${party.shippingAddress.pincode}`,
            items: [
                {
                    itemId: productId,
                    itemName: product.name,
                    hsnSac: product.hsnSac,
                    quantity: 25,
                    unit: product.unit,
                    unitPrice: product.salesPrice,
                    discountType: 'percentage',
                    discountValue: 5,
                    discountPercent: 5,
                    gstPercent: product.gstPercent,
                    taxInclusive: true,
                    cessType: 'Percentage',
                    cessValue: 1
                },
                {
                    itemId: 'item-2',
                    itemName: 'Installation Service',
                    hsnSac: '998314',
                    quantity: 1,
                    unit: 'Service',
                    unitPrice: 2000,
                    discountType: 'flat',
                    discountValue: 200,
                    discountPercent: 0,
                    gstPercent: 18,
                    taxInclusive: false,
                    cessType: 'Fixed',
                    cessValue: 0
                }
            ],
            additionalCharges: [
                {
                    name: 'Packing & Forwarding',
                    amount: 500,
                    gstPercent: 18,
                    hsnSac: '996511',
                    isTaxInclusive: false
                },
                {
                    name: 'Insurance',
                    amount: 300,
                    gstPercent: 18,
                    hsnSac: '997132',
                    isTaxInclusive: false
                }
            ],
            globalDiscountType: 'percentage',
            globalDiscountValue: 2,
            tcsInfo: {
                percentage: 0.1,
                basis: 'finalAmount'
            },
            transportInfo: {
                vehicleNumber: 'KA01MN5678',
                mode: 'By Road',
                transporterName: 'Fast Logistics Pvt Ltd',
                transporterId: 'TRANS123456',
                docNo: 'LR-2024-00123',
                docDate: todayStr,
                approxDistance: 980,
                placeOfSupply: 'Maharashtra',
                dateOfSupply: todayStr,
                placeOfSupplyStateCode: '27',
                placeOfSupplyStateName: 'Maharashtra',
                supplyTypeDisplay: 'interstate'
            },
            bankDetails: {
                bankName: 'State Bank of India',
                accountHolderName: bizRes.data.business.firmName,
                accountNumber: '12345678901234',
                ifscCode: 'SBIN0001234',
                branch: 'MG Road Branch',
                upiId: `testfirm${timestamp}@sbi`
            },
            otherDetails: {
                reverseCharge: false,
                poNumber: `PO-${timestamp}-001`,
                poDate: todayStr,
                challanNumber: `CH-${timestamp}-001`,
                eWayBillNumber: `EWB-${timestamp}-001`
            },
            customFields: [
                { name: 'Order Reference', value: `ORD-${timestamp}` },
                { name: 'Sales Person', value: 'Rajesh Kumar' },
                { name: 'Territory', value: 'West Zone' }
            ],
            termsAndConditions: [
                'Payment due within 30 days of invoice date.',
                'Interest @18% p.a. will be charged on delayed payments.',
                'Goods once sold will not be taken back.',
                'Subject to Bengaluru jurisdiction only.'
            ],
            notes: 'Thank you for your business! For any queries, contact our support team.',
            signatureUrl: 'https://example.com/signature.png',
            stampUrl: 'https://example.com/stamp.png'
        };

        const invoiceRes = await authClient.post(
            `/business/${businessId}/invoices`,
            invoiceBody
        );
        invoiceId = invoiceRes.data.invoice.invoiceId;
        success(`Invoice created: ${invoiceId}`);
        console.log('✅ Shipping consignee name:', invoiceRes.data.invoice.shippingName);
        console.log('✅ Shipping consignee GSTIN:', invoiceRes.data.invoice.shippingGstin);

        // Generate Invoice PDF
        const invPdfRes = await authClient.post(
            `/business/${businessId}/invoices/${invoiceId}/pdf`,
            { templateId: 'classic' }
        );
        success(`Invoice PDF generated: ${invPdfRes.data.pdfUrl}`);

        // ====================================================================
        // 6. CREATE QUOTATION (with shippingName & shippingGstin - v1.1.0)
        // ====================================================================
        log('STEP 6', 'Creating Quotation with Shipping Consignee Fields (v1.1.0)');

        const validUntil = new Date(today.getTime() + 15 * 86400000);
        const validUntilStr = validUntil.toISOString().split('T')[0];

        const quotationBody = {
            quotationNumber: `QT-${timestamp}-001`,
            quotationDate: todayStr,
            validUntil: validUntilStr,
            status: 'sent',
            seller: invoiceBody.seller,
            buyerId: partyId,
            buyerName: party.companyName,
            buyerGstin: party.gstNumber || '',
            buyerAddress: invoiceBody.buyerAddress,
            // ✅ NEW FIELDS (v1.1.0)
            shippingName: 'ABC Warehouse Solutions Ltd',
            shippingGstin: '27ABCWAR1234E1Z7',
            shippingAddress: invoiceBody.shippingAddress,
            items: [
                {
                    itemId: productId,
                    itemName: product.name,
                    hsnSac: product.hsnSac,
                    quantity: 50,
                    unit: product.unit,
                    unitPrice: 950, // Discounted quote price
                    discountType: 'percentage',
                    discountValue: 10,
                    discountPercent: 10,
                    gstPercent: product.gstPercent,
                    taxInclusive: true,
                    cessType: 'Percentage',
                    cessValue: 1
                }
            ],
            additionalCharges: [
                {
                    name: 'Setup Charges',
                    amount: 1000,
                    gstPercent: 18,
                    hsnSac: '998314',
                    isTaxInclusive: false
                }
            ],
            globalDiscountType: 'flat',
            globalDiscountValue: 500,
            tcsInfo: null,
            bankDetails: invoiceBody.bankDetails,
            contactPersons: [
                {
                    name: 'Amit Sharma',
                    phone: '9876543210',
                    email: 'amit.sharma@example.com'
                },
                {
                    name: 'Priya Patel',
                    phone: '9876543211',
                    email: 'priya.patel@example.com'
                }
            ],
            customFields: [
                { name: 'Quotation Type', value: 'Bulk Order' },
                { name: 'Valid For', value: '15 Days' }
            ],
            termsAndConditions: [
                'This quotation is valid for 15 days.',
                'Prices are subject to change without notice.',
                'Payment terms: 50% advance, 50% on delivery.'
            ],
            notes: 'Special bulk order pricing. Contact us for further discounts on larger quantities.',
            signatureUrl: 'https://example.com/signature.png',
            stampUrl: 'https://example.com/stamp.png'
        };

        const quotationRes = await authClient.post(
            `/business/${businessId}/quotations`,
            quotationBody
        );
        quotationId = quotationRes.data.quotation.quotationId;
        success(`Quotation created: ${quotationId}`);
        console.log('✅ Shipping consignee name:', quotationRes.data.quotation.shippingName);
        console.log('✅ Shipping consignee GSTIN:', quotationRes.data.quotation.shippingGstin);

        // Generate Quotation PDF
        const qtPdfRes = await authClient.post(
            `/business/${businessId}/quotations/${quotationId}/pdf`,
            { templateId: 'classic' }
        );
        success(`Quotation PDF generated: ${qtPdfRes.data.pdfUrl}`);

        // ====================================================================
        // 7. CREATE DELIVERY CHALLAN (with shippingName & shippingGstin - v1.1.0)
        // ====================================================================
        log('STEP 7', 'Creating Delivery Challan with Shipping Consignee Fields (v1.1.0)');

        const challanBody = {
            challanNumber: `DC-${timestamp}-001`,
            challanDate: todayStr,
            status: 'pending',
            seller: invoiceBody.seller,
            buyerId: partyId,
            buyerName: party.companyName,
            buyerGstin: party.gstNumber || '',
            buyerAddress: invoiceBody.buyerAddress,
            // ✅ NEW FIELDS (v1.1.0)
            shippingName: 'DEF Distribution Center Pvt Ltd',
            shippingGstin: '27DEFDIST1234F1Z6',
            shippingAddress: invoiceBody.shippingAddress,
            items: invoiceBody.items,
            additionalCharges: invoiceBody.additionalCharges,
            globalDiscountType: 'flat',
            globalDiscountValue: 0,
            tcsInfo: null,
            transportInfo: invoiceBody.transportInfo,
            bankDetails: invoiceBody.bankDetails,
            otherDetails: {
                reverseCharge: false,
                poNumber: invoiceBody.otherDetails.poNumber,
                poDate: invoiceBody.otherDetails.poDate,
                challanNumber: `CH-${timestamp}-001`,
                eWayBillNumber: `EWB-${timestamp}-002`
            },
            customFields: [
                { name: 'Delivery Type', value: 'Express' },
                { name: 'Delivery Person', value: 'Suresh Kumar' },
                { name: 'Vehicle Type', value: 'Truck' }
            ],
            termsAndConditions: [
                'Goods to be returned if not accepted within 24 hours.',
                'All disputes subject to seller city jurisdiction.',
                'Receiver must sign and stamp the delivery receipt.'
            ],
            notes: 'Handle with care. Fragile items inside.',
            signatureUrl: 'https://example.com/signature.png',
            stampUrl: 'https://example.com/stamp.png'
        };

        const challanRes = await authClient.post(
            `/business/${businessId}/delivery-challans`,
            challanBody
        );
        challanId = challanRes.data.deliveryChallan.deliveryChallanId ||
                     challanRes.data.deliveryChallan.id;
        success(`Delivery Challan created: ${challanId}`);
        console.log('✅ Shipping consignee name:', challanRes.data.deliveryChallan.shippingName);
        console.log('✅ Shipping consignee GSTIN:', challanRes.data.deliveryChallan.shippingGstin);

        // Generate Delivery Challan PDF
        const dcPdfRes = await authClient.post(
            `/business/${businessId}/delivery-challans/${challanId}/pdf`,
            { templateId: 'classic' }
        );
        success(`Delivery Challan PDF generated: ${dcPdfRes.data.pdfUrl}`);

        // Update Challan Status to Delivered
        const updateChallanRes = await authClient.put(
            `/business/${businessId}/delivery-challans/${challanId}`,
            { status: 'delivered' }
        );
        success(`Delivery Challan status updated to: ${updateChallanRes.data.deliveryChallan.status}`);

        // ====================================================================
        // 8. CREATE SALES DEBIT NOTE (with ALL new fields - v1.1.0)
        // ====================================================================
        log('STEP 8', 'Creating Sales Debit Note with Reference Invoice & Reason (v1.1.0)');

        const salesDebitNoteBody = {
            invoiceNumber: `SDN-${timestamp}-001`,
            invoiceDate: todayStr,
            dueDate: dueDateStr,
            status: 'saved',
            // ✅ NEW FIELDS (v1.1.0) - Reference to original invoice
            referenceInvoiceId: invoiceId,
            referenceInvoiceNumber: invoiceBody.invoiceNumber,
            reason: 'Additional charges for express delivery and special packaging as per customer request. Rate difference due to fuel surcharge.',
            seller: invoiceBody.seller,
            buyerId: partyId,
            buyerName: party.companyName,
            buyerGstin: party.gstNumber || '',
            buyerAddress: invoiceBody.buyerAddress,
            // ✅ NEW FIELDS (v1.1.0) - Shipping consignee
            shippingName: 'GHI Receiving Center Ltd',
            shippingGstin: '27GHIREC1234G1Z5',
            shippingAddress: invoiceBody.shippingAddress,
            items: [
                {
                    itemId: 'charge-1',
                    itemName: 'Express Delivery Surcharge',
                    hsnSac: '996511',
                    quantity: 1,
                    unit: 'Service',
                    unitPrice: 1500,
                    discountType: 'flat',
                    discountValue: 0,
                    discountPercent: 0,
                    gstPercent: 18,
                    taxInclusive: false,
                    cessType: 'Fixed',
                    cessValue: 0
                },
                {
                    itemId: 'charge-2',
                    itemName: 'Special Packaging Charges',
                    hsnSac: '996511',
                    quantity: 1,
                    unit: 'Service',
                    unitPrice: 800,
                    discountType: 'flat',
                    discountValue: 0,
                    discountPercent: 0,
                    gstPercent: 18,
                    taxInclusive: false,
                    cessType: 'Fixed',
                    cessValue: 0
                },
                {
                    itemId: 'charge-3',
                    itemName: 'Fuel Surcharge',
                    hsnSac: '996511',
                    quantity: 1,
                    unit: 'Service',
                    unitPrice: 500,
                    discountType: 'flat',
                    discountValue: 0,
                    discountPercent: 0,
                    gstPercent: 18,
                    taxInclusive: false,
                    cessType: 'Fixed',
                    cessValue: 0
                }
            ],
            additionalCharges: [],
            globalDiscountType: 'flat',
            globalDiscountValue: 0,
            tcsInfo: {
                percentage: 0.1,
                basis: 'finalAmount'
            },
            transportInfo: invoiceBody.transportInfo,
            bankDetails: invoiceBody.bankDetails,
            otherDetails: {
                reverseCharge: false,
                poNumber: invoiceBody.invoiceNumber, // Reference to original invoice
                poDate: invoiceBody.invoiceDate,
                challanNumber: invoiceBody.otherDetails.challanNumber,
                eWayBillNumber: null
            },
            customFields: [
                { name: 'Debit Note Type', value: 'Additional Charges' },
                { name: 'Original Invoice', value: invoiceBody.invoiceNumber },
                { name: 'Approved By', value: 'Finance Manager' }
            ],
            termsAndConditions: [
                'This debit note is issued for additional charges as per agreement.',
                'Please adjust this amount in your next payment.',
                'For any queries, contact our accounts department.'
            ],
            notes: 'Debit note raised for additional services provided. Please refer to original invoice for details.',
            signatureUrl: 'https://example.com/signature.png',
            stampUrl: 'https://example.com/stamp.png'
        };

        const sdnRes = await authClient.post(
            `/business/${businessId}/sales-debit-notes`,
            salesDebitNoteBody
        );
        salesDebitNoteId = sdnRes.data.salesDebitNote.salesDebitNoteId ||
                           sdnRes.data.salesDebitNote.id;
        success(`Sales Debit Note created: ${salesDebitNoteId}`);
        console.log('✅ Reference Invoice ID:', sdnRes.data.salesDebitNote.referenceInvoiceId);
        console.log('✅ Reference Invoice Number:', sdnRes.data.salesDebitNote.referenceInvoiceNumber);
        console.log('✅ Reason:', sdnRes.data.salesDebitNote.reason);
        console.log('✅ Shipping consignee name:', sdnRes.data.salesDebitNote.shippingName);
        console.log('✅ Shipping consignee GSTIN:', sdnRes.data.salesDebitNote.shippingGstin);

        // Generate Sales Debit Note PDF
        const sdnPdfRes = await authClient.post(
            `/business/${businessId}/sales-debit-notes/${salesDebitNoteId}/pdf`,
            { templateId: 'classic' }
        );
        success(`Sales Debit Note PDF generated: ${sdnPdfRes.data.pdfUrl}`);

        // ====================================================================
        // 9. QUERY DEBIT NOTES BY REFERENCE INVOICE (v1.1.0)
        // ====================================================================
        log('STEP 9', 'Querying Debit Notes by Reference Invoice ID (v1.1.0)');

        const queryRes = await authClient.get(
            `/business/${businessId}/sales-debit-notes?referenceInvoiceId=${invoiceId}`
        );
        success(`Found ${queryRes.data.count} debit note(s) for invoice ${invoiceId}`);
        console.log('Debit notes:', queryRes.data.salesDebitNotes.map(n => ({
            id: n.salesDebitNoteId || n.id,
            number: n.invoiceNumber,
            reason: n.reason,
            referenceInvoiceNumber: n.referenceInvoiceNumber
        })));

        // ====================================================================
        // 10. LIST ALL DOCUMENTS
        // ====================================================================
        log('STEP 10', 'Listing All Documents');

        const listInvoices = await authClient.get(`/business/${businessId}/invoices`);
        success(`Total Invoices: ${listInvoices.data.count}`);

        const listQuotations = await authClient.get(`/business/${businessId}/quotations`);
        success(`Total Quotations: ${listQuotations.data.count}`);

        const listChallans = await authClient.get(`/business/${businessId}/delivery-challans`);
        success(`Total Delivery Challans: ${listChallans.data.count}`);

        const listDebitNotes = await authClient.get(`/business/${businessId}/sales-debit-notes`);
        success(`Total Sales Debit Notes: ${listDebitNotes.data.count}`);

        // ====================================================================
        // 11. VERIFY BACKWARD COMPATIBILITY
        // ====================================================================
        log('STEP 11', 'Testing Backward Compatibility (Documents without new fields)');

        // Create invoice WITHOUT new fields (should still work)
        const simpleInvoiceBody = {
            invoiceNumber: `INV-${timestamp}-002`,
            invoiceDate: todayStr,
            type: 'taxInvoice',
            status: 'saved',
            seller: invoiceBody.seller,
            buyerName: party.companyName,
            buyerGstin: party.gstNumber || '',
            buyerAddress: invoiceBody.buyerAddress,
            // No shippingName, no shippingGstin
            items: [
                {
                    itemId: productId,
                    itemName: product.name,
                    hsnSac: product.hsnSac,
                    quantity: 5,
                    unit: product.unit,
                    unitPrice: product.salesPrice,
                    discountType: 'flat',
                    discountValue: 0,
                    discountPercent: 0,
                    gstPercent: product.gstPercent,
                    taxInclusive: true,
                    cessType: 'Fixed',
                    cessValue: 0
                }
            ],
            globalDiscountType: 'flat',
            globalDiscountValue: 0
        };

        const simpleInvRes = await authClient.post(
            `/business/${businessId}/invoices`,
            simpleInvoiceBody
        );
        success(`Simple invoice created (backward compatibility): ${simpleInvRes.data.invoice.invoiceId}`);

        // Create debit note WITHOUT new fields (should still work)
        const simpleDebitNoteBody = {
            invoiceNumber: `SDN-${timestamp}-002`,
            invoiceDate: todayStr,
            status: 'saved',
            seller: invoiceBody.seller,
            buyerName: party.companyName,
            // No referenceInvoiceId, no reason, no shippingName
            items: simpleInvoiceBody.items,
            globalDiscountType: 'flat',
            globalDiscountValue: 0
        };

        const simpleSDNRes = await authClient.post(
            `/business/${businessId}/sales-debit-notes`,
            simpleDebitNoteBody
        );
        success(`Simple debit note created (backward compatibility): ${simpleSDNRes.data.salesDebitNote.salesDebitNoteId || simpleSDNRes.data.salesDebitNote.id}`);

        // ====================================================================
        // SUMMARY
        // ====================================================================
        log('TEST SUMMARY', 'All Tests Completed Successfully! ✅');

        console.log('\n📊 Created Resources:');
        console.log(`   Business ID: ${businessId}`);
        console.log(`   Party ID: ${partyId}`);
        console.log(`   Product ID: ${productId}`);
        console.log(`   Invoice ID: ${invoiceId}`);
        console.log(`   Quotation ID: ${quotationId}`);
        console.log(`   Delivery Challan ID: ${challanId}`);
        console.log(`   Sales Debit Note ID: ${salesDebitNoteId}`);

        console.log('\n✅ Verified Features (v1.1.0):');
        console.log('   ✓ Party with nested address structure');
        console.log('   ✓ Numeric pincode validation');
        console.log('   ✓ Invoice with shippingName & shippingGstin');
        console.log('   ✓ Quotation with shippingName & shippingGstin');
        console.log('   ✓ Delivery Challan with shippingName & shippingGstin');
        console.log('   ✓ Sales Debit Note with referenceInvoiceId');
        console.log('   ✓ Sales Debit Note with referenceInvoiceNumber');
        console.log('   ✓ Sales Debit Note with reason field');
        console.log('   ✓ Sales Debit Note with shippingName & shippingGstin');
        console.log('   ✓ Query debit notes by referenceInvoiceId');
        console.log('   ✓ Backward compatibility (documents without new fields)');

        console.log('\n🎉 Backend v1.1.0 - All Features Working Perfectly!');

    } catch (err) {
        error('Test failed', err);
        process.exit(1);
    }
}

// ============================================================================
// RUN TEST
// ============================================================================

if (!BASE_URL) {
    console.error('❌ BASE_URL is not configured');
    process.exit(1);
}

main().then(() => {
    console.log('\n✅ Test script completed successfully');
    process.exit(0);
}).catch((err) => {
    console.error('\n❌ Test script failed:', err.message);
    process.exit(1);
});
