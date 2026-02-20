const Invoice = require('../models/invoiceModel');
const UserSubscription = require('../models/userSubscriptionModel');
const VoucherIndex = require('../models/voucherIndexModel');
const { z } = require('zod');

// --- Zod Schemas matching the shared Invoice JSON spec ---

const invoiceLineItemSchema = z.object({
    itemId: z.string(),
    itemName: z.string(),
    hsnSac: z.string().optional().default(''),
    quantity: z.number().nonnegative(),
    unit: z.string().default('Nos'),
    unitPrice: z.number().nonnegative(),
    discountType: z.enum(['percentage', 'flat']),
    discountValue: z.number().nonnegative(),
    discountPercent: z.number().nonnegative(),
    gstPercent: z.number().min(0).max(100),
    taxInclusive: z.boolean().default(false),
    cessType: z.enum(['Percentage', 'Fixed', 'Per Unit']),
    cessValue: z.number().nonnegative()
});

const additionalChargeSchema = z.object({
    name: z.string(),
    amount: z.number().nonnegative(),
    gstPercent: z.number().min(0).max(100),
    hsnSac: z.string().optional().default(''),
    isTaxInclusive: z.boolean().default(false)
});

const tcsInfoSchema = z.object({
    percentage: z.number().nonnegative(),
    basis: z.enum(['taxableAmount', 'finalAmount'])
});

const transportInfoSchema = z.object({
    vehicleNumber: z.string().nullable().optional(),
    mode: z.string().nullable().optional(),
    transporterName: z.string().nullable().optional(),
    transporterId: z.string().nullable().optional(),
    docNo: z.string().nullable().optional(),
    docDate: z.string().nullable().optional(),
    approxDistance: z.number().nonnegative().optional(),
    placeOfSupply: z.string().nullable().optional(),
    dateOfSupply: z.string().nullable().optional(),
    placeOfSupplyStateCode: z.string().nullable().optional(),
    placeOfSupplyStateName: z.string().nullable().optional(),
    supplyTypeDisplay: z.enum(['intrastate', 'interstate']).nullable().optional()
});

const bankDetailsSnapshotSchema = z.object({
    bankName: z.string().nullable().optional(),
    accountHolderName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    ifscCode: z.string().nullable().optional(),
    branch: z.string().nullable().optional(),
    upiId: z.string().nullable().optional()
});

const otherDetailsSchema = z.object({
    reverseCharge: z.boolean().default(false),
    poNumber: z.string().nullable().optional(),
    poDate: z.string().nullable().optional(),
    challanNumber: z.string().nullable().optional(),
    eWayBillNumber: z.string().nullable().optional()
});

const invoiceCustomFieldSchema = z.object({
    name: z.string(),
    value: z.string()
});

// Seller snapshot – keep minimal required + passthrough
const sellerSchema = z.object({
    firmName: z.string().min(1, 'Seller firmName is required'),
    gstNumber: z.string().min(1, 'Seller GST number is required')
}).passthrough();

