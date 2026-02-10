const Package = require('../models/packageModel');
const UserSubscription = require('../models/userSubscriptionModel');
const { Payment, PaymentStatus } = require('../models/paymentModel');
const { getDocumentAccess } = require('../services/documentAccessService');

module.exports = {
    // GET /packages – list active packages (for purchase)
    async listPackages(req, res) {
        try {
            const all = await Package.listAll();
            const packages = all.filter((p) => p.isActive);
            return res.json({ packages });
        } catch (error) {
            console.error('List Packages Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // POST /user/subscriptions – purchase a package (body: { packageId })
    async purchasePackage(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { packageId } = req.body || {};
            if (!packageId) {
                return res.status(400).json({ error: 'packageId is required' });
            }

            const pkg = await Package.getById(packageId);
            if (!pkg || !pkg.isActive) {
                return res.status(404).json({ error: 'Package not found or inactive' });
            }

            // Packages have no time-based validity - subscriptions only expire when usage limits are exhausted
            // If user has an active subscription, limits will be added cumulatively
            const subscription = await UserSubscription.create(userId, {
                packageId: pkg.packageId,
                name: pkg.name,
                invoiceLimit: pkg.invoiceLimit,
                quotationLimit: pkg.quotationLimit
                // validityDays is ignored - packages have unlimited time validity
            });

            // For non-PhonePe purchases, also record a successful payment so that
            // the admin payment list reflects this transaction.
            try {
                const amountPaise = Math.max(0, Math.round((Number(pkg.price) || 0) * 100));
                if (amountPaise > 0) {
                    const payment = await Payment.create({
                        userId,
                        packageId: pkg.packageId,
                        amountPaise
                    });
                    // Mark as successful with a manual/source reference
                    await Payment.markSuccess(payment.orderId, 'MANUAL_SUBSCRIPTION');
                }
            } catch (paymentError) {
                // Do not block subscription creation if payment logging fails; just log it.
                console.error('Failed to record payment for manual subscription purchase:', paymentError);
            }

            // Calculate remaining limits for response
            const remainingInvoices = Math.max(0, (subscription.invoiceLimit || 0) - (subscription.invoicesUsed || 0));
            const remainingQuotations = Math.max(0, (subscription.quotationLimit || 0) - (subscription.quotationsUsed || 0));

            return res.status(201).json({ 
                subscription,
                message: subscription.updatedAt ? 
                    'Package limits added to your existing subscription' : 
                    'Package purchased successfully',
                remainingInvoices,
                remainingQuotations
            });
        } catch (error) {
            console.error('Purchase Package Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // GET /user/subscription – current active subscription and remaining limits
    async getMySubscription(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const subscription = await UserSubscription.getActiveSubscription(userId);
            if (!subscription) {
                return res.json({
                    hasActiveSubscription: false,
                    subscription: null,
                    remainingInvoices: 0,
                    remainingQuotations: 0
                });
            }

            const remainingInvoices = Math.max(0, subscription.invoiceLimit - (subscription.invoicesUsed || 0));
            const remainingQuotations = Math.max(0, subscription.quotationLimit - (subscription.quotationsUsed || 0));

            return res.json({
                hasActiveSubscription: true,
                subscription: {
                    subscriptionId: subscription.subscriptionId,
                    packageId: subscription.packageId,
                    packageName: subscription.packageName,
                    invoiceLimit: subscription.invoiceLimit,
                    quotationLimit: subscription.quotationLimit,
                    invoicesUsed: subscription.invoicesUsed || 0,
                    quotationsUsed: subscription.quotationsUsed || 0,
                    startDate: subscription.startDate,
                    endDate: subscription.endDate
                },
                remainingInvoices,
                remainingQuotations
            });
        } catch (error) {
            console.error('Get My Subscription Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    /**
     * GET /user/document-access – whether the user can create invoices/quotations.
     * Use this to show/hide or enable/disable the "Create Invoice" and "Create Quotation" screens.
     * When canCreateDocuments is false, do not allow the user to open creation screens.
     */
    async getDocumentAccess(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const access = await getDocumentAccess(userId);
            return res.json(access);
        } catch (error) {
            console.error('Get Document Access Error:', error);
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
};
