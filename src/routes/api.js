const express = require('express');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const adminAuthController = require('../controllers/adminAuthController');

const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

// Auth Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Admin Auth Routes
router.post('/admin/auth/register', adminAuthController.registerAdmin);
router.post('/admin/auth/login', adminAuthController.loginAdmin);

// Admin Routes (Protected + Role Check)
router.get('/admin/pending', authMiddleware, adminMiddleware, adminController.getPendingReviews);
router.post('/admin/approve', authMiddleware, adminMiddleware, adminController.approveUser);
router.post('/admin/approve-business', authMiddleware, adminMiddleware, adminController.approveBusiness);

// Business Routes (Protected)
const businessController = require('../controllers/businessController');
router.post('/business', authMiddleware, businessController.createBusiness);
router.get('/business', authMiddleware, businessController.getMyBusinesses);
router.put('/business/:businessId', authMiddleware, businessController.updateBusiness);

// Party (Buyer/Customer) Routes (Protected)
const partyController = require('../controllers/partyController');
router.post('/parties', authMiddleware, partyController.createParty);
router.get('/parties', authMiddleware, partyController.listParties);
router.get('/parties/:partyId', authMiddleware, partyController.getParty);
router.put('/parties/:partyId', authMiddleware, partyController.updateParty);
router.delete('/parties/:partyId', authMiddleware, partyController.deleteParty);

// Health Check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
