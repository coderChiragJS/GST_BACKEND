const Product = require('../models/productModel');
const Business = require('../models/businessModel');
const StockMovement = require('../models/stockMovementModel');

const DEFAULT_INVENTORY_SETTINGS = {
    reduceStockOn: 'invoice',
    stockValueBasedOn: 'purchase',
    allowNegativeStock: false
};

function getInventorySettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return { ...DEFAULT_INVENTORY_SETTINGS };
    }
    return {
        reduceStockOn: settings.reduceStockOn === 'deliveryChallan' ? 'deliveryChallan' : 'invoice',
        stockValueBasedOn: settings.stockValueBasedOn === 'sale' ? 'sale' : 'purchase',
        allowNegativeStock: !!settings.allowNegativeStock
    };
}

/**
 * Get inventory settings for a business (from business document).
 * @returns {Promise<{ reduceStockOn: string, stockValueBasedOn: string, allowNegativeStock: boolean }>}
 */
async function getBusinessInventorySettings(userId, businessId) {
    const business = await Business.getById(userId, businessId);
    return getInventorySettings(business?.inventorySettings);
}

/**
 * Apply a stock change for a product: update currentStock and record movement.
 * @param {string} userId
 * @param {string} businessId
 * @param {string} productId
 * @param {number} quantityChange - positive for add, negative for reduce
 * @param {object} options - { activityType, referenceId, referenceNumber, remark, unit }
 * @returns {Promise<{ product: object, movement: object }>}
 * @throws if product not found, product.maintainStock is false, or (when allowNegativeStock is false) result would be negative
 */
async function applyStockChange(userId, businessId, productId, quantityChange, options = {}) {
    const product = await Product.getById(userId, businessId, productId);
    if (!product) {
        const err = new Error('Product not found');
        err.code = 'PRODUCT_NOT_FOUND';
        throw err;
    }
    if (!product.maintainStock) {
        const err = new Error('Stock tracking is not enabled for this product');
        err.code = 'STOCK_NOT_TRACKED';
        throw err;
    }

    const settings = await getBusinessInventorySettings(userId, businessId);
    const currentStock = Number(product.currentStock) || 0;
    const newStock = currentStock + quantityChange;

    if (!settings.allowNegativeStock && newStock < 0) {
        const err = new Error(
            `Insufficient stock. Current: ${currentStock} ${product.unit || 'Nos'}, requested change: ${quantityChange}. Enable "Allow negative stock" in Inventory Settings to permit overselling.`
        );
        err.code = 'INSUFFICIENT_STOCK';
        err.currentStock = currentStock;
        err.requestedChange = quantityChange;
        throw err;
    }

    const unit = product.unit || 'Nos';
    await Product.update(userId, businessId, productId, { currentStock: newStock });

    const movement = await StockMovement.create(userId, businessId, {
        productId,
        quantityChange,
        finalStock: newStock,
        activityType: options.activityType || 'adjustment',
        referenceId: options.referenceId || null,
        referenceNumber: options.referenceNumber || null,
        remark: options.remark || null,
        unit,
        createdAt: new Date().toISOString()
    });

    const updatedProduct = await Product.getById(userId, businessId, productId);
    return { product: updatedProduct, movement };
}

/**
 * Compute stock value for a product based on business settings.
 * @param {object} product - product with currentStock, purchasePrice, salesPrice
 * @param {object} settings - inventory settings (stockValueBasedOn)
 * @returns {number}
 */
function computeStockValue(product, settings) {
    const qty = Number(product.currentStock) || 0;
    const price = settings.stockValueBasedOn === 'sale'
        ? (Number(product.salesPrice) || 0)
        : (Number(product.purchasePrice) || 0);
    return Math.round(qty * price * 100) / 100;
}

/**
 * Apply stock deductions for a saved invoice (each line item: itemId as productId, deduct quantity).
 * If any deduction fails (e.g. insufficient stock), reverses all previous deductions and rethrows.
 * @param {string} userId
 * @param {string} businessId
 * @param {object} invoice - invoice with items[], invoiceId, invoiceNumber
 * @returns {Promise<void>}
 */
