const { computeInvoiceTotals } = require('../../src/services/invoiceCalculationService');

function minimalItem(overrides = {}) {
    return {
        itemId: '1',
        itemName: 'Item',
        quantity: 1,
        unit: 'Nos',
        unitPrice: 100,
        discountType: 'percentage',
        discountValue: 0,
        discountPercent: 0,
        gstPercent: 18,
        taxInclusive: false,
        cessType: 'Percentage',
        cessValue: 0,
        ...overrides
    };
}

function minimalInvoice(overrides = {}) {
    return {
        items: [minimalItem()],
        additionalCharges: [],
        globalDiscountType: 'percentage',
        globalDiscountValue: 0,
        ...overrides
    };
}

describe('invoiceCalculationService', () => {
    describe('computeInvoiceTotals', () => {
        test('line item – GST exclusive: base 100, 18% GST', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18, taxInclusive: false })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.taxableAmount).toBe(100);
            expect(result.summary.taxAmount).toBe(18);
            expect(result.summary.grandTotal).toBe(118);
            expect(result.items[0].totals.taxableAmount).toBe(100);
            expect(result.items[0].totals.gstAmount).toBe(18);
            expect(result.items[0].totals.lineTotal).toBe(118);
        });

        test('line item – GST inclusive: 118 includes 18%', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 118, gstPercent: 18, taxInclusive: true })]
            });
            const result = computeInvoiceTotals(invoice);
            // 118 / 1.18 = 100, gst = 18
            expect(result.items[0].totals.taxableAmount).toBe(100);
            expect(result.items[0].totals.gstAmount).toBe(18);
            expect(result.items[0].totals.lineTotal).toBe(118);
            expect(result.summary.grandTotal).toBe(118);
        });

        test('line item – percentage discount: 10% off 100', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, discountType: 'percentage', discountValue: 10, discountPercent: 10, gstPercent: 18 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.items[0].totals.baseAmount).toBe(100);
            expect(result.items[0].totals.discountAmount).toBe(10);
            expect(result.items[0].totals.taxableAmount).toBe(90);
            expect(result.items[0].totals.gstAmount).toBe(16.2);
            expect(result.items[0].totals.lineTotal).toBe(106.2);
            expect(result.summary.grandTotal).toBe(106.2);
        });

        test('line item – flat discount: 50 off 100', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, discountType: 'flat', discountValue: 50, gstPercent: 18 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.items[0].totals.discountAmount).toBe(50);
            expect(result.items[0].totals.taxableAmount).toBe(50);
            expect(result.items[0].totals.gstAmount).toBe(9);
            expect(result.items[0].totals.lineTotal).toBe(59);
            expect(result.summary.grandTotal).toBe(59);
        });

        test('line item – CESS Percentage: 1% of taxable', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18, cessType: 'Percentage', cessValue: 1 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.items[0].totals.taxableAmount).toBe(100);
            expect(result.items[0].totals.gstAmount).toBe(18);
            expect(result.items[0].totals.cessAmount).toBe(1);
            expect(result.items[0].totals.lineTotal).toBe(119);
            expect(result.summary.grandTotal).toBe(119);
        });

        test('line item – CESS Per Unit: cessValue * qty', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 2, unitPrice: 100, gstPercent: 0, cessType: 'Per Unit', cessValue: 5 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.items[0].totals.cessAmount).toBe(10);
            expect(result.items[0].totals.lineTotal).toBe(210);
            expect(result.summary.grandTotal).toBe(210);
        });

        test('additional charge – GST exclusive', () => {
            const invoice = minimalInvoice({
                items: [],
                additionalCharges: [{ name: 'Freight', amount: 100, gstPercent: 18, isTaxInclusive: false }]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.totalChargeTaxable).toBe(100);
            expect(result.summary.totalChargeGst).toBe(18);
            expect(result.summary.totalChargeAmount).toBe(118);
            expect(result.summary.grandTotal).toBe(118);
        });

        test('additional charge – GST inclusive', () => {
            const invoice = minimalInvoice({
                items: [],
                additionalCharges: [{ name: 'Freight', amount: 118, gstPercent: 18, isTaxInclusive: true }]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.additionalCharges[0].totals.taxableAmount).toBe(100);
            expect(result.additionalCharges[0].totals.gstAmount).toBe(18);
            expect(result.summary.grandTotal).toBe(118);
        });

        test('global discount – percentage: 5% off total', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18 })],
                globalDiscountType: 'percentage',
                globalDiscountValue: 5
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.totalBeforeDiscount).toBe(118);
            expect(result.summary.totalDiscountAmount).toBe(5.9);
            expect(result.summary.grandTotal).toBe(112.1);
        });

        test('global discount – flat: 100 off', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 200, gstPercent: 18 })],
                globalDiscountType: 'flat',
                globalDiscountValue: 100
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.totalBeforeDiscount).toBe(236);
            expect(result.summary.totalDiscountAmount).toBe(100);
            expect(result.summary.grandTotal).toBe(136);
        });

        test('TCS – basis taxableAmount: 1% of taxable', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18 })],
                tcsInfo: { percentage: 1, basis: 'taxableAmount' }
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.taxableAmount).toBe(100);
            expect(result.summary.tcsAmount).toBe(1);
            expect(result.summary.grandTotal).toBe(119);
        });

        test('TCS – basis finalAmount: 1% of taxable + tax', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18 })],
                tcsInfo: { percentage: 1, basis: 'finalAmount' }
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.taxAmount).toBe(18);
            expect(result.summary.tcsAmount).toBe(1.18);
            expect(result.summary.grandTotal).toBeCloseTo(119.18, 2);
        });

        test('roundOff: +0.50 applied', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18 })],
                roundOff: 0.5
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.totalBeforeDiscount).toBe(118);
            expect(result.summary.roundOff).toBe(0.5);
            expect(result.summary.grandTotal).toBe(118.5);
        });

        test('roundOff: -0.50 applied', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18 })],
                roundOff: -0.5
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.grandTotal).toBe(117.5);
        });

        test('multiple items: two items with different GST', () => {
            const invoice = minimalInvoice({
                items: [
                    minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 18 }),
                    minimalItem({ quantity: 2, unitPrice: 50, gstPercent: 12 })
                ]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.totalItemAmount).toBe(118 + 112);
            expect(result.summary.grandTotal).toBe(230);
        });

        test('edge case: empty items, only additional charges', () => {
            const invoice = minimalInvoice({
                items: [],
                additionalCharges: [{ name: 'Fee', amount: 100, gstPercent: 0 }]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.totalItemAmount).toBe(0);
            expect(result.summary.totalChargeAmount).toBe(100);
            expect(result.summary.grandTotal).toBe(100);
        });

        test('edge case: gstPercent 0', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, gstPercent: 0 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.summary.taxAmount).toBe(0);
            expect(result.summary.grandTotal).toBe(100);
        });

        test('edge case: discount 100% caps at base amount', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 1, unitPrice: 100, discountType: 'percentage', discountValue: 100, discountPercent: 100, gstPercent: 18 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(result.items[0].totals.discountAmount).toBe(100);
            expect(result.items[0].totals.taxableAmount).toBe(0);
            expect(result.items[0].totals.gstAmount).toBe(0);
            expect(result.items[0].totals.lineTotal).toBe(0);
            expect(result.summary.grandTotal).toBe(0);
        });

        test('round2: values rounded to 2 decimals', () => {
            const invoice = minimalInvoice({
                items: [minimalItem({ quantity: 3, unitPrice: 33.33, gstPercent: 18 })]
            });
            const result = computeInvoiceTotals(invoice);
            expect(typeof result.summary.grandTotal).toBe('number');
            expect(Number.isInteger(result.summary.grandTotal * 100)).toBe(true);
        });
    });
});
