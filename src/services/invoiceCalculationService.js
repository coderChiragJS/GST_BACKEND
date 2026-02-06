/**
 * Utility functions to calculate invoice line totals, taxes, discounts and grand totals.
 * This is intentionally business-logic only and does not know anything about templates.
 */

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateLineItemTotals(item) {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const baseAmount = quantity * unitPrice;

    // Discount
    let discountAmount = 0;
    if (item.discountType === 'percentage') {
        const percent = Number(item.discountPercent || item.discountValue || 0);
        discountAmount = (baseAmount * percent) / 100;
    } else if (item.discountType === 'flat') {
        discountAmount = Number(item.discountValue || 0);
    }
    if (discountAmount > baseAmount) {
        discountAmount = baseAmount;
    }

    // Taxable amount before GST
    let taxableAmount = baseAmount - discountAmount;

    const gstPercent = Number(item.gstPercent || 0);
    const taxInclusive = !!item.taxInclusive;

    let gstAmount = 0;
    if (taxInclusive && gstPercent > 0) {
        // If tax is inclusive, back-calculate base amount
        const divisor = 1 + gstPercent / 100;
        const netBeforeTax = taxableAmount / divisor;
        gstAmount = taxableAmount - netBeforeTax;
        taxableAmount = netBeforeTax;
    } else {
        gstAmount = (taxableAmount * gstPercent) / 100;
    }

    const lineTotal = taxableAmount + gstAmount;

    return {
        baseAmount: round2(baseAmount),
        discountAmount: round2(discountAmount),
        taxableAmount: round2(taxableAmount),
        gstPercent,
        gstAmount: round2(gstAmount),
        lineTotal: round2(lineTotal)
    };
}

function calculateAdditionalChargeTotals(charge) {
    const amount = Number(charge.amount || 0);
    const gstPercent = Number(charge.gstPercent || 0);
    const isTaxInclusive = !!charge.isTaxInclusive;

    let taxableAmount = amount;
    let gstAmount = 0;

    if (isTaxInclusive && gstPercent > 0) {
        const divisor = 1 + gstPercent / 100;
        const netBeforeTax = amount / divisor;
        gstAmount = amount - netBeforeTax;
        taxableAmount = netBeforeTax;
    } else {
        gstAmount = (amount * gstPercent) / 100;
    }

    const total = taxableAmount + gstAmount;

    return {
        taxableAmount: round2(taxableAmount),
        gstPercent,
        gstAmount: round2(gstAmount),
        total: round2(total)
    };
}

/**
 * Compute totals for an invoice object as defined by the Zod schema in invoiceController.
 * Returns an object with:
 * - lineItems: array of items with computed totals
 * - additionalCharges: array with totals
 * - summary: overall sums (taxable, tax, tcs, grandTotal, etc.)
 */
function computeInvoiceTotals(invoice) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const additionalCharges = Array.isArray(invoice.additionalCharges)
        ? invoice.additionalCharges
        : [];

    let totalItemBase = 0;
    let totalItemDiscount = 0;
    let totalItemTaxable = 0;
    let totalItemGst = 0;
    let totalItemAmount = 0;

    const itemsWithTotals = items.map((item) => {
        const totals = calculateLineItemTotals(item);
        totalItemBase += totals.baseAmount;
        totalItemDiscount += totals.discountAmount;
        totalItemTaxable += totals.taxableAmount;
        totalItemGst += totals.gstAmount;
        totalItemAmount += totals.lineTotal;
        return {
            ...item,
            totals
        };
    });

    let totalChargeTaxable = 0;
    let totalChargeGst = 0;
    let totalChargeAmount = 0;

    const chargesWithTotals = additionalCharges.map((charge) => {
        const totals = calculateAdditionalChargeTotals(charge);
        totalChargeTaxable += totals.taxableAmount;
        totalChargeGst += totals.gstAmount;
        totalChargeAmount += totals.total;
        return {
            ...charge,
            totals
        };
    });

    const taxableAmount = totalItemTaxable + totalChargeTaxable;
    const taxAmount = totalItemGst + totalChargeGst;

    // TCS
    let tcsAmount = 0;
    if (invoice.tcsInfo && typeof invoice.tcsInfo.percentage === 'number') {
        const tcsPercent = Number(invoice.tcsInfo.percentage || 0);
        const basis = invoice.tcsInfo.basis || 'finalAmount';
        const baseForTcs =
            basis === 'taxableAmount'
                ? taxableAmount
                : taxableAmount + taxAmount;
        tcsAmount = (baseForTcs * tcsPercent) / 100;
    }

    const grandTotal = taxableAmount + taxAmount + tcsAmount;

    return {
        items: itemsWithTotals,
        additionalCharges: chargesWithTotals,
        summary: {
            totalItemBase: round2(totalItemBase),
            totalItemDiscount: round2(totalItemDiscount),
            totalItemTaxable: round2(totalItemTaxable),
            totalItemGst: round2(totalItemGst),
            totalItemAmount: round2(totalItemAmount),
            totalChargeTaxable: round2(totalChargeTaxable),
            totalChargeGst: round2(totalChargeGst),
            totalChargeAmount: round2(totalChargeAmount),
            taxableAmount: round2(taxableAmount),
            taxAmount: round2(taxAmount),
            tcsAmount: round2(tcsAmount),
            grandTotal: round2(grandTotal)
        }
    };
}

module.exports = {
    computeInvoiceTotals
};

