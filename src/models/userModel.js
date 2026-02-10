const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { Settings } = require('./settingsModel');

const USERS_TABLE = process.env.USERS_TABLE;

const User = {
    // Create a new User (trial duration from global settings)
    async create({ name, email, password }, options = {}) {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const now = new Date();

        let trialDays = 14;
        try {
            trialDays = await Settings.getTrialDays();
        } catch (err) {
            // Table may not exist yet; use default
        }

        const trialEndDate = new Date(now);
        trialEndDate.setDate(trialEndDate.getDate() + trialDays);

        const newUser = {
            userId,
            email,
            name,
            passwordHash,
            role: options.role || 'USER',
            subscriptionActive: false,
            trialDays,
            trialStartDate: now.toISOString(),
            trialEndDate: trialEndDate.toISOString(),
            createdAt: now.toISOString(),
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

    // List users whose trial has expired (trialEndDate < now). Paginated via limit/nextToken.
    async listExpiredTrial(limit = 50, nextToken = null) {
        const now = new Date().toISOString();
        const params = {
            TableName: USERS_TABLE,
            FilterExpression: 'trialEndDate < :now',
            ExpressionAttributeValues: { ':now': now },
            Limit: Math.min(Math.max(limit || 50, 1), 100)
        };
        if (nextToken) {
            try {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            } catch (_) {}
        }
        const result = await dynamoDb.send(new ScanCommand(params));
        const next = result.LastEvaluatedKey
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : null;
        return { users: result.Items || [], nextToken: next };
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
    },

    // List all users (for admin). Paginated via limit/nextToken.
    async listAll(limit = 50, nextToken = null) {
        const params = {
            TableName: USERS_TABLE,
            Limit: Math.min(Math.max(limit || 50, 1), 100)
        };
        if (nextToken) {
            try {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            } catch (_) {}
        }
        const result = await dynamoDb.send(new ScanCommand(params));
        const next = result.LastEvaluatedKey
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : null;
        return { users: result.Items || [], nextToken: next };
    },

    // Update profile (name, email). Email must be unique if changed.
    async updateProfile(userId, { name, email }) {
        const updates = [];
        const expAttrNames = {};
        const expAttrValues = {};

        if (name !== undefined) {
            updates.push('#name = :name');
            expAttrNames['#name'] = 'name';
            expAttrValues[':name'] = name;
        }
        if (email !== undefined) {
            updates.push('#email = :email');
            expAttrNames['#email'] = 'email';
            expAttrValues[':email'] = email;
        }
        if (updates.length === 0) return (await this.findById(userId));

        expAttrNames['#updatedAt'] = 'updatedAt';
        expAttrValues[':updatedAt'] = new Date().toISOString();
        updates.push('#updatedAt = :updatedAt');

        const params = {
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'set ' + updates.join(', '),
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW',
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    // Update password (used after reset-password verification).
    async updatePassword(userId, passwordHash) {
        const params = {
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'set passwordHash = :hash',
            ExpressionAttributeValues: { ':hash': passwordHash },
            ReturnValues: 'ALL_NEW',
        };
        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    }
};

module.exports = User;
