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
    async endActiveSubscriptions(userId) {
        const subscriptions = await this.getByUser(userId);
        const now = new Date().toISOString();
        const pk = pkUser(userId);
        for (const sub of subscriptions) {
            const expired = sub.endDate && sub.endDate < now;
            const exhausted = sub.invoicesUsed >= sub.invoiceLimit && sub.quotationsUsed >= sub.quotationLimit;
            if (expired || exhausted) continue;
            await dynamoDb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sub.SK },
                UpdateExpression: 'SET endDate = :now',
                ExpressionAttributeValues: { ':now': now }
            }));
        }
    },

    async create(userId, packageData) {
        const subscriptionId = uuidv4();
        const now = new Date();
        const startDate = now.toISOString();
        let endDate = null;
        if (packageData.validityDays) {
            const end = new Date(now);
            end.setDate(end.getDate() + packageData.validityDays);
            endDate = end.toISOString();
        }

        await this.endActiveSubscriptions(userId);

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
            createdAt: startDate
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
        const now = new Date().toISOString();

        for (const sub of subscriptions) {
            if (sub.endDate && sub.endDate < now) continue;
            if (sub.invoicesUsed >= sub.invoiceLimit && sub.quotationsUsed >= sub.quotationLimit) continue;
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
