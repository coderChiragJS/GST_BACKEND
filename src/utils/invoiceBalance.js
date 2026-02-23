const Invoice = require('../models/invoiceModel');
const { computeInvoiceTotals } = require('../services/invoiceCalculationService');

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Get invoice balance info: grandTotal, paidAmount, tdsAmount, balanceDue.
 * balanceDue = grandTotal - paidAmount - tdsAmount (single source of truth).
 * @param {string} userId
 * @param {string} businessId
 * @param {string} invoiceId
 * @returns {Promise<{ invoice, grandTotal, paidAmount, tdsAmount, balanceDue } | null>}
 */
async function getInvoiceBalanceInfo(userId, businessId, invoiceId) {
    const invoice = await Invoice.getById(userId, businessId, invoiceId);
    if (!invoice) return null;
    const totals = computeInvoiceTotals(invoice);
    const grandTotal = totals?.summary?.grandTotal ?? 0;
    const paidAmount = invoice.paidAmount != null ? Number(invoice.paidAmount) : 0;
    const tdsAmount = invoice.tdsAmount != null ? Number(invoice.tdsAmount) : 0;
    const balanceDue = round2(grandTotal - paidAmount - tdsAmount);
    return {
        invoice,
        grandTotal: round2(grandTotal),
        paidAmount: round2(paidAmount),
        tdsAmount: round2(tdsAmount),
        balanceDue
    };
}

module.exports = {
    getInvoiceBalanceInfo,
    round2
};
