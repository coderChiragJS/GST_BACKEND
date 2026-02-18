const SalesDebitNote = require('../models/salesDebitNoteModel');
const Business = require('../models/businessModel');
const invoicePdfService = require('../services/invoicePdfService');

// For now we expose only the "classic" template for Sales Debit Note.
const ALLOWED_TEMPLATES = ['classic'];

const salesDebitNotePdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, salesDebitNoteId } = req.params;
            const { templateId, copyType: rawCopyType } = req.body || {};

            if (!businessId || !salesDebitNoteId) {
                return res
                    .status(400)
                    .json({
                        message:
                            'Business ID and Sales Debit Note ID are required in URL'
                    });
            }

            if (!templateId || !ALLOWED_TEMPLATES.includes(templateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    allowedTemplates: ALLOWED_TEMPLATES
                });
            }

            const validCopyTypes = ['original', 'duplicate', 'triplicate'];
            const copyType = validCopyTypes.includes(rawCopyType) ? rawCopyType : 'original';

            const note = await SalesDebitNote.getById(
                userId,
                businessId,
                salesDebitNoteId
            );
            if (!note) {
                return res
                    .status(404)
                    .json({ message: 'Sales Debit Note not found' });
            }

            const business = await Business.getById(userId, businessId);

            const pdfUrl =
                await invoicePdfService.generateAndUploadSalesDebitNotePdf({
                    userId,
                    businessId,
                    salesDebitNote: note,
                    templateId,
                    copyType,
                    business
                });

            return res.json({
                pdfUrl,
                salesDebitNoteId,
                templateId,
                copyType
            });
        } catch (error) {
            console.error('Generate Sales Debit Note PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error.message
            });
        }
    }
};

module.exports = salesDebitNotePdfController;

