const axios = require('axios');

const BASE_URL = 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev'; // Production URL

async function createChiragUserAndBusiness() {
    try {
        console.log('--- Step 1: Register/Login User ---');
        // Register User (Idempotent-ish)
        const registerPayload = {
            name: 'Chirag Tankwal',
            email: 'chirag@gmail.com',
            password: 'test@33'
        };

        let token;
        let userId;

        // Try to register
        try {
            await axios.post(`${BASE_URL}/auth/register`, registerPayload);
            console.log('User registered successfully.');
        } catch (error) {
            if (error.response && error.response.status === 409) {
                console.log('User already exists, proceeding to login...');
            } else {
                throw error;
            }
        }

        // Login
        const loginPayload = {
            email: 'chirag@gmail.com',
            password: 'test@33'
        };

        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginPayload);
        console.log('Login successful.');
        token = loginResponse.data.token;
        userId = loginResponse.data.user.userId;

        console.log('\n--- Step 2: Get or Create Business ---');
        let businessId;

        // Check existing businesses
        try {
            const businessesResponse = await axios.get(`${BASE_URL}/business`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (businessesResponse.data && businessesResponse.data.length > 0) {
                businessId = businessesResponse.data[0].businessId;
                console.log(`Found existing business: ${businessesResponse.data[0].firmName} (${businessId})`);
            }
        } catch (error) {
            console.log('Error fetching businesses, will try to create one.');
        }

        if (!businessId) {
            // Create Business
            const businessPayload = {
                firmName: 'Chirag Enterprises',
                gstNumber: '29ABCDE1234F1Z5',
                pan: 'ABCDE1234F',
                mobile: '9876543210',
                email: 'chirag@gmail.com',
                address: {
                    street: '123 Main St',
                    city: 'Bangalore',
                    state: 'Karnataka',
                    pincode: '560001'
                },
                dispatchAddress: {
                    street: '456 Warehouse Rd',
                    city: 'Bangalore',
                    state: 'Karnataka',
                    pincode: '560002'
                },
                bankAccounts: [
                    {
                        id: 'bank-1',
                        accountName: 'Chirag Tankwal',
                        bankName: 'HDFC Bank',
                        accountNumber: '1234567890',
                        ifscCode: 'HDFC0001234',
                        branch: 'Indiranagar',
                        isDefault: true
                    }
                ],
                transporters: [
                    {
                        id: 'transporter-1',
                        transporterId: 'TR-001',
                        name: 'VRL Logistics',
                        isDefault: true
                    }
                ],
                termsTemplates: [
                    {
                        id: 'terms-1',
                        name: 'Standard Terms',
                        terms: ['Payment due in 30 days', 'Goods once sold cannot be returned'],
                        isDefault: true
                    }
                ]
            };

            const businessResponse = await axios.post(`${BASE_URL}/business`, businessPayload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            businessId = businessResponse.data.business.businessId;
            console.log('Business created successfully:', businessResponse.data);
        }

        console.log('\n--- Step 3: Create Party ---');
        const partyPayload = {
            companyName: 'Test Customer Pvt Ltd',
            gstNumber: '29XXXXX1234X1Z5',
            mobile: '9876543211',
            email: 'customer@test.com',
            billingAddress: {
                street: 'Flat 101, Galaxy Apts',
                city: 'Bangalore',
                state: 'Karnataka',
                pincode: '560001',
                country: 'India'
            },
            sameAsBilling: true,
            partyType: 'Company',
            gstTreatment: 'Regular',
            openingBalance: 0
        };

        try {
            const partyResponse = await axios.post(`${BASE_URL}/parties`, partyPayload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('Party created successfully:', partyResponse.data);
        } catch (error) {
            console.error('Create Party Error:', error.response ? error.response.data : error.message);
        }

        console.log('\n--- Step 4: Manage Products ---');

        // 4a. List existing products to find "Samsung Galaxy S23" and delete it
        try {
            const productsResponse = await axios.get(`${BASE_URL}/business/${businessId}/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const existingProducts = productsResponse.data.products || [];
            const samsungProduct = existingProducts.find(p => p.name === 'Samsung Galaxy S23');

            if (samsungProduct) {
                console.log(`Deleting existing product: ${samsungProduct.name} (${samsungProduct.productId})`);
                await axios.delete(`${BASE_URL}/business/${businessId}/products/${samsungProduct.productId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                console.log('Product deleted successfully.');
            } else {
                console.log('Old product "Samsung Galaxy S23" not found, skipping delete.');
            }
        } catch (error) {
            console.error('Error listing/deleting products:', error.message);
        }

        // 4b. Create "Waste Paper" Product with ALL fields
        const wastePaperPayload = {
            name: 'Waste Paper (Recycled)',
            type: 'product',
            description: 'High quality sorted waste paper for recycling',
            hsnSac: '4707',
            unit: 'Kgs',
            secondaryUnit: 'Tonnes',
            conversionRate: 1000, // 1 Tonne = 1000 Kgs

            // Sales Details
            salesPrice: 25.00,        // Per Kg
            taxInclusive: false,      // Tax is extra
            gstPercent: 5,            // 5% GST
            cessType: 'Percentage',
            cessValue: 1,             // 1% Cess (Hypothetical for testing)
            discountType: 'percentage',
            discountValue: 2.5,       // 2.5% Discount default

            // Purchase Details
            purchasePrice: 15.00,
            taxInclusivePurchase: true, // Purchase price includes tax

            // Wholesale Details
            wholesalePrice: 22.00,
            minWholesaleQty: 500,     // If buying > 500 Kgs, price is 22

            categoryId: 'default',
            imagePath: 'https://via.placeholder.com/150?text=Waste+Paper',

            customFields: [
                { name: 'Quality Grade', value: 'Grade A' },
                { name: 'Moisture Content', value: '5%' }
            ]
        };

        try {
            console.log('Creating new complex product: "Waste Paper"...');
            const productResponse = await axios.post(`${BASE_URL}/business/${businessId}/products`, wastePaperPayload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('Product created successfully:', productResponse.data);
        } catch (error) {
            console.error('Create Product Error:', error.response ? error.response.data : error.message);
        }

    } catch (error) {
        if (error.response) {
            console.error('Global Error Response:', error.response.status, error.response.data);
        } else {
            console.error('Global Error:', error.message);
        }
    }
}

createChiragUserAndBusiness();
