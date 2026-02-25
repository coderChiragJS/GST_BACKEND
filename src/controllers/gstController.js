const {
    getStateByCode,
    getStateByGstin,
    getStateByName,
    getAllStates,
    isValidStateCode
} = require('../data/gstStates');
const { getHsnRate } = require('../data/hsnRates');
const { deriveGstContext } = require('../services/gstDeterminationService');

/**
 * POST /api/gst/place-of-supply
 * Place of supply = Bill-To (buyer) state only. Per IGST Act Section 10(1)(a) and 10(1)(b).
 * Body: sellerStateCode, sellerStateName, sellerGstNumber, buyerStateCode, buyerStateName, buyerGstin
 * (shippingStateCode/shippingStateName are ignored for GST)
 * Returns: placeOfSupplyStateCode, placeOfSupplyStateName, supplyTypeDisplay (intrastate|interstate)
 */
function placeOfSupply(req, res) {
    try {
        const body = req.body || {};
        const result = deriveGstContext({
            sellerStateCode: body.sellerStateCode,
            sellerStateName: body.sellerStateName,
            sellerGstNumber: body.sellerGstNumber,
            buyerGstin: body.buyerGstin,
            buyerStateCode: body.buyerStateCode,
            buyerStateName: body.buyerStateName
        });

        if (result.error) {
            return res.status(400).json({
                error: result.error,
                code: 'INVALID_INPUT'
            });
        }

        return res.status(200).json({
            placeOfSupplyStateCode: result.placeOfSupplyStateCode,
            placeOfSupplyStateName: result.placeOfSupplyStateName,
            supplyTypeDisplay: result.supplyTypeDisplay
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
