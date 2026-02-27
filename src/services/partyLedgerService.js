const { dynamoDb } = require('../config/db');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { computeInvoiceTotals } = require('./invoiceCalculationService');
const Party = require('../models/partyModel');

const TABLE_NAME = process.env.INVOICES_TABLE;

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

const SK_PREFIXES = {
    INVOICE: 'INVOICE#',
    RECEIPT: 'RECEIPT#',
    TDS_VOUCHER: 'TDS_VOUCHER#',
    CREDIT_NOTE: 'CREDIT_NOTE#',
    SALES_DEBIT_NOTE: 'SALES_DEBIT_NOTE#'
};

function getDocType(sk) {
    for (const [type, prefix] of Object.entries(SK_PREFIXES)) {
        if (sk.startsWith(prefix)) return type;
    }
    return null;
}

function getPartyIdFromDoc(doc, docType) {
    switch (docType) {
        case 'INVOICE':
        case 'CREDIT_NOTE':
        case 'SALES_DEBIT_NOTE':
            return doc.buyerId || null;
        case 'RECEIPT':
        case 'TDS_VOUCHER':
            return doc.partyId || null;
        default:
            return null;
    }
}

function getPartyNameFromDoc(doc, docType) {
    switch (docType) {
        case 'INVOICE':
        case 'CREDIT_NOTE':
        case 'SALES_DEBIT_NOTE':
            return doc.buyerName || '';
        case 'RECEIPT':
        case 'TDS_VOUCHER':
            return doc.partyName || '';
        default:
            return '';
    }
}

function normalizeDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getDocDate(doc, docType) {
    let raw;
    switch (docType) {
        case 'INVOICE':
            raw = doc.invoiceDate || doc.createdAt || '';
            break;
        case 'CREDIT_NOTE':
        case 'SALES_DEBIT_NOTE':
            raw = doc.invoiceDate || doc.createdAt || '';
            break;
        case 'RECEIPT':
            raw = doc.receiptDate || doc.createdAt || '';
            break;
        case 'TDS_VOUCHER':
            raw = doc.voucherDate || doc.createdAt || '';
            break;
        default:
            raw = doc.createdAt || '';
    }
    return normalizeDate(raw);
}

function getDocNumber(doc, docType) {
    switch (docType) {
        case 'INVOICE':
        case 'CREDIT_NOTE':
        case 'SALES_DEBIT_NOTE':
            return doc.invoiceNumber || '';
        case 'RECEIPT':
            return doc.receiptNumber || '';
        case 'TDS_VOUCHER':
            return doc.voucherNumber || '';
        default:
            return '';
    }
}

function isActiveDoc(doc, docType) {
    if (docType === 'INVOICE' || docType === 'CREDIT_NOTE' || docType === 'SALES_DEBIT_NOTE') {
        return doc.status === 'saved';
    }
    return true;
}

function buildLedgerRow(doc, docType) {
    let debit = 0;
    let credit = 0;
    let particulars = '';
    let voucherType = '';

    switch (docType) {
        case 'INVOICE': {
            const totals = computeInvoiceTotals(doc);
            debit = round2(totals?.summary?.grandTotal ?? 0);
            particulars = 'Sales';
            voucherType = 'Invoice';
            break;
        }
        case 'SALES_DEBIT_NOTE': {
            const totals = computeInvoiceTotals(doc);
            debit = round2(totals?.summary?.grandTotal ?? 0);
            particulars = 'Sales';
            voucherType = 'Sales Debit Note';
            break;
        }
        case 'CREDIT_NOTE': {
            const totals = computeInvoiceTotals(doc);
            credit = round2(totals?.summary?.grandTotal ?? 0);
            particulars = 'Return';
            voucherType = 'Credit Note';
            break;
        }
        case 'RECEIPT': {
            credit = round2(Number(doc.amountCollected) || 0);
            const mode = doc.paymentMode || 'Cash';
            particulars = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
            voucherType = 'Payment Receipt';
            break;
        }
        case 'TDS_VOUCHER': {
            credit = round2(Number(doc.tdsAmountCollected) || 0);
            particulars = 'TDS';
            voucherType = 'TDS';
            break;
        }
    }

    return {
        date: getDocDate(doc, docType),
        particulars,
        voucherType,
        voucherNumber: getDocNumber(doc, docType),
        debit,
        credit
    };
}

/**
 * Fetch every document in the business's partition of the INVOICES_TABLE.
 * Paginates automatically to handle >1MB responses.
 */
async function fetchAllBusinessDocs(userId, businessId) {
    const pk = `USER#${userId}#BUSINESS#${businessId}`;
    const allItems = [];
    let exclusiveStartKey = null;

    do {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': pk }
        };
        if (exclusiveStartKey) {
            params.ExclusiveStartKey = exclusiveStartKey;
        }
        const result = await dynamoDb.send(new QueryCommand(params));
        allItems.push(...(result.Items || []));
        exclusiveStartKey = result.LastEvaluatedKey || null;
    } while (exclusiveStartKey);

    return allItems;
}

