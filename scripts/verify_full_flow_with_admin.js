const https = require('https');
const AWS = require('aws-sdk');

// Configuration
const API_URL = 'https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev';
const USERS_TABLE = 'GST_USERS';

// Initialize DynamoDB for Promotion step
const dynamoDb = new AWS.DynamoDB.DocumentClient({ 
    region: 'eu-north-1',
    httpOptions: {
        timeout: 5000,
        connectTimeout: 5000
    }
});

const timestamp = Date.now();
const userEmail = `user_${timestamp}@example.com`;
const adminEmail = `admin_${timestamp}@example.com`;
const password = 'Test@1234!'; // Strong password

// Enhanced request function with retry logic
async function request(path, method, body, token, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await new Promise((resolve, reject) => {
                const options = {
                    method,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        ...(token && { 'Authorization': `Bearer ${token}` })
                    },
                    timeout: 10000 // 10 second timeout
                };

                console.log(`\n[${method}] ${path}${i > 0 ? ` (Attempt ${i + 1})` : ''}`);
                if (body && Object.keys(body).length > 0) {
                    console.log('Request Body:', JSON.stringify(body, null, 2));
                }

                const req = https.request(`${API_URL}${path}`, options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        const response = {
                            status: res.statusCode,
                            headers: res.headers,
                            body: null
                        };

                        try {
                            response.body = data ? JSON.parse(data) : null;
                        } catch (e) {
                            console.warn('Failed to parse JSON response:', data);
                            response.body = data;
                        }

                        console.log(`Status: ${res.statusCode}`);
                        if (response.body) {
                            console.log('Response:', JSON.stringify(response.body, null, 2));
                        }

                        if (res.statusCode >= 400) {
                            const error = new Error(`Request failed with status ${res.statusCode}`);
                            error.response = response;
                            reject(error);
                        } else {
                            resolve(response);
                        }
                    });
                });

                req.on('error', (e) => {
                    console.error('Request error:', e.message);
                    reject(e);
                });

                req.on('timeout', () => {
                    req.destroy(new Error('Request timeout'));
                });

                if (body) {
                    req.write(JSON.stringify(body));
                }
                req.end();
            });

            return result;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function promoteToAdmin(email) {
    console.log(`\n--- [ACTION] Promoting ${email} to ADMIN in DynamoDB ---`);
    try {
        const findRes = await dynamoDb.query({
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email }
        }).promise();

        if (!findRes.Items || findRes.Items.length === 0) {
            throw new Error('Admin user not found in DB');
        }

        const userId = findRes.Items[0].userId;
        console.log(`Found user ID ${userId}, promoting to admin...`);

        await dynamoDb.update({
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'set #role = :admin',
            ExpressionAttributeNames: { '#role': 'role' },
            ExpressionAttributeValues: { ':admin': 'ADMIN' }
        }).promise();
        
        console.log('✅ Successfully promoted user to admin');
    } catch (error) {
        console.error('❌ Failed to promote user to admin:', error.message);
        throw error;
    }
}

async function testPartyAPI(token) {
    console.log('\n--- TESTING PARTY MANAGEMENT ENDPOINTS ---');
    let partyId;

    try {
        // 1. Create Party
        console.log('\n[1] Creating a new party...');
        const partyData = {
            companyName: `Test Company ${timestamp}`,
            mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
            billingAddress: {
                street: `${timestamp} Test St`,
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001"
            },
            sameAsBilling: true,
            paymentTerms: 30,
            partyType: "Company",
            gstTreatment: "Regular"
        };

        const createRes = await request('/api/parties', 'POST', partyData, token);
        partyId = createRes.body.data?.partyId;
        if (!partyId) {
            throw new Error('Party creation response did not include partyId');
        }
        console.log('✅ Party created successfully. ID:', partyId);

        // 2. List Parties
        console.log('\n[2] Listing all parties...');
        const listRes = await request('/api/parties', 'GET', null, token);
        if (!Array.isArray(listRes.body?.data)) {
            throw new Error('Invalid response format when listing parties');
        }
        console.log(`✅ Found ${listRes.body.data.length} parties`);

        // 3. Get Party by ID
        console.log(`\n[3] Getting party by ID: ${partyId}...`);
        const getRes = await request(`/api/parties/${partyId}`, 'GET', null, token);
        if (getRes.body.data?.partyId !== partyId) {
            throw new Error('Failed to retrieve the created party');
        }
        console.log('✅ Retrieved party:', getRes.body.data.companyName);

        // 4. Update Party
        console.log('\n[4] Updating party...');
        const updateData = {
            companyName: `Updated Company ${timestamp}`,
            billingAddress: {
                street: `${timestamp} Updated St`,
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001"
            },
            sameAsBilling: false,
            shippingAddress: {
                street: `${timestamp} Shipping St`,
                city: "Thane",
                state: "Maharashtra",
                pincode: "400601"
            }
        };

        const updateRes = await request(`/api/parties/${partyId}`, 'PUT', updateData, token);
        if (updateRes.body.data?.companyName !== updateData.companyName) {
            throw new Error('Party update failed');
        }
        console.log('✅ Party updated successfully');

        return { success: true, partyId };

    } catch (error) {
        console.error('❌ Party API Test Failed:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response, null, 2));
        }
        return { success: false, error: error.message, partyId };
    } finally {
        // 5. Cleanup: Delete Party
        if (partyId) {
            try {
                console.log(`\n[5] Cleaning up: Deleting party ${partyId}...`);
                await request(`/api/parties/${partyId}`, 'DELETE', null, token);
                console.log('✅ Test party deleted');
            } catch (cleanupError) {
                console.warn('⚠️ Failed to clean up test party:', cleanupError.message);
            }
        }
    }
}

