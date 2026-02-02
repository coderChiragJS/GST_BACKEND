const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const USERS_TABLE = process.env.USERS_TABLE;

const User = {
    // Create a new User
    async create({ name, email, password }, options = {}) {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const now = new Date().toISOString();

        const newUser = {
            userId,
            email,
            name,
            passwordHash,
            role: options.role || 'USER', // Default role
            approvalStatus: options.approvalStatus || 'PENDING', // Default status
            subscriptionActive: false,
            trialDays: 0,
            createdAt: now,
        };

        const params = {
            TableName: USERS_TABLE,
            Item: newUser,
        };

        await dynamoDb.send(new PutCommand(params));
        return newUser;
    },

    // Find User by Email
    async findByEmail(email) {
        const params = {
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email,
            },
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items[0]; // Email should be unique
    },

    // Find User by ID
    async findById(userId) {
        const params = {
            TableName: USERS_TABLE,
            Key: {
                userId,
            },
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item;
    },

    // Approve User (Admin Action)
    async approve(userId, adminId, trialDays = 14) {
        const now = new Date();
        const trialEndDate = new Date();
        trialEndDate.setDate(now.getDate() + trialDays);

        const params = {
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'set approvalStatus = :status, approvedBy = :adminId, approvedAt = :now, trialDays = :days, trialStartDate = :now, trialEndDate = :end',
            ExpressionAttributeValues: {
                ':status': 'APPROVED',
                ':adminId': adminId,
                ':now': now.toISOString(),
                ':days': trialDays,
                ':end': trialEndDate.toISOString(),
            },
            ReturnValues: 'ALL_NEW',
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    // List all users with a given status (Using GSI for cost-effectiveness)
    async listPending(status = 'PENDING') {
        const params = {
            TableName: USERS_TABLE,
            IndexName: 'ApprovalStatusIndex',
            KeyConditionExpression: 'approvalStatus = :status',
            ExpressionAttributeValues: {
                ':status': status
            }
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items;
    },

    // Update User Status
    async updateStatus(userId, status) {
        const params = {
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'set approvalStatus = :status',
            ExpressionAttributeValues: {
                ':status': status,
            },
            ReturnValues: 'ALL_NEW',
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    }
};

module.exports = User;
