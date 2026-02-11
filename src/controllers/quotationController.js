const Quotation = require('../models/quotationModel');
const UserSubscription = require('../models/userSubscriptionModel');
const { z } = require('zod');

// --- Zod Schemas for Quotation (aligned with Gimbook; shared shapes mirror invoice where applicable) ---

const lineItemSchema = z.object({
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
    cessType: z.enum(['Percentage', 'Fixed']),
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

const bankDetailsSchema = z.object({
    bankName: z.string().nullable().optional(),
    accountHolderName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    ifscCode: z.string().nullable().optional(),
    branch: z.string().nullable().optional(),
    upiId: z.string().nullable().optional()
});

const customFieldSchema = z.object({
    name: z.string(),
    value: z.string()
});

const contactPersonSchema = z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal(''))
});

const sellerSchema = z.object({
    firmName: z.string().min(1, 'Seller firmName is required'),
    gstNumber: z.string().min(1, 'Seller GST number is required'),
    dispatchAddress: z.object({ street: z.string().optional() }).passthrough().nullable().optional()
}).passthrough();

const quotationStatusEnum = z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']);

const baseQuotationSchema = z.object({
    id: z.string().optional().nullable(),
    quotationNumber: z.string().min(1, 'quotationNumber is required'),
    quotationDate: z.string().nullable().optional(),
    validUntil: z.string().nullable().optional(),
    status: quotationStatusEnum,
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().optional().default(''),
    buyerGstin: z.string().optional().default(''),
    buyerAddress: z.preprocess((val) => (val == null ? '' : val), z.string().optional().default('')),
    shippingAddress: z.preprocess((val) => (val == null ? '' : val), z.string().optional().default('')),
    items: z.array(lineItemSchema).optional().default([]),
    additionalCharges: z.array(additionalChargeSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']).optional().default('percentage'),
    globalDiscountValue: z.number().nonnegative().optional().default(0),
    tcsInfo: tcsInfoSchema.nullable().optional(),
    bankDetails: bankDetailsSchema.nullable().optional(),
    contactPersons: z.array(contactPersonSchema).optional().default([]),
    customFields: z.array(customFieldSchema).optional().default([]),
    termsAndConditions: z.array(z.string()).optional().default([]),
    notes: z.string().optional().default(''),
    signatureUrl: z.string().nullable().optional(),
    stampUrl: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional()
});

const draftQuotationSchema = baseQuotationSchema.extend({
    status: z.literal('draft')
});

const sentQuotationSchema = baseQuotationSchema.extend({
    status: z.literal('sent'),
    buyerName: z.string().min(1, 'buyerName is required when status is sent'),
    items: z.array(lineItemSchema).min(1, 'At least one item is required when status is sent')
});

const otherQuotationStatusSchema = baseQuotationSchema.extend({
    status: z.enum(['accepted', 'rejected', 'expired'])
});

const createQuotationSchema = z.discriminatedUnion('status', [
    draftQuotationSchema,
    sentQuotationSchema,
    otherQuotationStatusSchema
]);

const updateQuotationSchema = baseQuotationSchema.partial();

const quotationController = {
    async createQuotation(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const validation = createQuotationSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const quotation = await Quotation.create(userId, businessId, validation.data);

            // When not on trial, increment usage on the active subscription bound to this business.
            if (!req.onTrial && req.subscription) {
                await UserSubscription.incrementQuotationsUsed(userId, req.subscription.subscriptionId);
            }

            return res.status(201).json({ quotation });
        } catch (error) {
            console.error('Create Quotation Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async listQuotations(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const { status, fromDate, toDate, search, limit, nextToken } = req.query;
            const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
            let exclusiveStartKey = null;
            if (nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
                } catch (_) {
                    return res.status(400).json({ message: 'Invalid nextToken' });
                }
            }

            const { items, lastEvaluatedKey } = await Quotation.listByBusiness(userId, businessId, {
                limit: parsedLimit,
                exclusiveStartKey
            });

            let quotations = items;

            if (status) {
                quotations = quotations.filter((q) => q.status === status);
            }
            if (fromDate) {
                const from = new Date(fromDate);
                quotations = quotations.filter((q) => q.quotationDate && new Date(q.quotationDate) >= from);
            }
            if (toDate) {
                const to = new Date(toDate);
                quotations = quotations.filter((q) => q.quotationDate && new Date(q.quotationDate) <= to);
            }
            if (search) {
                const s = String(search).toLowerCase();
                quotations = quotations.filter((q) => {
                    const buyerName = (q.buyerName || '').toLowerCase();
                    const quotationNumber = (q.quotationNumber || '').toLowerCase();
                    return buyerName.includes(s) || quotationNumber.includes(s);
                });
            }

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url')
                : null;

            return res.json({
                quotations,
                count: quotations.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List Quotations Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async getQuotation(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, quotationId } = req.params;

            const quotation = await Quotation.getById(userId, businessId, quotationId);
            if (!quotation) {
                return res.status(404).json({ message: 'Quotation not found' });
            }

            return res.json({ quotation });
        } catch (error) {
            console.error('Get Quotation Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async updateQuotation(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, quotationId } = req.params;

            const validation = updateQuotationSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const existing = await Quotation.getById(userId, businessId, quotationId);
            if (!existing) {
                return res.status(404).json({ message: 'Quotation not found' });
            }

            const quotation = await Quotation.update(userId, businessId, quotationId, validation.data);
            return res.json({ quotation });
        } catch (error) {
            console.error('Update Quotation Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async deleteQuotation(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, quotationId } = req.params;

            const existing = await Quotation.getById(userId, businessId, quotationId);
            if (!existing) {
                return res.status(404).json({ message: 'Quotation not found' });
            }

            await Quotation.delete(userId, businessId, quotationId);
            return res.status(204).send();
        } catch (error) {
            console.error('Delete Quotation Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }
};

module.exports = quotationController;
