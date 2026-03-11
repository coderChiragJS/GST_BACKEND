const User = require('../models/userModel');
const Business = require('../models/businessModel');
const UserSubscription = require('../models/userSubscriptionModel');
const { Payment } = require('../models/paymentModel');
const { Settings } = require('../models/settingsModel');

module.exports = {
    // GET /admin/settings/trial-days
    async getTrialDays(req, res) {
        try {
            const trialDays = await Settings.getTrialDays();
            return res.json({ trialDays });
        } catch (error) {
            console.error('Get Trial Days Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // PUT /admin/settings/trial-days  Body: { trialDays: 14 }
    async setTrialDays(req, res) {
        try {
            const { trialDays } = req.body;
            if (trialDays === undefined || trialDays === null) {
                return res.status(400).json({ error: 'trialDays is required' });
            }
            const value = await Settings.setTrialDays(trialDays);
            return res.json({ trialDays: value });
        } catch (error) {
            if (error.message && error.message.includes('non-negative')) {
                return res.status(400).json({ error: error.message });
            }
            console.error('Set Trial Days Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // POST /admin/approve
    // Body: { userId: "uuid", trialDays: 14 }
    async approveUser(req, res) {
        try {
            const { userId, trialDays } = req.body;
            const adminId = req.user ? req.user.userId : 'SYSTEM_ADMIN'; // From middleware

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            const updatedUser = await User.approve(userId, adminId, trialDays);

            res.json({
                message: 'User approved successfully.',
                user: updatedUser
            });

        } catch (error) {
            console.error('Admin Approve Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // POST /admin/approve-business
    // Body: { userId: "uuid", businessId: "uuid" }
    async approveBusiness(req, res) {
        try {
            const { userId, businessId } = req.body;
            if (!userId || !businessId) {
                return res.status(400).json({ error: 'User ID and Business ID are required' });
            }

            const updatedBusiness = await Business.approve(userId, businessId);

            res.json({
                message: 'Business approved successfully.',
                business: updatedBusiness
            });

        } catch (error) {
            console.error('Admin Approve Business Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // GET /admin/users/expired-trial ? limit=50 & nextToken=...
    async getExpiredTrialUsers(req, res) {
        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
            const nextToken = req.query.nextToken || null;
            const { users: raw, nextToken: next } = await User.listExpiredTrial(limit, nextToken);

            // Filter out users who already have an active subscription.
            const enriched = await Promise.all(raw.map(async (u) => {
                const activeSubscription = await UserSubscription.getActiveSubscription(u.userId);
                return {
                    user: u,
                    hasActiveSubscription: !!activeSubscription
                };
            }));

            const users = enriched
                .filter((entry) => !entry.hasActiveSubscription)
                .map(({ user: u }) => ({
                    userId: u.userId,
                    name: u.name,
                    email: u.email,
                    trialStartDate: u.trialStartDate,
                    trialEndDate: u.trialEndDate,
                    createdAt: u.createdAt
                }));
            return res.json({ users, nextToken: next });
        } catch (error) {
            console.error('Get Expired Trial Users Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // GET /admin/pending
    async getPendingReviews(req, res) {
        try {
            // Fetch all pending businesses across all users
            const pendingBusinesses = await Business.listPending();

            if (!pendingBusinesses || pendingBusinesses.length === 0) {
                return res.json([]);
            }

            // Group by user if needed, or just return as is. 
            // For now, let's return them enriched with user data.
            const enrichedReviews = await Promise.all(pendingBusinesses.map(async (biz) => {
                const user = await User.findById(biz.userId);
                return {
                    business: biz,
                    user: user ? {
                        userId: user.userId,
                        name: user.name,
                        email: user.email
                    } : null
                };
            }));

            res.json(enrichedReviews);

        } catch (error) {
            console.error('Get Pending Reviews Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // GET /admin/users – complete user list with business details and subscription details
    async getUsersList(req, res) {
        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
            const nextToken = req.query.nextToken || null;
            const { users: rawUsers, nextToken: next } = await User.listAll(limit, nextToken);

            const users = await Promise.all(rawUsers.map(async (u) => {
                const businesses = await Business.getByUserId(u.userId);
                const allSubs = await UserSubscription.getByUser(u.userId);

                // Filter active subscriptions using the same semantics as the main access rules:
                // - usage_limited: active while there is remaining usage and no endDate
                // - time_unlimited: active while today <= endDate
                // - lifetime: active indefinitely (endDate only matters if set in the past)
                const now = new Date();
                const activeSubs = (allSubs || []).filter((sub) => {
                    const packageType = sub.packageType || 'usage_limited';
                    const invoicesLimit = sub.invoiceLimit ?? 0;
                    const quotationsLimit = sub.quotationLimit ?? 0;
                    const invoicesUsed = sub.invoicesUsed ?? 0;
                    const quotationsUsed = sub.quotationsUsed ?? 0;
                    const remainingInvoices = invoicesLimit > 0 ? invoicesLimit - invoicesUsed : 0;
                    const remainingQuotations = quotationsLimit > 0 ? quotationsLimit - quotationsUsed : 0;

                    if (packageType === 'usage_limited') {
                        const hasRemainingUsage = remainingInvoices > 0 || remainingQuotations > 0;
                        return hasRemainingUsage && !sub.endDate;
                    }

                    if (packageType === 'time_unlimited') {
                        if (!sub.endDate) return false;
                        const end = new Date(sub.endDate);
                        return end >= now;
                    }

                    // lifetime
                    if (!sub.endDate) return true;
                    const end = new Date(sub.endDate);
                    return end >= now;
                });

                const hasPackage = activeSubs.length > 0;

                // Aggregate remaining counts across all active subscriptions (per business)
                let remainingInvoices = 0;
                let remainingQuotations = 0;
                activeSubs.forEach((sub) => {
                    remainingInvoices += Math.max(0, (sub.invoiceLimit || 0) - (sub.invoicesUsed || 0));
                    remainingQuotations += Math.max(0, (sub.quotationLimit || 0) - (sub.quotationsUsed || 0));
                });

                // Preserve existing `subscription` field by choosing the first active subscription (for backward compatibility)
                const primarySub = activeSubs[0] || null;

                // New field: detailed per-business subscriptions (non-breaking addition)
                const subscriptionsByBusiness = activeSubs.map((sub) => ({
                    subscriptionId: sub.subscriptionId,
                    packageId: sub.packageId,
                    packageName: sub.packageName,
                    businessId: sub.businessId || null,
                    gstNumber: sub.gstNumber || null,
                    invoiceLimit: sub.invoiceLimit,
                    quotationLimit: sub.quotationLimit,
                    invoicesUsed: sub.invoicesUsed || 0,
                    quotationsUsed: sub.quotationsUsed || 0,
                    startDate: sub.startDate
                }));

                // User > Business AND its subscription: each business with its active subscription (if any)
                const businessesWithSubscription = (businesses || []).map((biz) => {
                    const sub = activeSubs.find((s) => s.businessId === biz.businessId);
                    return {
                        business: biz,
                        subscription: sub ? {
                            subscriptionId: sub.subscriptionId,
                            packageId: sub.packageId,
                            packageName: sub.packageName,
                            packageType: sub.packageType || 'usage_limited',
                            billingPeriod: sub.billingPeriod || null,
                            invoiceLimit: sub.invoiceLimit,
                            quotationLimit: sub.quotationLimit,
                            invoicesUsed: sub.invoicesUsed || 0,
                            quotationsUsed: sub.quotationsUsed || 0,
                            startDate: sub.startDate,
                            endDate: sub.endDate || null
                        } : null
                    };
                });

                return {
                    userId: u.userId,
                    name: u.name,
                    email: u.email,
                    role: u.role || 'USER',
                    approvalStatus: u.approvalStatus,
                    subscriptionActive: u.subscriptionActive,
                    trialStartDate: u.trialStartDate,
                    trialEndDate: u.trialEndDate,
                    createdAt: u.createdAt,
                    businesses: businesses || [],
                    subscription: primarySub ? {
                        subscriptionId: primarySub.subscriptionId,
                        packageId: primarySub.packageId,
                        packageName: primarySub.packageName,
                        invoiceLimit: primarySub.invoiceLimit,
                        quotationLimit: primarySub.quotationLimit,
                        invoicesUsed: primarySub.invoicesUsed || 0,
                        quotationsUsed: primarySub.quotationsUsed || 0,
                        startDate: primarySub.startDate,
                    } : null,
                    hasPurchasedPackage: hasPackage,
                    remainingInvoices,
                    remainingQuotations,
                    subscriptionsByBusiness,
                    businessesWithSubscription,
                };
            }));

            return res.json({ users, nextToken: next });
        } catch (error) {
            console.error('Get Users List Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // GET /admin/payments – all payments mapped with user IDs
    async getPaymentsList(req, res) {
        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
            const nextToken = req.query.nextToken || null;
            const { payments, nextToken: next } = await Payment.listAll(limit, nextToken);
            return res.json({ payments, nextToken: next });
        } catch (error) {
            console.error('Get Payments List Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};
