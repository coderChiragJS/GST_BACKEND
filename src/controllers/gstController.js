const {
    getStateByCode,
    getStateByGstin,
    getStateByName,
    getAllStates,
    isValidStateCode
} = require('../data/gstStates');
const { getHsnRate } = require('../data/hsnRates');

function normalizeStateCode(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (s.length === 0) return null;
    if (/^\d{1,2}$/.test(s)) return s.padStart(2, '0').slice(-2);
    return null;
}

/**
 * POST /api/gst/place-of-supply
 * Body: supplyType, sellerStateCode, sellerStateName, buyerStateCode, buyerStateName,
 *       buyerGstin, shippingStateCode, shippingStateName
 * Returns: placeOfSupplyStateCode, placeOfSupplyStateName, supplyTypeDisplay (intrastate|interstate)
 */
function placeOfSupply(req, res) {
    try {
        const body = req.body || {};
        const supplyType = (body.supplyType || 'goods').toLowerCase();
        const sellerStateCode = normalizeStateCode(body.sellerStateCode) || (body.sellerStateName ? getStateByName(body.sellerStateName)?.code : null);
        const sellerState = sellerStateCode ? getStateByCode(sellerStateCode) : null;

        let placeState = null;
        const buyerStateCode = normalizeStateCode(body.buyerStateCode);
        const buyerStateName = body.buyerStateName;
        const buyerGstin = body.buyerGstin && String(body.buyerGstin).trim();
        const shippingStateCode = normalizeStateCode(body.shippingStateCode);
        const shippingStateName = body.shippingStateName;

        if (buyerStateCode) placeState = getStateByCode(buyerStateCode);
        if (!placeState && buyerStateName) placeState = getStateByName(buyerStateName);
        if (!placeState && buyerGstin && buyerGstin.length >= 2) placeState = getStateByGstin(buyerGstin);
        if (!placeState && shippingStateCode) placeState = getStateByCode(shippingStateCode);
        if (!placeState && shippingStateName) placeState = getStateByName(shippingStateName);

        if (!placeState) {
            return res.status(400).json({
                error: 'Could not determine place of supply. Provide at least one of: buyerStateCode, buyerStateName, buyerGstin, shippingStateCode, shippingStateName.',
                code: 'INVALID_INPUT'
            });
        }

        const placeOfSupplyStateCode = placeState.code;
        const placeOfSupplyStateName = placeState.name;
        const sellerCode = sellerState ? sellerState.code : null;
        const supplyTypeDisplay = (sellerCode && sellerCode === placeOfSupplyStateCode) ? 'intrastate' : 'interstate';

        return res.status(200).json({
            placeOfSupplyStateCode,
            placeOfSupplyStateName,
            supplyTypeDisplay
        });
    } catch (err) {
        console.error('Place of supply error:', err);
        return res.status(500).json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
}

/**
 * GET /api/gst/state-from-gstin?gstin=
 */
function stateFromGstin(req, res) {
    try {
        const gstin = (req.query.gstin || '').trim();
        if (!gstin || gstin.length !== 15) {
            return res.status(400).json({ error: 'Invalid GSTIN', code: 'INVALID_GSTIN' });
        }
        const state = getStateByGstin(gstin);
        if (!state) {
            return res.status(400).json({ error: 'Invalid GSTIN', code: 'INVALID_GSTIN' });
        }
        return res.status(200).json({ stateCode: state.code, stateName: state.name });
    } catch (err) {
        console.error('State from GSTIN error:', err);
        return res.status(500).json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
}

/**
 * GET /api/gst/hsn-rate?code=
 */
function hsnRate(req, res) {
    try {
        const code = (req.query.code || '').trim();
        if (!code || code.length < 2) {
            return res.status(400).json({ error: 'Code is required (min 2 characters)', code: 'INVALID_INPUT' });
        }
        const row = getHsnRate(code);
        if (!row) {
            return res.status(404).json({ error: 'HSN/SAC code not found', code: 'NOT_FOUND' });
        }
        return res.status(200).json({
            code: row.code,
            description: row.description,
            gstRate: row.gstRate
        });
    } catch (err) {
        console.error('HSN rate error:', err);
        return res.status(500).json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
}

/**
 * GET /api/gst/validate-gstin?gstin=
 */
function validateGstin(req, res) {
    try {
        const gstin = (req.query.gstin || '').trim();
        if (!gstin || gstin.length !== 15) {
            return res.status(200).json({
                valid: false,
                stateCode: null,
                stateName: null,
                message: 'Invalid GSTIN format'
            });
        }
        const state = getStateByGstin(gstin);
        if (!state) {
            return res.status(200).json({
                valid: false,
                stateCode: null,
                stateName: null,
                message: 'Invalid GSTIN format'
            });
        }
        return res.status(200).json({
            valid: true,
            stateCode: state.code,
            stateName: state.name,
            message: 'Valid'
        });
    } catch (err) {
        console.error('Validate GSTIN error:', err);
        return res.status(500).json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
}

/**
 * GET /api/master/states
 */
function listStates(req, res) {
    try {
        const states = getAllStates();
        return res.status(200).json(states);
    } catch (err) {
        console.error('List states error:', err);
        return res.status(500).json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
}

module.exports = {
    placeOfSupply,
    stateFromGstin,
    hsnRate,
    validateGstin,
    listStates
};
