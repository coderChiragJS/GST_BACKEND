const { createPackagePayment } = require('../services/phonePeService');
const { Payment, PaymentStatus } = require('../models/paymentModel');
const Package = require('../models/packageModel');
const UserSubscription = require('../models/userSubscriptionModel');

module.exports = {
    // POST /payments/phonepe/create – initiate PhonePe Standard Checkout for a package
    async createPhonePePayment(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { packageId } = req.body || {};
            if (!packageId) {
                return res.status(400).json({ error: 'packageId is required' });
            }

            const { payment, checkoutUrl, phonePeOrderId } = await createPackagePayment({
                userId,
                packageId
            });

            return res.status(201).json({
                paymentId: payment.orderId,
                checkoutUrl,
                phonePeOrderId
            });
        } catch (error) {
            console.error('Create PhonePe Payment Error:', error);
            if (error.code === 'PACKAGE_NOT_FOUND') {
                return res.status(404).json({ error: error.message });
            }
            if (error.code === 'AMOUNT_TOO_LOW') {
                return res.status(400).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    },

    // POST /payments/phonepe/callback – PhonePe server-to-server callback
    async phonePeCallback(req, res) {
        try {
            // Basic Auth verification
            const authHeader = req.headers.authorization || '';
            if (!authHeader.startsWith('Basic ')) {
                return res.status(401).send('Unauthorized');
            }

            const base64 = authHeader.replace('Basic ', '');
            const decoded = Buffer.from(base64, 'base64').toString('utf8');
            const [username, password] = decoded.split(':');

            if (
                username !== process.env.PHONEPE_WEBHOOK_USERNAME ||
                password !== process.env.PHONEPE_WEBHOOK_PASSWORD
            ) {
                return res.status(401).send('Unauthorized');
            }

            const body = req.body || {};
            const merchantOrderId = body.merchantOrderId || body.orderId || body.order_id;
            const transactionStatus = body.code || body.transactionStatus || body.status;
            const amountPaise = body.amount;

            if (!merchantOrderId) {
                return res.status(400).send('Missing merchantOrderId');
            }

            const payment = await Payment.getByOrderId(merchantOrderId);
            if (!payment) {
                // Unknown order – acknowledge but do nothing
                return res.status(200).send('OK');
            }

            // If already processed, just ACK
            if (payment.status === PaymentStatus.SUCCESS || payment.status === PaymentStatus.FAILED) {
                return res.status(200).send('OK');
            }

            // Ensure amount matches
            if (amountPaise && Number(amountPaise) !== Number(payment.amountPaise)) {
                await Payment.markFailed(merchantOrderId, 'Amount mismatch');
                return res.status(400).send('Amount mismatch');
            }

            const isSuccess = String(transactionStatus).toUpperCase() === 'SUCCESS';

            if (!isSuccess) {
                await Payment.markFailed(merchantOrderId, `Payment failed with code: ${transactionStatus}`);
                return res.status(200).send('OK');
            }

            // Mark payment success
            await Payment.markSuccess(merchantOrderId, body.transactionId || body.transaction_id || null);

            // Credit subscription usage for this package
            const pkg = await Package.getById(payment.packageId);
            if (pkg && pkg.isActive) {
                await UserSubscription.create(payment.userId, {
                    packageId: pkg.packageId,
                    name: pkg.name,
                    invoiceLimit: pkg.invoiceLimit,
                    quotationLimit: pkg.quotationLimit
                });
            }

            // ACK to PhonePe
            return res.status(200).send('OK');
        } catch (error) {
            console.error('PhonePe Callback Error:', error);
            // Respond 200 so PhonePe does not retry indefinitely; log error for manual investigation
            return res.status(200).send('OK');
        }
    }
};

