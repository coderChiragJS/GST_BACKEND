const Invoice = require('../models/invoiceModel');
const PaymentReceipt = require('../models/paymentReceiptModel');
const invoicePdfService = require('../services/invoicePdfService');
const { computeInvoiceTotals } = require('../services/invoiceCalculationService');

const ALLOWED_TEMPLATES = ['classic', 'modern', 'minimal'];

/**
 * Fetch all receipts for the business that allocate to this invoice.
 * Returns array of { date, amount, receiptNumber } sorted by date ascending.
 */
async function getPaymentHistoryForInvoice(userId, businessId, invoiceId) {
    const entries = [];
    let exclusiveStartKey = null;

    do {
        const { items, lastEvaluatedKey } = await PaymentReceipt.listByBusiness(userId, businessId, {
            limit: 100,
            exclusiveStartKey
        });
        exclusiveStartKey = lastEvaluatedKey || null;

        for (const receipt of items || []) {
            const allocations = receipt.allocations || [];
            const alloc = allocations.find((a) => a.invoiceId === invoiceId);
            if (!alloc) continue;

            const amount = Number(alloc.allocatedAmount) || 0;
            entries.push({
                date: receipt.receiptDate || receipt.createdAt || '',
                amount,
                receiptNumber: receipt.receiptNumber || ''
            });
        }
    } while (exclusiveStartKey);

    entries.sort((a, b) => {
        const dA = a.date ? new Date(a.date).getTime() : 0;
        const dB = b.date ? new Date(b.date).getTime() : 0;
        return dA - dB;
    });

    return entries;
}

const invoiceStatementPdfController = {
    async generateStatementPdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, invoiceId } = req.params;
            const { templateId: rawTemplateId } = req.body || {};
            if (rawTemplateId && !ALLOWED_TEMPLATES.includes(rawTemplateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    code: 'VALIDATION_FAILED',
                    allowedTemplates: ALLOWED_TEMPLATES
                });
            }
            const templateId = rawTemplateId || 'classic';

            if (!businessId || !invoiceId) {
                return res.status(400).json({
                    message: 'Business ID and Invoice ID are required in URL'
                });
            }

            const invoice = await Invoice.getById(userId, businessId, invoiceId);
            if (!invoice) {
                return res.status(404).json({ message: 'Invoice not found' });
            }

            const paymentHistory = await getPaymentHistoryForInvoice(userId, businessId, invoiceId);
            const totals = computeInvoiceTotals(invoice);
            const grandTotal = totals?.summary?.grandTotal ?? 0;
            const paidAmount = invoice.paidAmount != null ? Number(invoice.paidAmount) : 0;
            const balanceDue = Math.round((grandTotal - paidAmount + Number.EPSILON) * 100) / 100;

            const pdfUrl = await invoicePdfService.generateAndUploadInvoiceStatementPdf({
                userId,
                businessId,
                invoice,
                templateId,
                paymentHistory,
                grandTotal,
                paidAmount,
                balanceDue
            });

            return res.json({
                pdfUrl,
                invoiceId,
                templateId
            });
        } catch (error) {
            console.error('Generate Invoice Statement PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error.message
            });
        }
    }
};

module.exports = invoiceStatementPdfController;