async function applyInvoiceStockDeductions(userId, businessId, invoice) {
    const settings = await getBusinessInventorySettings(userId, businessId);
    if (settings.reduceStockOn !== 'invoice') return;

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const applied = [];

    for (const item of items) {
        const productId = item.itemId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;

        try {
            await applyStockChange(userId, businessId, productId, -qty, {
                activityType: 'invoice',
                referenceId: invoice.invoiceId,
                referenceNumber: invoice.invoiceNumber || null,
                remark: null
            });
            applied.push({ productId, quantity: qty });
        } catch (err) {
            for (const a of applied) {
                await applyStockChange(userId, businessId, a.productId, a.quantity, {
                    activityType: 'invoice',
                    referenceId: invoice.invoiceId,
                    referenceNumber: invoice.invoiceNumber || null,
                    remark: 'Reversal'
                }).catch(() => {});
            }
            throw err;
        }
    }
}

/**
 * Reverse stock deductions for an invoice (add back quantity for each line item).
 * @param {string} userId
 * @param {string} businessId
 * @param {object} invoice - invoice with items[], invoiceId, invoiceNumber
 */
async function reverseInvoiceStockDeductions(userId, businessId, invoice) {
    const settings = await getBusinessInventorySettings(userId, businessId);
    if (settings.reduceStockOn !== 'invoice') return;

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    for (const item of items) {
        const productId = item.itemId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;
        await applyStockChange(userId, businessId, productId, qty, {
            activityType: 'invoice',
            referenceId: invoice.invoiceId,
            referenceNumber: invoice.invoiceNumber || null,
            remark: 'Reversal'
        }).catch(() => {});
    }
}

/**
 * Apply stock deductions for a delivery challan (each line item: itemId as productId, deduct quantity).
 * Same pattern as invoice: on failure reverse and rethrow.
 */
async function applyDeliveryChallanStockDeductions(userId, businessId, challan) {
    const settings = await getBusinessInventorySettings(userId, businessId);
    if (settings.reduceStockOn !== 'deliveryChallan') return;

    const items = Array.isArray(challan.items) ? challan.items : [];
    const applied = [];

    for (const item of items) {
        const productId = item.itemId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;

        try {
            await applyStockChange(userId, businessId, productId, -qty, {
                activityType: 'deliveryChallan',
                referenceId: challan.deliveryChallanId || challan.challanId,
                referenceNumber: challan.challanNumber || null,
                remark: null
            });
            applied.push({ productId, quantity: qty });
        } catch (err) {
            for (const a of applied) {
                await applyStockChange(userId, businessId, a.productId, a.quantity, {
                    activityType: 'deliveryChallan',
                    referenceId: challan.deliveryChallanId || challan.challanId,
                    referenceNumber: challan.challanNumber || null,
                    remark: 'Reversal'
                }).catch(() => {});
            }
            throw err;
        }
    }
}

/**
 * Reverse stock deductions for a delivery challan.
 */
async function reverseDeliveryChallanStockDeductions(userId, businessId, challan) {
    const settings = await getBusinessInventorySettings(userId, businessId);
    if (settings.reduceStockOn !== 'deliveryChallan') return;

    const items = Array.isArray(challan.items) ? challan.items : [];
    for (const item of items) {
        const productId = item.itemId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;
        await applyStockChange(userId, businessId, productId, qty, {
            activityType: 'deliveryChallan',
            referenceId: challan.deliveryChallanId || challan.challanId,
            referenceNumber: challan.challanNumber || null,
            remark: 'Reversal'
        }).catch(() => {});
    }
}

module.exports = {
    getInventorySettings,
    getBusinessInventorySettings,
    applyStockChange,
    computeStockValue,
    applyInvoiceStockDeductions,
    reverseInvoiceStockDeductions,
    applyDeliveryChallanStockDeductions,
    reverseDeliveryChallanStockDeductions,
    DEFAULT_INVENTORY_SETTINGS
};