async function runTest() {
    let userId;
    let userToken;
    let adminToken;

    try {
        console.log(`\n--- STARTING COMPREHENSIVE FLOW VERIFICATION ---`);
        console.log('API URL:', API_URL);
        console.log('Test Timestamp:', new Date(timestamp).toISOString());

        // 0. Check API Health
        console.log(`\n[0] Checking API Health...`);
        try {
            const healthRes = await request('/health', 'GET');
            console.log('✅ API Health:', healthRes.body?.status || 'Unknown');
        } catch (e) {
            console.warn('⚠️ Health check failed, continuing anyway:', e.message);
        }

        // 1. REGISTER USER
        console.log(`\n[1] Registering User (${userEmail})...`);
        const regRes = await request('/auth/register', 'POST', { 
            name: `Test User ${timestamp}`, 
            email: userEmail, 
            password,
            mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`
        });
        
        userId = regRes.body?.userId;
        if (!userId) {
            throw new Error('User registration failed: No userId in response');
        }
        console.log('✅ User registered with ID:', userId);

        // 2. USER LOGIN
        console.log(`\n[2] User Logging in...`);
        const loginRes = await request('/auth/login', 'POST', { 
            email: userEmail, 
            password 
        });
        
        userToken = loginRes.body?.token;
        if (!userToken) {
            throw new Error('Login failed: No token in response');
        }
        console.log('✅ User logged in successfully');

        // 3. Test Party API
        console.log(`\n[3] Testing Party Management API...`);
        const partyTestResult = await testPartyAPI(userToken);
        if (!partyTestResult.success) {
            throw new Error('Party API tests failed');
        }

        // 4. Create Business Profile
        console.log(`\n[4] Creating Business Profile...`);
        const bizRes = await request('/business', 'POST', {
            firmName: `Test Business ${timestamp}`,
            gstNumber: `27${Math.floor(1000000000 + Math.random() * 9000000000)}F1Z1`,
            mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
            address: { 
                street: `${timestamp} Business St`,
                city: 'Mumbai', 
                state: 'Maharashtra',
                pincode: '400001'
            }
        }, userToken);
        
        if (!bizRes.body?.businessId) {
            throw new Error('Business creation failed');
        }
        console.log('✅ Business profile created');

        // 5. REGISTER ADMIN
        console.log(`\n[5] Registering Admin (${adminEmail})...`);
        await request('/auth/register', 'POST', { 
            name: `Admin User ${timestamp}`, 
            email: adminEmail, 
            password,
            mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`
        });

        // 6. PROMOTE TO ADMIN
        console.log(`\n[6] Promoting to Admin...`);
        await promoteToAdmin(adminEmail);

        // 7. ADMIN LOGIN
        console.log(`\n[7] Admin Logging in...`);
        const adminLoginRes = await request('/auth/login', 'POST', { 
            email: adminEmail, 
            password 
        });
        
        adminToken = adminLoginRes.body?.token;
        if (!adminToken) {
            throw new Error('Admin login failed');
        }
        console.log('✅ Admin logged in successfully');

        // 8. ADMIN APPROVES USER
        console.log(`\n[8] Admin Approving User...`);
        const approveRes = await request('/admin/approve', 'POST', { 
            userId, 
            trialDays: 14 
        }, adminToken);
        
        if (approveRes.status !== 200) {
            throw new Error('User approval failed');
        }
        console.log('✅ User approved by admin');

        // 9. VERIFY APPROVAL
        console.log(`\n[9] Verifying User Approval...`);
        const finalLogin = await request('/auth/login', 'POST', { 
            email: userEmail, 
            password 
        });
        
        if (finalLogin.body?.user?.approvalStatus !== 'APPROVED') {
            throw new Error('User was not approved successfully');
        }
        
        console.log('\n🌟🌟🌟 ALL TESTS PASSED SUCCESSFULLY! 🌟🌟🌟');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response, null, 2));
        }
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the tests
runTest();