const baseInvoiceSchema = z.object({
    id: z.string().optional().nullable(),
    invoiceNumber: z
        .string()
        .min(1, 'invoiceNumber is required')
        .regex(/^INV-.+/, 'Invoice number must start with INV-'),
    invoiceDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    type: z.enum(['taxInvoice', 'billOfSupply']),
    status: z.enum(['draft', 'saved', 'cancelled']),
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().min(1, 'buyerName is required'),
    buyerGstin: z.string().optional().default(''),
    buyerStateCode: z.string().nullable().optional(),
    buyerStateName: z.string().nullable().optional(),
    buyerAddress: z.preprocess((val) => (val == null ? '' : val), z.string().optional().default('')),
    // Optional separate consignee details – fall back to buyer when omitted
    shippingName: z.string().optional().default(''),
    shippingGstin: z.string().optional().default(''),
    shippingAddress: z.preprocess((val) => (val == null ? '' : val), z.string().optional().default('')),
    items: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required'),
    additionalCharges: z.array(additionalChargeSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']),
    globalDiscountValue: z.number().nonnegative(),
    tcsInfo: tcsInfoSchema.nullable().optional(),
    transportInfo: transportInfoSchema.nullable().optional(),
    bankDetails: bankDetailsSnapshotSchema.nullable().optional(),
    otherDetails: otherDetailsSchema.nullable().optional(),
    customFields: z.array(invoiceCustomFieldSchema).optional().default([]),
    termsAndConditions: z.array(z.string()).optional().default([]),
    terms: z.array(z.string()).optional().default([]),
    roundOff: z.number().nullable().optional(),
    notes: z.string().optional().default(''),
    signatureUrl: z.string().nullable().optional(),
    stampUrl: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional()
});

// For creation we want different rules for saved vs draft
const savedInvoiceSchema = baseInvoiceSchema.extend({
    status: z.literal('saved')
});

const draftInvoiceSchema = baseInvoiceSchema.extend({
    status: z.literal('draft'),
    // Drafts can be partially filled
    buyerName: z.string().optional().default(''),
    items: z.array(invoiceLineItemSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']).optional().default('percentage'),
    globalDiscountValue: z.number().nonnegative().optional().default(0)
});

const cancelledInvoiceSchema = baseInvoiceSchema.extend({
    status: z.literal('cancelled')
});

const createInvoiceSchema = z.discriminatedUnion('status', [
    savedInvoiceSchema,
    draftInvoiceSchema,
    cancelledInvoiceSchema
]);

// For updates / cancel we allow partial payloads (including status-only)
const updateInvoiceSchema = baseInvoiceSchema.partial();

// --- Controller implementation ---

const invoiceController = {
    async createInvoice(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const validation = createInvoiceSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            try {
                await VoucherIndex.claimVoucherNumber(
                    userId,
                    businessId,
                    VoucherIndex.DOC_TYPES.INVOICE,
                    validation.data.invoiceNumber
                );
            } catch (err) {
                if (err.code === 'VOUCHER_NUMBER_TAKEN') {
                    return res.status(409).json({
                        message: 'Voucher number already in use',
                        code: 'VOUCHER_NUMBER_TAKEN',
                        field: 'invoiceNumber'
                    });
                }
                throw err;
            }

            let invoice;
            try {
                invoice = await Invoice.create(userId, businessId, validation.data);
            } catch (createErr) {
                await VoucherIndex.releaseVoucherNumber(
                    userId,
                    businessId,
                    VoucherIndex.DOC_TYPES.INVOICE,
                    validation.data.invoiceNumber
                ).catch(() => {});
                throw createErr;
            }

            // When not on trial, increment usage on the active subscription bound to this business.
            if (!req.onTrial && req.subscription) {
                await UserSubscription.incrementInvoicesUsed(userId, req.subscription.subscriptionId);
            }

            return res.status(201).json({ invoice });
        } catch (error) {
            console.error('Create Invoice Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async listInvoices(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const { status, fromDate, toDate, search, limit, nextToken } = req.query;
            const validStatuses = ['draft', 'saved', 'cancelled'];
            if (status && !validStatuses.includes(status)) {
                return res.status(400).json({
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}. Omit for all.`,
                    code: 'INVALID_QUERY'
                });
            }
            const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
            let exclusiveStartKey = null;
            if (nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
                } catch (_) {
                    return res.status(400).json({ message: 'Invalid nextToken' });
                }
            }

            const { items, lastEvaluatedKey } = await Invoice.listByBusiness(userId, businessId, {
                limit: parsedLimit,
                exclusiveStartKey
            });

            let invoices = items;

            // Optional filters in-memory on current page
            if (status) {
                invoices = invoices.filter((inv) => inv.status === status);
            }
            if (fromDate) {
                const from = new Date(fromDate);
                invoices = invoices.filter((inv) => inv.invoiceDate && new Date(inv.invoiceDate) >= from);
            }
            if (toDate) {
                const to = new Date(toDate);
                invoices = invoices.filter((inv) => inv.invoiceDate && new Date(inv.invoiceDate) <= to);
            }
            if (search) {
                const s = String(search).toLowerCase();
                invoices = invoices.filter((inv) => {
                    const buyerName = (inv.buyerName || '').toLowerCase();
                    const invoiceNumber = (inv.invoiceNumber || '').toLowerCase();
                    return buyerName.includes(s) || invoiceNumber.includes(s);
                });
            }

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url')
                : null;

            const invoicesWithPaid = invoices.map((inv) => ({
                ...inv,
                paidAmount: inv.paidAmount ?? 0
            }));

            return res.json({
                invoices: invoicesWithPaid,
                count: invoicesWithPaid.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List Invoices Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async getInvoice(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, invoiceId } = req.params;

            const invoice = await Invoice.getById(userId, businessId, invoiceId);
            if (!invoice) {
                return res.status(404).json({ message: 'Invoice not found' });
            }

            const invoiceWithPaid = { ...invoice, paidAmount: invoice.paidAmount ?? 0 };
            return res.json({ invoice: invoiceWithPaid });
        } catch (error) {
            console.error('Get Invoice Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async updateInvoice(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, invoiceId } = req.params;

            const validation = updateInvoiceSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const existing = await Invoice.getById(userId, businessId, invoiceId);
            if (!existing) {
                return res.status(404).json({ message: 'Invoice not found' });
            }
            if (existing.status === 'cancelled') {
                return res.status(403).json({
                    message: 'Cancelled invoices cannot be edited',
                    code: 'CANCELLED_INVOICE_EDIT_FORBIDDEN'
                });
            }

            const newNumber = validation.data.invoiceNumber;
            const oldNumber = existing.invoiceNumber;
            if (newNumber !== undefined && newNumber !== oldNumber) {
                try {
                    await VoucherIndex.updateVoucherNumber(
                        userId,
                        businessId,
                        VoucherIndex.DOC_TYPES.INVOICE,
                        oldNumber,
                        newNumber,
                        invoiceId
                    );
                } catch (err) {
                    if (err.code === 'VOUCHER_NUMBER_TAKEN') {
                        return res.status(409).json({
                            message: 'Voucher number already in use',
                            code: 'VOUCHER_NUMBER_TAKEN',
                            field: 'invoiceNumber'
                        });
                    }
                    throw err;
                }
            }

            const invoice = await Invoice.update(userId, businessId, invoiceId, validation.data);
            return res.json({ invoice });
        } catch (error) {
            console.error('Update Invoice Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async deleteInvoice(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, invoiceId } = req.params;

            const existing = await Invoice.getById(userId, businessId, invoiceId);
            if (!existing) {
                return res.status(404).json({ message: 'Invoice not found' });
            }

            await Invoice.delete(userId, businessId, invoiceId);
            await VoucherIndex.releaseVoucherNumber(
                userId,
                businessId,
                VoucherIndex.DOC_TYPES.INVOICE,
                existing.invoiceNumber
            ).catch(() => {});
            // Client accepts 200 or 204; body is ignored
            return res.status(204).send();
        } catch (error) {
            console.error('Delete Invoice Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }
};

module.exports = invoiceController;

