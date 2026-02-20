const PaymentReceipt = require('../models/paymentReceiptModel');
const Invoice = require('../models/invoiceModel');
const VoucherIndex = require('../models/voucherIndexModel');
const { computeInvoiceTotals } = require('../services/invoiceCalculationService');
const { z } = require('zod');

const PAYMENT_MODES = ['Cash', 'Cheque', 'Net Banking', 'UPI', 'Card', 'Other'];

const allocationSchema = z.object({
    invoiceId: z.string().min(1),
    invoiceNumber: z.string().min(1),
    invoiceTotalAmount: z.number().nonnegative(),
    allocatedAmount: z.number().nonnegative(),
    dueAmount: z.number().nonnegative().optional()
});

const createReceiptSchema = z.object({
    receiptNumber: z.string().min(1, 'Receipt number is required').regex(/^PR.+/, 'Receipt number must start with PR'),
    receiptDate: z.string().min(1, 'Receipt date is required'),
    partyId: z.string().nullable().optional(),
    partyName: z.string().min(1, 'Party name is required'),
    amountCollected: z.number().nonnegative(),
    paymentMode: z.enum(PAYMENT_MODES),
    accountId: z.string().nullable().optional(),
    accountName: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    tdsAmount: z.number().nonnegative().optional().default(0),
    allocations: z.array(allocationSchema).min(1, 'At least one allocation is required')
});

const updateReceiptSchema = z.object({
    receiptNumber: z.string().min(1).regex(/^PR.+/).optional(),
    receiptDate: z.string().optional(),
    partyId: z.string().nullable().optional(),
    partyName: z.string().optional(),
    amountCollected: z.number().nonnegative().optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    accountId: z.string().nullable().optional(),
    accountName: z.string().optional(),
    notes: z.string().optional(),
    tdsAmount: z.number().nonnegative().optional(),
    allocations: z.array(allocationSchema).optional()
});

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getInvoiceGrandTotalAndPaid(userId, businessId, invoiceId) {
    const invoice = await Invoice.getById(userId, businessId, invoiceId);
    if (!invoice) return null;
    const totals = computeInvoiceTotals(invoice);
    const grandTotal = totals?.summary?.grandTotal ?? 0;
    const paidAmount = invoice.paidAmount != null ? Number(invoice.paidAmount) : 0;
    const balanceDue = round2(grandTotal - paidAmount);
    return { invoice, grandTotal: round2(grandTotal), paidAmount: round2(paidAmount), balanceDue };
}

