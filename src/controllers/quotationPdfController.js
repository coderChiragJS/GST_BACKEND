const Quotation = require('../models/quotationModel');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_QUOTATION_TEMPLATES = ['classic', 'compact', 'modern'];

const quotationPdfController = {
    async generatePdf(req, res) {
        const userId = req.user.userId;
        const { businessId, quotationId } = req.params;
        const { templateId, copyType: rawCopyType, outputType: rawOutputType } = req.body || {};

        if (!businessId || !quotationId) {
            return res.status(400).json({ message: 'Business ID and Quotation ID are required in URL' });
        }

        if (!templateId || !ALLOWED_QUOTATION_TEMPLATES.includes(templateId)) {
            return res.status(400).json({
                message: 'Invalid templateId',
                allowedTemplates: ALLOWED_QUOTATION_TEMPLATES
            });
        }

        const validCopyTypes = ['original', 'duplicate', 'triplicate'];
        const copyType = validCopyTypes.includes(rawCopyType) ? rawCopyType : 'original';
        const outputType = rawOutputType === 'proforma' ? 'proforma' : undefined;

        let quotation;
        try {
            quotation = await Quotation.getById(userId, businessId, quotationId);
        } catch (err) {
            console.error('Generate Quotation PDF – getById error:', err);
            return res.status(500).json({ message: 'Failed to load quotation', error: 'Server error' });
        }

        if (!quotation) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        try {
            const pdfUrl = await invoicePdfService.generateAndUploadQuotationPdf({
                userId,
                businessId,
                quotation,
                templateId,
                copyType,
                outputType
            });

            const response = {
                pdfUrl,
                quotationId,
                templateId,
                copyType
            };
            if (outputType) {
                response.outputType = outputType;
            }
            return res.status(200).json(response);
        } catch (error) {
            console.error('Generate Quotation PDF Error:', error);
            return res.status(503).json({
                message: 'PDF generation failed',
                error: error.message || 'Service temporarily unavailable'
            });
        }
    }
};

module.exports = quotationPdfController;
