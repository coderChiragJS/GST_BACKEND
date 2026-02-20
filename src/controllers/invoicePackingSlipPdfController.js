const Invoice = require('../models/invoiceModel');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_TEMPLATES = ['classic'];

/**
 * Generate packing slip PDF for an invoice. No CRUD – user only generates the PDF.
 * POST /business/:businessId/invoices/:invoiceId/packing-slip-pdf
 * Body: { templateId?: 'classic' }
 */
const invoicePackingSlipPdfController = {
    async generatePackingSlipPdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, invoiceId } = req.params;
            const { templateId: rawTemplateId } = req.body || {};

            if (!businessId || !invoiceId) {
                return res.status(400).json({ message: 'Business ID and Invoice ID are required in URL' });
            }

            const templateId = rawTemplateId && ALLOWED_TEMPLATES.includes(rawTemplateId) ? rawTemplateId : 'classic';

            const invoice = await Invoice.getById(userId, businessId, invoiceId);
            if (!invoice) {
                return res.status(404).json({ message: 'Invoice not found' });
            }

            const pdfUrl = await invoicePdfService.generateAndUploadPackingSlipPdf({
                userId,
                businessId,
                invoice,
                templateId
            });

            return res.json({
                pdfUrl,
                invoiceId,
                templateId
            });
        } catch (error) {
            console.error('Generate Packing Slip PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate packing slip PDF',
                error: error.message
            });
        }
    }
};

module.exports = invoicePackingSlipPdfController;
