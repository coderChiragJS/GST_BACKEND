const { dynamoDb } = require('../config/db');
const { PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.INVOICES_TABLE;
const SK_PREFIX = 'VOUCHER#';

/** Document types for voucher uniqueness (per type per business). */
const DOC_TYPES = {
    INVOICE: 'INVOICE',
    QUOTATION: 'QUOTATION',
    SALES_DEBIT_NOTE: 'SALES_DEBIT_NOTE',
    DELIVERY_CHALLAN: 'DELIVERY_CHALLAN',
    PAYMENT_RECEIPT: 'PAYMENT_RECEIPT'
};

/**
 * Normalize voucher number for storage/comparison: trim and use as-is (case-sensitive).
 * @param {string} voucherNumber
 * @returns {string}
 */
function normalizeVoucherNumber(voucherNumber) {
    if (typeof voucherNumber !== 'string') return '';
    return voucherNumber.trim();
}

/**
 * Build PK for voucher index (same as document PK).
 */
function pk(userId, businessId) {
    return `USER#${userId}#BUSINESS#${businessId}`;
}

/**
 * Build SK for voucher index: VOUCHER#<docType>#<normalizedNumber>
 */
function sk(docType, voucherNumber) {
    const normalized = normalizeVoucherNumber(voucherNumber);
    return `${SK_PREFIX}${docType}#${normalized}`;
}

/**
 * Claim a voucher number for a document type. Fails if already in use.
 * @param {string} userId
 * @param {string} businessId
 * @param {string} docType - one of DOC_TYPES
 * @param {string} voucherNumber
 * @param {string} [documentId] - optional, for debugging
 * @returns {{ claimed: true }} on success
 * @throws {{ code: 'VOUCHER_NUMBER_TAKEN', message: string }} when number already used
 */
async function claimVoucherNumber(userId, businessId, docType, voucherNumber, documentId = null) {
    const normalized = normalizeVoucherNumber(voucherNumber);
    if (!normalized) {
        const err = new Error('Voucher number is required');
        err.code = 'VOUCHER_NUMBER_REQUIRED';
        throw err;
    }

    const item = {
        PK: pk(userId, businessId),
        SK: sk(docType, voucherNumber),
        docType,
        voucherNumber: normalized,
        claimedAt: new Date().toISOString()
    };
    if (documentId) item.documentId = documentId;

    try {
        await dynamoDb.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: item,
                ConditionExpression: 'attribute_not_exists(SK)'
            })
        );
        return { claimed: true };
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            const e = new Error('Voucher number already in use');
            e.code = 'VOUCHER_NUMBER_TAKEN';
            throw e;
        }
        throw err;
    }
}

/**
 * Release a voucher number so it can be used again (e.g. on document delete).
 */
async function releaseVoucherNumber(userId, businessId, docType, voucherNumber) {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            PK: pk(userId, businessId),
            SK: sk(docType, voucherNumber)
        }
    };
    await dynamoDb.send(new DeleteCommand(params));
    return true;
}

/**
 * Update from old voucher number to new (e.g. on document update).
 * Ensures new number is not already taken; releases old and claims new.
 * @throws {{ code: 'VOUCHER_NUMBER_TAKEN' }} if new number is already in use
 */
async function updateVoucherNumber(userId, businessId, docType, oldNumber, newNumber, documentId = null) {
    const oldNorm = normalizeVoucherNumber(oldNumber);
    const newNorm = normalizeVoucherNumber(newNumber);
    if (oldNorm === newNorm) return { claimed: true };

    if (!newNorm) {
        const err = new Error('Voucher number is required');
        err.code = 'VOUCHER_NUMBER_REQUIRED';
        throw err;
    }

    // First claim the new number (fails if taken)
    await claimVoucherNumber(userId, businessId, docType, newNumber, documentId);
    // Then release the old (best-effort; if no index item, delete is no-op)
    try {
        await releaseVoucherNumber(userId, businessId, docType, oldNumber);
    } catch (_) {
        // Ignore; old item might not exist in edge cases
    }
    return { claimed: true };
}

module.exports = {
    DOC_TYPES,
    normalizeVoucherNumber,
    claimVoucherNumber,
    releaseVoucherNumber,
    updateVoucherNumber
};
