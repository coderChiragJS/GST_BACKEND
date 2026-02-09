const {
    StandardCheckoutClient,
    Env,
    MetaInfo,
    StandardCheckoutPayRequest
} = require('pg-sdk-node');

const { Payment } = require('../models/paymentModel');
const Package = require('../models/packageModel');

const PHONEPE_ENV = process.env.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX;

const client = StandardCheckoutClient.getInstance(
    process.env.PHONEPE_CLIENT_ID,
    process.env.PHONEPE_CLIENT_SECRET,
    Number(process.env.PHONEPE_CLIENT_VERSION || 1),
    PHONEPE_ENV
);

async function createPackagePayment({ userId, packageId }) {
    const pkg = await Package.getById(packageId);
    if (!pkg || !pkg.isActive) {
        const error = new Error('Package not found or inactive');
        error.code = 'PACKAGE_NOT_FOUND';
        throw error;
    }

    const amountPaise = Math.max(0, Math.round((Number(pkg.price) || 0) * 100));
    if (amountPaise < 100) {
        const error = new Error('Amount must be at least ₹1');
        error.code = 'AMOUNT_TOO_LOW';
        throw error;
    }

    // 1. Create local payment record
    const payment = await Payment.create({
        userId,
        packageId,
        amountPaise
    });

    // 2. Build meta info (helpful for debugging in PhonePe dashboard)
    const metaInfo = MetaInfo.builder()
        .udf1(String(userId))
        .udf2(String(packageId))
        .build();

    // 3. Build Standard Checkout pay request using SDK v2 builder API
    //    StandardCheckoutPayRequest.builder() -> set fields -> build()
    const payRequest = StandardCheckoutPayRequest.builder()
        .merchantOrderId(payment.orderId)
        .amount(amountPaise)
        .redirectUrl(process.env.PHONEPE_REDIRECT_URL)
        .metaInfo(metaInfo)
        .build();

    // 4. Call PhonePe to get checkout URL
    const payResponse = await client.pay(payRequest);

    return {
        payment,
        checkoutUrl: payResponse.redirect_url || payResponse.redirectUrl,
        phonePeOrderId: payResponse.order_id || payResponse.orderId
    };
}

module.exports = {
    createPackagePayment
};

