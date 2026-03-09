const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.APP_DATA_TABLE;

/**
 * Cash/Bank account model stored in APP_DATA_TABLE.
 * PK = USER#userId#BUSINESS#businessId
 * SK = ACCOUNT#accountId
 */
const Account = {
    async create(userId, businessId, data) {
        const accountId = uuidv4();
        const now = new Date().toISOString();
        const pk = `USER#${userId}#BUSINESS#${businessId}`;

        const item = {
            PK: pk,
            SK: `ACCOUNT#${accountId}`,
            accountId,
            businessId,
            userId,
            name: data.name,
            type: data.type === 'bank' ? 'bank' : 'cash',
            isDefault: !!data.isDefault,
            openingBalance: Number(data.openingBalance) || 0,
            closingBalance: Number(data.closingBalance != null ? data.closingBalance : data.openingBalance) || 0,
            bankDetails: data.bankDetails || null,
            createdAt: now,
            updatedAt: now
        };

        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));

        return item;
    },

    async listByBusiness(userId, businessId) {
        const pk = `USER#${userId}#BUSINESS#${businessId}`;
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': pk,
                ':sk': 'ACCOUNT#'
            }
        };
        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items || [];
    },

    async getById(userId, businessId, accountId) {
        const pk = `USER#${userId}#BUSINESS#${businessId}`;
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: pk,
                SK: `ACCOUNT#${accountId}`
            }
        };
        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item || null;
    },

    /**
     * Atomically increment closingBalance by delta.
     * Returns updated account.
     */
    async updateBalance(userId, businessId, accountId, delta) {
        const pk = `USER#${userId}#BUSINESS#${businessId}`;
        const now = new Date().toISOString();
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: pk,
                SK: `ACCOUNT#${accountId}`
            },
            UpdateExpression: 'SET closingBalance = if_not_exists(closingBalance, :zero) + :delta, updatedAt = :now',
            ExpressionAttributeValues: {
                ':delta': Number(delta) || 0,
                ':zero': 0,
                ':now': now
            },
            ReturnValues: 'ALL_NEW'
        };
        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    }
};

module.exports = Account;

