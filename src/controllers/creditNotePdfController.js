const CreditNote = require('../models/creditNoteModel');
const Business = require('../models/businessModel');
const invoicePdfService = require('../services/invoicePdfService');

// For now we expose only the "classic" template for Credit Note.
const ALLOWED_TEMPLATES = ['classic'];

const creditNotePdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, creditNoteId } = req.params;
            const { templateId, copyType: rawCopyType } = req.body || {};

            if (!businessId || !creditNoteId) {
                return res
                    .status(400)
                    .json({
                        message:
                            'Business ID and Credit Note ID are required in URL'
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

            const note = await CreditNote.getById(
                userId,
                businessId,
                creditNoteId
            );
            if (!note) {
                return res
                    .status(404)
                    .json({ message: 'Credit Note not found' });
            }

            const business = await Business.getById(userId, businessId);

            const pdfUrl =
                await invoicePdfService.generateAndUploadCreditNotePdf({
                    userId,
                    businessId,
                    creditNote: note,
                    templateId,
                    copyType,
                    business
                });

            return res.json({
                pdfUrl,
                creditNoteId,
                templateId,
                copyType
            });
        } catch (error) {
            console.error('Generate Credit Note PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF'
            });
        }
    }
};

module.exports = creditNotePdfController;
