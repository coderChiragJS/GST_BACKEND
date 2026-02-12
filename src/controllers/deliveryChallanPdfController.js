const DeliveryChallan = require('../models/deliveryChallanModel');
const invoicePdfService = require('../services/invoicePdfService');

// For now we expose only the "classic" template for Delivery Challan.
const ALLOWED_TEMPLATES = ['classic'];

const deliveryChallanPdfController = {
    async generatePdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, challanId } = req.params;
            const { templateId } = req.body || {};

            if (!businessId || !challanId) {
                return res
                    .status(400)
                    .json({
                        message:
                            'Business ID and Delivery Challan ID are required in URL'
                    });
            }

            if (!templateId || !ALLOWED_TEMPLATES.includes(templateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    allowedTemplates: ALLOWED_TEMPLATES
                });
            }

            const challan = await DeliveryChallan.getById(
                userId,
                businessId,
                challanId
            );
            if (!challan) {
                return res
                    .status(404)
                    .json({ message: 'Delivery Challan not found' });
            }

            const pdfUrl =
                await invoicePdfService.generateAndUploadDeliveryChallanPdf({
                    userId,
                    businessId,
                    deliveryChallan: challan,
                    templateId
                });

            return res.json({
                pdfUrl,
                deliveryChallanId: challanId,
                templateId
            });
        } catch (error) {
            console.error('Generate Delivery Challan PDF Error:', error);
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error.message
            });
        }
    }
};

module.exports = deliveryChallanPdfController;
