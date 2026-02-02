const https = require('https');
const AWS = require('aws-sdk');

// Configuration
const API_URL = 'https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev';
const USERS_TABLE = 'GST_USERS';

// Initialize DynamoDB for Promotion step
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'eu-north-1' });

const timestamp = Date.now();
const userEmail = `user_flow_${timestamp}@example.com`;
const adminEmail = `admin_flow_${timestamp}@example.com`;
const password = 'password123';

async function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = https.request(`${API_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function promoteToAdmin(email) {
    console.log(`\n--- [ACTION] Promoting ${email} to ADMIN in DynamoDB ---`);
    const findRes = await dynamoDb.query({
        TableName: USERS_TABLE,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email }
    }).promise();

    if (!findRes.Items || findRes.Items.length === 0) throw new Error('Admin user not found in DB');
    const userId = findRes.Items[0].userId;

    await dynamoDb.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set #role = :admin',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':admin': 'ADMIN' }
    }).promise();
    console.log('✅ Promoted successfully.');
}

async function runTest() {
    try {
        console.log(`\n--- STARTING COMPREHENSIVE FLOW VERIFICATION ---`);

        // 1. REGISTER USER
        console.log(`\n[1] Registering User (${userEmail})...`);
        const regRes = await request('/auth/register', 'POST', { name: 'Flow User', email: userEmail, password });
        const userId = regRes.body.userId;
        console.log('Status:', regRes.status, 'UserId:', userId);

        // 2. USER LOGIN
        console.log(`\n[2] User Logging in...`);
        const loginRes = await request('/auth/login', 'POST', { email: userEmail, password });
        const userToken = loginRes.body.token;
        console.log('Status:', loginRes.status, 'Token Check:', !!userToken);

        // 3. USER CREATE BUSINESS
        console.log(`\n[3] User Creating Business Profile...`);
        const bizRes = await request('/business', 'POST', {
            firmName: 'Cloud Flow Industries',
            gstNumber: '27AABCA1234F1Z1',
            mobile: '9876543210',
            address: { city: 'Mumbai', state: 'MH' }
        }, userToken);
        console.log('Status:', bizRes.status);

        // 4. REGISTER ADMIN & PROMOTE
        console.log(`\n[4] Registering & Promoting Admin (${adminEmail})...`);
        await request('/auth/register', 'POST', { name: 'Super Admin', email: adminEmail, password });
        await promoteToAdmin(adminEmail);

        // 5. ADMIN LOGIN
        console.log(`\n[5] Admin Logging in...`);
        const adminLoginRes = await request('/auth/login', 'POST', { email: adminEmail, password });
        const adminToken = adminLoginRes.body.token;
        console.log('Status:', adminLoginRes.status, 'Role Check:', adminLoginRes.body.user.role);

        // 6. FETCH PENDING DASHBOARD
        console.log(`\n[6] Admin Fetching Pending Reviews Dashboard...`);
        const dashRes = await request('/admin/pending', 'GET', null, adminToken);
        console.log('Status:', dashRes.status);

        const review = dashRes.body.find(r => r.user.userId === userId);
        if (review) {
            console.log('✅ SUCCESS: User found in Admin Review list!');
            console.log('Business Details:', review.businesses[0].firmName);
        } else {
            console.error('❌ FAILED: User NOT found in Admin Review list.');
        }

        // 7. ADMIN APPROVE USER
        console.log(`\n[7] Admin Approving User...`);
        const approveRes = await request('/admin/approve', 'POST', { userId, trialDays: 14 }, adminToken);
        console.log('Status:', approveRes.status, 'Message:', approveRes.body.message);

        // 8. FINAL CHECK
        console.log(`\n[8] Final Verification: Login User again to check status...`);
        const finalLogin = await request('/auth/login', 'POST', { email: userEmail, password });
        console.log('Final Approval Status:', finalLogin.body.user.approvalStatus);

        if (finalLogin.body.user.approvalStatus === 'APPROVED') {
            console.log('\n🌟🌟🌟 ENTIRE FLOW VERIFIED SUCCESSFULLY! 🌟🌟🌟');
        } else {
            console.error('\n❌ FLOW VERIFICATION FAILED AT FINAL STEP.');
        }

    } catch (error) {
        console.error('\n❌ ERROR DURING VERIFICATION:', error);
    }
}

runTest();
