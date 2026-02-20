const Product = require('../models/productModel');
const { getBusinessInventorySettings, computeStockValue } = require('../services/inventoryService');
const { z } = require('zod');

// Validation Schema based on the shared schema
const productSchema = z.object({
    name: z.string().min(1, "Product Name is required"),
    type: z.enum(['product', 'service']).default('product'),
    description: z.string().optional(),
    hsnSac: z.string().optional(),
    unit: z.string().default('Nos'),
    secondaryUnit: z.string().optional().nullable(),
    conversionRate: z.number().optional().default(1),
    salesPrice: z.number().nonnegative().optional().default(0),
    taxInclusive: z.boolean().optional().default(true),
    gstPercent: z.number().min(0).max(100).optional().default(0),
    cessType: z.enum(['Percentage', 'Per Unit']).optional().default('Percentage'),
    cessValue: z.number().nonnegative().optional().default(0),
    discountType: z.enum(['percentage', 'amount']).optional().default('percentage'),
    discountValue: z.number().nonnegative().optional().default(0),
    purchasePrice: z.number().nonnegative().optional().default(0),
    taxInclusivePurchase: z.boolean().optional().default(true),
    wholesalePrice: z.number().nonnegative().optional().default(0),
    minWholesaleQty: z.number().nonnegative().optional().default(0),
    categoryId: z.string().optional().default('default'),
    imagePath: z.string().url().optional().or(z.literal('')).nullable(),
    customFields: z.array(z.object({
        name: z.string(),
        value: z.any()
    })).optional().default([]),
    // Inventory (for type === 'product')
    maintainStock: z.boolean().optional().default(false),
    openingStock: z.number().nonnegative().optional().default(0),
    lowStockAlertQty: z.number().nonnegative().optional().default(0)
});

// Update Schema (Partial)
const updateProductSchema = productSchema.partial();

const productController = {
    async createProduct(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ error: 'Business ID is required in URL' });
            }

            const validation = productSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: validation.error.errors[0].message,
                    details: validation.error.errors
                });
            }

            const product = await Product.create(userId, businessId, validation.data);
            res.status(201).json({
                message: 'Product Created Successfully',
                product
            });
        } catch (error) {
            console.error('Create Product Error:', error);
            res.status(500).json({
                error: 'Internal Server Error',
                details: error.message
            });
        }
    },

    async listProducts(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const lowStockOnly = req.query.lowStock === 'true';
            const categoryId = req.query.categoryId != null && req.query.categoryId !== '' ? String(req.query.categoryId) : null;

            if (!businessId) {
                return res.status(400).json({ error: 'Business ID is required in URL' });
            }

            let products = await Product.listByBusiness(userId, businessId);
            const settings = await getBusinessInventorySettings(userId, businessId);

            products = products.map((p) => {
                const currentStock = p.maintainStock ? (Number(p.currentStock) || 0) : 0;
                const stockValue = p.maintainStock ? computeStockValue(p, settings) : 0;
                return { ...p, currentStock, stockValue };
            });

            if (categoryId != null) {
                products = products.filter((p) => (p.categoryId || 'default') === categoryId);
            }

            if (lowStockOnly) {
                products = products.filter(
                    (p) => p.maintainStock && p.currentStock <= (Number(p.lowStockAlertQty) || 0)
                );
            }

            res.json({
                count: products.length,
                products
            });
        } catch (error) {
            console.error('List Products Error:', error);
            res.status(500).json({
                error: 'Internal Server Error',
                details: error.message
            });
        }
    },

    async getProduct(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, productId } = req.params;

            const product = await Product.getById(userId, businessId, productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const currentStock = product.maintainStock ? (Number(product.currentStock) || 0) : 0;
            const settings = await getBusinessInventorySettings(userId, businessId);
            const stockValue = product.maintainStock ? computeStockValue(product, settings) : 0;

            res.json({ ...product, currentStock, stockValue });
        } catch (error) {
            console.error('Get Product Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async updateProduct(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, productId } = req.params;

            const validation = updateProductSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ error: validation.error.errors[0].message });
            }

            const existing = await Product.getById(userId, businessId, productId);
            if (!existing) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const updateData = { ...validation.data };
            if (updateData.maintainStock === true && !existing.maintainStock && updateData.openingStock !== undefined) {
                updateData.currentStock = Number(updateData.openingStock) || 0;
            }

            const product = await Product.update(userId, businessId, productId, updateData);
            res.json({ message: 'Product updated successfully', product });
        } catch (error) {
            console.error('Update Product Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async deleteProduct(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, productId } = req.params;

            const existing = await Product.getById(userId, businessId, productId);
            if (!existing) {
                return res.status(404).json({ error: 'Product not found' });
            }

            await Product.delete(userId, businessId, productId);
            res.json({ message: 'Product deleted successfully' });
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                return res.status(404).json({ error: 'Product not found' });
            }
            console.error('Delete Product Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

module.exports = productController;
