const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.APP_DATA_TABLE;

function sk(accountId, timestamp, txnId) {
    return `ACCTXN#${accountId}#${timestamp}#${txnId}`;
}

/**
 * AccountTransaction model: movements of money in/out of a cash/bank account.
 * PK = USER#userId#BUSINESS#businessId#ACCOUNT#accountId
 * SK = ACCTXN#accountId#timestamp#txnId
 */
const AccountTransaction = {
    async create(userId, businessId, accountId, data) {
        const now = data.createdAt || new Date().toISOString();
        const txnId = data.txnId || uuidv4();
        const pk = `USER#${userId}#BUSINESS#${businessId}#ACCOUNT#${accountId}`;

        const item = {
            PK: pk,
            SK: sk(accountId, now, txnId),
            txnId,
            accountId,
            type: data.type || 'manual',
            direction: data.direction || 'in',
            amount: Number(data.amount) || 0,
            balanceAfter: data.balanceAfter != null ? Number(data.balanceAfter) : null,
            referenceType: data.referenceType || null,
            referenceId: data.referenceId || null,
            referenceNumber: data.referenceNumber || null,
            narration: data.narration || null,
            createdAt: now
        };

        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));

        return item;
    },

    async listByAccount(userId, businessId, accountId, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
        const pk = `USER#${userId}#BUSINESS#${businessId}#ACCOUNT#${accountId}`;
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': pk,
                ':sk': `ACCTXN#${accountId}#`
            },
            Limit: limit,
            ScanIndexForward: false
        };
        if (options.exclusiveStartKey) {
            params.ExclusiveStartKey = options.exclusiveStartKey;
        }
        const result = await dynamoDb.send(new QueryCommand(params));
        return {
            items: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };
    }
};

module.exports = AccountTransaction;

