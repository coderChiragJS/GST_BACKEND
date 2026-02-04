const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.PARTIES_TABLE;

const Party = {
    // Create a new party
    async create(userId, partyData) {
        const partyId = `PARTY#${uuidv4()}`;
        const now = new Date().toISOString();
        const sameAsBilling = partyData.sameAsBilling || false;

        const newParty = {
            PK: `USER#${userId}`,
            SK: partyId,
            partyId: partyId.split('#')[1],
            companyName: partyData.companyName,
            gstNumber: partyData.gstNumber || '',
            mobile: partyData.mobile,
            email: partyData.email || '',
            billingAddress: partyData.billingAddress || {
                street: '',
                city: '',
                state: '',
                pincode: '',
                country: 'India'
            },
            sameAsBilling: sameAsBilling,
            shippingAddress: sameAsBilling
                ? { ...partyData.billingAddress, sameAsBilling: true }
                : {
                    ...(partyData.shippingAddress || {
                        street: '',
                        city: '',
                        state: '',
                        pincode: '',
                        country: 'India'
                    }),
                    sameAsBilling: false
                },
            paymentTerms: partyData.paymentTerms || 0,
            openingBalance: partyData.openingBalance || 0,
            openingBalanceType: partyData.openingBalanceType || 'TO_RECEIVE',
            partyType: partyData.partyType || 'Individual',
            gstTreatment: partyData.gstTreatment || 'Regular',
            taxPreference: partyData.taxPreference || 'Inclusive',
            tdsApplicable: partyData.tdsApplicable || false,
            tcsApplicable: partyData.tcsApplicable || false,
            createdAt: now,
            updatedAt: now
        };

        const params = {
            TableName: TABLE_NAME,
            Item: newParty
        };

        await dynamoDb.send(new PutCommand(params));
        return newParty;
    },

    // List all parties for a user
    async listByUser(userId) {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':sk': 'PARTY#'
            }
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items;
    },

    // Get party by ID
    async getById(userId, partyId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `PARTY#${partyId}`
            }
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item;
    },

    // Update party
    async update(userId, partyId, updateData) {
        const now = new Date().toISOString();
        const sameAsBilling = updateData.sameAsBilling || false;

        // Handle shipping address if sameAsBilling is true
        if (sameAsBilling && updateData.billingAddress) {
            updateData.shippingAddress = {
                ...updateData.billingAddress,
                sameAsBilling: true
            };
        } else if (updateData.shippingAddress) {
            updateData.shippingAddress.sameAsBilling = false;
        }

        // Build update expression
        let updateExp = 'SET updatedAt = :updatedAt, sameAsBilling = :sameAsBilling';
        const expAttrValues = {
            ':updatedAt': now,
            ':sameAsBilling': sameAsBilling
        };
        const expAttrNames = {};

        // List of allowed fields to update
        const allowedFields = [
            'companyName', 'gstNumber', 'mobile', 'email',
            'billingAddress', 'shippingAddress',
            'paymentTerms', 'openingBalance', 'openingBalanceType',
            'partyType', 'gstTreatment', 'taxPreference',
            'tdsApplicable', 'tcsApplicable'
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
            Key: {
                PK: `USER#${userId}`,
                SK: `PARTY#${partyId}`
            },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    // Delete party (soft delete by updating status)
    async delete(userId, partyId) {
        const now = new Date().toISOString();

        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `PARTY#${partyId}`
            },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'DELETED',
                ':updatedAt': now
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    }
};

module.exports = Party;
