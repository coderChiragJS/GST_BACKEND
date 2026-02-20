const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const User = require('./userModel');

const TABLE_NAME = process.env.BUSINESSES_TABLE;

const Business = {
    async create(userId, businessData) {
        const businessId = uuidv4();
        const now = new Date().toISOString();

        const newBusiness = {
            userId, // PK
            businessId, // SK
            firmName: businessData.firmName,
            gstNumber: businessData.gstNumber,
            pan: businessData.pan,
            mobile: businessData.mobile,
            email: businessData.email,
            address: businessData.address, // Map
            dispatchAddress: businessData.dispatchAddress, // Map
            companyLogoUrl: businessData.companyLogoUrl,
            customFields: businessData.customFields,

            // Master Settings (Optional)
            bankAccounts: businessData.bankAccounts || [],
            transporters: businessData.transporters || [],
            termsTemplates: businessData.termsTemplates || [],
            defaultSignatureUrl: businessData.defaultSignatureUrl || null,
            defaultStampUrl: businessData.defaultStampUrl || null,
            inventorySettings: businessData.inventorySettings || null,

            approvalStatus: 'PENDING', // Default status for new business
            isActive: false, // Default inactive until approved
            createdAt: now,
            updatedAt: now
        };

        const params = {
            TableName: TABLE_NAME,
            Item: newBusiness
        };

        await dynamoDb.send(new PutCommand(params));

        return newBusiness;
    },

    async getByUserId(userId) {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items;
    },

    async getById(userId, businessId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                userId,
                businessId
            }
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item;
    },

    async update(userId, businessId, updateData) {
        const now = new Date().toISOString();

        // Construct UpdateExpression dynamically
        let updateExp = 'set updatedAt = :updatedAt';
        let expAttrValues = {
            ':updatedAt': now
        };
        let expAttrNames = {};

        // List of allowed fields to update
        const allowedFields = [
            'firmName', 'gstNumber', 'pan', 'mobile', 'email',
            'address', 'dispatchAddress', 'companyLogoUrl', 'customFields',
            'isActive',
            // Master Settings
            'bankAccounts', 'transporters', 'termsTemplates',
            'defaultSignatureUrl', 'defaultStampUrl', 'inventorySettings'
        ];

        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updateExp += `, #${field} = :${field}`;
                expAttrValues[`:${field}`] = updateData[field];
                expAttrNames[`#${field}`] = field;
            }
        });

        const params = {
            TableName: TABLE_NAME,
            Key: { userId, businessId },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    async approve(userId, businessId) {
        const now = new Date().toISOString();
        const params = {
            TableName: TABLE_NAME,
            Key: { userId, businessId },
            UpdateExpression: 'set approvalStatus = :status, isActive = :active, updatedAt = :now',
            ExpressionAttributeValues: {
                ':status': 'APPROVED',
                ':active': true,
                ':now': now
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    async listPending() {
        // This requires a GSI on approvalStatus to be efficient, 
        // but for now we can scan or query if we know the user.
        // Given the requirement, we likely need a GSI across all users.
        const params = {
            TableName: TABLE_NAME,
            IndexName: 'ApprovalStatusIndex', // Assuming this index exists or will be added
            KeyConditionExpression: 'approvalStatus = :status',
            ExpressionAttributeValues: {
                ':status': 'PENDING'
            }
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items;
    }
};

module.exports = Business;
