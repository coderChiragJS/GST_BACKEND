const Account = require('../models/accountModel');
const AccountTransaction = require('../models/accountTransactionModel');
const accountService = require('../services/accountService');

const accountController = {
    async listAccounts(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const summary = await accountService.getAccountSummary(userId, businessId);
            return res.json(summary);
        } catch (error) {
            console.error('List Accounts Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async createAccount(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const { name, type, openingBalance, bankDetails } = req.body || {};
            if (!name) {
                return res.status(400).json({ message: 'Account name is required' });
            }
            const created = await accountService.createAccount(userId, businessId, {
                name,
                type,
                openingBalance,
                bankDetails
            });
            return res.status(201).json({ account: created });
        } catch (error) {
            console.error('Create Account Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async getAccountLedger(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, accountId } = req.params;
            const { limit, nextToken } = req.query;
            let exclusiveStartKey;
            if (nextToken) {
                try {
                    exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid nextToken', code: 'INVALID_NEXT_TOKEN' });
                }
            }
            const ledger = await accountService.getAccountLedger(userId, businessId, accountId, {
                limit,
                exclusiveStartKey
            });
            let encodedNext = null;
            if (ledger.nextToken) {
                encodedNext = Buffer.from(JSON.stringify(ledger.nextToken)).toString('base64');
            }
            return res.json({
                account: ledger.account,
                transactions: ledger.transactions,
                nextToken: encodedNext
            });
        } catch (error) {
            console.error('Get Account Ledger Error:', error);
            if (error.code === 'ACCOUNT_NOT_FOUND') {
                return res.status(404).json({ message: error.message, code: error.code });
            }
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async addMoney(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, accountId } = req.params;
            const { amount, narration } = req.body || {};
            const updated = await accountService.addMoney(userId, businessId, accountId, {
                amount,
                narration,
                type: 'add'
            });
            return res.json({ account: updated });
        } catch (error) {
            console.error('Add Money Error:', error);
            if (error.code === 'INVALID_AMOUNT' || error.code === 'ACCOUNT_NOT_FOUND') {
                return res.status(400).json({ message: error.message, code: error.code });
            }
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async withdrawMoney(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId, accountId } = req.params;
            const { amount, narration } = req.body || {};
            const updated = await accountService.withdrawMoney(userId, businessId, accountId, {
                amount,
                narration,
                type: 'withdraw'
            });
            return res.json({ account: updated });
        } catch (error) {
            console.error('Withdraw Money Error:', error);
            if (error.code === 'INVALID_AMOUNT' || error.code === 'ACCOUNT_NOT_FOUND' || error.code === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ message: error.message, code: error.code });
            }
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    },

    async createContra(req, res) {
        try {
            const userId = req.user.userId;
            const { businessId } = req.params;
            const { fromAccountId, toAccountId, amount, narration } = req.body || {};
            const result = await accountService.createContraEntry(userId, businessId, {
                fromAccountId,
                toAccountId,
                amount,
                narration
            });
            return res.json(result);
        } catch (error) {
            console.error('Create Contra Error:', error);
            if (error.code === 'INVALID_CONTRA' || error.code === 'INVALID_AMOUNT' || error.code === 'ACCOUNT_NOT_FOUND' || error.code === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ message: error.message, code: error.code });
            }
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }
};

module.exports = accountController;

