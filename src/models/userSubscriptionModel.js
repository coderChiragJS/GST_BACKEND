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
    async addLimitsToActiveSubscription(userId, packageData) {
        // Add new package limits to existing active subscription (cumulative)
        const activeSub = await this.getActiveSubscription(userId);
        if (!activeSub) {
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

    async create(userId, packageData) {
        // Check if user has an active subscription - if yes, add limits to it (cumulative)
        const existingActive = await this.getActiveSubscription(userId);
        if (existingActive) {
            // Add limits to existing subscription instead of creating a new one
            const updated = await this.addLimitsToActiveSubscription(userId, packageData);
            if (updated) {
                return updated;
            }
            // If addLimitsToActiveSubscription returned null (edge case), fall through to create new
        }

        // No active subscription - create a new one
        const subscriptionId = uuidv4();
        const now = new Date();
        const startDate = now.toISOString();
        // Packages have no time-based validity - endDate is always null
        // Subscriptions only expire when usage limits are exhausted
        const endDate = null;

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
            invoicesUsed: 0,
            quotationsUsed: 0,
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

    async getActiveSubscription(userId) {
        const subscriptions = await this.getByUser(userId);

        // Find the most recent active subscription (no time-based expiration)
        // A subscription is active if it has remaining usage (invoices or quotations)
        for (const sub of subscriptions) {
            // Skip if usage limits are exhausted
            if (sub.invoicesUsed >= sub.invoiceLimit && sub.quotationsUsed >= sub.quotationLimit) continue;
            // Skip if explicitly ended (endDate set means manually ended/exhausted)
            if (sub.endDate) continue;
            return sub;
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
