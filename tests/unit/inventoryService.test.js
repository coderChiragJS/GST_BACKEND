const {
    getInventorySettings,
    getBusinessInventorySettings,
    applyStockChange,
    computeStockValue,
    applyInvoiceStockDeductions,
    reverseInvoiceStockDeductions,
    DEFAULT_INVENTORY_SETTINGS
} = require('../../src/services/inventoryService');

jest.mock('../../src/models/productModel');
jest.mock('../../src/models/businessModel');
jest.mock('../../src/models/stockMovementModel');

const Product = require('../../src/models/productModel');
const Business = require('../../src/models/businessModel');
const StockMovement = require('../../src/models/stockMovementModel');

describe('inventoryService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getInventorySettings', () => {
        test('returns defaults when settings is null', () => {
            const result = getInventorySettings(null);
            expect(result).toEqual(DEFAULT_INVENTORY_SETTINGS);
        });

        test('returns defaults when settings is empty object', () => {
            const result = getInventorySettings({});
            expect(result).toEqual(DEFAULT_INVENTORY_SETTINGS);
        });

        test('returns deliveryChallan when reduceStockOn is deliveryChallan', () => {
            const result = getInventorySettings({ reduceStockOn: 'deliveryChallan' });
            expect(result.reduceStockOn).toBe('deliveryChallan');
            expect(result.stockValueBasedOn).toBe('purchase');
            expect(result.allowNegativeStock).toBe(false);
        });

        test('returns sale when stockValueBasedOn is sale', () => {
            const result = getInventorySettings({ stockValueBasedOn: 'sale' });
            expect(result.stockValueBasedOn).toBe('sale');
        });

        test('returns allowNegativeStock true when set', () => {
            const result = getInventorySettings({ allowNegativeStock: true });
            expect(result.allowNegativeStock).toBe(true);
        });

        test('normalizes invalid reduceStockOn to invoice', () => {
            const result = getInventorySettings({ reduceStockOn: 'other' });
            expect(result.reduceStockOn).toBe('invoice');
        });
    });

    describe('computeStockValue', () => {
        test('uses purchase price when stockValueBasedOn is purchase', () => {
            const product = { currentStock: 10, purchasePrice: 50, salesPrice: 80 };
            const settings = { stockValueBasedOn: 'purchase' };
            expect(computeStockValue(product, settings)).toBe(500);
        });

        test('uses sales price when stockValueBasedOn is sale', () => {
            const product = { currentStock: 10, purchasePrice: 50, salesPrice: 80 };
            const settings = { stockValueBasedOn: 'sale' };
            expect(computeStockValue(product, settings)).toBe(800);
        });

        test('rounds to two decimal places', () => {
            const product = { currentStock: 3, purchasePrice: 33.33, salesPrice: 40 };
            const settings = { stockValueBasedOn: 'purchase' };
            expect(computeStockValue(product, settings)).toBe(99.99);
        });

        test('handles missing prices as 0', () => {
            const product = { currentStock: 5 };
            const settings = { stockValueBasedOn: 'purchase' };
            expect(computeStockValue(product, settings)).toBe(0);
        });
    });

    describe('getBusinessInventorySettings', () => {
        test('returns normalized settings from business', async () => {
            Business.getById.mockResolvedValue({
                inventorySettings: { reduceStockOn: 'deliveryChallan', allowNegativeStock: true }
            });
            const result = await getBusinessInventorySettings('u1', 'b1');
            expect(Business.getById).toHaveBeenCalledWith('u1', 'b1');
            expect(result.reduceStockOn).toBe('deliveryChallan');
            expect(result.allowNegativeStock).toBe(true);
        });

        test('returns defaults when business has no inventorySettings', async () => {
            Business.getById.mockResolvedValue({});
            const result = await getBusinessInventorySettings('u1', 'b1');
            expect(result).toEqual(DEFAULT_INVENTORY_SETTINGS);
        });

        test('returns defaults when business is null', async () => {
            Business.getById.mockResolvedValue(null);
            const result = await getBusinessInventorySettings('u1', 'b1');
            expect(result).toEqual(DEFAULT_INVENTORY_SETTINGS);
        });
    });

    describe('applyStockChange', () => {
        const userId = 'u1';
        const businessId = 'b1';
        const productId = 'p1';

        test('throws PRODUCT_NOT_FOUND when product does not exist', async () => {
            Product.getById.mockResolvedValue(null);
            await expect(applyStockChange(userId, businessId, productId, 10)).rejects.toMatchObject({
                code: 'PRODUCT_NOT_FOUND',
                message: 'Product not found'
            });
            expect(Product.update).not.toHaveBeenCalled();
            expect(StockMovement.create).not.toHaveBeenCalled();
        });

        test('throws STOCK_NOT_TRACKED when product.maintainStock is false', async () => {
            Product.getById.mockResolvedValue({ productId, maintainStock: false, currentStock: 0 });
            Business.getById.mockResolvedValue({ inventorySettings: null });
            await expect(applyStockChange(userId, businessId, productId, 10)).rejects.toMatchObject({
                code: 'STOCK_NOT_TRACKED',
                message: expect.stringContaining('Stock tracking is not enabled')
            });
            expect(Product.update).not.toHaveBeenCalled();
            expect(StockMovement.create).not.toHaveBeenCalled();
        });

        test('throws INSUFFICIENT_STOCK when result would be negative and allowNegativeStock is false', async () => {
            Product.getById.mockResolvedValue({ productId, maintainStock: true, currentStock: 5, unit: 'Nos' });
            Business.getById.mockResolvedValue({ inventorySettings: { allowNegativeStock: false } });
            await expect(applyStockChange(userId, businessId, productId, -10)).rejects.toMatchObject({
                code: 'INSUFFICIENT_STOCK',
                currentStock: 5,
                requestedChange: -10
            });
            expect(Product.update).not.toHaveBeenCalled();
            expect(StockMovement.create).not.toHaveBeenCalled();
        });

        test('succeeds when adding stock', async () => {
            const product = { productId, maintainStock: true, currentStock: 10, unit: 'Nos' };
            Product.getById.mockResolvedValue(product);
            Product.getById.mockResolvedValueOnce(product).mockResolvedValueOnce({ ...product, currentStock: 20 });
            Business.getById.mockResolvedValue({ inventorySettings: null });
            StockMovement.create.mockResolvedValue({
                productId, quantityChange: 10, finalStock: 20, activityType: 'adjustment', unit: 'Nos', createdAt: 'now'
            });

            const result = await applyStockChange(userId, businessId, productId, 10, { activityType: 'adjustment', remark: 'Restock' });

            expect(Product.update).toHaveBeenCalledWith(userId, businessId, productId, { currentStock: 20 });
            expect(StockMovement.create).toHaveBeenCalledWith(userId, businessId, expect.objectContaining({
                productId,
                quantityChange: 10,
                finalStock: 20,
                activityType: 'adjustment',
                remark: 'Restock',
                unit: 'Nos'
            }));
            expect(result.product).toBeDefined();
            expect(result.movement).toBeDefined();
        });

        test('succeeds when reducing stock within available', async () => {
            const product = { productId, maintainStock: true, currentStock: 10, unit: 'Nos' };
            Product.getById.mockResolvedValue(product);
            Product.getById.mockResolvedValueOnce(product).mockResolvedValueOnce({ ...product, currentStock: 4 });
            Business.getById.mockResolvedValue({ inventorySettings: null });
            StockMovement.create.mockResolvedValue({});

            await applyStockChange(userId, businessId, productId, -6);

            expect(Product.update).toHaveBeenCalledWith(userId, businessId, productId, { currentStock: 4 });
            expect(StockMovement.create).toHaveBeenCalledWith(userId, businessId, expect.objectContaining({
                quantityChange: -6,
                finalStock: 4,
                activityType: 'adjustment'
            }));
        });

        test('allows negative stock when allowNegativeStock is true', async () => {
            const product = { productId, maintainStock: true, currentStock: 2, unit: 'Nos' };
            Product.getById.mockResolvedValue(product);
            Product.getById.mockResolvedValueOnce(product).mockResolvedValueOnce({ ...product, currentStock: -3 });
            Business.getById.mockResolvedValue({ inventorySettings: { allowNegativeStock: true } });
            StockMovement.create.mockResolvedValue({});

            await applyStockChange(userId, businessId, productId, -5);

            expect(Product.update).toHaveBeenCalledWith(userId, businessId, productId, { currentStock: -3 });
        });
    });

    describe('applyInvoiceStockDeductions / reverseInvoiceStockDeductions', () => {
        const userId = 'u1';
        const businessId = 'b1';

        test('applyInvoiceStockDeductions does nothing when reduceStockOn is deliveryChallan', async () => {
            Business.getById.mockResolvedValue({ inventorySettings: { reduceStockOn: 'deliveryChallan' } });
            await applyInvoiceStockDeductions(userId, businessId, { items: [{ itemId: 'p1', quantity: 5 }] });
            expect(Product.getById).not.toHaveBeenCalled();
            expect(Product.update).not.toHaveBeenCalled();
            expect(StockMovement.create).not.toHaveBeenCalled();
        });

        test('applyInvoiceStockDeductions deducts when reduceStockOn is invoice', async () => {
            Business.getById.mockResolvedValue({ inventorySettings: { reduceStockOn: 'invoice', allowNegativeStock: false } });
            Product.getById.mockResolvedValue({ productId: 'p1', maintainStock: true, currentStock: 10, unit: 'Nos' });
            Product.getById.mockResolvedValueOnce({ productId: 'p1', maintainStock: true, currentStock: 10, unit: 'Nos' })
                .mockResolvedValueOnce({ productId: 'p1', maintainStock: true, currentStock: 5, unit: 'Nos' });
            StockMovement.create.mockResolvedValue({});

            const invoice = { invoiceId: 'inv1', invoiceNumber: 'INV-001', items: [{ itemId: 'p1', quantity: 5 }] };
            await applyInvoiceStockDeductions(userId, businessId, invoice);

            expect(Product.update).toHaveBeenCalledWith(userId, businessId, 'p1', { currentStock: 5 });
            expect(StockMovement.create).toHaveBeenCalledWith(userId, businessId, expect.objectContaining({
                productId: 'p1',
                quantityChange: -5,
                finalStock: 5,
                activityType: 'invoice',
                referenceId: 'inv1',
                referenceNumber: 'INV-001'
            }));
        });
    });
});
