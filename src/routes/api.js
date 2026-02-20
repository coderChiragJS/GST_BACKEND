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
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password', authController.resetPassword);

// User profile (authenticated)
router.get('/user/profile', authMiddleware, authController.getProfile);
router.put('/user/profile', authMiddleware, authController.updateProfile);

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
router.get('/admin/users', authMiddleware, adminMiddleware, adminController.getUsersList);
router.get('/admin/payments', authMiddleware, adminMiddleware, adminController.getPaymentsList);

const adminPackageController = require('../controllers/adminPackageController');
router.get('/admin/packages', authMiddleware, adminMiddleware, adminPackageController.listPackages);
router.get('/admin/packages/:packageId', authMiddleware, adminMiddleware, adminPackageController.getPackage);
router.post('/admin/packages', authMiddleware, adminMiddleware, adminPackageController.createPackage);
router.put('/admin/packages/:packageId', authMiddleware, adminMiddleware, adminPackageController.updatePackage);
router.delete('/admin/packages/:packageId', authMiddleware, adminMiddleware, adminPackageController.deletePackage);

// Packages (user-facing: list active, purchase, my subscription)
const userPackageController = require('../controllers/userPackageController');
router.get('/packages', authMiddleware, userPackageController.listPackages);
router.post('/user/subscriptions', authMiddleware, userPackageController.purchasePackage);
router.get('/user/subscription', authMiddleware, userPackageController.getMySubscription);
router.get('/user/document-access', authMiddleware, userPackageController.getDocumentAccess);

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

// Inventory: stock adjustment and stock timeline (per product)
const inventoryController = require('../controllers/inventoryController');
router.post('/business/:businessId/products/:productId/stock', authMiddleware, requireBusiness, inventoryController.adjustStock);
router.get('/business/:businessId/products/:productId/stock-movements', authMiddleware, requireBusiness, inventoryController.getStockMovements);

// Inventory settings (per business)
router.get('/business/:businessId/settings/inventory', authMiddleware, requireBusiness, inventoryController.getInventorySettings);
router.put('/business/:businessId/settings/inventory', authMiddleware, requireBusiness, inventoryController.updateInventorySettings);

// Invoice Routes (Protected; requireBusiness ensures businessId belongs to user)
const invoiceController = require('../controllers/invoiceController');
const invoicePdfController = require('../controllers/invoicePdfController');
const invoiceStatementPdfController = require('../controllers/invoiceStatementPdfController');
const invoicePackingSlipPdfController = require('../controllers/invoicePackingSlipPdfController');
router.post('/business/:businessId/invoices', authMiddleware, requireBusiness, canCreateDocument, invoiceController.createInvoice);
router.get('/business/:businessId/invoices', authMiddleware, requireBusiness, invoiceController.listInvoices);
router.get('/business/:businessId/invoices/:invoiceId', authMiddleware, requireBusiness, invoiceController.getInvoice);
router.put('/business/:businessId/invoices/:invoiceId', authMiddleware, requireBusiness, invoiceController.updateInvoice);
router.delete('/business/:businessId/invoices/:invoiceId', authMiddleware, requireBusiness, invoiceController.deleteInvoice);
router.post('/business/:businessId/invoices/:invoiceId/pdf', authMiddleware, requireBusiness, invoicePdfController.generatePdf);
router.post('/business/:businessId/invoices/:invoiceId/statement-pdf', authMiddleware, requireBusiness, invoiceStatementPdfController.generateStatementPdf);
router.post('/business/:businessId/invoices/:invoiceId/packing-slip-pdf', authMiddleware, requireBusiness, invoicePackingSlipPdfController.generatePackingSlipPdf);

// Quotation Routes (Protected; requireBusiness ensures businessId belongs to user)
const quotationController = require('../controllers/quotationController');
const quotationPdfController = require('../controllers/quotationPdfController');
router.post('/business/:businessId/quotations', authMiddleware, requireBusiness, canCreateDocument, quotationController.createQuotation);
router.get('/business/:businessId/quotations', authMiddleware, requireBusiness, quotationController.listQuotations);
router.get('/business/:businessId/quotations/:quotationId', authMiddleware, requireBusiness, quotationController.getQuotation);
router.put('/business/:businessId/quotations/:quotationId', authMiddleware, requireBusiness, quotationController.updateQuotation);
router.delete('/business/:businessId/quotations/:quotationId', authMiddleware, requireBusiness, quotationController.deleteQuotation);
router.post('/business/:businessId/quotations/:quotationId/pdf', authMiddleware, requireBusiness, quotationPdfController.generatePdf);

