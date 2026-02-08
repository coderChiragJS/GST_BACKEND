const { dynamoDb } = require('../config/db');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.APP_DATA_TABLE;
const PK_SETTING = 'SETTING';

const SETTING_KEYS = {
    GLOBAL_TRIAL_DAYS: 'GLOBAL_TRIAL_DAYS'
};

const Settings = {
    async get(settingKey) {
        const params = {
            TableName: TABLE_NAME,
            Key: { PK: PK_SETTING, SK: settingKey }
        };
        const result = await dynamoDb.send(new GetCommand(params));
        return result.Item ? result.Item.settingValue : null;
    },

    async set(settingKey, settingValue) {
        const now = new Date().toISOString();
        const item = {
            PK: PK_SETTING,
            SK: settingKey,
            settingValue,
            updatedAt: now
        };
        await dynamoDb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));
        return item;
    },

    async getTrialDays() {
        const value = await this.get(SETTING_KEYS.GLOBAL_TRIAL_DAYS);
        const num = value != null ? Number(value) : NaN;
        return Number.isFinite(num) && num >= 0 ? num : 14;
    },

    async setTrialDays(days) {
        const num = Number(days);
        if (!Number.isFinite(num) || num < 0) {
            throw new Error('trialDays must be a non-negative number');
        }
        await this.set(SETTING_KEYS.GLOBAL_TRIAL_DAYS, num);
        return num;
    }
};

module.exports = { Settings, SETTING_KEYS };
