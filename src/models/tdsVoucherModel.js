const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const {
    PutCommand,
    QueryCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.INVOICES_TABLE;
const SK_PREFIX = 'TDS_VOUCHER#';

const TdsVoucher = {
    async create(userId, businessId, voucherData) {
        const voucherId = uuidv4();
        const now = new Date().toISOString();

        const item = {
            PK: `USER#${userId}#BUSINESS#${businessId}`,
            SK: `${SK_PREFIX}${voucherId}`,
            voucherId,
            id: voucherId,
            businessId,
            userId,
            ...voucherData,
            createdAt: now,
            updatedAt: now
        };

        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));
        return item;
    },

    async listByBusiness(userId, businessId, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 100);
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}#BUSINESS#${businessId}`,
                ':sk': SK_PREFIX
            },
            Limit: limit
        };
        if (options.exclusiveStartKey) {
            params.ExclusiveStartKey = options.exclusiveStartKey;
        }

        const result = await dynamoDb.send(new QueryCommand(params));
        return {
            items: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };
    },

    async getById(userId, businessId, voucherId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `${SK_PREFIX}${voucherId}`
            }
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item || null;
    },

    async update(userId, businessId, voucherId, updateData) {
        const now = new Date().toISOString();

        let updateExp = 'SET updatedAt = :updatedAt';
        const expAttrValues = { ':updatedAt': now };
        const expAttrNames = {};

        Object.keys(updateData).forEach((field) => {
            const value = updateData[field];
            if (value !== undefined) {
                updateExp += `, #${field} = :${field}`;
                expAttrValues[`:${field}`] = value;
                expAttrNames[`#${field}`] = field;
            }
        });

        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `${SK_PREFIX}${voucherId}`
            },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    async delete(userId, businessId, voucherId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `${SK_PREFIX}${voucherId}`
            }
        };

        await dynamoDb.send(new DeleteCommand(params));
        return true;
    }
};

module.exports = TdsVoucher;
