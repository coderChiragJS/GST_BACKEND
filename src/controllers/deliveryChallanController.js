const DeliveryChallan = require('../models/deliveryChallanModel');
const { z } = require('zod');

// Zod schemas – mirror invoice structure so we can reuse totals + templates.

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

const customFieldSchema = z.object({
    name: z.string(),
    value: z.string()
});

const sellerSchema = z.object({
    firmName: z.string().min(1, 'Seller firmName is required'),
    gstNumber: z.string().min(1, 'Seller GST number is required')
}).passthrough();

// Status for delivery challan – pending/delivered/cancelled
const deliveryChallanStatusEnum = z.enum(['pending', 'delivered', 'cancelled']);

const baseDeliveryChallanSchema = z.object({
    id: z.string().optional().nullable(),
    deliveryChallanId: z.string().optional().nullable(),
    // Primary challan fields
    challanNumber: z.string().min(1, 'Challan Number is required'),
    challanDate: z.string().nullable().optional(),
    status: deliveryChallanStatusEnum,
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().min(1, 'buyerName is required'),
    buyerGstin: z.string().optional().default(''),
    // Optional separate consignee details – fall back to buyer when omitted
    shippingName: z.string().optional().default(''),
    shippingGstin: z.string().optional().default(''),
    buyerAddress: z.preprocess(
        (val) => (val == null ? '' : val),
        z.string().optional().default('')
    ),
    shippingAddress: z.preprocess(
        (val) => (val == null ? '' : val),
        z.string().optional().default('')
    ),
    items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
    additionalCharges: z.array(additionalChargeSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']),
    globalDiscountValue: z.number().nonnegative(),
    tcsInfo: tcsInfoSchema.nullable().optional(),
    transportInfo: transportInfoSchema.nullable().optional(),
    bankDetails: bankDetailsSnapshotSchema.nullable().optional(),
    otherDetails: otherDetailsSchema.nullable().optional(),
    customFields: z.array(customFieldSchema).optional().default([]),
    termsAndConditions: z.array(z.string()).optional().default([]),
    notes: z.string().optional().default(''),
    signatureUrl: z.string().nullable().optional(),
    stampUrl: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional()
});

const deliveredChallanSchema = baseDeliveryChallanSchema.extend({
    status: z.literal('delivered')
});

const pendingChallanSchema = baseDeliveryChallanSchema.extend({
    status: z.literal('pending'),
    buyerName: z.string().optional().default(''),
    items: z.array(lineItemSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']).optional().default('percentage'),
    globalDiscountValue: z.number().nonnegative().optional().default(0)
});

const cancelledChallanSchema = baseDeliveryChallanSchema.extend({
    status: z.literal('cancelled')
});

const createDeliveryChallanSchema = z.discriminatedUnion('status', [
    deliveredChallanSchema,
    pendingChallanSchema,
    cancelledChallanSchema
]);

const updateDeliveryChallanSchema = baseDeliveryChallanSchema.partial();

const deliveryChallanController = {
    async createDeliveryChallan(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res
                    .status(400)
                    .json({ message: 'Business ID is required in URL' });
            }

            const validation = createDeliveryChallanSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const challan = await DeliveryChallan.create(
                userId,
                businessId,
                validation.data
            );

            // For now, delivery challans do not consume invoice / quotation usage.

            return res.status(201).json({ deliveryChallan: challan });
        } catch (error) {
            console.error('Create Delivery Challan Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async listDeliveryChallans(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res
                    .status(400)
                    .json({ message: 'Business ID is required in URL' });
            }

            const { status, fromDate, toDate, search, limit, nextToken } =
                req.query;
            const parsedLimit = Math.min(
                Math.max(parseInt(limit, 10) || 100, 1),
                100
            );
            let exclusiveStartKey = null;
            if (nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(
                        Buffer.from(nextToken, 'base64url').toString('utf8')
                    );
                } catch (_) {
                    return res
                        .status(400)
                        .json({ message: 'Invalid nextToken' });
                }
            }

            const { items, lastEvaluatedKey } =
                await DeliveryChallan.listByBusiness(userId, businessId, {
                    limit: parsedLimit,
                    exclusiveStartKey
                });

            let challans = items;

            if (status) {
                challans = challans.filter((c) => c.status === status);
            }
            if (fromDate) {
                const from = new Date(fromDate);
                challans = challans.filter(
                    (c) => c.challanDate && new Date(c.challanDate) >= from
                );
            }
            if (toDate) {
                const to = new Date(toDate);
                challans = challans.filter(
                    (c) => c.challanDate && new Date(c.challanDate) <= to
                );
            }
            if (search) {
                const s = String(search).toLowerCase();
                challans = challans.filter((c) => {
                    const buyerName = (c.buyerName || '').toLowerCase();
                    const number = (c.challanNumber || '').toLowerCase();
                    return (
                        buyerName.includes(s) ||
                        number.includes(s)
                    );
                });
            }

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString(
                      'base64url'
                  )
                : null;

            return res.json({
                deliveryChallans: challans,
                count: challans.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List Delivery Challans Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async getDeliveryChallan(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, challanId } = req.params;

            const challan = await DeliveryChallan.getById(
                userId,
                businessId,
                challanId
            );
            if (!challan) {
                return res
                    .status(404)
                    .json({ message: 'Delivery Challan not found' });
            }

            return res.json({ deliveryChallan: challan });
        } catch (error) {
            console.error('Get Delivery Challan Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async updateDeliveryChallan(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, challanId } = req.params;

            const validation = updateDeliveryChallanSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const existing = await DeliveryChallan.getById(
                userId,
                businessId,
                challanId
            );
            if (!existing) {
                return res
                    .status(404)
                    .json({ message: 'Delivery Challan not found' });
            }

            const challan = await DeliveryChallan.update(
                userId,
                businessId,
                challanId,
                validation.data
            );
            return res.json({ deliveryChallan: challan });
        } catch (error) {
            console.error('Update Delivery Challan Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async deleteDeliveryChallan(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, challanId } = req.params;

            const existing = await DeliveryChallan.getById(
                userId,
                businessId,
                challanId
            );
            if (!existing) {
                return res
                    .status(404)
                    .json({ message: 'Delivery Challan not found' });
            }

            await DeliveryChallan.delete(
                userId,
                businessId,
                challanId
            );
            return res.status(204).send();
        } catch (error) {
            console.error('Delete Delivery Challan Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    }
};

module.exports = deliveryChallanController;
