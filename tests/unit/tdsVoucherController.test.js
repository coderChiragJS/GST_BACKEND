const tdsVoucherController = require('../../src/controllers/tdsVoucherController');

describe('tdsVoucherController', () => {
    test('exports all required handlers for routes', () => {
        const required = [
            'listInvoicesForParty',
            'createVoucher',
            'listVouchers',
            'getVoucher',
            'updateVoucher',
            'deleteVoucher'
        ];
        required.forEach((name) => {
            expect(typeof tdsVoucherController[name]).toBe('function');
        });
        expect(Object.keys(tdsVoucherController).sort()).toEqual(required.sort());
    });
});
