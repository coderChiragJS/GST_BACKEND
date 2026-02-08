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

const Invoice = {
    async create(userId, businessId, invoiceData) {
        const invoiceId = uuidv4();
        const now = new Date().toISOString();

        const newInvoice = {
            PK: `USER#${userId}#BUSINESS#${businessId}`,
            SK: `INVOICE#${invoiceId}`,
            invoiceId,
            businessId,
            userId,
            // Core invoice fields (stored as-is from client, plus timestamps)
            ...invoiceData,
            id: invoiceId,
            createdAt: now,
            updatedAt: now
        };

        const params = {
            TableName: TABLE_NAME,
            Item: newInvoice
        };

        await dynamoDb.send(new PutCommand(params));
        return newInvoice;
    },

    /**
     * List invoices by business with pagination to avoid 1MB DynamoDB limit truncation.
     * @param {object} options - { limit = 100, exclusiveStartKey }
     * @returns { items, lastEvaluatedKey } lastEvaluatedKey is set when more results exist.
     */
    async listByBusiness(userId, businessId, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 100);
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}#BUSINESS#${businessId}`,
                ':sk': 'INVOICE#'
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

    async getById(userId, businessId, invoiceId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `INVOICE#${invoiceId}`
            }
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item;
    },

    async update(userId, businessId, invoiceId, updateData) {
        const now = new Date().toISOString();

        let updateExp = 'SET updatedAt = :updatedAt';
        const expAttrValues = {
            ':updatedAt': now
        };
        const expAttrNames = {};

        // Dynamically build update expression from provided fields
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
                SK: `INVOICE#${invoiceId}`
            },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    async delete(userId, businessId, invoiceId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `INVOICE#${invoiceId}`
            }
        };

        await dynamoDb.send(new DeleteCommand(params));
        return true;
    }
};

module.exports = Invoice;

