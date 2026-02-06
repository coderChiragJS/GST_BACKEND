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

    async listByBusiness(userId, businessId) {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}#BUSINESS#${businessId}`,
                ':sk': 'INVOICE#'
            }
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items || [];
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

