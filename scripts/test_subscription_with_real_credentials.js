/**
 * Test script for Package & Subscription APIs using real credentials.
 * Verifies subscription data is consistent between admin panel and mobile app.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/test_subscription_with_real_credentials.js
 *   SKIP_PURCHASE=1 node scripts/test_subscription_with_real_credentials.js   # read-only, no purchase
 *   node scripts/test_subscription_with_real_credentials.js --read-only
 *
 * Credentials (overridable via env):
 *   USER_EMAIL=chirag@gmail.com  USER_PASSWORD=test@33
 *   ADMIN_EMAIL=gst@gmail.com    ADMIN_PASSWORD=Gst@123
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
const SKIP_PURCHASE = process.env.SKIP_PURCHASE === '1' || process.argv.includes('--read-only');

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

    console.log('\n--- Package & Subscription API test (real credentials) ---');
    console.log('BASE_URL:', BASE_URL);
    console.log('User:', USER_EMAIL, '| Admin:', ADMIN_EMAIL);
    console.log('SKIP_PURCHASE:', SKIP_PURCHASE);

    let userToken = null;
    let adminToken = null;
    let userBusinessId = null;
    let userSubscriptionBefore = null;
    let userSubscriptionAfter = null;
    let userDocumentAccessBefore = null;
    let userDocumentAccessAfter = null;
    let adminUserChirag = null;
    let packagesFromUser = [];
    let purchasePerformed = false;
    let userBusinesses = [];

    // ---------- User flow (mobile) ----------
    console.log('\n[User APIs] Logging in...');
    const loginRes = await request('/auth/login', 'POST', { email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200 || !loginRes.body.token) {
        fail('User login', loginRes.body.error || loginRes.body.message || String(loginRes.status));
    } else {
        userToken = loginRes.body.token;
        ok('User login');
    }

    if (userToken) {
        // GET /business
        const bizRes = await request('/business', 'GET', null, userToken);
        const businessList = Array.isArray(bizRes.body) ? bizRes.body : (bizRes.body.businesses || []);
        if (bizRes.status === 200 && Array.isArray(businessList)) {
            ok('GET /business');
            userBusinesses = businessList;
            if (businessList.length > 0) {
                userBusinessId = businessList[0].businessId;
                console.log('    First businessId:', userBusinessId);
                console.log('    Total businesses:', businessList.length);
            }
        } else {
            fail('GET /business', bizRes.body.error || bizRes.status);
        }

        // GET /packages
        const listPkgRes = await request('/packages', 'GET', null, userToken);
        if (listPkgRes.status === 200 && Array.isArray(listPkgRes.body.packages)) {
            ok('GET /packages');
            packagesFromUser = listPkgRes.body.packages;
            console.log('    Packages count:', packagesFromUser.length);
        } else {
            fail('GET /packages', listPkgRes.body.error || listPkgRes.status);
        }

        // GET /user/subscription (no businessId)
        const subPath = buildPath('/user/subscription', {});
        const subRes = await request(subPath, 'GET', null, userToken);
        if (subRes.status === 200 && typeof subRes.body.hasActiveSubscription === 'boolean') {
            ok('GET /user/subscription');
            userSubscriptionBefore = subRes.body;
            console.log('    hasActiveSubscription:', subRes.body.hasActiveSubscription, 'remainingInvoices:', subRes.body.remainingInvoices, 'remainingQuotations:', subRes.body.remainingQuotations);
        } else {
            fail('GET /user/subscription', subRes.body.error || subRes.status);
        }

        // GET /user/subscription?businessId=... if user has businesses
        if (userBusinessId) {
            const subBizPath = buildPath('/user/subscription', { businessId: userBusinessId });
            const subBizRes = await request(subBizPath, 'GET', null, userToken);
            if (subBizRes.status === 200) {
                ok('GET /user/subscription?businessId=...');
            } else {
                fail('GET /user/subscription?businessId=...', subBizRes.body.error || subBizRes.status);
            }
        }

        // GET /user/document-access
        const accessRes = await request('/user/document-access', 'GET', null, userToken);
        if (accessRes.status === 200 && typeof accessRes.body.canCreateDocuments === 'boolean') {
            ok('GET /user/document-access');
            userDocumentAccessBefore = accessRes.body;
            console.log('    canCreateDocuments:', accessRes.body.canCreateDocuments, 'hasActiveSubscription:', accessRes.body.hasActiveSubscription);
        } else {
            fail('GET /user/document-access', accessRes.body.error || accessRes.status);
        }

        // POST /user/subscriptions (optional)
        if (!SKIP_PURCHASE && packagesFromUser.length > 0 && userBusinessId) {
            const pkgId = packagesFromUser[0].packageId;
            const purchaseRes = await request('/user/subscriptions', 'POST', { packageId: pkgId, businessId: userBusinessId }, userToken);
            if (purchaseRes.status === 201 && purchaseRes.body.subscription) {
                ok('POST /user/subscriptions');
                purchasePerformed = true;
                console.log('    subscriptionId:', purchaseRes.body.subscription.subscriptionId);
            } else {
                fail('POST /user/subscriptions', purchaseRes.body.error || purchaseRes.status);
            }
        } else if (!SKIP_PURCHASE && (!packagesFromUser.length || !userBusinessId)) {
            console.log('  ⏭ Skipping purchase (no packages or no business)');
        } else if (SKIP_PURCHASE) {
            console.log('  ⏭ Skipping purchase (read-only mode)');
        }

        if (purchasePerformed) {
            const subRes2 = await request('/user/subscription', 'GET', null, userToken);
            if (subRes2.status === 200) {
                userSubscriptionAfter = subRes2.body;
                ok('GET /user/subscription after purchase');
            } else {
                fail('GET /user/subscription after purchase', subRes2.body.error || subRes2.status);
            }
            const accessRes2 = await request('/user/document-access', 'GET', null, userToken);
            if (accessRes2.status === 200) {
                userDocumentAccessAfter = accessRes2.body;
                ok('GET /user/document-access after purchase');
            } else {
                fail('GET /user/document-access after purchase', accessRes2.body.error || accessRes2.status);
            }
        }
    }

    // ---------- Admin flow ----------
    console.log('\n[Admin APIs] Logging in...');
    const adminLoginRes = await request('/admin/auth/login', 'POST', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (adminLoginRes.status !== 200 || !adminLoginRes.body.token) {
        fail('Admin login', adminLoginRes.body.error || adminLoginRes.body.message || String(adminLoginRes.status));
    } else {
        adminToken = adminLoginRes.body.token;
        ok('Admin login');
    }

    if (adminToken) {
        const adminPkgRes = await request('/admin/packages', 'GET', null, adminToken);
        if (adminPkgRes.status === 200 && Array.isArray(adminPkgRes.body.packages)) {
            ok('GET /admin/packages');
            console.log('    Packages count:', adminPkgRes.body.packages.length);
        } else {
            fail('GET /admin/packages', adminPkgRes.body.error || adminPkgRes.status);
        }

        const adminUsersRes = await request('/admin/users', 'GET', null, adminToken);
        if (adminUsersRes.status === 200 && Array.isArray(adminUsersRes.body.users)) {
            ok('GET /admin/users');
            adminUserChirag = adminUsersRes.body.users.find((u) => u.email === USER_EMAIL);
            if (adminUserChirag) {
                console.log('    Found user:', USER_EMAIL, '| hasPurchasedPackage:', adminUserChirag.hasPurchasedPackage, '| remainingInvoices:', adminUserChirag.remainingInvoices, '| remainingQuotations:', adminUserChirag.remainingQuotations);
            } else {
                fail('Find user in admin list', `${USER_EMAIL} not in GET /admin/users response`);
            }
        } else {
            fail('GET /admin/users', adminUsersRes.body.error || adminUsersRes.status);
        }
    }

    // ---------- Cross-check: user vs admin subscription data for chirag@gmail.com ----------
    if (adminUserChirag && (userSubscriptionAfter || userSubscriptionBefore)) {
        const userSub = userSubscriptionAfter || userSubscriptionBefore;
        const adminSub = adminUserChirag.subscription;

        if (userSub.hasActiveSubscription && adminUserChirag.hasPurchasedPackage) {
            if (userSub.subscription && adminSub) {
                const sidMatch = userSub.subscription.subscriptionId === adminSub.subscriptionId;
                const pkgIdMatch = userSub.subscription.packageId === adminSub.packageId;
                if (sidMatch && pkgIdMatch) {
                    ok('Cross-check: subscriptionId and packageId match (admin vs user)');
                } else {
                    fail('Cross-check: subscriptionId/packageId mismatch', `user subId=${userSub.subscription?.subscriptionId} admin subId=${adminSub?.subscriptionId}`);
                }
            }
            const userRemainingInv = userSub.remainingInvoices ?? 0;
            const userRemainingQuot = userSub.remainingQuotations ?? 0;
            const adminRemainingInv = adminUserChirag.remainingInvoices ?? 0;
            const adminRemainingQuot = adminUserChirag.remainingQuotations ?? 0;
            // When user has multiple subscriptions (per business), GET /user/subscription returns one subscription's counts
            // while admin aggregates all; only assert match when there's at most one active subscription.
            const adminSubCount = (adminUserChirag.subscriptionsByBusiness || []).length;
            if (adminSubCount <= 1) {
                if (userRemainingInv === adminRemainingInv && userRemainingQuot === adminRemainingQuot) {
                    ok('Cross-check: remainingInvoices and remainingQuotations match (admin vs user)');
                } else {
                    fail('Cross-check: remaining counts mismatch', `user inv=${userRemainingInv} quot=${userRemainingQuot} admin inv=${adminRemainingInv} quot=${adminRemainingQuot}`);
                }
            } else {
                ok('Cross-check: remaining counts (user shows one subscription; admin aggregates ' + adminSubCount + ' – skip exact match)');
            }
        } else if (!userSub.hasActiveSubscription && !adminUserChirag.hasPurchasedPackage) {
            ok('Cross-check: no active subscription in both admin and user');
        }
    }

    // ---------- Per-business subscription: each business shows its own subscription details ----------
    if (userToken && userBusinesses.length > 0 && adminUserChirag) {
        const subsByBiz = adminUserChirag.subscriptionsByBusiness || [];
        console.log('\n[Per-business subscription] Checking', userBusinesses.length, 'business(es)...');
        for (const biz of userBusinesses) {
            const bid = biz.businessId;
            const path = buildPath('/user/subscription', { businessId: bid });
            const res = await request(path, 'GET', null, userToken);
            if (res.status !== 200) {
                fail('GET /user/subscription?businessId=' + bid, res.body.error || res.status);
                continue;
            }
            const adminSub = subsByBiz.find((s) => s.businessId === bid);
            const userHasSub = res.body.hasActiveSubscription === true && res.body.subscription;
            if (adminSub) {
                const expRemainingInv = Math.max(0, (adminSub.invoiceLimit || 0) - (adminSub.invoicesUsed || 0));
                const expRemainingQuot = Math.max(0, (adminSub.quotationLimit || 0) - (adminSub.quotationsUsed || 0));
                if (!userHasSub) {
                    fail('Per-business ' + bid, 'Admin has subscription but user API returned no subscription');
                } else if (res.body.subscription.subscriptionId !== adminSub.subscriptionId) {
                    fail('Per-business ' + bid, 'subscriptionId mismatch: user=' + res.body.subscription.subscriptionId + ' admin=' + adminSub.subscriptionId);
                } else if (res.body.remainingInvoices !== expRemainingInv || res.body.remainingQuotations !== expRemainingQuot) {
                    fail('Per-business ' + bid, 'remaining mismatch: user inv=' + res.body.remainingInvoices + ' quot=' + res.body.remainingQuotations + ' expected inv=' + expRemainingInv + ' quot=' + expRemainingQuot);
                } else {
                    ok('Per-business subscription for ' + (biz.firmName || bid) + ': subscriptionId & remaining match');
                }
            } else {
                if (userHasSub) {
                    fail('Per-business ' + bid, 'User API returned subscription but admin has none for this business');
                } else {
                    ok('Per-business ' + (biz.firmName || bid) + ': no subscription (consistent with admin)');
                }
            }
        }
    }

    // ---------- Summary: what admin panel and mobile app should show ----------
    console.log('\n--- Summary ---');
    console.log('\nAdmin panel should show (for', USER_EMAIL + '):');
    if (adminUserChirag) {
        console.log('  - subscription:', adminUserChirag.subscription ? JSON.stringify(adminUserChirag.subscription, null, 2).split('\n').join('\n    ') : null);
        console.log('  - subscriptionsByBusiness:', Array.isArray(adminUserChirag.subscriptionsByBusiness) ? adminUserChirag.subscriptionsByBusiness.length + ' item(s)' : adminUserChirag.subscriptionsByBusiness);
        console.log('  - hasPurchasedPackage:', adminUserChirag.hasPurchasedPackage);
        console.log('  - remainingInvoices:', adminUserChirag.remainingInvoices);
        console.log('  - remainingQuotations:', adminUserChirag.remainingQuotations);
    } else {
        console.log('  (user not found in GET /admin/users)');
    }

    console.log('\nMobile app should show:');
    const subForDisplay = userSubscriptionAfter || userSubscriptionBefore;
    const accessForDisplay = userDocumentAccessAfter || userDocumentAccessBefore;
    if (subForDisplay) {
        console.log('  - GET /user/subscription: hasActiveSubscription=', subForDisplay.hasActiveSubscription, 'remainingInvoices=', subForDisplay.remainingInvoices, 'remainingQuotations=', subForDisplay.remainingQuotations);
        if (subForDisplay.subscription) {
            console.log('  - subscription:', JSON.stringify(subForDisplay.subscription, null, 2).split('\n').join('\n    '));
        }
    }
    if (accessForDisplay) {
        console.log('  - GET /user/document-access: canCreateDocuments=', accessForDisplay.canCreateDocuments, 'hasActiveSubscription=', accessForDisplay.hasActiveSubscription, 'message=', accessForDisplay.message || '(none)');
    }

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
