const TdsVoucher = require('../models/tdsVoucherModel');
const Business = require('../models/businessModel');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_TEMPLATES = ['classic'];

const tdsVoucherPdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, voucherId } = req.params;
            const { templateId: rawTemplateId } = req.body || {};
            const templateId = rawTemplateId && ALLOWED_TEMPLATES.includes(rawTemplateId)
                ? rawTemplateId
                : 'classic';

            if (!businessId || !voucherId) {
                return res.status(400).json({
                    message: 'Business ID and Voucher ID are required in URL'
                });
            }

            const voucher = await TdsVoucher.getById(userId, businessId, voucherId);
            if (!voucher) {
                return res.status(404).json({ message: 'TDS voucher not found' });
            }

            const business = await Business.getById(userId, businessId);

            const pdfUrl = await invoicePdfService.generateAndUploadTdsVoucherPdf({
                userId,
                businessId,
                voucher,
                business,
                templateId
            });

            return res.json({
                pdfUrl,
                voucherId,
                templateId
            });
        } catch (error) {
            console.error('Generate TDS Voucher PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate TDS voucher PDF'
            });
        }
    }
};

module.exports = tdsVoucherPdfController;
