const { createPackagePayment } = require('../services/phonePeService');
const { Payment, PaymentStatus } = require('../models/paymentModel');
const Package = require('../models/packageModel');
const UserSubscription = require('../models/userSubscriptionModel');
const crypto = require('crypto');

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
            // Webhook auth verification (per PhonePe docs):
            // Authorization: SHA256(username:password)
            const authHeader = (req.headers.authorization || '').trim();
            if (!authHeader) {
                return res.status(401).send('Unauthorized');
            }

            const configuredUser = process.env.PHONEPE_WEBHOOK_USERNAME || '';
            const configuredPass = process.env.PHONEPE_WEBHOOK_PASSWORD || '';
            const expectedHash = crypto
                .createHash('sha256')
                .update(`${configuredUser}:${configuredPass}`)
                .digest('hex');

            if (authHeader !== expectedHash) {
                return res.status(401).send('Unauthorized');
            }

            const body = req.body || {};
            // PhonePe standard checkout webhooks typically send a wrapper with `type` and `payload`.
            // We support both the wrapped and flat formats:
            //  {
            //    "type": "CHECKOUT_ORDER_COMPLETED",
            //    "payload": {
            //      "originalMerchantOrderId": "ORD_xxx", // our merchant orderId
            //      "orderId": "PG_ORDER_ID",
            //      "amount": 100,
            //      "state": "COMPLETED"
            //    }
            //  }
            const payload = body.payload || body;

            const merchantOrderId =
                payload.originalMerchantOrderId ||
                payload.merchantOrderId ||
                payload.orderId ||
                payload.order_id;

            const transactionStatus =
                payload.code ||
                payload.transactionStatus ||
                payload.status ||
                payload.state; // e.g. "COMPLETED"

            const amountPaise = payload.amount;

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

            const normalizedStatus = String(transactionStatus || '').toUpperCase();
            // Treat both "SUCCESS" and "COMPLETED" (and future similar values) as success.
            const isSuccess =
                normalizedStatus === 'SUCCESS' ||
                normalizedStatus === 'COMPLETED' ||
                normalizedStatus === 'CHARGED';

            if (!isSuccess) {
                await Payment.markFailed(merchantOrderId, `Payment failed with code: ${transactionStatus}`);
                return res.status(200).send('OK');
            }

            // Mark payment success
            await Payment.markSuccess(
                merchantOrderId,
                payload.transactionId || payload.transaction_id || null
            );

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

