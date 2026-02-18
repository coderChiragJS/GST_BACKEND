const Invoice = require('../models/invoiceModel');
const invoicePdfService = require('../services/invoicePdfService');

// Allowed template IDs – must match what Flutter uses
const ALLOWED_TEMPLATES = ['classic', 'modern', 'minimal'];

const invoicePdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, invoiceId } = req.params;
            const { templateId, copyType: rawCopyType } = req.body || {};

            if (!businessId || !invoiceId) {
                return res.status(400).json({ message: 'Business ID and Invoice ID are required in URL' });
            }

            if (!templateId || !ALLOWED_TEMPLATES.includes(templateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    allowedTemplates: ALLOWED_TEMPLATES
                });
            }

            const validCopyTypes = ['original', 'duplicate', 'triplicate'];
            const copyType = validCopyTypes.includes(rawCopyType) ? rawCopyType : 'original';

            const invoice = await Invoice.getById(userId, businessId, invoiceId);
            if (!invoice) {
                return res.status(404).json({ message: 'Invoice not found' });
            }

            const pdfUrl = await invoicePdfService.generateAndUploadInvoicePdf({
                userId,
                businessId,
                invoice,
                templateId,
                copyType
            });

            return res.json({
                pdfUrl,
                invoiceId,
                templateId,
                copyType
            });
        } catch (error) {
            console.error('Generate Invoice PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error.message
            });
        }
    },

    listTemplates(_req, res) {
        // Static list for now; can be extended later
        const templates = [
            {
                id: 'classic',
                name: 'Classic',
                description: 'Standard GST invoice layout'
            },
            {
                id: 'modern',
                name: 'Modern',
                description: 'Clean layout with bold headings'
            },
            {
                id: 'minimal',
                name: 'Minimal',
                description: 'Compact invoice with minimal borders'
            }
        ];

        return res.json({ templates });
    }
};

module.exports = invoicePdfController;

