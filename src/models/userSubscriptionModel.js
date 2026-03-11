const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.APP_DATA_TABLE;

function pkUser(userId) {
    return `USER#${userId}`;
}
function skSub(subscriptionId) {
    return `SUB#${subscriptionId}`;
}

const UserSubscription = {
    /**
     * Add new package limits to existing active subscription (cumulative).
     * If businessId is provided, only subscriptions bound to that businessId are considered.
     */
    async addLimitsToActiveSubscription(userId, packageData, businessId = null) {
        // Add new package limits to existing active subscription (cumulative)
        const activeSub = await this.getActiveSubscription(userId, { businessId });
        if (!activeSub) {
            return null;
        }

        // Only cumulative-add limits for usage_limited subscriptions of the same type.
        // For time_unlimited / lifetime packages (or type changes), fall back to creating
        // a new subscription record for simpler semantics.
        if (activeSub.packageType && activeSub.packageType !== 'usage_limited') {
            return null;
        }
        if (packageData.packageType && packageData.packageType !== 'usage_limited') {
            return null;
        }

        const pk = pkUser(userId);
        const sk = skSub(activeSub.subscriptionId);
        const now = new Date().toISOString();

        // Add the new package's limits to existing limits
        const newInvoiceLimit = (activeSub.invoiceLimit || 0) + (packageData.invoiceLimit || 0);
        const newQuotationLimit = (activeSub.quotationLimit || 0) + (packageData.quotationLimit || 0);

        const result = await dynamoDb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: sk },
            UpdateExpression: 'SET invoiceLimit = :newInvoiceLimit, quotationLimit = :newQuotationLimit, updatedAt = :now',
            ExpressionAttributeValues: {
                ':newInvoiceLimit': newInvoiceLimit,
                ':newQuotationLimit': newQuotationLimit,
                ':now': now
            },
            ReturnValues: 'ALL_NEW'
        }));

        return result.Attributes;
    },

    /**
     * Create a new subscription for a user (and optional business).
     * If there is an active subscription for the same business (or unbound when businessId is null),
     * add limits cumulatively instead of creating a new record.
     *
     * packageData may optionally include:
     * - businessId: string | null
     * - gstNumber: string | null
     */
    async create(userId, packageData) {
        const { businessId = null, gstNumber = null } = packageData;

        // Check if user has an active subscription for this business - if yes, add limits to it (cumulative)
        const existingActive = await this.getActiveSubscription(userId, { businessId });
        if (existingActive) {
            // Add limits to existing subscription instead of creating a new one
            const updated = await this.addLimitsToActiveSubscription(userId, packageData, businessId);
            if (updated) {
                return updated;
            }
            // If addLimitsToActiveSubscription returned null (edge case), fall through to create new
        }

        // No active subscription - create a new one
        const subscriptionId = uuidv4();
        const now = new Date();
        const startDate = now.toISOString();
        // Time validity is derived from packageType/billingPeriod:
        // - usage_limited: endDate = null (no time-based expiry, only usage-based)
        // - time_unlimited: endDate computed from billingPeriod
        // - lifetime: endDate = null (never expires)
        let endDate = null;
        const pkgType = packageData.packageType || 'usage_limited';
        const billingPeriod = packageData.billingPeriod || null;
        if (pkgType === 'time_unlimited') {
            const end = new Date(now);
            if (billingPeriod === 'monthly') {
                end.setMonth(end.getMonth() + 1);
            } else if (billingPeriod === 'yearly') {
                end.setFullYear(end.getFullYear() + 1);
            }
            endDate = end.toISOString();
        }

        const pk = pkUser(userId);
        const sk = skSub(subscriptionId);
        const item = {
            PK: pk,
            SK: sk,
            userId,
            subscriptionId,
            packageId: packageData.packageId,
            packageName: packageData.name,
            invoiceLimit: packageData.invoiceLimit,
            quotationLimit: packageData.quotationLimit,
            packageType: pkgType,
            billingPeriod,
            invoicesUsed: 0,
            quotationsUsed: 0,
            // Per-business binding fields (nullable for legacy/unbound subscriptions)
            businessId,
            gstNumber,
            startDate,
            endDate,
            createdAt: startDate,
            updatedAt: startDate
        };

        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));

        return item;
    },

    async getByUser(userId) {
        const result = await dynamoDb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': pkUser(userId), ':sk': 'SUB#' }
        }));
        return result.Items || [];
    },

    /**
     * Get active subscription for a user.
     * Options:
     *  - businessId: if provided, prefer subscriptions bound to that business.
     *                If none found, and allowUnbound is true, fall back to unbound subs (businessId null).
     *  - allowUnbound: whether to consider legacy unbound subscriptions.
     */
    async getActiveSubscription(userId, options = {}) {
        const { businessId = null, allowUnbound = true } = options;
        const subscriptions = await this.getByUser(userId);

        const hasBusiness = !!businessId;

        // Helper: is subscription active by usage/time rules
        function isUsageActive(sub) {
            const type = sub.packageType || 'usage_limited';

            // Time-based expiry for time_unlimited packages
            if (type === 'time_unlimited') {
                if (!sub.endDate) return false;
                const now = new Date();
                const end = new Date(sub.endDate);
                if (now > end) return false;
                return true;
            }

            // Lifetime: no endDate, ignore limits
            if (type === 'lifetime') {
                if (sub.endDate) {
                    const now = new Date();
                    const end = new Date(sub.endDate);
                    if (now > end) return false;
                }
                return true;
            }

            // Default (usage_limited): active while any usage remains and no endDate
            if (sub.invoicesUsed >= sub.invoiceLimit && sub.quotationsUsed >= sub.quotationLimit) return false;
            if (sub.endDate) return false;
            return true;
        }

        let candidate = null;

        // 1. Prefer subscriptions already bound to this businessId (if provided)
        if (hasBusiness) {
            for (const sub of subscriptions) {
                if (!isUsageActive(sub)) continue;
                if (sub.businessId === businessId) {
                    candidate = sub;
                    break;
                }
            }
            if (candidate) {
                return candidate;
            }
        }

        // 2. Fallback: legacy unbound subscriptions (businessId null), if allowed
        if (allowUnbound) {
            for (const sub of subscriptions) {
                if (!isUsageActive(sub)) continue;
                if (!sub.businessId) {
                    candidate = sub;
                    break;
                }
            }
            if (candidate) {
                return candidate;
            }
        }

        // 3. If no business-specific context, fallback to any active subscription (current behavior)
        if (!hasBusiness) {
            for (const sub of subscriptions) {
                if (!isUsageActive(sub)) continue;
                return sub;
            }
        }

        return null;
    },

    async incrementInvoicesUsed(userId, subscriptionId) {
        const result = await dynamoDb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: pkUser(userId), SK: skSub(subscriptionId) },
            UpdateExpression: 'SET invoicesUsed = if_not_exists(invoicesUsed, :zero) + :one',
            ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
            ReturnValues: 'ALL_NEW'
        }));
        return result.Attributes;
    },

    async incrementQuotationsUsed(userId, subscriptionId) {
        const result = await dynamoDb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: pkUser(userId), SK: skSub(subscriptionId) },
            UpdateExpression: 'SET quotationsUsed = if_not_exists(quotationsUsed, :zero) + :one',
            ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
            ReturnValues: 'ALL_NEW'
        }));
        return result.Attributes;
    }
};

module.exports = UserSubscription;
