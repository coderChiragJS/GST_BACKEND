const User = require('../models/userModel');
const Business = require('../models/businessModel');

module.exports = {
    // POST /admin/approve
    // Body: { userId: "uuid", trialDays: 14 }
    async approveUser(req, res) {
        try {
            const { userId, trialDays } = req.body;
            const adminId = req.user ? req.user.userId : 'SYSTEM_ADMIN'; // From middleware

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            const updatedUser = await User.approve(userId, adminId, trialDays);

            res.json({
                message: 'User approved successfully.',
                user: updatedUser
            });

        } catch (error) {
            console.error('Admin Approve Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // POST /admin/approve-business
    // Body: { userId: "uuid", businessId: "uuid" }
    async approveBusiness(req, res) {
        try {
            const { userId, businessId } = req.body;
            if (!userId || !businessId) {
                return res.status(400).json({ error: 'User ID and Business ID are required' });
            }

            const updatedBusiness = await Business.approve(userId, businessId);

            res.json({
                message: 'Business approved successfully.',
                business: updatedBusiness
            });

        } catch (error) {
            console.error('Admin Approve Business Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // GET /admin/pending
    async getPendingReviews(req, res) {
        try {
            // Fetch all pending businesses across all users
            const pendingBusinesses = await Business.listPending();

            if (!pendingBusinesses || pendingBusinesses.length === 0) {
                return res.json([]);
            }

            // Group by user if needed, or just return as is. 
            // For now, let's return them enriched with user data.
            const enrichedReviews = await Promise.all(pendingBusinesses.map(async (biz) => {
                const user = await User.findById(biz.userId);
                return {
                    business: biz,
                    user: user ? {
                        userId: user.userId,
                        name: user.name,
                        email: user.email
                    } : null
                };
            }));

            res.json(enrichedReviews);

        } catch (error) {
            console.error('Get Pending Reviews Error:', error);
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
};
