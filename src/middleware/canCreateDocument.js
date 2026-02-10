const { getDocumentAccess } = require('../services/documentAccessService');

/**
 * Ensures the user can create an invoice or quotation:
 * - Trial active (today <= trialEndDate), or
 * - Active subscription with remaining usage (invoices or quotations).
 * Uses documentAccessService for a single source of truth.
 * Sets req.documentAccess, req.onTrial and req.subscription for use in create handlers.
 * Must be used after authMiddleware and requireBusiness.
 */
async function canCreateDocument(req, res, next) {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const access = await getDocumentAccess(userId);
        if (!access.canCreateDocuments) {
            return res.status(403).json({
                error: access.message || 'No active trial or package. Please purchase a package to create invoices/quotations.'
            });
        }
        req.documentAccess = access;
        req.onTrial = access.onTrial;
        req.subscription = access.subscription;
        next();
    } catch (err) {
        console.error('canCreateDocument Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = canCreateDocument;
