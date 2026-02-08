const Package = require('../models/packageModel');
const UserSubscription = require('../models/userSubscriptionModel');

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

            const subscription = await UserSubscription.create(userId, {
                packageId: pkg.packageId,
                name: pkg.name,
                invoiceLimit: pkg.invoiceLimit,
                quotationLimit: pkg.quotationLimit,
                validityDays: pkg.validityDays ?? null
            });

            return res.status(201).json({ subscription });
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
    }
};