// Sales Debit Note Routes (Protected; mirror invoice structure)
const salesDebitNoteController = require('../controllers/salesDebitNoteController');
const salesDebitNotePdfController = require('../controllers/salesDebitNotePdfController');
router.post(
    '/business/:businessId/sales-debit-notes',
    authMiddleware,
    requireBusiness,
    canCreateDocument,
    salesDebitNoteController.createSalesDebitNote
);
router.get(
    '/business/:businessId/sales-debit-notes',
    authMiddleware,
    requireBusiness,
    salesDebitNoteController.listSalesDebitNotes
);
router.get(
    '/business/:businessId/sales-debit-notes/:salesDebitNoteId',
    authMiddleware,
    requireBusiness,
    salesDebitNoteController.getSalesDebitNote
);
router.put(
    '/business/:businessId/sales-debit-notes/:salesDebitNoteId',
    authMiddleware,
    requireBusiness,
    salesDebitNoteController.updateSalesDebitNote
);
router.delete(
    '/business/:businessId/sales-debit-notes/:salesDebitNoteId',
    authMiddleware,
    requireBusiness,
    salesDebitNoteController.deleteSalesDebitNote
);
router.post(
    '/business/:businessId/sales-debit-notes/:salesDebitNoteId/pdf',
    authMiddleware,
    requireBusiness,
    salesDebitNotePdfController.generatePdf
);

// Delivery Challan Routes (Protected; mirror invoice structure)
const deliveryChallanController = require('../controllers/deliveryChallanController');
const deliveryChallanPdfController = require('../controllers/deliveryChallanPdfController');
router.post(
    '/business/:businessId/delivery-challans',
    authMiddleware,
    requireBusiness,
    canCreateDocument,
    deliveryChallanController.createDeliveryChallan
);
router.get(
    '/business/:businessId/delivery-challans',
    authMiddleware,
    requireBusiness,
    deliveryChallanController.listDeliveryChallans
);
router.get(
    '/business/:businessId/delivery-challans/:challanId',
    authMiddleware,
    requireBusiness,
    deliveryChallanController.getDeliveryChallan
);
router.put(
    '/business/:businessId/delivery-challans/:challanId',
    authMiddleware,
    requireBusiness,
    deliveryChallanController.updateDeliveryChallan
);
router.delete(
    '/business/:businessId/delivery-challans/:challanId',
    authMiddleware,
    requireBusiness,
    deliveryChallanController.deleteDeliveryChallan
);
router.post(
    '/business/:businessId/delivery-challans/:challanId/pdf',
    authMiddleware,
    requireBusiness,
    deliveryChallanPdfController.generatePdf
);

// Payment Receipt Routes (Protected; requireBusiness)
const paymentReceiptController = require('../controllers/paymentReceiptController');
const receiptPdfController = require('../controllers/receiptPdfController');
router.post('/business/:businessId/receipts', authMiddleware, requireBusiness, paymentReceiptController.createReceipt);
router.get('/business/:businessId/receipts', authMiddleware, requireBusiness, paymentReceiptController.listReceipts);
router.get('/business/:businessId/receipts/:receiptId', authMiddleware, requireBusiness, paymentReceiptController.getReceipt);
router.put('/business/:businessId/receipts/:receiptId', authMiddleware, requireBusiness, paymentReceiptController.updateReceipt);
router.delete('/business/:businessId/receipts/:receiptId', authMiddleware, requireBusiness, paymentReceiptController.deleteReceipt);
router.post('/business/:businessId/receipts/:receiptId/pdf', authMiddleware, requireBusiness, receiptPdfController.generatePdf);

// Optional: public list of available invoice templates
router.get('/invoice-templates', invoicePdfController.listTemplates);

// Health Check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
