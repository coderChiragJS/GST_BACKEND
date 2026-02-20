const PaymentReceipt = require('../models/paymentReceiptModel');
const Business = require('../models/businessModel');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_TEMPLATES = ['classic'];

const receiptPdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, receiptId } = req.params;
            const { templateId: rawTemplateId } = req.body || {};
            const templateId = rawTemplateId && ALLOWED_TEMPLATES.includes(rawTemplateId)
                ? rawTemplateId
                : 'classic';

            if (!businessId || !receiptId) {
                return res.status(400).json({
                    message: 'Business ID and Receipt ID are required in URL'
                });
            }

            const receipt = await PaymentReceipt.getById(userId, businessId, receiptId);
            if (!receipt) {
                return res.status(404).json({ message: 'Receipt not found' });
            }

            const business = await Business.getById(userId, businessId);

            const pdfUrl = await invoicePdfService.generateAndUploadReceiptPdf({
                userId,
                businessId,
                receipt,
                business,
                templateId
            });

            return res.json({
                pdfUrl,
                receiptId,
                templateId
            });
        } catch (error) {
            console.error('Generate Receipt PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error.message
            });
        }
    }
};

module.exports = receiptPdfController;
