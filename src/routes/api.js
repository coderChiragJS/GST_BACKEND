const express = require('express');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const adminAuthController = require('../controllers/adminAuthController');

const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const requireBusiness = require('../middleware/requireBusiness');
const canCreateDocument = require('../middleware/canCreateDocument');

const router = express.Router();

// Auth Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Admin Auth Routes
router.post('/admin/auth/register', adminAuthController.registerAdmin);
router.post('/admin/auth/login', adminAuthController.loginAdmin);

// Admin Routes (Protected + Role Check)
router.get('/admin/settings/trial-days', authMiddleware, adminMiddleware, adminController.getTrialDays);
router.put('/admin/settings/trial-days', authMiddleware, adminMiddleware, adminController.setTrialDays);
router.get('/admin/users/expired-trial', authMiddleware, adminMiddleware, adminController.getExpiredTrialUsers);
router.get('/admin/pending', authMiddleware, adminMiddleware, adminController.getPendingReviews);
router.post('/admin/approve', authMiddleware, adminMiddleware, adminController.approveUser);
router.post('/admin/approve-business', authMiddleware, adminMiddleware, adminController.approveBusiness);

const adminPackageController = require('../controllers/adminPackageController');
router.get('/admin/packages', authMiddleware, adminMiddleware, adminPackageController.listPackages);
router.post('/admin/packages', authMiddleware, adminMiddleware, adminPackageController.createPackage);
router.put('/admin/packages/:packageId', authMiddleware, adminMiddleware, adminPackageController.updatePackage);

// Packages (user-facing: list active, purchase, my subscription)
const userPackageController = require('../controllers/userPackageController');
router.get('/packages', authMiddleware, userPackageController.listPackages);
router.post('/user/subscriptions', authMiddleware, userPackageController.purchasePackage);
router.get('/user/subscription', authMiddleware, userPackageController.getMySubscription);

// Payments – PhonePe Standard Checkout
const paymentController = require('../controllers/paymentController');
router.post('/payments/phonepe/create', authMiddleware, paymentController.createPhonePePayment);
router.post('/payments/phonepe/callback', paymentController.phonePeCallback);

// Upload Routes
const uploadController = require('../controllers/uploadController');
router.post('/upload', authMiddleware, uploadController.uploadImage);

// Business Routes (Protected)
const businessController = require('../controllers/businessController');
router.post('/business', authMiddleware, businessController.createBusiness);
router.get('/business', authMiddleware, businessController.getMyBusinesses);
router.put('/business/:businessId', authMiddleware, requireBusiness, businessController.updateBusiness);

// Party (Buyer/Customer) Routes (Protected)
const partyController = require('../controllers/partyController');
router.post('/parties', authMiddleware, partyController.createParty);
router.get('/parties', authMiddleware, partyController.listParties);
router.get('/parties/:partyId', authMiddleware, partyController.getParty);
router.put('/parties/:partyId', authMiddleware, partyController.updateParty);
router.delete('/parties/:partyId', authMiddleware, partyController.deleteParty);

// Product Routes (Protected; requireBusiness ensures businessId belongs to user)
const productController = require('../controllers/productController');
router.post('/business/:businessId/products', authMiddleware, requireBusiness, productController.createProduct);
router.get('/business/:businessId/products', authMiddleware, requireBusiness, productController.listProducts);
router.get('/business/:businessId/products/:productId', authMiddleware, requireBusiness, productController.getProduct);
router.put('/business/:businessId/products/:productId', authMiddleware, requireBusiness, productController.updateProduct);
router.delete('/business/:businessId/products/:productId', authMiddleware, requireBusiness, productController.deleteProduct);

// Invoice Routes (Protected; requireBusiness ensures businessId belongs to user)
const invoiceController = require('../controllers/invoiceController');
const invoicePdfController = require('../controllers/invoicePdfController');
router.post('/business/:businessId/invoices', authMiddleware, requireBusiness, canCreateDocument, invoiceController.createInvoice);
router.get('/business/:businessId/invoices', authMiddleware, requireBusiness, invoiceController.listInvoices);
router.get('/business/:businessId/invoices/:invoiceId', authMiddleware, requireBusiness, invoiceController.getInvoice);
router.put('/business/:businessId/invoices/:invoiceId', authMiddleware, requireBusiness, invoiceController.updateInvoice);
router.delete('/business/:businessId/invoices/:invoiceId', authMiddleware, requireBusiness, invoiceController.deleteInvoice);
router.post('/business/:businessId/invoices/:invoiceId/pdf', authMiddleware, requireBusiness, invoicePdfController.generatePdf);

// Quotation Routes (Protected; requireBusiness ensures businessId belongs to user)
const quotationController = require('../controllers/quotationController');
const quotationPdfController = require('../controllers/quotationPdfController');
router.post('/business/:businessId/quotations', authMiddleware, requireBusiness, canCreateDocument, quotationController.createQuotation);
router.get('/business/:businessId/quotations', authMiddleware, requireBusiness, quotationController.listQuotations);
router.get('/business/:businessId/quotations/:quotationId', authMiddleware, requireBusiness, quotationController.getQuotation);
router.put('/business/:businessId/quotations/:quotationId', authMiddleware, requireBusiness, quotationController.updateQuotation);
router.delete('/business/:businessId/quotations/:quotationId', authMiddleware, requireBusiness, quotationController.deleteQuotation);
router.post('/business/:businessId/quotations/:quotationId/pdf', authMiddleware, requireBusiness, quotationPdfController.generatePdf);

// Optional: public list of available invoice templates
router.get('/invoice-templates', invoicePdfController.listTemplates);

// Health Check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
