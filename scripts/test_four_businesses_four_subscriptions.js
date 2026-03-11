/**
 * Test: Single user, 4 businesses, 4 subscriptions (2 same plan, 2 different plans).
 * Creates 4 businesses, purchases 4 subscriptions (biz1 & biz2 same package, biz3 & biz4 different),
 * then verifies all data in user and admin APIs.
 *
 * Usage:
 *   BASE_URL=https://... node scripts/test_four_businesses_four_subscriptions.js
 *
 * Credentials (env): USER_EMAIL, USER_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const https = require('https');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev';
const isHttps = BASE_URL.startsWith('https');
const lib = isHttps ? https : http;

const USER_EMAIL = process.env.USER_EMAIL || 'chirag@gmail.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'test@33';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'gst@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Gst@123';

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

function buildPath(path, query) {
    if (!query || Object.keys(query).length === 0) return path;
    const search = new URLSearchParams(query).toString();
    return path + (path.includes('?') ? '&' : '?') + search;
}

const MINIMAL_BUSINESS = {
    mobile: '9876543210',
    address: { city: 'Mumbai', state: 'Maharashtra' }
};

const BUSINESS_NAMES = ['Test Four Biz A', 'Test Four Biz B', 'Test Four Biz C', 'Test Four Biz D'];

async function run() {
    const results = { passed: 0, failed: 0 };
    const errors = [];

    function ok(name) {
        results.passed++;
        console.log(`  ✅ ${name}`);
    }
    function fail(name, detail) {
        results.failed++;
        const msg = detail ? `${name}: ${detail}` : name;
        errors.push(msg);
        console.log(`  ❌ ${msg}`);
    }

    console.log('\n--- Single user, 4 businesses, 4 subscriptions test ---');
    console.log('BASE_URL:', BASE_URL);
    console.log('User:', USER_EMAIL, '| Admin:', ADMIN_EMAIL);

    let userToken = null;
    let adminToken = null;
    const businesses = [];
    let packages = [];
    const subscriptionsByBusinessId = {};

    // ---------- User login ----------
    console.log('\n[Setup] User login...');
    const loginRes = await request('/auth/login', 'POST', { email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200 || !loginRes.body.token) {
        fail('User login', loginRes.body.error || loginRes.body.message || String(loginRes.status));
        console.log('\n--- Result ---');
        console.log('Passed:', results.passed, ' Failed:', results.failed);
        process.exit(1);
    }
    userToken = loginRes.body.token;
    ok('User login');

    // ---------- Admin login ----------
    console.log('\n[Setup] Admin login...');
    const adminLoginRes = await request('/admin/auth/login', 'POST', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (adminLoginRes.status !== 200 || !adminLoginRes.body.token) {
        fail('Admin login', adminLoginRes.body.error || adminLoginRes.body.message || String(adminLoginRes.status));
        console.log('\n--- Result ---');
        console.log('Passed:', results.passed, ' Failed:', results.failed);
        process.exit(1);
    }
    adminToken = adminLoginRes.body.token;
    ok('Admin login');

    // ---------- Create 4 businesses ----------
    console.log('\n[Setup] Creating 4 businesses...');
    for (let i = 0; i < 4; i++) {
        const payload = { ...MINIMAL_BUSINESS, firmName: BUSINESS_NAMES[i] };
        const res = await request('/business', 'POST', payload, userToken);
        if (res.status !== 201 || !res.body.business) {
            fail('Create business ' + (i + 1), res.body.error || res.status);
        } else {
            const biz = res.body.business;
            businesses.push({ businessId: biz.businessId, firmName: biz.firmName || BUSINESS_NAMES[i] });
            ok('Create business: ' + (biz.firmName || BUSINESS_NAMES[i]));
        }
    }
    if (businesses.length !== 4) {
        console.log('\n--- Result ---');
        console.log('Passed:', results.passed, ' Failed:', results.failed);
        process.exit(results.failed > 0 ? 1 : 0);
    }

    // ---------- Ensure at least 3 packages ----------
    console.log('\n[Setup] Packages...');
    let pkgRes = await request('/packages', 'GET', null, userToken);
    if (pkgRes.status === 200 && Array.isArray(pkgRes.body.packages)) {
        packages = pkgRes.body.packages;
    }
    while (packages.length < 3) {
        const name = 'Test Plan ' + Date.now() + '-' + packages.length;
        const createRes = await request('/admin/packages', 'POST', {
            name,
            price: 100 + packages.length * 50,
            invoiceLimit: 25,
            quotationLimit: 50,
            packageType: 'usage_limited',
            isActive: true
        }, adminToken);
        if (createRes.status === 201 && createRes.body.package) {
            packages.push(createRes.body.package);
            ok('Create package: ' + name);
        } else {
            fail('Create package', createRes.body.error || JSON.stringify(createRes.body));
            break;
        }
    }
    if (pkgRes.status === 200 && packages.length > 0) {
        ok('GET /packages');
    }
    if (packages.length < 3) {
        fail('Need at least 3 packages', 'have ' + packages.length);
        console.log('\n--- Result ---');
        console.log('Passed:', results.passed, ' Failed:', results.failed);
        process.exit(1);
    }
    const pkgA = packages[0];
    const pkgB = packages[1];
    const pkgC = packages[2];

    // ---------- Purchase 4 subscriptions ----------
    console.log('\n[Purchase] Subscribing 4 businesses...');
    const assignments = [
        { businessId: businesses[0].businessId, package: pkgA, label: 'Biz1→PkgA' },
        { businessId: businesses[1].businessId, package: pkgA, label: 'Biz2→PkgA' },
        { businessId: businesses[2].businessId, package: pkgB, label: 'Biz3→PkgB' },
        { businessId: businesses[3].businessId, package: pkgC, label: 'Biz4→PkgC' }
    ];
    for (const a of assignments) {
        const res = await request('/user/subscriptions', 'POST', {
            packageId: a.package.packageId,
            businessId: a.businessId
        }, userToken);
        if (res.status !== 201 || !res.body.subscription) {
            fail(a.label, res.body.error || res.status);
        } else {
            subscriptionsByBusinessId[a.businessId] = res.body.subscription;
            ok(a.label + ' subscriptionId=' + (res.body.subscription.subscriptionId || '').slice(0, 8) + '...');
        }
    }
    if (Object.keys(subscriptionsByBusinessId).length !== 4) {
        console.log('\n--- Result ---');
        console.log('Passed:', results.passed, ' Failed:', results.failed);
        process.exit(results.failed > 0 ? 1 : 0);
    }

    // ---------- Verification: GET /business includes all 4 ----------
    console.log('\n[Verify] User businesses...');
    const bizListRes = await request('/business', 'GET', null, userToken);
    const bizList = Array.isArray(bizListRes.body) ? bizListRes.body : (bizListRes.body.businesses || []);
    const ourIds = new Set(businesses.map((b) => b.businessId));
    const found = bizList.filter((b) => ourIds.has(b.businessId));
    if (bizListRes.status === 200 && found.length === 4) {
        ok('GET /business includes all 4 new businesses');
    } else {
        fail('GET /business', 'expected 4 of our businesses, found ' + found.length);
    }

    // ---------- Verification: per-business GET /user/subscription ----------
    console.log('\n[Verify] Per-business subscription (user API)...');
    const subscriptionIds = new Set();
    const packageIdsByBiz = {};
    for (const biz of businesses) {
        const path = buildPath('/user/subscription', { businessId: biz.businessId });
        const res = await request(path, 'GET', null, userToken);
        if (res.status !== 200) {
            fail('GET /user/subscription?businessId=' + biz.businessId, res.body.error || res.status);
            continue;
        }
        if (!res.body.hasActiveSubscription || !res.body.subscription) {
            fail('Per-business ' + biz.firmName, 'no subscription');
            continue;
        }
        const sub = res.body.subscription;
        subscriptionIds.add(sub.subscriptionId);
        packageIdsByBiz[biz.businessId] = sub.packageId;

        const isUsageLimited = (sub.packageType || 'usage_limited') === 'usage_limited';
        const expInv = isUsageLimited ? Math.max(0, (sub.invoiceLimit || 0) - (sub.invoicesUsed || 0)) : null;
        const expQuot = isUsageLimited ? Math.max(0, (sub.quotationLimit || 0) - (sub.quotationsUsed || 0)) : null;
        const invMatch = isUsageLimited ? res.body.remainingInvoices === expInv : res.body.remainingInvoices === null;
        const quotMatch = isUsageLimited ? res.body.remainingQuotations === expQuot : res.body.remainingQuotations === null;
        if (!invMatch || !quotMatch) {
            fail('Per-business ' + biz.firmName, 'remaining mismatch (type=' + (sub.packageType || 'usage_limited') + ')');
        } else {
            ok('Per-business ' + biz.firmName + ': subscriptionId, remaining match');
        }
    }
    if (subscriptionIds.size !== 4) {
        fail('Unique subscriptionIds', 'expected 4 distinct, got ' + subscriptionIds.size);
    } else {
        ok('Four distinct subscriptionIds');
    }
    if (packageIdsByBiz[businesses[0].businessId] === packageIdsByBiz[businesses[1].businessId] &&
        packageIdsByBiz[businesses[0].businessId] !== packageIdsByBiz[businesses[2].businessId] &&
        packageIdsByBiz[businesses[2].businessId] !== packageIdsByBiz[businesses[3].businessId]) {
        ok('Plan assignment: Biz1&Biz2 same package, Biz3&Biz4 different');
    } else {
        fail('Plan assignment', 'Biz1&Biz2 same, Biz3&Biz4 different');
    }

    // ---------- Verification: GET /user/document-access ----------
    const accessRes = await request('/user/document-access', 'GET', null, userToken);
    if (accessRes.status === 200 && accessRes.body.canCreateDocuments === true && accessRes.body.hasActiveSubscription === true) {
        ok('GET /user/document-access: canCreateDocuments and hasActiveSubscription');
    } else {
        fail('GET /user/document-access', accessRes.body.error || 'canCreateDocuments or hasActiveSubscription false');
    }

    // ---------- Verification: GET /admin/users and subscriptionsByBusiness ----------
    console.log('\n[Verify] Admin user list...');
    const adminUsersRes = await request('/admin/users', 'GET', null, adminToken);
    if (adminUsersRes.status !== 200 || !Array.isArray(adminUsersRes.body.users)) {
        fail('GET /admin/users', adminUsersRes.body.error || adminUsersRes.status);
    } else {
        const adminUser = adminUsersRes.body.users.find((u) => u.email === USER_EMAIL);
            if (!adminUser) {
                fail('Find user in admin list', USER_EMAIL + ' not found');
            } else {
                ok('Find user in admin list');
                if (!adminUser.hasPurchasedPackage) {
                    fail('Admin hasPurchasedPackage', 'expected true');
                } else {
                    ok('Admin hasPurchasedPackage true');
                }
                const subsByBiz = adminUser.subscriptionsByBusiness || [];
                if (subsByBiz.length < 4) {
                    fail('Admin subscriptionsByBusiness', 'expected at least 4, got ' + subsByBiz.length);
                } else {
                    ok('Admin subscriptionsByBusiness count >= 4');
                }
                // User > Business AND its subscription (businessesWithSubscription)
                const bizWithSub = adminUser.businessesWithSubscription || [];
                const ourBizIds = new Set(businesses.map((b) => b.businessId));
                const ourBizWithSub = bizWithSub.filter((bws) => bws.business && ourBizIds.has(bws.business.businessId));
                if (bizWithSub.length > 0) {
                    if (ourBizWithSub.length >= 4) {
                        ok('Admin businessesWithSubscription: user > business > subscription shown for our 4 businesses');
                        console.log('    User > Business AND its subscription (our 4):');
                        ourBizWithSub.slice(0, 4).forEach((bws, i) => {
                            const name = (bws.business && bws.business.firmName) || bws.business?.businessId || '?';
                            const pkg = bws.subscription ? bws.subscription.packageName : 'no subscription';
                            console.log('      ' + (i + 1) + '. ' + name + ' -> ' + pkg);
                        });
                    }
                } else {
                    console.log('    (businessesWithSubscription not in response; deploy latest backend to see user > business > subscription)');
                }
            let adminAggregateInv = 0;
            let adminAggregateQuot = 0;
            for (const biz of businesses) {
                const adminSub = subsByBiz.find((s) => s.businessId === biz.businessId);
                if (!adminSub) {
                    fail('Admin sub for ' + biz.firmName, 'not found');
                } else {
                    const expRemInv = Math.max(0, (adminSub.invoiceLimit || 0) - (adminSub.invoicesUsed || 0));
                    const expRemQuot = Math.max(0, (adminSub.quotationLimit || 0) - (adminSub.quotationsUsed || 0));
                    const userPath = buildPath('/user/subscription', { businessId: biz.businessId });
                    const userSubRes = await request(userPath, 'GET', null, userToken);
                    if (userSubRes.status === 200 && userSubRes.body.subscription) {
                        const usub = userSubRes.body.subscription;
                        const isUsageLimited = (usub.packageType || 'usage_limited') === 'usage_limited';
                        const userRemInv = userSubRes.body.remainingInvoices;
                        const userRemQuot = userSubRes.body.remainingQuotations;
                        const remMatch = isUsageLimited
                            ? (userRemInv === expRemInv && userRemQuot === expRemQuot)
                            : (userRemInv === null && userRemQuot === null);
                        if (userSubRes.body.subscription.subscriptionId !== adminSub.subscriptionId) {
                            fail('Cross-check ' + biz.firmName, 'subscriptionId mismatch');
                        } else if (!remMatch) {
                            fail('Cross-check ' + biz.firmName, 'remaining mismatch');
                        } else {
                            ok('Cross-check user vs admin for ' + biz.firmName);
                        }
                    }
                }
            }
            if (subsByBiz.length >= 4) {
                let totalInv = 0;
                let totalQuot = 0;
                for (const s of subsByBiz) {
                    totalInv += Math.max(0, (s.invoiceLimit || 0) - (s.invoicesUsed || 0));
                    totalQuot += Math.max(0, (s.quotationLimit || 0) - (s.quotationsUsed || 0));
                }
                const reportedInv = adminUser.remainingInvoices ?? 0;
                const reportedQuot = adminUser.remainingQuotations ?? 0;
                if (reportedInv === totalInv && reportedQuot === totalQuot) {
                    ok('Admin aggregate remainingInvoices/remainingQuotations match sum of subscriptionsByBusiness');
                } else {
                    fail('Admin aggregate', 'reported inv=' + reportedInv + ' quot=' + reportedQuot + ' sum inv=' + totalInv + ' quot=' + totalQuot);
                }
            }
        }
    }

    // ---------- Summary table ----------
    console.log('\n--- Summary ---');
    console.log('Business                    | Package     | subscriptionId (short) | remainingInv | remainingQuot');
    console.log('-'.repeat(95));
    for (const biz of businesses) {
        const path = buildPath('/user/subscription', { businessId: biz.businessId });
        const res = await request(path, 'GET', null, userToken);
        const sub = res.body.subscription;
        const pkgName = sub ? (sub.packageName || sub.packageId) : '-';
        const subIdShort = sub ? (sub.subscriptionId || '').slice(0, 8) + '...' : '-';
        const rInv = res.body.remainingInvoices ?? '-';
        const rQuot = res.body.remainingQuotations ?? '-';
        console.log((biz.firmName || biz.businessId).padEnd(27) + ' | ' + String(pkgName).padEnd(11) + ' | ' + subIdShort.padEnd(24) + ' | ' + String(rInv).padEnd(12) + ' | ' + rQuot);
    }
    console.log('\nBiz1 & Biz2 share the same plan; Biz3 & Biz4 have different plans.');

    console.log('\n--- Result ---');
    console.log('Passed:', results.passed, ' Failed:', results.failed);
    if (errors.length > 0) {
        console.log('Errors:', errors.join('; '));
    }
    process.exit(results.failed > 0 ? 1 : 0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
