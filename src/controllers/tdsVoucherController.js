const TdsVoucher = require('../models/tdsVoucherModel');
const Invoice = require('../models/invoiceModel');
const VoucherIndex = require('../models/voucherIndexModel');
const { getInvoiceBalanceInfo, round2 } = require('../utils/invoiceBalance');
const { z } = require('zod');
const accountService = require('../services/accountService');

const tdsAllocationSchema = z.object({
    invoiceId: z.string().min(1),
    invoiceNumber: z.string().min(1),
    tdsAllocated: z.number().nonnegative()
});

const createVoucherSchema = z.object({
    voucherNumber: z.string().min(1, 'Voucher number is required').regex(/^TD.+/, 'Voucher number must start with TD'),
    voucherDate: z.string().min(1, 'Voucher date is required'),
    partyId: z.string().nullable().optional(),
    partyName: z.string().min(1, 'Party name is required'),
    tdsAmountCollected: z.number().nonnegative(),
    allocations: z.array(tdsAllocationSchema).min(1, 'At least one allocation is required')
});

const updateVoucherSchema = z.object({
    voucherNumber: z.string().min(1).regex(/^TD.+/).optional(),
    voucherDate: z.string().optional(),
    partyId: z.string().nullable().optional(),
    partyName: z.string().optional(),
    tdsAmountCollected: z.number().nonnegative().optional(),
    allocations: z.array(tdsAllocationSchema).optional()
});

