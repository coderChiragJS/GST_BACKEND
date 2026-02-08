const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.APP_DATA_TABLE;
const PK_PACKAGE = 'PACKAGE';

const Package = {
    async create(packageData) {
        const packageId = uuidv4();
        const now = new Date().toISOString();

        const item = {
            PK: PK_PACKAGE,
            SK: packageId,
            packageId,
            name: packageData.name,
            price: Number(packageData.price) || 0,
            invoiceLimit: Number(packageData.invoiceLimit) || 0,
            quotationLimit: Number(packageData.quotationLimit) || 0,
            validityDays: packageData.validityDays != null ? Number(packageData.validityDays) : null,
            isActive: packageData.isActive !== false,
            createdAt: now,
            updatedAt: now
        };

        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));

        return item;
    },

    async listAll() {
        const result = await dynamoDb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': PK_PACKAGE }
        }));
        return result.Items || [];
    },

    async getById(packageId) {
        const result = await dynamoDb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: PK_PACKAGE, SK: packageId }
        }));
        return result.Item;
    },

    async update(packageId, updateData) {
        const now = new Date().toISOString();
        const allowed = ['name', 'price', 'invoiceLimit', 'quotationLimit', 'validityDays', 'isActive'];
        let updateExp = 'SET updatedAt = :updatedAt';
        const expAttrNames = {};
        const expAttrValues = { ':updatedAt': now };

        allowed.forEach((field) => {
            if (updateData[field] !== undefined) {
                updateExp += `, #${field} = :${field}`;
                expAttrNames[`#${field}`] = field;
                if (field === 'isActive') {
                    expAttrValues[`:${field}`] = !!updateData[field];
                } else if (field === 'validityDays') {
                    expAttrValues[`:${field}`] = updateData[field] == null ? null : Number(updateData[field]);
                } else if (['price', 'invoiceLimit', 'quotationLimit'].includes(field)) {
                    expAttrValues[`:${field}`] = Number(updateData[field]) || 0;
                } else {
                    expAttrValues[`:${field}`] = updateData[field];
                }
            }
        });

        const result = await dynamoDb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: PK_PACKAGE, SK: packageId },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        }));

        return result.Attributes;
    }
};

module.exports = Package;
