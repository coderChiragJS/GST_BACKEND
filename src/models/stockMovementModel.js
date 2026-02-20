const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.INVOICES_TABLE;

/**
 * Stock movements are stored with PK = USER#userId#BUSINESS#businessId,
 * SK = STOCKMOVEMENT#productId#timestamp (ISO string for chronological sort).
 */
function sk(productId, timestamp) {
    return `STOCKMOVEMENT#${productId}#${timestamp}`;
}

const StockMovement = {
    async create(userId, businessId, movementData) {
        const now = movementData.createdAt || new Date().toISOString();
        const pk = `USER#${userId}#BUSINESS#${businessId}`;
        const movement = {
            PK: pk,
            SK: sk(movementData.productId, now),
            productId: movementData.productId,
            quantityChange: movementData.quantityChange,
            finalStock: movementData.finalStock,
            activityType: movementData.activityType,
            referenceId: movementData.referenceId || null,
            referenceNumber: movementData.referenceNumber || null,
            remark: movementData.remark || null,
            unit: movementData.unit || 'Nos',
            createdAt: now
        };
        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: movement
        }));
        return movement;
    },

    async listByProduct(userId, businessId, productId, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}#BUSINESS#${businessId}`,
                ':sk': `STOCKMOVEMENT#${productId}#`
            },
            Limit: limit,
            ScanIndexForward: false
        };
        if (options.exclusiveStartKey) {
            params.ExclusiveStartKey = options.exclusiveStartKey;
        }
        const result = await dynamoDb.send(new QueryCommand(params));
        return {
            items: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey || null
        };
    }
};

module.exports = StockMovement;
