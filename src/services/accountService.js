const Account = require('../models/accountModel');
const AccountTransaction = require('../models/accountTransactionModel');

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function ensureDefaultCashAccount(userId, businessId) {
    const accounts = await Account.listByBusiness(userId, businessId);
    const existingCash = accounts.find((a) => a.type === 'cash');
    if (existingCash) {
        return existingCash;
    }
    return Account.create(userId, businessId, {
        name: 'Cash',
        type: 'cash',
        isDefault: true,
        openingBalance: 0,
        closingBalance: 0
    });
}

async function getAccountOrDefaultCash(userId, businessId, accountId) {
    if (accountId) {
        const acc = await Account.getById(userId, businessId, accountId);
        if (!acc) {
            const err = new Error('Account not found');
            err.code = 'ACCOUNT_NOT_FOUND';
            throw err;
        }
        return acc;
    }
    return ensureDefaultCashAccount(userId, businessId);
}

async function createAccount(userId, businessId, data) {
    const created = await Account.create(userId, businessId, data);
    if (created.openingBalance) {
        await AccountTransaction.create(userId, businessId, created.accountId, {
            type: 'opening',
            direction: created.openingBalance >= 0 ? 'in' : 'out',
            amount: Math.abs(created.openingBalance),
            balanceAfter: created.closingBalance,
            narration: 'Opening balance'
        });
    }
    return created;
}

async function addMoney(userId, businessId, accountId, payload) {
    const account = await getAccountOrDefaultCash(userId, businessId, accountId);
    const amount = Number(payload.amount) || 0;
    if (amount <= 0) {
        const err = new Error('Amount must be greater than zero');
        err.code = 'INVALID_AMOUNT';
        throw err;
    }
    const updated = await Account.updateBalance(userId, businessId, account.accountId, amount);
    await AccountTransaction.create(userId, businessId, account.accountId, {
        type: payload.type || 'add',
        direction: 'in',
        amount,
        balanceAfter: updated.closingBalance,
        referenceType: payload.referenceType || null,
        referenceId: payload.referenceId || null,
        referenceNumber: payload.referenceNumber || null,
        narration: payload.narration || payload.source || null
    });
    return updated;
}

async function withdrawMoney(userId, businessId, accountId, payload) {
    const account = await getAccountOrDefaultCash(userId, businessId, accountId);
    const amount = Number(payload.amount) || 0;
    if (amount <= 0) {
        const err = new Error('Amount must be greater than zero');
        err.code = 'INVALID_AMOUNT';
        throw err;
    }
    const type = payload.type || 'withdraw';
    const isReversal = type === 'receipt-reversal' || type === 'tds-reversal';
    if (!isReversal) {
        const currentBalance = Number(account.closingBalance) || 0;
        if (currentBalance < amount) {
            const err = new Error('Insufficient balance');
            err.code = 'INSUFFICIENT_BALANCE';
            throw err;
        }
    }
    const updated = await Account.updateBalance(userId, businessId, account.accountId, -amount);
    await AccountTransaction.create(userId, businessId, account.accountId, {
        type: payload.type || 'withdraw',
        direction: 'out',
        amount,
        balanceAfter: updated.closingBalance,
        referenceType: payload.referenceType || null,
        referenceId: payload.referenceId || null,
        referenceNumber: payload.referenceNumber || null,
        narration: payload.narration || payload.reason || null
    });
    return updated;
}

async function createContraEntry(userId, businessId, { fromAccountId, toAccountId, amount, narration }) {
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        const err = new Error('Both fromAccountId and toAccountId are required and must be different');
        err.code = 'INVALID_CONTRA';
        throw err;
    }
    const value = Number(amount) || 0;
    if (value <= 0) {
        const err = new Error('Amount must be greater than zero');
        err.code = 'INVALID_AMOUNT';
        throw err;
    }

    const from = await getAccountOrDefaultCash(userId, businessId, fromAccountId);
    const to = await getAccountOrDefaultCash(userId, businessId, toAccountId);

    const fromBalance = Number(from.closingBalance) || 0;
    if (fromBalance < value) {
        const err = new Error('Insufficient balance in source account');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
    }

    const updatedFrom = await Account.updateBalance(userId, businessId, from.accountId, -value);
    await AccountTransaction.create(userId, businessId, from.accountId, {
        type: 'contra',
        direction: 'out',
        amount: value,
        balanceAfter: updatedFrom.closingBalance,
        referenceType: 'CONTRA',
        referenceId: null,
        referenceNumber: null,
        narration: narration || `Transfer to ${to.name}`
    });

    const updatedTo = await Account.updateBalance(userId, businessId, to.accountId, value);
    await AccountTransaction.create(userId, businessId, to.accountId, {
        type: 'contra',
        direction: 'in',
        amount: value,
        balanceAfter: updatedTo.closingBalance,
        referenceType: 'CONTRA',
        referenceId: null,
        referenceNumber: null,
        narration: narration || `Transfer from ${from.name}`
    });

    return { from: updatedFrom, to: updatedTo };
}

async function getAccountSummary(userId, businessId) {
    let accounts = await Account.listByBusiness(userId, businessId);
    const hasCash = accounts.some((a) => a.type === 'cash');
    if (!hasCash) {
        const cash = await ensureDefaultCashAccount(userId, businessId);
        accounts = [...accounts, cash];
    }
    let cashBalance = 0;
    let bankBalance = 0;
    for (const acc of accounts) {
        const bal = Number(acc.closingBalance) || 0;
        if (acc.type === 'cash') {
            cashBalance = round2(cashBalance + bal);
        } else if (acc.type === 'bank') {
            bankBalance = round2(bankBalance + bal);
        }
    }
    return {
        cashBalance,
        bankBalance,
        accounts
    };
}

async function getAccountLedger(userId, businessId, accountId, options = {}) {
    const account = await getAccountOrDefaultCash(userId, businessId, accountId);
    const { items, lastEvaluatedKey } = await AccountTransaction.listByAccount(
        userId,
        businessId,
        account.accountId,
        options
    );
    return {
        account,
        transactions: items,
        nextToken: lastEvaluatedKey || null
    };
}

module.exports = {
    ensureDefaultCashAccount,
    createAccount,
    addMoney,
    withdrawMoney,
    createContraEntry,
    getAccountSummary,
    getAccountLedger
};

