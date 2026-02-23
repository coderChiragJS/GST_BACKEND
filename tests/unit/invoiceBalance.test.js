const Invoice = require('../../src/models/invoiceModel');
const { computeInvoiceTotals } = require('../../src/services/invoiceCalculationService');
const { getInvoiceBalanceInfo, round2 } = require('../../src/utils/invoiceBalance');

jest.mock('../../src/models/invoiceModel');
jest.mock('../../src/services/invoiceCalculationService');

describe('invoiceBalance', () => {
    describe('round2', () => {
        test('rounds to 2 decimals', () => {
            expect(round2(1.005)).toBe(1.01);
            expect(round2(1.004)).toBe(1);
            expect(round2(100.115)).toBe(100.12);
            expect(round2(0)).toBe(0);
            expect(round2(99.99)).toBe(99.99);
        });
    });

    describe('getInvoiceBalanceInfo', () => {
        const userId = 'u1';
        const businessId = 'b1';
        const invoiceId = 'inv1';

        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('returns null when invoice not found', async () => {
            Invoice.getById.mockResolvedValue(null);
            const result = await getInvoiceBalanceInfo(userId, businessId, invoiceId);
            expect(result).toBeNull();
            expect(Invoice.getById).toHaveBeenCalledWith(userId, businessId, invoiceId);
            expect(computeInvoiceTotals).not.toHaveBeenCalled();
        });

        test('balanceDue = grandTotal - paidAmount - tdsAmount (no payments)', async () => {
            const invoice = { invoiceId, paidAmount: null, tdsAmount: null };
            Invoice.getById.mockResolvedValue(invoice);
            computeInvoiceTotals.mockReturnValue({ summary: { grandTotal: 1000 } });
            const result = await getInvoiceBalanceInfo(userId, businessId, invoiceId);
            expect(result).not.toBeNull();
            expect(result.grandTotal).toBe(1000);
            expect(result.paidAmount).toBe(0);
            expect(result.tdsAmount).toBe(0);
            expect(result.balanceDue).toBe(1000);
        });

        test('balanceDue = grandTotal - paidAmount - tdsAmount (with paid and TDS)', async () => {
            const invoice = { invoiceId, paidAmount: 400, tdsAmount: 50 };
            Invoice.getById.mockResolvedValue(invoice);
            computeInvoiceTotals.mockReturnValue({ summary: { grandTotal: 1000 } });
            const result = await getInvoiceBalanceInfo(userId, businessId, invoiceId);
            expect(result).not.toBeNull();
            expect(result.grandTotal).toBe(1000);
            expect(result.paidAmount).toBe(400);
            expect(result.tdsAmount).toBe(50);
            expect(result.balanceDue).toBe(550);
        });

        test('balanceDue rounds to 2 decimals', async () => {
            const invoice = { invoiceId, paidAmount: 100, tdsAmount: 0 };
            Invoice.getById.mockResolvedValue(invoice);
            computeInvoiceTotals.mockReturnValue({ summary: { grandTotal: 333.33 } });
            const result = await getInvoiceBalanceInfo(userId, businessId, invoiceId);
            expect(result.balanceDue).toBe(233.33);
        });

        test('uses invoice.paidAmount and invoice.tdsAmount when set', async () => {
            const invoice = { invoiceId, paidAmount: 100.5, tdsAmount: 10.25 };
            Invoice.getById.mockResolvedValue(invoice);
            computeInvoiceTotals.mockReturnValue({ summary: { grandTotal: 200 } });
            const result = await getInvoiceBalanceInfo(userId, businessId, invoiceId);
            expect(result.paidAmount).toBe(100.5);
            expect(result.tdsAmount).toBe(10.25);
            expect(result.balanceDue).toBe(89.25);
        });

        test('handles grandTotal from computeInvoiceTotals undefined', async () => {
            const invoice = { invoiceId };
            Invoice.getById.mockResolvedValue(invoice);
            computeInvoiceTotals.mockReturnValue({ summary: {} });
            const result = await getInvoiceBalanceInfo(userId, businessId, invoiceId);
            expect(result.grandTotal).toBe(0);
            expect(result.balanceDue).toBe(0);
        });
    });
});