const tdsVoucherController = {
    async listInvoicesForParty(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const { partyId, limit, nextToken } = req.query;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }
            if (!partyId) {
                return res.status(400).json({ message: 'partyId query is required' });
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

            const filtered = (items || []).filter((inv) => inv.buyerId === partyId);
            const result = [];

            for (const inv of filtered) {
                const info = await getInvoiceBalanceInfo(userId, businessId, inv.invoiceId);
                if (!info) continue;
                result.push({
                    invoiceId: inv.invoiceId,
                    invoiceNumber: inv.invoiceNumber || '',
                    invoiceDate: inv.invoiceDate || '',
                    grandTotal: info.grandTotal,
                    paidAmount: info.paidAmount,
                    tdsAmount: info.tdsAmount,
                    balanceDue: info.balanceDue
                });
            }

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url')
                : null;

            return res.json({
                invoices: result,
                count: result.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List Invoices for Party (TDS) Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async createVoucher(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const validation = createVoucherSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const voucherNumber = VoucherIndex.normalizeVoucherNumber(validation.data.voucherNumber);
            const { voucherDate, partyId, partyName, tdsAmountCollected, allocations } = validation.data;

            const sumTdsAllocated = allocations.reduce((s, a) => s + a.tdsAllocated, 0);
            if (round2(sumTdsAllocated) > round2(tdsAmountCollected)) {
                return res.status(400).json({
                    message: 'Sum of TDS allocated cannot exceed TDS amount collected',
                    code: 'VALIDATION_FAILED'
                });
            }

            // Total TDS allocated per invoice (same invoice can appear in multiple allocation rows)
            const tdsPerInvoice = {};
            for (const alloc of allocations) {
                tdsPerInvoice[alloc.invoiceId] = round2((tdsPerInvoice[alloc.invoiceId] ?? 0) + alloc.tdsAllocated);
            }
            for (const [invId, totalTds] of Object.entries(tdsPerInvoice)) {
                const info = await getInvoiceBalanceInfo(userId, businessId, invId);
                if (!info) {
                    return res.status(400).json({
                        message: `Invoice not found: ${invId}`,
                        code: 'INVALID_ALLOCATION'
                    });
                }
                if (partyId != null && info.invoice.buyerId != null && info.invoice.buyerId !== partyId) {
                    return res.status(400).json({
                        message: `Invoice ${info.invoice.invoiceNumber || invId} does not belong to the selected party`,
                        code: 'INVALID_ALLOCATION'
                    });
                }
                if (round2(totalTds) > round2(info.balanceDue)) {
                    return res.status(400).json({
                        message: `Total TDS allocated for invoice ${info.invoice.invoiceNumber || invId} exceeds balance due`,
                        code: 'INVALID_ALLOCATION'
                    });
                }
            }

            try {
                await VoucherIndex.claimVoucherNumber(userId, businessId, VoucherIndex.DOC_TYPES.TDS_VOUCHER, voucherNumber);
            } catch (err) {
                if (err.code === 'VOUCHER_NUMBER_TAKEN') {
                    return res.status(409).json({
                        message: 'Voucher number already in use',
                        code: 'VOUCHER_NUMBER_TAKEN',
                        field: 'voucherNumber'
                    });
                }
                throw err;
            }

            let voucher;
            try {
                voucher = await TdsVoucher.create(userId, businessId, {
                    voucherNumber,
                    voucherDate,
                    partyId: partyId || null,
                    partyName,
                    tdsAmountCollected,
                    allocations
                });
            } catch (createErr) {
                await VoucherIndex.releaseVoucherNumber(userId, businessId, VoucherIndex.DOC_TYPES.TDS_VOUCHER, voucherNumber).catch((err) => { console.error('TDS voucher create rollback: releaseVoucherNumber failed', err); });
                throw createErr;
            }

            for (const alloc of allocations) {
                await Invoice.atomicIncrement(userId, businessId, alloc.invoiceId, 'tdsAmount', round2(alloc.tdsAllocated));
            }

            // Optional: record TDS as money flowing out from default cash/bank (fire-and-forget)
            accountService
                .withdrawMoney(userId, businessId, null, {
                    amount: tdsAmountCollected,
                    type: 'tds',
                    referenceType: 'TDS_VOUCHER',
                    referenceId: voucher.tdsVoucherId || voucher.id,
                    referenceNumber: voucher.voucherNumber,
                    narration: `TDS voucher for ${partyName}`
                })
                .catch((err) => {
                    console.error('Account withdrawMoney for TDS voucher failed:', err);
                });

            return res.status(201).json({ voucher });
        } catch (error) {
            console.error('Create TDS Voucher Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async listVouchers(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;

            if (!businessId) {
                return res.status(400).json({ message: 'Business ID is required in URL' });
            }

            const { partyId, fromDate, toDate, limit, nextToken, search, q } = req.query;
            const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
            const searchTerm = (search || q || '').toString().trim().toLowerCase();
            let exclusiveStartKey = null;
            if (nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
                } catch (_) {
                    return res.status(400).json({ message: 'Invalid nextToken' });
                }
            }

            const { items, lastEvaluatedKey } = await TdsVoucher.listByBusiness(userId, businessId, {
                limit: parsedLimit,
                exclusiveStartKey
            });

            let vouchers = items || [];

            if (partyId) {
                vouchers = vouchers.filter((v) => v.partyId === partyId);
            }
            if (fromDate) {
                const from = new Date(fromDate);
                vouchers = vouchers.filter((v) => v.voucherDate && new Date(v.voucherDate) >= from);
            }
            if (toDate) {
                const to = new Date(toDate);
                vouchers = vouchers.filter((v) => v.voucherDate && new Date(v.voucherDate) <= to);
            }
            if (searchTerm) {
                vouchers = vouchers.filter((v) => {
                    const voucherNum = (v.voucherNumber || '').toString().toLowerCase();
                    const party = (v.partyName || '').toString().toLowerCase();
                    return voucherNum.includes(searchTerm) || party.includes(searchTerm);
                });
            }

            const nextTokenOut = lastEvaluatedKey
                ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url')
                : null;

            return res.json({
                vouchers,
                count: vouchers.length,
                ...(nextTokenOut && { nextToken: nextTokenOut })
            });
        } catch (error) {
            console.error('List TDS Vouchers Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async getVoucher(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, voucherId } = req.params;

            const voucher = await TdsVoucher.getById(userId, businessId, voucherId);
            if (!voucher) {
                return res.status(404).json({ message: 'TDS voucher not found' });
            }

            return res.json({ voucher });
        } catch (error) {
            console.error('Get TDS Voucher Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async updateVoucher(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, voucherId } = req.params;

            const validation = updateVoucherSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Validation failed',
                    error: validation.error.errors[0].message,
                    details: validation.error.errors,
                    code: 'VALIDATION_FAILED'
                });
            }

            const existing = await TdsVoucher.getById(userId, businessId, voucherId);
            if (!existing) {
                return res.status(404).json({ message: 'TDS voucher not found' });
            }

            const updates = validation.data;
            if (updates.voucherNumber !== undefined) {
                updates.voucherNumber = VoucherIndex.normalizeVoucherNumber(updates.voucherNumber);
            }
            const hasNewAllocations = updates.allocations !== undefined;

            if (hasNewAllocations) {
                const allocations = updates.allocations;
                const sumTdsAllocated = allocations.reduce((s, a) => s + a.tdsAllocated, 0);
                const tdsAmountCollected = updates.tdsAmountCollected != null ? updates.tdsAmountCollected : existing.tdsAmountCollected;
                if (round2(sumTdsAllocated) > round2(tdsAmountCollected)) {
                    return res.status(400).json({
                        message: 'Sum of TDS allocated cannot exceed TDS amount collected',
                        code: 'VALIDATION_FAILED'
                    });
                }

                // Total TDS allocated per invoice in new allocations (same invoice can appear in multiple rows)
                const newTdsPerInvoice = {};
                for (const alloc of allocations) {
                    newTdsPerInvoice[alloc.invoiceId] = round2((newTdsPerInvoice[alloc.invoiceId] ?? 0) + alloc.tdsAllocated);
                }
                const partyIdForUpdate = updates.partyId != null ? updates.partyId : existing.partyId;
                for (const [invId, totalNewTds] of Object.entries(newTdsPerInvoice)) {
                    const info = await getInvoiceBalanceInfo(userId, businessId, invId);
                    if (!info) {
                        return res.status(400).json({
                            message: `Invoice not found: ${invId}`,
                            code: 'INVALID_ALLOCATION'
                        });
                    }
                    if (partyIdForUpdate != null && info.invoice.buyerId != null && info.invoice.buyerId !== partyIdForUpdate) {
                        return res.status(400).json({
                            message: `Invoice ${info.invoice.invoiceNumber || invId} does not belong to the selected party`,
                            code: 'INVALID_ALLOCATION'
                        });
                    }
                    const alreadyTdsForThisInvoice = (existing.allocations || []).reduce((s, a) => s + (a.invoiceId === invId ? a.tdsAllocated : 0), 0);
                    const balanceAfterRevert = round2(info.balanceDue + alreadyTdsForThisInvoice);
                    if (round2(totalNewTds) > round2(balanceAfterRevert)) {
                        return res.status(400).json({
                            message: `Total TDS allocated for invoice ${info.invoice.invoiceNumber || invId} exceeds balance due`,
                            code: 'INVALID_ALLOCATION'
                        });
                    }
                }

                for (const alloc of existing.allocations || []) {
                    await Invoice.atomicIncrement(userId, businessId, alloc.invoiceId, 'tdsAmount', -round2(alloc.tdsAllocated));
                }

                for (const alloc of allocations) {
                    await Invoice.atomicIncrement(userId, businessId, alloc.invoiceId, 'tdsAmount', round2(alloc.tdsAllocated));
                }
            }

            if (updates.voucherNumber !== undefined && updates.voucherNumber !== existing.voucherNumber) {
                try {
                    await VoucherIndex.updateVoucherNumber(
                        userId,
                        businessId,
                        VoucherIndex.DOC_TYPES.TDS_VOUCHER,
                        existing.voucherNumber,
                        updates.voucherNumber,
                        voucherId
                    );
                } catch (err) {
                    if (err.code === 'VOUCHER_NUMBER_TAKEN') {
                        return res.status(409).json({
                            message: 'Voucher number already in use',
                            code: 'VOUCHER_NUMBER_TAKEN',
                            field: 'voucherNumber'
                        });
                    }
                    throw err;
                }
            }

            const updatePayload = { ...updates };
            const voucher = await TdsVoucher.update(userId, businessId, voucherId, updatePayload);
            return res.json({ voucher });
        } catch (error) {
            console.error('Update TDS Voucher Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    },

    async deleteVoucher(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, voucherId } = req.params;

            const existing = await TdsVoucher.getById(userId, businessId, voucherId);
            if (!existing) {
                return res.status(404).json({ message: 'TDS voucher not found' });
            }

            for (const alloc of existing.allocations || []) {
                await Invoice.atomicIncrement(userId, businessId, alloc.invoiceId, 'tdsAmount', -round2(alloc.tdsAllocated));
            }

            // Reverse TDS account effect (best-effort)
            accountService
                .addMoney(userId, businessId, null, {
                    amount: existing.tdsAmountCollected,
                    type: 'tds-reversal',
                    referenceType: 'TDS_VOUCHER',
                    referenceId: existing.tdsVoucherId || existing.id,
                    referenceNumber: existing.voucherNumber,
                    narration: 'Delete TDS voucher'
                })
                .catch((err) => {
                    console.error('Account addMoney for TDS voucher delete failed:', err);
                });

            await TdsVoucher.delete(userId, businessId, voucherId);
            await VoucherIndex.releaseVoucherNumber(
                userId,
                businessId,
                VoucherIndex.DOC_TYPES.TDS_VOUCHER,
                existing.voucherNumber
            ).catch((err) => { console.error('TDS voucher delete: releaseVoucherNumber failed', err); });

            return res.status(204).send();
        } catch (error) {
            console.error('Delete TDS Voucher Error:', error);
            return res.status(500).json({
                message: 'Internal Server Error'
            });
        }
    }
};

module.exports = tdsVoucherController;
