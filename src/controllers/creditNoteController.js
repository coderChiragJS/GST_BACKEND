const CreditNote = require('../models/creditNoteModel');
const VoucherIndex = require('../models/voucherIndexModel');
const { applyGstContextToDocument } = require('../services/gstDeterminationService');
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
    supplyTypeDisplay: z.enum(['intrastate', 'interstate']).nullable().optional(),
    placeOfDelivery: z.string().nullable().optional(),
    placeOfDeliveryStateCode: z.string().nullable().optional(),
    placeOfDeliveryStateName: z.string().nullable().optional()
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

// Status for credit note – draft/saved/cancelled to mirror invoices.
const creditNoteStatusEnum = z.enum(['draft', 'saved', 'cancelled']);

const baseCreditNoteSchema = z.object({
    id: z.string().optional().nullable(),
    creditNoteId: z.string().optional().nullable(),
    // We reuse invoiceNumber & dates for compatibility with templates and clients.
    invoiceNumber: z
        .string()
        .min(1, 'Credit Note Number is required')
        .regex(/^CN-.+/, 'Credit Note number must start with CN-'),
    invoiceDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    status: creditNoteStatusEnum,
    // Reference to original invoice (for credit notes linked to invoices)
    referenceInvoiceId: z.string().nullable().optional(),
    referenceInvoiceNumber: z.string().nullable().optional(),
    referenceInvoiceDate: z.string().nullable().optional(),
    reason: z.string().optional().default(''),
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().min(1, 'buyerName is required'),
    buyerGstin: z.string().optional().default(''),
    buyerStateCode: z.string().nullable().optional(),
    buyerStateName: z.string().nullable().optional(),
    // Optional separate consignee details
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
    terms: z.array(z.string()).optional().default([]),
    roundOff: z.number().nullable().optional(),
    notes: z.string().optional().default(''),
    signatureUrl: z.string().nullable().optional(),
    stampUrl: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional()
});

const savedNoteSchema = baseCreditNoteSchema.extend({
    status: z.literal('saved')
});