const paymentReceiptController = {
    async createReceipt(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const validation = createReceiptSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const { receiptNumber, receiptDate, partyId, partyName, amountCollected, paymentMode, accountId, accountName, notes, tdsAmount, allocations } = validation.data;

            const sumAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
            if (round2(sumAllocated) > round2(amountCollected)) {
                return res.status(400).json({
                    message: 'Sum of allocated amounts cannot exceed amount collected',
                    code: 'VALIDATION_FAILED'
                });
            }

            for (const alloc of allocations) {
                const info = await getInvoiceGrandTotalAndPaid(userId, businessId, alloc.invoiceId);
                if (!info) {
                    return res.status(400).json({
                        message: `Invoice not found: ${alloc.invoiceId}`,
                        code: 'INVALID_ALLOCATION'
                    });
                }
                if (round2(alloc.allocatedAmount) > round2(info.balanceDue)) {
                    return res.status(400).json({
                        message: `Allocated amount for invoice ${alloc.invoiceNumber} exceeds balance due`,
                        code: 'INVALID_ALLOCATION'
                    });
                }
            }

            try {
                await VoucherIndex.claimVoucherNumber(userId, businessId, VoucherIndex.DOC_TYPES.PAYMENT_RECEIPT, receiptNumber);
            } catch (err) {
                if (err.code === 'VOUCHER_NUMBER_TAKEN') {
                    return res.status(409).json({
                        message: 'Receipt number already in use',
                        code: 'VOUCHER_NUMBER_TAKEN',
                        field: 'receiptNumber'
                    });
                }
                throw err;
            }

            let receipt;
            try {
                receipt = await PaymentReceipt.create(userId, businessId, {
                    receiptNumber,
                    receiptDate,
                    partyId: partyId || null,
                    partyName,
                    amountCollected,
                    paymentMode,
                    accountId: accountId || null,
                    accountName: accountName || '',
                    notes: notes || '',
                    tdsAmount: tdsAmount ?? 0,
                    allocations
                });
            } catch (createErr) {
                await VoucherIndex.releaseVoucherNumber(userId, businessId, VoucherIndex.DOC_TYPES.PAYMENT_RECEIPT, receiptNumber).catch(() => {});
                throw createErr;
            }

            for (const alloc of allocations) {
                const info = await getInvoiceGrandTotalAndPaid(userId, businessId, alloc.invoiceId);
                const newPaid = round2((info.paidAmount ?? 0) + alloc.allocatedAmount);
                await Invoice.update(userId, businessId, alloc.invoiceId, { paidAmount: newPaid });
            }

            return res.status(201).json({ receipt });
        } catch (error) {
            console.error('Create Payment Receipt Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async listReceipts(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const { partyId, fromDate, toDate, limit, nextToken } = req.query;
            const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
            let exclusiveStartKey = null;
            if (nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
                } catch (_) {
                    return res.status(400).json({ message: 'Invalid nextToken' });
                }
            }

            const { items, lastEvaluatedKey } = await PaymentReceipt.listByBusiness(userId, businessId, {
                limit: parsedLimit,
                exclusiveStartKey
            });

            let receipts = items;

            if (partyId) {
                receipts = receipts.filter((r) => r.partyId === partyId);
            }
            if (fromDate) {
                const from = new Date(fromDate);
                receipts = receipts.filter((r) => r.receiptDate && new Date(r.receiptDate) >= from);
            }
            if (toDate) {
                const to = new Date(toDate);
                receipts = receipts.filter((r) => r.receiptDate && new Date(r.receiptDate) <= to);
            }

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url')
                : null;

            return res.json({
                receipts,
                count: receipts.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List Payment Receipts Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async getReceipt(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, receiptId } = req.params;

            const receipt = await PaymentReceipt.getById(userId, businessId, receiptId);
            if (!receipt) {
                return res.status(404).json({ message: 'Payment receipt not found' });
            }

            return res.json({ receipt });
        } catch (error) {
            console.error('Get Payment Receipt Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async updateReceipt(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, receiptId } = req.params;

            const validation = updateReceiptSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const existing = await PaymentReceipt.getById(userId, businessId, receiptId);
            if (!existing) {
                return res.status(404).json({ message: 'Payment receipt not found' });
            }

            const updates = validation.data;
            const hasNewAllocations = updates.allocations !== undefined;

            if (hasNewAllocations) {
                const allocations = updates.allocations;
                const sumAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
                const amountCollected = updates.amountCollected != null ? updates.amountCollected : existing.amountCollected;
                if (round2(sumAllocated) > round2(amountCollected)) {
                    return res.status(400).json({
                        message: 'Sum of allocated amounts cannot exceed amount collected',
                        code: 'VALIDATION_FAILED'
                    });
                }

                for (const alloc of allocations) {
                    const info = await getInvoiceGrandTotalAndPaid(userId, businessId, alloc.invoiceId);
                    if (!info) {
                        return res.status(400).json({
                            message: `Invoice not found: ${alloc.invoiceId}`,
                            code: 'INVALID_ALLOCATION'
                        });
                    }
                    const existingAlloc = (existing.allocations || []).find((a) => a.invoiceId === alloc.invoiceId);
                    const alreadyPaidForThisInvoice = (existing.allocations || []).reduce((s, a) => s + (a.invoiceId === alloc.invoiceId ? a.allocatedAmount : 0), 0);
                    const balanceAfterRevert = round2(info.balanceDue + alreadyPaidForThisInvoice);
                    if (round2(alloc.allocatedAmount) > round2(balanceAfterRevert)) {
                        return res.status(400).json({
                            message: `Allocated amount for invoice ${alloc.invoiceNumber} exceeds balance due`,
                            code: 'INVALID_ALLOCATION'
                        });
                    }
                }

                for (const alloc of existing.allocations || []) {
                    const info = await getInvoiceGrandTotalAndPaid(userId, businessId, alloc.invoiceId);
                    if (info) {
                        const newPaid = round2(Math.max(0, (info.paidAmount ?? 0) - alloc.allocatedAmount));
                        await Invoice.update(userId, businessId, alloc.invoiceId, { paidAmount: newPaid });
                    }
                }

                for (const alloc of allocations) {
                    const info = await getInvoiceGrandTotalAndPaid(userId, businessId, alloc.invoiceId);
                    const newPaid = round2((info.paidAmount ?? 0) + alloc.allocatedAmount);
                    await Invoice.update(userId, businessId, alloc.invoiceId, { paidAmount: newPaid });
                }
            }

            if (updates.receiptNumber !== undefined && updates.receiptNumber !== existing.receiptNumber) {
                try {
                    await VoucherIndex.updateVoucherNumber(
                        userId,
                        businessId,
                        VoucherIndex.DOC_TYPES.PAYMENT_RECEIPT,
                        existing.receiptNumber,
                        updates.receiptNumber,
                        receiptId
                    );
                } catch (err) {
                    if (err.code === 'VOUCHER_NUMBER_TAKEN') {
                        return res.status(409).json({
                            message: 'Receipt number already in use',
                            code: 'VOUCHER_NUMBER_TAKEN',
                            field: 'receiptNumber'
                        });
                    }
                    throw err;
                }
            }

            const updatePayload = { ...updates };
            const receipt = await PaymentReceipt.update(userId, businessId, receiptId, updatePayload);
            return res.json({ receipt });
        } catch (error) {
            console.error('Update Payment Receipt Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    },

    async deleteReceipt(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, receiptId } = req.params;

            const existing = await PaymentReceipt.getById(userId, businessId, receiptId);
            if (!existing) {
                return res.status(404).json({ message: 'Payment receipt not found' });
            }

            for (const alloc of existing.allocations || []) {
                const info = await getInvoiceGrandTotalAndPaid(userId, businessId, alloc.invoiceId);
                if (info) {
                    const newPaid = round2(Math.max(0, (info.paidAmount ?? 0) - alloc.allocatedAmount));
                    await Invoice.update(userId, businessId, alloc.invoiceId, { paidAmount: newPaid });
                }
            }

            await PaymentReceipt.delete(userId, businessId, receiptId);
            await VoucherIndex.releaseVoucherNumber(
                userId,
                businessId,
                VoucherIndex.DOC_TYPES.PAYMENT_RECEIPT,
                existing.receiptNumber
            ).catch(() => {});

            return res.status(204).send();
        } catch (error) {
            console.error('Delete Payment Receipt Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error',
                error: error.message
            });
        }
    }
};

module.exports = paymentReceiptController;
