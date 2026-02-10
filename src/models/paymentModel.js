const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.APP_DATA_TABLE;
const PK_PAYMENT = 'PAYMENT';

const PaymentStatus = {
    PENDING: 'PENDING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED'
};

const Payment = {
    generateOrderId() {
        // Short unique ID for PhonePe merchantOrderId (max 63 chars, safe characters)
        return `ORD_${uuidv4().replace(/-/g, '').slice(0, 28)}`;
    },

    async create({ userId, packageId, amountPaise }) {
        const now = new Date().toISOString();
        const orderId = this.generateOrderId();

        const item = {
            PK: PK_PAYMENT,
            SK: orderId,
            orderId,
            userId,
            packageId,
            amountPaise,
            status: PaymentStatus.PENDING,
            createdAt: now,
            updatedAt: now
        };

        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));

        return item;
    },

    async getByOrderId(orderId) {
        const result = await dynamoDb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: PK_PAYMENT, SK: orderId }
        }));
        return result.Item || null;
    },

    async updateStatus(orderId, status, extraFields = {}) {
        const now = new Date().toISOString();
        const updateKeys = ['status', 'updatedAt', ...Object.keys(extraFields)];

        let updateExp = 'SET';
        const expAttrNames = {};
        const expAttrValues = {};

        updateKeys.forEach((key, idx) => {
            const attrName = `#${key}`;
            const attrValue = `:${key}`;
            if (idx > 0) updateExp += ',';
            updateExp += ` ${attrName} = ${attrValue}`;
            expAttrNames[attrName] = key;
            expAttrValues[attrValue] = key === 'status' ? status : (key === 'updatedAt' ? now : extraFields[key]);
        });

        const result = await dynamoDb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: PK_PAYMENT, SK: orderId },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        }));

        return result.Attributes;
    },

    async markSuccess(orderId, gatewayRef = null) {
        const extra = {};
        if (gatewayRef) {
            extra.gatewayRef = gatewayRef;
        }
        return this.updateStatus(orderId, PaymentStatus.SUCCESS, extra);
    },

    async markFailed(orderId, failureReason = null) {
        const extra = {};
        if (failureReason) {
            extra.failureReason = failureReason;
        }
        return this.updateStatus(orderId, PaymentStatus.FAILED, extra);
    },

    // List all payments (for admin). Paginated. Each item includes userId.
    async listAll(limit = 50, nextToken = null) {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': PK_PAYMENT },
            Limit: Math.min(Math.max(limit || 50, 1), 100)
        };
        if (nextToken) {
            try {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            } catch (_) {}
        }
        const result = await dynamoDb.send(new QueryCommand(params));
        const next = result.LastEvaluatedKey
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : null;
        return { payments: result.Items || [], nextToken: next };
    }
};

module.exports = { Payment, PaymentStatus };

