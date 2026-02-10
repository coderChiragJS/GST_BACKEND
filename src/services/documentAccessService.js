const User = require('../models/userModel');
const UserSubscription = require('../models/userSubscriptionModel');

/**
 * Single source of truth for "can this user create invoices/quotations?".
 * User can create if:
 * - Trial is active (today <= trialEndDate), OR
 * - Has an active subscription with at least one remaining (invoice or quotation) limit.
 * Used by canCreateDocument middleware and GET /user/document-access API.
 */
async function getDocumentAccess(userId) {
    const now = new Date();
    const user = await User.findById(userId);
    if (!user) {
        return {
            canCreateDocuments: false,
            onTrial: false,
            trialEndDate: null,
            hasActiveSubscription: false,
            remainingInvoices: 0,
            remainingQuotations: 0,
            subscription: null,
            message: 'User not found. You cannot create invoices or quotations.'
        };
    }

    const trialEnd = user.trialEndDate ? new Date(user.trialEndDate) : null;
    const trialActive = trialEnd && trialEnd >= now;

    if (trialActive) {
        return {
            canCreateDocuments: true,
            onTrial: true,
            trialEndDate: user.trialEndDate,
            hasActiveSubscription: false,
            remainingInvoices: null,
            remainingQuotations: null,
            subscription: null,
            message: null
        };
    }

    const subscription = await UserSubscription.getActiveSubscription(userId);
    if (!subscription) {
        return {
            canCreateDocuments: false,
            onTrial: false,
            trialEndDate: user.trialEndDate,
            hasActiveSubscription: false,
            remainingInvoices: 0,
            remainingQuotations: 0,
            subscription: null,
            message: 'Your trial has expired and you have no active package. Purchase a package to create invoices and quotations.'
        };
    }

    const remainingInvoices = Math.max(0, (subscription.invoiceLimit || 0) - (subscription.invoicesUsed || 0));
    const remainingQuotations = Math.max(0, (subscription.quotationLimit || 0) - (subscription.quotationsUsed || 0));
    const hasRemaining = remainingInvoices > 0 || remainingQuotations > 0;

    if (!hasRemaining) {
        return {
            canCreateDocuments: false,
            onTrial: false,
            trialEndDate: user.trialEndDate,
            hasActiveSubscription: false,
            remainingInvoices: 0,
            remainingQuotations: 0,
            subscription: null,
            message: 'Your package limits are exhausted. Purchase a package to create more invoices and quotations.'
        };
    }

    return {
        canCreateDocuments: true,
        onTrial: false,
        trialEndDate: user.trialEndDate,
        hasActiveSubscription: true,
        remainingInvoices,
        remainingQuotations,
        subscription: {
            subscriptionId: subscription.subscriptionId,
            packageId: subscription.packageId,
            packageName: subscription.packageName,
            invoiceLimit: subscription.invoiceLimit,
            quotationLimit: subscription.quotationLimit,
            invoicesUsed: subscription.invoicesUsed || 0,
            quotationsUsed: subscription.quotationsUsed || 0,
            startDate: subscription.startDate
        },
        message: null
    };
}

module.exports = { getDocumentAccess };