const draftNoteSchema = baseCreditNoteSchema.extend({
    status: z.literal('draft'),
    buyerName: z.string().optional().default(''),
    items: z.array(lineItemSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']).optional().default('percentage'),
    globalDiscountValue: z.number().nonnegative().optional().default(0)
});

const cancelledNoteSchema = baseCreditNoteSchema.extend({
    status: z.literal('cancelled')
});

const createCreditNoteSchema = z.discriminatedUnion('status', [
    savedNoteSchema,
    draftNoteSchema,
    cancelledNoteSchema
]);

const updateCreditNoteSchema = baseCreditNoteSchema.partial();

const creditNoteController = {
    async createCreditNote(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res
                    .status(400)
                    .json({ message: 'Business ID is required in URL' });
            }

            const validation = createCreditNoteSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const gstResult = applyGstContextToDocument(validation.data, {
                requireDerivation: validation.data.status === 'saved'
            });
            if (gstResult.error) {
                return res.status(400).json({
                    message: gstResult.error,
                    code: 'GST_DETERMINATION_FAILED'
                });
            }
            const payload = gstResult.data;
            payload.invoiceNumber = VoucherIndex.normalizeVoucherNumber(payload.invoiceNumber);
            const gstWarnings = gstResult.warnings || [];

            try {
                await VoucherIndex.claimVoucherNumber(
                    userId,
                    businessId,
                    VoucherIndex.DOC_TYPES.SALES_CREDIT_NOTE,
                    payload.invoiceNumber
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

            let note;
            try {
                note = await CreditNote.create(userId, businessId, payload);
            } catch (createErr) {
                await VoucherIndex.releaseVoucherNumber(
                    userId,
                    businessId,
                    VoucherIndex.DOC_TYPES.SALES_CREDIT_NOTE,
                    payload.invoiceNumber
                ).catch((err) => { console.error('Credit note create rollback: releaseVoucherNumber failed', err); });
                throw createErr;
            }

            return res.status(201).json({
                creditNote: note,
                ...(gstWarnings.length > 0 && { warnings: gstWarnings })
            });
        } catch (error) {
            console.error('Create Credit Note Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async listCreditNotes(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res
                    .status(400)
                    .json({ message: 'Business ID is required in URL' });
            }

            const { status, fromDate, toDate, search, limit, nextToken, referenceInvoiceId } =
                req.query;
            const validStatuses = ['draft', 'saved', 'cancelled'];
            if (status && !validStatuses.includes(status)) {
                return res.status(400).json({
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}. Omit for all.`,
                    code: 'INVALID_QUERY'
                });
            }
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
                await CreditNote.listByBusiness(userId, businessId, {
                    limit: parsedLimit,
                    exclusiveStartKey
                });

            let notes = items;

            if (status) {
                notes = notes.filter((n) => n.status === status);
            }
            if (referenceInvoiceId) {
                notes = notes.filter((n) => n.referenceInvoiceId === referenceInvoiceId);
            }
            if (fromDate) {
                const from = new Date(fromDate);
                notes = notes.filter(
                    (n) => n.invoiceDate && new Date(n.invoiceDate) >= from
                );
            }
            if (toDate) {
                const to = new Date(toDate);
                notes = notes.filter(
                    (n) => n.invoiceDate && new Date(n.invoiceDate) <= to
                );
            }
            if (search) {
                const s = String(search).toLowerCase();
                notes = notes.filter((n) => {
                    const buyerName = (n.buyerName || '').toLowerCase();
                    const number = (n.invoiceNumber || '').toLowerCase();
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
                creditNotes: notes,
                count: notes.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List Credit Notes Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async getCreditNote(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, creditNoteId } = req.params;

            const note = await CreditNote.getById(
                userId,
                businessId,
                creditNoteId
            );
            if (!note) {
                return res
                    .status(404)
                    .json({ message: 'Credit Note not found' });
            }

            return res.json({ creditNote: note });
        } catch (error) {
            console.error('Get Credit Note Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async updateCreditNote(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, creditNoteId } = req.params;

            const validation = updateCreditNoteSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const existing = await CreditNote.getById(
                userId,
                businessId,
                creditNoteId
            );
            if (!existing) {
                return res
                    .status(404)
                    .json({ message: 'Credit Note not found' });
            }

            const newNumber = validation.data.invoiceNumber !== undefined
                ? VoucherIndex.normalizeVoucherNumber(validation.data.invoiceNumber)
                : undefined;
            const oldNumber = existing.invoiceNumber;
            if (newNumber !== undefined && newNumber !== oldNumber) {
                try {
                    await VoucherIndex.updateVoucherNumber(
                        userId,
                        businessId,
                        VoucherIndex.DOC_TYPES.SALES_CREDIT_NOTE,
                        oldNumber,
                        newNumber,
                        creditNoteId
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

            const merged = { ...existing, ...validation.data };
            const gstResult = applyGstContextToDocument(merged, {
                requireDerivation: merged.status === 'saved'
            });
            if (gstResult.error) {
                return res.status(400).json({
                    message: gstResult.error,
                    code: 'GST_DETERMINATION_FAILED'
                });
            }
            const updatePayload = {
                ...validation.data,
                transportInfo: gstResult.data.transportInfo
            };
            if (updatePayload.invoiceNumber !== undefined) {
                updatePayload.invoiceNumber = VoucherIndex.normalizeVoucherNumber(updatePayload.invoiceNumber);
            }
            const gstWarnings = gstResult.warnings || [];

            const note = await CreditNote.update(
                userId,
                businessId,
                creditNoteId,
                updatePayload
            );
            return res.json({
                creditNote: note,
                ...(gstWarnings.length > 0 && { warnings: gstWarnings })
            });
        } catch (error) {
            console.error('Update Credit Note Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async deleteCreditNote(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, creditNoteId } = req.params;

            const existing = await CreditNote.getById(
                userId,
                businessId,
                creditNoteId
            );
            if (!existing) {
                return res
                    .status(404)
                    .json({ message: 'Credit Note not found' });
            }

            await CreditNote.delete(
                userId,
                businessId,
                creditNoteId
            );
            await VoucherIndex.releaseVoucherNumber(
                userId,
                businessId,
                VoucherIndex.DOC_TYPES.SALES_CREDIT_NOTE,
                existing.invoiceNumber
            ).catch((err) => { console.error('Credit note delete: releaseVoucherNumber failed', err); });
            return res.status(204).send();
        } catch (error) {
            console.error('Delete Credit Note Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    }
};

module.exports = creditNoteController;