function sortByDate(rows) {
    return rows.sort((a, b) => {
        const dA = a.date ? new Date(a.date).getTime() : 0;
        const dB = b.date ? new Date(b.date).getTime() : 0;
        return dA - dB;
    });
}

/**
 * Build the full ledger for a single party within a date range.
 */
async function buildPartyLedger(userId, businessId, partyId, fromDate, toDate) {
    const [allDocs, party] = await Promise.all([
        fetchAllBusinessDocs(userId, businessId),
        Party.getById(userId, partyId)
    ]);

    if (!party) return null;

    const baseOpeningBalance = Number(party.openingBalance) || 0;
    const openingBalanceType = party.openingBalanceType || 'TO_RECEIVE';
    const signedOpeningBalance = openingBalanceType === 'TO_PAY'
        ? -baseOpeningBalance
        : baseOpeningBalance;

    const partyDocs = [];
    for (const doc of allDocs) {
        const docType = getDocType(doc.SK);
        if (!docType) continue;
        if (!isActiveDoc(doc, docType)) continue;
        const docPartyId = getPartyIdFromDoc(doc, docType);
        if (docPartyId !== partyId) continue;
        partyDocs.push({ doc, docType });
    }

    const allRows = partyDocs.map(({ doc, docType }) => buildLedgerRow(doc, docType));
    sortByDate(allRows);

    let periodOpeningBalance = signedOpeningBalance;
    const periodRows = [];

    for (const row of allRows) {
        const rowDateStr = row.date || '';
        const netAmount = row.debit - row.credit;

        if (fromDate && rowDateStr && rowDateStr < fromDate) {
            periodOpeningBalance = round2(periodOpeningBalance + netAmount);
            continue;
        }
        if (toDate && rowDateStr && rowDateStr > toDate) {
            continue;
        }
        periodRows.push(row);
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const row of periodRows) {
        totalDebit = round2(totalDebit + row.debit);
        totalCredit = round2(totalCredit + row.credit);
    }

    const closingBalance = round2(periodOpeningBalance + totalDebit - totalCredit);

    let currentBalance = signedOpeningBalance;
    for (const row of allRows) {
        currentBalance = round2(currentBalance + row.debit - row.credit);
    }

    const addr = party.billingAddress || {};
    const addressParts = [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean);

    return {
        party: {
            partyId: party.partyId,
            partyName: party.companyName || '',
            gstin: party.gstNumber || '',
            address: addressParts.join(', '),
            mobile: party.mobile || '',
            email: party.email || ''
        },
        period: {
            from: fromDate || null,
            to: toDate || null
        },
        openingBalance: round2(periodOpeningBalance),
        transactions: periodRows,
        totalDebit: round2(totalDebit),
        totalCredit: round2(totalCredit),
        closingBalance: round2(closingBalance),
        currentBalance: round2(currentBalance)
    };
}

/**
 * Build a ledger summary: all parties grouped into debtors and creditors
 * with their current balance.
 */
async function buildLedgerSummary(userId, businessId) {
    const [allDocs, parties] = await Promise.all([
        fetchAllBusinessDocs(userId, businessId),
        Party.listByUser(userId)
    ]);

    const partyMap = {};
    for (const p of parties) {
        const pid = p.partyId;
        const base = Number(p.openingBalance) || 0;
        const type = p.openingBalanceType || 'TO_RECEIVE';
        partyMap[pid] = {
            partyId: pid,
            partyName: p.companyName || '',
            gstin: p.gstNumber || '',
            balance: type === 'TO_PAY' ? -base : base
        };
    }

    for (const doc of allDocs) {
        const docType = getDocType(doc.SK);
        if (!docType) continue;
        if (!isActiveDoc(doc, docType)) continue;

        const pid = getPartyIdFromDoc(doc, docType);
        if (!pid) continue;

        if (!partyMap[pid]) {
            partyMap[pid] = {
                partyId: pid,
                partyName: getPartyNameFromDoc(doc, docType),
                gstin: '',
                balance: 0
            };
        }

        const row = buildLedgerRow(doc, docType);
        partyMap[pid].balance = round2(partyMap[pid].balance + row.debit - row.credit);
    }

    const debtors = [];
    const creditors = [];
    let totalToCollect = 0;
    let totalToPay = 0;

    for (const entry of Object.values(partyMap)) {
        if (entry.balance > 0) {
            debtors.push({ partyId: entry.partyId, partyName: entry.partyName, currentBalance: entry.balance });
            totalToCollect = round2(totalToCollect + entry.balance);
        } else if (entry.balance < 0) {
            creditors.push({ partyId: entry.partyId, partyName: entry.partyName, currentBalance: round2(Math.abs(entry.balance)) });
            totalToPay = round2(totalToPay + Math.abs(entry.balance));
        }
    }

    debtors.sort((a, b) => b.currentBalance - a.currentBalance);
    creditors.sort((a, b) => b.currentBalance - a.currentBalance);

    return {
        debtors: { totalToCollect, parties: debtors },
        creditors: { totalToPay, parties: creditors }
    };
}

module.exports = {
    buildPartyLedger,
    buildLedgerSummary,
    round2
};
