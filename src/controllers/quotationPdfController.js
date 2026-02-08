const Quotation = require('../models/quotationModel');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_QUOTATION_TEMPLATES = ['classic'];

const quotationPdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, quotationId } = req.params;
            const { templateId } = req.body || {};

            if (!businessId || !quotationId) {
                return res.status(400).json({ message: 'Business ID and Quotation ID are required in URL' });
            }

            if (!templateId || !ALLOWED_QUOTATION_TEMPLATES.includes(templateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    allowedTemplates: ALLOWED_QUOTATION_TEMPLATES
                });
            }

            const quotation = await Quotation.getById(userId, businessId, quotationId);
            if (!quotation) {
                return res.status(404).json({ message: 'Quotation not found' });
            }

            const pdfUrl = await invoicePdfService.generateAndUploadQuotationPdf({
                userId,
                businessId,
                quotation,
                templateId
            });

            return res.json({
                pdfUrl,
                quotationId,
                templateId
            });
        } catch (error) {
            console.error('Generate Quotation PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error.message
            });
        }
    }
};

module.exports = quotationPdfController;
