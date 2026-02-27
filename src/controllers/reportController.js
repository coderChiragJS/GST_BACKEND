const { generateReport, VALID_REPORT_TYPES, REPORT_TITLES } = require('../services/reportService');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_TEMPLATES = ['classic'];

const reportController = {
    async getReport(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, reportType } = req.params;
            const { fromDate, toDate, status } = req.query;

            if (!VALID_REPORT_TYPES.includes(reportType)) {
                return res.status(400).json({
                    message: `Invalid report type: ${reportType}`,
                    code: 'INVALID_REPORT_TYPE',
                    validTypes: VALID_REPORT_TYPES
                });
            }

            const report = await generateReport(userId, businessId, reportType, {
                fromDate: fromDate || null,
                toDate: toDate || null,
                status: status || null
            });

            if (!report) {
                return res.status(500).json({ message: 'Failed to generate report' });
            }

            return res.json({
                reportType,
                reportTitle: REPORT_TITLES[reportType] || reportType,
                period: reportType === 'current-stock'
                    ? null
                    : { from: fromDate || null, to: toDate || null },
                ...report,
                generatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Get Report Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async generateReportPdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, reportType } = req.params;
            const { fromDate, toDate, status, templateId: rawTemplateId } = req.body || {};

            if (!VALID_REPORT_TYPES.includes(reportType)) {
                return res.status(400).json({
                    message: `Invalid report type: ${reportType}`,
                    code: 'INVALID_REPORT_TYPE',
                    validTypes: VALID_REPORT_TYPES
                });
            }

            if (rawTemplateId && !ALLOWED_TEMPLATES.includes(rawTemplateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    code: 'VALIDATION_FAILED',
                    allowedTemplates: ALLOWED_TEMPLATES
                });
            }
            const templateId = rawTemplateId || 'classic';

            const report = await generateReport(userId, businessId, reportType, {
                fromDate: fromDate || null,
                toDate: toDate || null,
                status: status || null
            });

            if (!report) {
                return res.status(500).json({ message: 'Failed to generate report' });
            }

            const business = req.business || {};
            const addr = business.address || {};
            const addressParts = [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean);

            const pdfUrl = await invoicePdfService.generateAndUploadReportPdf({
                userId,
                businessId,
                reportType,
                templateId,
                business: {
                    firmName: business.firmName || '',
                    address: addressParts.join(', '),
                    gstin: business.gstNumber || '',
                    mobile: business.mobile || '',
                    email: business.email || ''
                },
                report,
                reportTitle: REPORT_TITLES[reportType] || reportType,
                period: reportType === 'current-stock'
                    ? null
                    : { from: fromDate || null, to: toDate || null }
            });

            return res.json({ pdfUrl, reportType, templateId });
        } catch (error) {
            console.error('Generate Report PDF Error:', error);
            return res.status(500).json({ message: 'Failed to generate PDF' });
        }
    }
};

module.exports = reportController;
