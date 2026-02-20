const Product = require('../models/productModel');
const Business = require('../models/businessModel');
const StockMovement = require('../models/stockMovementModel');
const {
    getBusinessInventorySettings,
    applyStockChange,
    computeStockValue,
    getInventorySettings
} = require('../services/inventoryService');
const { z } = require('zod');

const adjustStockSchema = z.object({
    quantityChange: z.number().refine((n) => n !== 0, { message: 'quantityChange must be non-zero (positive to add, negative to reduce)' }),
    remark: z.string().optional().default(''),
    date: z.string().optional()
});

const inventorySettingsSchema = z.object({
    reduceStockOn: z.enum(['invoice', 'deliveryChallan']).optional(),
    stockValueBasedOn: z.enum(['purchase', 'sale']).optional(),
    allowNegativeStock: z.boolean().optional()
}).strict();

const inventoryController = {
    /**
     * POST /business/:businessId/products/:productId/stock
     * Body: { quantityChange: number, remark?: string, date?: string }
     */
    async adjustStock(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, productId } = req.params;

            if (!businessId || !productId) {
                return res.status(400).json({ message: 'Business ID and Product ID are required' });
            }

            const validation = adjustStockSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: validation.error.errors[0].message,
                    code: 'VALIDATION_FAILED',
                    details: validation.error.errors
                });
            }

            const { quantityChange, remark } = validation.data;
            const product = await Product.getById(userId, businessId, productId);
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const { product: updatedProduct, movement } = await applyStockChange(
                userId,
                businessId,
                productId,
                quantityChange,
                { activityType: 'adjustment', remark }
            );

            return res.status(200).json({
                message: 'Stock updated successfully',
                product: updatedProduct,
                movement: {
                    productId: movement.productId,
                    quantityChange: movement.quantityChange,
                    finalStock: movement.finalStock,
                    activityType: movement.activityType,
                    remark: movement.remark,
                    unit: movement.unit,
                    createdAt: movement.createdAt
                }
            });
        } catch (error) {
            if (error.code === 'PRODUCT_NOT_FOUND') {
                return res.status(404).json({ message: error.message });
            }
            if (error.code === 'STOCK_NOT_TRACKED') {
                return res.status(400).json({ message: error.message, code: error.code });
            }
            if (error.code === 'INSUFFICIENT_STOCK') {
                return res.status(400).json({
                    message: error.message,
                    code: error.code,
                    currentStock: error.currentStock,
                    requestedChange: error.requestedChange
                });
            }
            console.error('Adjust Stock Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    /**
     * GET /business/:businessId/products/:productId/stock-movements
     * Query: limit, nextToken
     */
    async getStockMovements(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, productId } = req.params;

            if (!businessId || !productId) {
                return res.status(400).json({ message: 'Business ID and Product ID are required' });
            }

            const product = await Product.getById(userId, businessId, productId);
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
            let exclusiveStartKey = null;
            if (req.query.nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(
                        Buffer.from(req.query.nextToken, 'base64url').toString('utf8')
                    );
                } catch (_) {
                    return res.status(400).json({ message: 'Invalid nextToken' });
                }
            }

            const { items, lastEvaluatedKey } = await StockMovement.listByProduct(
                userId,
                businessId,
                productId,
                { limit, exclusiveStartKey }
            );

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url')
                : null;

            return res.json({
                stockMovements: items,
                count: items.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('Get Stock Movements Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    /**
     * GET /business/:businessId/settings/inventory
     */
    async getInventorySettings(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required' });
            }

            const settings = await getBusinessInventorySettings(userId, businessId);
            return res.json({ inventorySettings: settings });
        } catch (error) {
            console.error('Get Inventory Settings Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    /**
     * PUT /business/:businessId/settings/inventory
     * Body: { reduceStockOn?, stockValueBasedOn?, allowNegativeStock? }
     */
    async updateInventorySettings(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required' });
            }

            const validation = inventorySettingsSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: validation.error.errors[0].message,
                    code: 'VALIDATION_FAILED',
                    details: validation.error.errors
                });
            }

            const business = await Business.getById(userId, businessId);
            if (!business) {
                return res.status(404).json({ message: 'Business not found' });
            }

            const current = getInventorySettings(business.inventorySettings);
            const next = { ...current, ...validation.data };

            await Business.update(userId, businessId, { inventorySettings: next });
            return res.json({ inventorySettings: next });
        } catch (error) {
            console.error('Update Inventory Settings Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }
};

module.exports = inventoryController;
