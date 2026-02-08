const { v4: uuidv4 } = require('uuid');
const { dynamoDb } = require('../config/db');
const { PutCommand, QueryCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.PRODUCTS_TABLE;

const Product = {
    async create(userId, businessId, productData) {
        const productId = uuidv4();
        const now = new Date().toISOString();

        const newProduct = {
            PK: `USER#${userId}#BUSINESS#${businessId}`,
            SK: `PRODUCT#${productId}`,
            productId: productId,
            businessId: businessId,
            userId: userId,

            // Product Identification
            name: productData.name,
            type: productData.type || 'product', // product | service
            description: productData.description || '',
            hsnSac: productData.hsnSac || '',
            categoryId: productData.categoryId || 'default',

            // Units & Pricing
            unit: productData.unit || 'Nos',
            secondaryUnit: productData.secondaryUnit || null,
            conversionRate: productData.conversionRate || 1,
            salesPrice: productData.salesPrice || 0,
            taxInclusive: productData.taxInclusive !== undefined ? productData.taxInclusive : true,
            gstPercent: productData.gstPercent || 0,
            cessType: productData.cessType || 'Percentage',
            cessValue: productData.cessValue || 0,

            // Purchase & Wholesale
            purchasePrice: productData.purchasePrice || 0,
            taxInclusivePurchase: productData.taxInclusivePurchase !== undefined ? productData.taxInclusivePurchase : true,
            wholesalePrice: productData.wholesalePrice || 0,
            minWholesaleQty: productData.minWholesaleQty || 0,

            // Discounts
            discountType: productData.discountType || 'percentage', // percentage | amount
            discountValue: productData.discountValue || 0,

            // Media & Extra
            imagePath: productData.imagePath || '',
            customFields: productData.customFields || [],

            // GSI1 for filtering by category and sorting by name
            'GSI1-PK': `USER#${userId}#CATEGORY#${productData.categoryId || 'default'}`,
            'GSI1-SK': `NAME#${productData.name.toUpperCase()}`,

            createdAt: now,
            updatedAt: now
        };

        const params = {
            TableName: TABLE_NAME,
            Item: newProduct
        };

        await dynamoDb.send(new PutCommand(params));
        return newProduct;
    },

    async listByBusiness(userId, businessId) {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            FilterExpression: 'attribute_not_exists(#status) OR #status <> :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}#BUSINESS#${businessId}`,
                ':sk': 'PRODUCT#',
                ':status': 'DELETED'
            }
        };

        const result = await dynamoDb.send(new QueryCommand(params));
        return result.Items;
    },

    async getById(userId, businessId, productId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `PRODUCT#${productId}`
            }
        };

        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item;
    },

    async update(userId, businessId, productId, updateData) {
        const now = new Date().toISOString();
        let updateExp = 'SET updatedAt = :updatedAt';
        const expAttrValues = { ':updatedAt': now };
        const expAttrNames = {};

        // Define which fields can be updated
        const allowedFields = [
            'name', 'type', 'description', 'hsnSac', 'unit',
            'secondaryUnit', 'conversionRate', 'salesPrice',
            'taxInclusive', 'gstPercent', 'cessType', 'cessValue',
            'discountType', 'discountValue', 'purchasePrice',
            'taxInclusivePurchase', 'wholesalePrice', 'minWholesaleQty',
            'categoryId', 'imagePath', 'customFields'
        ];

        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updateExp += `, #${field} = :${field}`;
                expAttrValues[`:${field}`] = updateData[field];
                expAttrNames[`#${field}`] = field;
            }
        });

        // GSI1 needs both name and categoryId; fetch existing if only one is being updated
        const needsGsi1Update = updateData.name !== undefined || updateData.categoryId !== undefined;
        let nameForGsi1 = updateData.name;
        let categoryIdForGsi1 = updateData.categoryId;
        if (needsGsi1Update && (nameForGsi1 === undefined || categoryIdForGsi1 === undefined)) {
            const existing = await this.getById(userId, businessId, productId);
            if (existing) {
                nameForGsi1 = nameForGsi1 !== undefined ? nameForGsi1 : existing.name;
                categoryIdForGsi1 = categoryIdForGsi1 !== undefined ? categoryIdForGsi1 : (existing.categoryId || 'default');
            }
        }
        if (needsGsi1Update && nameForGsi1 != null && categoryIdForGsi1 != null) {
            updateExp += ', #gsi1pk = :gsi1pk, #gsi1sk = :gsi1sk';
            expAttrValues[':gsi1pk'] = `USER#${userId}#CATEGORY#${categoryIdForGsi1}`;
            expAttrValues[':gsi1sk'] = `NAME#${String(nameForGsi1).toUpperCase()}`;
            expAttrNames['#gsi1pk'] = 'GSI1-PK';
            expAttrNames['#gsi1sk'] = 'GSI1-SK';
        }

        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `PRODUCT#${productId}`
            },
            UpdateExpression: updateExp,
            ExpressionAttributeNames: expAttrNames,
            ExpressionAttributeValues: expAttrValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDb.send(new UpdateCommand(params));
        return result.Attributes;
    },

    async delete(userId, businessId, productId) {
        const now = new Date().toISOString();
        const params = {
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}#BUSINESS#${businessId}`,
                SK: `PRODUCT#${productId}`
            },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: { '#status': 'status' },
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

module.exports = Product;
