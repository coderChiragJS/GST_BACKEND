/**
 * Test script for Package & Trial APIs (deployed).
 * Usage:
 *   BASE_URL=https://your-api.execute-api.region.amazonaws.com/dev node scripts/test_package_and_trial_apis.js
 *   Optional: EMAIL=user@example.com PASSWORD=xxx  (for user APIs)
 *   Optional: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=xxx  (for admin APIs)
 */
const https = require('https');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev';
const isHttps = BASE_URL.startsWith('https');
const lib = isHttps ? https : http;

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL);
        const pathWithBase = (url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname) + (path.startsWith('/') ? path : '/' + path);
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: pathWithBase,
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
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

async function run() {
    const results = { passed: 0, failed: 0 };
    function ok(name) {
        results.passed++;
        console.log(`  ✅ ${name}`);
    }
    function fail(name, detail) {
        results.failed++;
        console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
    }

    console.log('\n--- Package & Trial API tests ---');
    console.log('BASE_URL:', BASE_URL);

    // --- User APIs (need a user token) ---
    const userEmail = process.env.EMAIL;
    const userPassword = process.env.PASSWORD;
    let userToken = null;

    if (userEmail && userPassword) {
        console.log('\n[User APIs] Logging in...');
        const loginRes = await request('/auth/login', 'POST', { email: userEmail, password: userPassword });
        if (loginRes.status === 200 && loginRes.body.token) {
            userToken = loginRes.body.token;
            ok('User login');
        } else {
            fail('User login', loginRes.body.error || loginRes.body.message || loginRes.status);
        }
    } else {
        console.log('\n[User APIs] No EMAIL/PASSWORD set – registering temp user...');
        const ts = Date.now();
        const tempEmail = `pkgtest_${ts}@example.com`;
        const regRes = await request('/auth/register', 'POST', { name: 'Pkg Test', email: tempEmail, password: 'Test123!' });
        if (regRes.status === 201 || regRes.status === 200) {
            const loginRes = await request('/auth/login', 'POST', { email: tempEmail, password: 'Test123!' });
            if (loginRes.status === 200 && loginRes.body.token) {
                userToken = loginRes.body.token;
                ok('Register + login temp user');
            } else {
                fail('Login after register', loginRes.status);
            }
        } else {
            fail('Register temp user', regRes.body.error || regRes.status);
        }
    }

    if (userToken) {
        // GET /packages
        const listPkgRes = await request('/packages', 'GET', null, userToken);
        if (listPkgRes.status === 200 && Array.isArray(listPkgRes.body.packages)) {
            ok('GET /packages');
            console.log('    Packages count:', listPkgRes.body.packages.length);
        } else {
            fail('GET /packages', listPkgRes.body.error || listPkgRes.status);
        }

        // GET /user/subscription
        const subRes = await request('/user/subscription', 'GET', null, userToken);
        if (subRes.status === 200 && typeof subRes.body.hasActiveSubscription === 'boolean') {
            ok('GET /user/subscription');
            console.log('    hasActiveSubscription:', subRes.body.hasActiveSubscription, 'remainingInvoices:', subRes.body.remainingInvoices, 'remainingQuotations:', subRes.body.remainingQuotations);
        } else {
            fail('GET /user/subscription', subRes.body.error || subRes.status);
        }

        // POST /user/subscriptions if we have at least one package
        const packages = listPkgRes.status === 200 ? listPkgRes.body.packages : [];
        if (packages.length > 0) {
            const pkgId = packages[0].packageId;
            const purchaseRes = await request('/user/subscriptions', 'POST', { packageId: pkgId }, userToken);
            if (purchaseRes.status === 201 && purchaseRes.body.subscription) {
                ok('POST /user/subscriptions');
                console.log('    subscriptionId:', purchaseRes.body.subscription.subscriptionId);
            } else {
                fail('POST /user/subscriptions', purchaseRes.body.error || purchaseRes.status);
            }

            // GET /user/subscription again
            const subRes2 = await request('/user/subscription', 'GET', null, userToken);
            if (subRes2.status === 200 && subRes2.body.hasActiveSubscription === true) {
                ok('GET /user/subscription after purchase');
            } else {
                fail('GET /user/subscription after purchase');
            }
        } else {
            console.log('  ⏭ No packages to test purchase (create via admin first)');
        }
    }

    // --- Admin APIs: create new admin if credentials not set ---
    let adminEmail = process.env.ADMIN_EMAIL;
    let adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
        console.log('\n[Admin APIs] No ADMIN_EMAIL/ADMIN_PASSWORD – creating new admin account...');
        const ts = Date.now();
        adminEmail = `admin_test_${ts}@example.com`;
        adminPassword = 'TestAdmin123!';
        const adminRegRes = await request('/admin/auth/register', 'POST', {
            name: 'Test Admin',
            email: adminEmail,
            password: adminPassword
        });
        if (adminRegRes.status === 201) {
            ok('POST /admin/auth/register (new admin created)');
            console.log('    Admin email:', adminEmail);
            console.log('    Admin password:', adminPassword);
        } else if (adminRegRes.status === 409) {
            fail('Admin register', 'Email already exists – use ADMIN_EMAIL and ADMIN_PASSWORD');
            adminEmail = null;
            adminPassword = null;
        } else {
            fail('Admin register', adminRegRes.body.error || adminRegRes.status);
            adminEmail = null;
            adminPassword = null;
        }
    }

    if (adminEmail && adminPassword) {
        console.log('\n[Admin APIs] Admin login...');
        const adminLoginRes = await request('/admin/auth/login', 'POST', { email: adminEmail, password: adminPassword });
        const adminToken = adminLoginRes.body.token;
        if (adminLoginRes.status !== 200 || !adminToken) {
            fail('Admin login', adminLoginRes.body.error || adminLoginRes.status);
        } else {
            ok('Admin login');

            // GET /admin/settings/trial-days
            const trialGetRes = await request('/admin/settings/trial-days', 'GET', null, adminToken);
            if (trialGetRes.status === 200 && typeof trialGetRes.body.trialDays === 'number') {
                ok('GET /admin/settings/trial-days');
                console.log('    trialDays:', trialGetRes.body.trialDays);
            } else {
                fail('GET /admin/settings/trial-days', trialGetRes.body.error || trialGetRes.status);
            }

            // PUT /admin/settings/trial-days (set to same value to avoid changing real config)
            const currentDays = trialGetRes.status === 200 ? trialGetRes.body.trialDays : 14;
            const trialPutRes = await request('/admin/settings/trial-days', 'PUT', { trialDays: currentDays }, adminToken);
            if (trialPutRes.status === 200 && typeof trialPutRes.body.trialDays === 'number') {
                ok('PUT /admin/settings/trial-days');
            } else {
                fail('PUT /admin/settings/trial-days', trialPutRes.body.error || trialPutRes.status);
            }

            // GET /admin/packages
            const adminListRes = await request('/admin/packages', 'GET', null, adminToken);
            if (adminListRes.status === 200 && Array.isArray(adminListRes.body.packages)) {
                ok('GET /admin/packages');
                console.log('    Packages count:', adminListRes.body.packages.length);
            } else {
                fail('GET /admin/packages', adminListRes.body.error || adminListRes.status);
            }

            // POST /admin/packages (create one for testing)
            const createBody = {
                name: 'Test Plan ' + Date.now(),
                price: 499,
                invoiceLimit: 50,
                quotationLimit: 50,
                validityDays: 30,
                isActive: true
            };
            const createRes = await request('/admin/packages', 'POST', createBody, adminToken);
            let createdPackageId = null;
            if (createRes.status === 201 && createRes.body.package) {
                ok('POST /admin/packages');
                createdPackageId = createRes.body.package.packageId || createRes.body.package.SK;
                console.log('    packageId:', createdPackageId);
            } else {
                fail('POST /admin/packages', createRes.body.error || JSON.stringify(createRes.body));
            }

            // PUT /admin/packages/:packageId (if we created one)
            if (createdPackageId) {
                const updateRes = await request(`/admin/packages/${createdPackageId}`, 'PUT', { name: 'Test Plan Updated' }, adminToken);
                if (updateRes.status === 200 && updateRes.body.package) {
                    ok('PUT /admin/packages/:packageId');
                } else {
                    fail('PUT /admin/packages/:packageId', updateRes.body.error || updateRes.status);
                }
            }

            // GET /admin/users/expired-trial
            const expiredRes = await request('/admin/users/expired-trial?limit=10', 'GET', null, adminToken);
            if (expiredRes.status === 200 && Array.isArray(expiredRes.body.users)) {
                ok('GET /admin/users/expired-trial');
                console.log('    Expired trial users count:', expiredRes.body.users.length);
            } else {
                fail('GET /admin/users/expired-trial', expiredRes.body.error || expiredRes.status);
            }
        }
    } else {
        console.log('\n[Admin APIs] Skipped (no admin credentials or create failed)');
    }

    console.log('\n--- Result ---');
    console.log('Passed:', results.passed, ' Failed:', results.failed);
    process.exit(results.failed > 0 ? 1 : 0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
