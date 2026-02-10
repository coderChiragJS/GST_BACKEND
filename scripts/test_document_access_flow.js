/**
 * End-to-end test for trial + subscription document access logic.
 *
 * Flow:
 *  1) Admin temporarily sets trialDays = 0 (instant expiry for new users).
 *  2) Register + login a temp user.
 *  3) Confirm /user/document-access => canCreateDocuments = false (trial expired, no package).
 *  4) Admin ensures at least one package exists (creates one if needed).
 *  5) User purchases a package -> /user/subscriptions.
 *  6) Confirm /user/document-access => canCreateDocuments = true.
 *  7) Confirm /admin/users/expired-trial does NOT include this user.
 *  8) Restore original trialDays.
 *
 * Usage (from project root):
 *   BASE_URL=https://your-api.execute-api.region.amazonaws.com/dev \
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=AdminPass123 \
 *   node scripts/test_document_access_flow.js
 *
 * If ADMIN_EMAIL / ADMIN_PASSWORD are not set, the script will try to create
 * a new admin via POST /admin/auth/register.
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev';
const isHttps = BASE_URL.startsWith('https');
const lib = isHttps ? https : http;

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL);
        const pathWithBase =
            (url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname) +
            (path.startsWith('/') ? path : '/' + path);

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
            res.on('data', (chunk) => (data += chunk));
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

async function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

async function main() {
    console.log('\n--- Document Access Flow Test ---');
    console.log('BASE_URL:', BASE_URL);

    const results = { passed: 0, failed: 0 };
    const errors = [];

    function ok(name) {
        results.passed++;
        console.log(`  ✅ ${name}`);
    }
    function fail(name, detail) {
        results.failed++;
        const msg = `${name}${detail ? ': ' + detail : ''}`;
        errors.push(msg);
        console.log(`  ❌ ${msg}`);
    }

    // 1) Ensure admin credentials (login or create)
    let adminEmail = process.env.ADMIN_EMAIL;
    let adminPassword = process.env.ADMIN_PASSWORD;
    let adminToken = null;

    if (!adminEmail || !adminPassword) {
        console.log('\n[Admin] No ADMIN_EMAIL/ADMIN_PASSWORD – creating temp admin...');
        const ts = Date.now();
        adminEmail = `admin_docaccess_${ts}@example.com`;
        adminPassword = 'TestAdmin123!';
        const reg = await request('/admin/auth/register', 'POST', {
            name: 'DocAccess Admin',
            email: adminEmail,
            password: adminPassword
        });
        if (reg.status === 201) {
            ok('POST /admin/auth/register (temp admin created)');
        } else if (reg.status === 409) {
            fail('Admin register', 'Email already exists – set ADMIN_EMAIL/ADMIN_PASSWORD env and rerun');
        } else {
            fail('Admin register', reg.body.error || reg.status);
        }
    }

    if (adminEmail && adminPassword) {
        const login = await request('/admin/auth/login', 'POST', {
            email: adminEmail,
            password: adminPassword
        });
        if (login.status === 200 && login.body.token) {
            adminToken = login.body.token;
            ok('Admin login');
        } else {
            fail('Admin login', login.body.error || login.status);
        }
    }

    if (!adminToken) {
        console.log('\n✋ Cannot continue test without admin token.');
        process.exit(1);
    }

    // 2) Get and then temporarily set trialDays ≈ 1 minute for new users
    console.log('\n[Admin] Adjusting trialDays for test...');
    const trialGet = await request('/admin/settings/trial-days', 'GET', null, adminToken);
    let originalTrialDays = 14;
    if (trialGet.status === 200 && typeof trialGet.body.trialDays === 'number') {
        originalTrialDays = trialGet.body.trialDays;
        ok('GET /admin/settings/trial-days');
    } else {
        fail('GET /admin/settings/trial-days', trialGet.body.error || trialGet.status);
    }

    // 1 day = 1440 minutes → 1 minute ≈ 1/1440 days
    const oneMinuteInDays = 1 / (24 * 60);
    const trialSetOneMinute = await request(
        '/admin/settings/trial-days',
        'PUT',
        { trialDays: oneMinuteInDays },
        adminToken
    );
    if (trialSetOneMinute.status === 200) {
        ok('PUT /admin/settings/trial-days (set to ~1 minute for test)');
    } else {
        fail(
            'PUT /admin/settings/trial-days (set to ~1 minute)',
            trialSetOneMinute.body.error || trialSetOneMinute.status
        );
    }

    let userToken = null;
    let testUserId = null;
    let testUserEmail = null;

    try {
        // 3) Register + login a temp user (trial should expire immediately)
        console.log('\n[User] Registering + logging in temp user...');
        const ts = Date.now();
        testUserEmail = `docaccess_user_${ts}@example.com`;
        const reg = await request('/auth/register', 'POST', {
            name: 'DocAccess User',
            email: testUserEmail,
            password: 'Test123!'
        });
        if ((reg.status === 201 || reg.status === 200) && reg.body.userId) {
            testUserId = reg.body.userId;
            ok('User register');
        } else {
            fail('User register', reg.body.error || reg.status);
        }

        const login = await request('/auth/login', 'POST', {
            email: testUserEmail,
            password: 'Test123!'
        });
        if (login.status === 200 && login.body.token) {
            userToken = login.body.token;
            ok('User login');
        } else {
            fail('User login', login.body.error || login.status);
        }

        // Small wait just to ensure trialEndDate < now in any borderline case
        await sleep(1500);

        // 4) Check /user/document-access => should be false (expired trial, no package)
        if (userToken) {
            const accessBefore = await request('/user/document-access', 'GET', null, userToken);
            if (accessBefore.status === 200) {
                const body = accessBefore.body;
                console.log('  [Access before purchase]', body);
                if (body.canCreateDocuments === false && body.onTrial === false) {
                    ok('document-access before purchase (blocked as expected)');
                } else {
                    fail('document-access before purchase', 'Expected canCreateDocuments=false and onTrial=false');
                }
            } else {
                fail('GET /user/document-access before purchase', accessBefore.body.error || accessBefore.status);
            }
        }

        // 5) Admin: ensure at least one package exists (create if needed)
        console.log('\n[Admin] Ensuring at least one package exists...');
        const pkgList = await request('/admin/packages', 'GET', null, adminToken);
        let packageId = null;
        if (pkgList.status === 200 && Array.isArray(pkgList.body.packages) && pkgList.body.packages.length > 0) {
            packageId = pkgList.body.packages[0].packageId;
            ok('GET /admin/packages (found existing package)');
        } else {
            console.log('  No packages found – creating test package...');
            const createPkg = await request(
                '/admin/packages',
                'POST',
                {
                    name: 'DocAccess Test Package',
                    price: 1,
                    invoiceLimit: 5,
                    quotationLimit: 0,
                    validityDays: null,
                    isActive: true
                },
                adminToken
            );
            if (createPkg.status === 201 && createPkg.body.package && createPkg.body.package.packageId) {
                packageId = createPkg.body.package.packageId;
                ok('POST /admin/packages (created test package)');
            } else {
                fail('POST /admin/packages', createPkg.body.error || createPkg.status);
            }
        }

        // 6) User purchases package
        if (userToken && packageId) {
            console.log('\n[User] Purchasing package...');
            const purchase = await request(
                '/user/subscriptions',
                'POST',
                { packageId },
                userToken
            );
            if (purchase.status === 201 && purchase.body.subscription) {
                ok('POST /user/subscriptions (purchase package)');
            } else {
                fail('POST /user/subscriptions', purchase.body.error || purchase.status);
            }
        }

        // 7) /user/document-access => should now be true
        if (userToken) {
            const accessAfter = await request('/user/document-access', 'GET', null, userToken);
            if (accessAfter.status === 200) {
                const body = accessAfter.body;
                console.log('  [Access after purchase]', body);
                if (body.canCreateDocuments === true && body.hasActiveSubscription === true) {
                    ok('document-access after purchase (allowed as expected)');
                } else {
                    fail(
                        'document-access after purchase',
                        'Expected canCreateDocuments=true and hasActiveSubscription=true'
                    );
                }
            } else {
                fail('GET /user/document-access after purchase', accessAfter.body.error || accessAfter.status);
            }
        }

        // 8) /admin/users/expired-trial should NOT include this user
        console.log('\n[Admin] Checking expired-trial list...');
        const expired = await request('/admin/users/expired-trial', 'GET', null, adminToken);
        if (expired.status === 200 && Array.isArray(expired.body.users)) {
            const found = expired.body.users.some((u) => u.userId === testUserId || u.email === testUserEmail);
            if (!found) {
                ok('User NOT in expired-trial list after purchase');
            } else {
                fail('User still in expired-trial list after purchase');
            }
        } else {
            fail('GET /admin/users/expired-trial', expired.body.error || expired.status);
        }
    } finally {
        // 9) Restore original trialDays
        console.log('\n[Admin] Restoring original trialDays...');
        const restore = await request(
            '/admin/settings/trial-days',
            'PUT',
            { trialDays: originalTrialDays },
            adminToken
        );
        if (restore.status === 200) {
            ok('Restored trialDays to original value');
        } else {
            fail('Restore trialDays', restore.body.error || restore.status);
        }

        console.log('\n--- Test Summary ---');
        console.log('  Passed:', results.passed);
        console.log('  Failed:', results.failed);
        if (errors.length) {
            console.log('  Details:');
            errors.forEach((e) => console.log('   -', e));
        }
    }
}

main().catch((err) => {
    console.error('Unexpected error in test_document_access_flow:', err);
    process.exit(1);
});

