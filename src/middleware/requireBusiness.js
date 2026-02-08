const Business = require('../models/businessModel');

/**
 * Ensures req.params.businessId exists and belongs to req.user.
 * Must be used after authMiddleware. Returns 404 if business not found.
 */
async function requireBusiness(req, res, next) {
    const businessId = req.params.businessId;
    if (!businessId) {
        return res.status(400).json({ error: 'Business ID is required' });
    }
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const business = await Business.getById(userId, businessId);
        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }
        req.business = business;
        next();
    } catch (err) {
        console.error('requireBusiness Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = requireBusiness;
