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
const SK_PREFIX = 'QUOTATION#';

const Quotation = {
    async create(userId, businessId, quotationData) {
        const quotationId = uuidv4();
        const now = new Date().toISOString();

        const newQuotation = {
            PK: `USER#${userId}#BUSINESS#${businessId}`,
            SK: `${SK_PREFIX}${quotationId}`,
            quotationId,
            businessId,
            userId,
            ...quotationData,
            id: quotationId,
            createdAt: now,
            updatedAt: now
        };

        const params = {
            TableName: TABLE_NAME,
            Item: newQuotation
        };

        await dynamoDb.send(new PutCommand(params));
        return newQuotation;
    },

    /**
     * List quotations by business with pagination (same table, different SK prefix).
     */
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

    async getById(userId, businessId, quotationId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `${SK_PREFIX}${quotationId}`
            }
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item;
    },

    async update(userId, businessId, quotationId, updateData) {
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
                SK: `${SK_PREFIX}${quotationId}`
            },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    async delete(userId, businessId, quotationId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `${SK_PREFIX}${quotationId}`
            }
        };

        await dynamoDb.send(new DeleteCommand(params));
        return true;
    }
};

module.exports = Quotation;
