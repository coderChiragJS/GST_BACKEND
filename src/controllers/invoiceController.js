const Invoice = require('../models/invoiceModel');
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
    dateOfSupply: z.string().nullable().optional()
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
    invoiceNumber: z.string().min(1, 'invoiceNumber is required'),
    invoiceDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    type: z.enum(['taxInvoice', 'billOfSupply']),
    status: z.enum(['draft', 'saved', 'cancelled']),
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().min(1, 'buyerName is required'),
    buyerGstin: z.string().optional().default(''),
    buyerAddress: z.string().optional().default(''),
    shippingAddress: z.string().optional().default(''),
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
                    details: validation.error.errors
                });
            }

            const invoice = await Invoice.create(userId, businessId, validation.data);

            // Respond in a way compatible with Flutter client: data['invoice'] ?? data
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

            const { status, fromDate, toDate, search } = req.query;

            let invoices = await Invoice.listByBusiness(userId, businessId);

            // Optional filters in-memory (good enough for now)
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

            // Compatible with client: can handle array or { invoices }
            return res.json({
                invoices,
                count: invoices.length
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

            return res.json({ invoice });
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
                    details: validation.error.errors
                });
            }

            const existing = await Invoice.getById(userId, businessId, invoiceId);
            if (!existing) {
                return res.status(404).json({ message: 'Invoice not found' });
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
            // Client accepts 200 or 204; body is ignored
            return res.status(204).send();
        } catch (error) {
            console.error('Delete Invoice Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }
};

module.exports = invoiceController;

