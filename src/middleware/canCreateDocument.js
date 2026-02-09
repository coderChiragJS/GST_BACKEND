const User = require('../models/userModel');
const UserSubscription = require('../models/userSubscriptionModel');

/**
 * Ensures the user can create an invoice or quotation:
 * - Trial active (today <= trialEndDate), or
 * - Active subscription with remaining usage (invoices or quotations).
 * Note: Packages have no time-based validity - subscriptions only expire when usage limits are exhausted.
 * Sets req.onTrial and req.subscription for use in create handlers.
 * Must be used after authMiddleware and requireBusiness.
 */
async function canCreateDocument(req, res, next) {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(403).json({
                error: 'No active trial or package. Please purchase a package to create invoices/quotations.'
            });
        }

        const now = new Date().toISOString().split('T')[0];
        const trialEnd = user.trialEndDate ? user.trialEndDate.split('T')[0] : null;
        const trialActive = trialEnd && trialEnd >= now;

        if (trialActive) {
            req.onTrial = true;
            req.subscription = null;
            return next();
        }

        const subscription = await UserSubscription.getActiveSubscription(userId);
        if (!subscription) {
            return res.status(403).json({
                error: 'No active trial or package. Please purchase a package to create invoices/quotations.'
            });
        }

        const invoicesRemaining = (subscription.invoiceLimit || 0) - (subscription.invoicesUsed || 0);
        const quotationsRemaining = (subscription.quotationLimit || 0) - (subscription.quotationsUsed || 0);
        const hasRemaining = invoicesRemaining > 0 || quotationsRemaining > 0;

        if (!hasRemaining) {
            return res.status(403).json({
                error: 'No active trial or package. Please purchase a package to create invoices/quotations.'
            });
        }

        req.onTrial = false;
        req.subscription = subscription;
        next();
    } catch (err) {
        console.error('canCreateDocument Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = canCreateDocument;
