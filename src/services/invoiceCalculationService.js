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

    // CESS: Percentage = % of taxable; Fixed/Per Unit = rupees per quantity
    let cessAmount = 0;
    const cessType = (item.cessType || 'Percentage').toString();
    const cessValue = Number(item.cessValue || 0);
    if (cessType === 'Percentage') {
        cessAmount = (taxableAmount * cessValue) / 100;
    } else if (cessType === 'Fixed' || cessType === 'Per Unit') {
        const qty = Number(item.quantity || 0);
        cessAmount = cessValue * qty;
    }

    const lineTotal = taxableAmount + gstAmount + cessAmount;

    return {
        baseAmount: round2(baseAmount),
        discountAmount: round2(discountAmount),
        taxableAmount: round2(taxableAmount),
        gstPercent,
        gstAmount: round2(gstAmount),
        cessAmount: round2(cessAmount),
        cessValue,
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

    const cessAmount = 0; // additionalCharges schema has no cessType/cessValue
    const total = taxableAmount + gstAmount + cessAmount;

    return {
        taxableAmount: round2(taxableAmount),
        gstPercent,
        gstAmount: round2(gstAmount),
        cessAmount: round2(cessAmount),
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

    let totalItemCess = 0;
    let totalQuantity = 0;
    const itemsWithTotals = items.map((item) => {
        const totals = calculateLineItemTotals(item);
        totalItemBase += totals.baseAmount;
        totalItemDiscount += totals.discountAmount;
        totalItemTaxable += totals.taxableAmount;
        totalItemGst += totals.gstAmount;
        totalItemCess += totals.cessAmount || 0;
        totalItemAmount += totals.lineTotal;
        totalQuantity += Number(item.quantity || 0);
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
    const cessAmount = totalItemCess;

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

    // Total before global discount (taxable + tax + cess + tcs)
    const totalBeforeDiscount = taxableAmount + taxAmount + cessAmount + tcsAmount;

    // Global discount
    let totalDiscountAmount = 0;
    if (invoice.globalDiscountType && typeof invoice.globalDiscountValue === 'number') {
        if (invoice.globalDiscountType === 'percentage') {
            totalDiscountAmount = (totalBeforeDiscount * invoice.globalDiscountValue) / 100;
        } else {
            totalDiscountAmount = invoice.globalDiscountValue;
        }
    }
    totalDiscountAmount = round2(Math.min(totalDiscountAmount, totalBeforeDiscount));

    const roundOff = Number(invoice.roundOff) || 0;
    const finalInvoiceAmount = round2(totalBeforeDiscount - totalDiscountAmount + roundOff);

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
            cessAmount: round2(cessAmount),
            tcsAmount: round2(tcsAmount),
            totalBeforeDiscount: round2(totalBeforeDiscount),
            totalDiscountAmount: round2(totalDiscountAmount),
            roundOff: round2(roundOff),
            finalInvoiceAmount: round2(finalInvoiceAmount),
            balanceDue: round2(finalInvoiceAmount),
            grandTotal: round2(finalInvoiceAmount),
            tableTotal: round2(totalItemAmount + totalChargeAmount),
            totalQuantity
        }
    };
}

module.exports = {
    computeInvoiceTotals
};

