const https = require('https');

const API_URL = 'https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev';

const timestamp = Date.now();
const email = `verify_${timestamp}@example.com`;
const password = 'password123';

async function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = https.request(`${API_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    console.log(`\n[${method} ${path}] Status: ${res.statusCode}`);
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, body: json });
                } catch (e) {
                    console.log('Response:', data);
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTest() {
    console.log(`\n--- STARTING VERIFICATION (${email}) ---`);

    // 1. Register
    const regRes = await request('/auth/register', 'POST', {
        name: 'Node Tester',
        email: email,
        password: password
    });
    console.log('Register:', regRes.body);

    // 2. Login
    const loginRes = await request('/auth/login', 'POST', {
        email: email,
        password: password
    });
    console.log('Login:', loginRes.body);

    const token = loginRes.body.token;
    if (!token) {
        console.error('❌ Failed to get token. Exiting.');
        process.exit(1);
    }
    console.log('✅ Token Received');

    // 3. Create Business
    const bizRes = await request('/business', 'POST', {
        firmName: 'NodeJS Tech Ltd',
        gstNumber: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        mobile: '9876543210',
        email: 'node@tech.com',
        address: { street: '456 Web St', city: 'Bangalore' }
    }, token);
    console.log('Create Business:', bizRes.body);

    // 4. List Businesses
    const listRes = await request('/business', 'GET', null, token);
    console.log('List Businesses:', listRes.body);

    if (Array.isArray(listRes.body) && listRes.body.length > 0) {
        console.log('✅ Business List Verification Passed');
    } else {
        console.error('❌ Business List Empty or Invalid');
    }
}

runTest();
