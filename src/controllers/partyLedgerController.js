const { buildPartyLedger, buildLedgerSummary } = require('../services/partyLedgerService');
const invoicePdfService = require('../services/invoicePdfService');

const ALLOWED_TEMPLATES = ['classic'];

const partyLedgerController = {
    async getLedgerSummary(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const { search } = req.query;

            const summary = await buildLedgerSummary(userId, businessId);

            if (search) {
                const s = String(search).toLowerCase();
                summary.debtors.parties = summary.debtors.parties.filter((p) => {
                    return (p.partyName || '').toLowerCase().includes(s) ||
                           (p.gstin || '').toLowerCase().includes(s);
                });
                summary.creditors.parties = summary.creditors.parties.filter((p) => {
                    return (p.partyName || '').toLowerCase().includes(s) ||
                           (p.gstin || '').toLowerCase().includes(s);
                });
                summary.debtors.totalToCollect = summary.debtors.parties.reduce((s, p) => s + p.currentBalance, 0);
                summary.creditors.totalToPay = summary.creditors.parties.reduce((s, p) => s + p.currentBalance, 0);
            }

            return res.json(summary);
        } catch (error) {
            console.error('Get Ledger Summary Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async getPartyLedger(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, partyId } = req.params;
            const { fromDate, toDate } = req.query;

            if (!partyId) {
                return res.status(400).json({ message: 'Party ID is required' });
            }

            const ledger = await buildPartyLedger(userId, businessId, partyId, fromDate, toDate);
            if (!ledger) {
                return res.status(404).json({ message: 'Party not found' });
            }

            return res.json(ledger);
        } catch (error) {
            console.error('Get Party Ledger Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async generatePartyLedgerPdf(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, partyId } = req.params;
            const { fromDate, toDate, templateId: rawTemplateId } = req.body || {};

            if (rawTemplateId && !ALLOWED_TEMPLATES.includes(rawTemplateId)) {
                return res.status(400).json({
                    message: 'Invalid templateId',
                    code: 'VALIDATION_FAILED',
                    allowedTemplates: ALLOWED_TEMPLATES
                });
            }
            const templateId = rawTemplateId || 'classic';

            if (!partyId) {
                return res.status(400).json({ message: 'Party ID is required' });
            }

            const ledger = await buildPartyLedger(userId, businessId, partyId, fromDate, toDate);
            if (!ledger) {
                return res.status(404).json({ message: 'Party not found' });
            }

            const business = req.business || {};
            const addr = business.address || {};
            const addressParts = [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean);

            const pdfUrl = await invoicePdfService.generateAndUploadPartyLedgerPdf({
                userId,
                businessId,
                partyId,
                templateId,
                business: {
                    firmName: business.firmName || '',
                    address: addressParts.join(', '),
                    gstin: business.gstNumber || '',
                    mobile: business.mobile || '',
                    email: business.email || ''
                },
                ledger
            });

            return res.json({ pdfUrl, partyId, templateId });
        } catch (error) {
            console.error('Generate Party Ledger PDF Error:', error);
            return res.status(500).json({ message: 'Failed to generate PDF' });
        }
    }
};

module.exports = partyLedgerController;
