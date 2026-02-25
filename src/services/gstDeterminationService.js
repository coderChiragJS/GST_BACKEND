/**
 * GST determination per IGST Act: Section 10(1)(a) Normal Sale, Section 10(1)(b) Bill-To/Ship-To.
 * Place of supply = Bill-To (buyer) state only. GST type = supplier.state vs place of supply.
 * Transport/delivery state is never used for GST.
 */

const { getStateByCode, getStateByGstin, getStateByName } = require('../data/gstStates');

function normalizeStateCode(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (s.length === 0) return null;
    if (/^\d{1,2}$/.test(s)) return s.padStart(2, '0').slice(-2);
    return null;
}

/**
 * Resolve buyer (Bill-To) state from GSTIN, state code, or state name.
 * Priority: buyerGstin -> buyerStateCode -> buyerStateName.
 * @returns {{ code: string, name: string } | null}
 */
function resolveBuyerState(buyerGstin, buyerStateCode, buyerStateName) {
    let placeState = null;
    if (buyerGstin && String(buyerGstin).trim().length >= 2) {
        placeState = getStateByGstin(String(buyerGstin).trim());
    }
    if (!placeState && buyerStateCode) {
        const code = normalizeStateCode(buyerStateCode);
        if (code) placeState = getStateByCode(code);
    }
    if (!placeState && buyerStateName && String(buyerStateName).trim()) {
        placeState = getStateByName(String(buyerStateName).trim());
    }
    return placeState;
}

/**
 * Resolve seller state from state code or GSTIN.
 * @returns {{ code: string, name: string } | null}
 */
function resolveSellerState(sellerStateCode, sellerStateName, sellerGstNumber) {
    let sellerState = null;
    const code = normalizeStateCode(sellerStateCode);
    if (code) sellerState = getStateByCode(code);
    if (!sellerState && sellerStateName && String(sellerStateName).trim()) {
        sellerState = getStateByName(String(sellerStateName).trim());
    }
    if (!sellerState && sellerGstNumber && String(sellerGstNumber).trim().length >= 2) {
        sellerState = getStateByGstin(String(sellerGstNumber).trim());
    }
    return sellerState;
}

/**
 * Derive GST context from Bill-To (buyer) only. Per Section 10(1)(a) and 10(1)(b), IGST Act.
 * Place of supply = buyer state. Supply type = intrastate if supplier.state === placeOfSupply, else interstate.
 *
 * @param {Object} options
 * @param {string} [options.sellerStateCode]
 * @param {string} [options.sellerStateName]
 * @param {string} [options.sellerGstNumber]
 * @param {string} [options.buyerGstin]
 * @param {string} [options.buyerStateCode]
 * @param {string} [options.buyerStateName]
 * @returns {{ placeOfSupplyStateCode: string, placeOfSupplyStateName: string, supplyTypeDisplay: 'intrastate'|'interstate' } | { error: string }}
 */
function deriveGstContext(options = {}) {
    const placeState = resolveBuyerState(
        options.buyerGstin,
        options.buyerStateCode,
        options.buyerStateName
    );
    if (!placeState) {
        return {
            error: 'Place of supply cannot be determined. Provide buyer state (buyerGstin, buyerStateCode, or buyerStateName).'
        };
    }

    const sellerState = resolveSellerState(
        options.sellerStateCode,
        options.sellerStateName,
        options.sellerGstNumber
    );

    const placeOfSupplyStateCode = placeState.code;
    const placeOfSupplyStateName = placeState.name;
    const sellerCode = sellerState ? sellerState.code : null;
    const supplyTypeDisplay =
        sellerCode && sellerCode === placeOfSupplyStateCode ? 'intrastate' : 'interstate';

    return {
        placeOfSupplyStateCode,
        placeOfSupplyStateName,
        supplyTypeDisplay
    };
}

/**
 * Apply derived GST context to a document (invoice/challan/debit note).
 * When requireDerivation: requires buyer state; returns error if cannot derive.
 * Otherwise: derivation optional; no error if buyer missing.
 * Validations: 7.1 warn on place-of-supply mismatch; 7.2/7.3 block wrong tax type.
 *
 * @param {Object} doc - Document with seller, buyerGstin, buyerStateCode, buyerStateName, transportInfo, status
 * @param {{ requireDerivation?: boolean }} [options] - If true, return error when buyer state missing. Default: true when doc.status === 'saved' or doc.status === 'delivered'
 * @returns {{ data?: Object, warnings?: Array<{code: string, message: string}>, error?: string }}
 */
function applyGstContextToDocument(doc, options = {}) {
    const seller = doc.seller || {};
    const result = deriveGstContext({
        sellerStateCode: seller.stateCode,
        sellerStateName: seller.state,
        sellerGstNumber: seller.gstNumber,
        buyerGstin: doc.buyerGstin,
        buyerStateCode: doc.buyerStateCode,
        buyerStateName: doc.buyerStateName
    });

    const status = (doc.status || '').toLowerCase();
    const requireDerivation =
        options.requireDerivation !== undefined
            ? options.requireDerivation
            : status === 'saved' || status === 'delivered';

    if (result.error) {
        if (requireDerivation) {
            return { error: result.error };
        }
        return { data: doc, warnings: [] };
    }

    const transportInfo = { ...(doc.transportInfo || {}) };
    const clientPlaceCode = transportInfo.placeOfSupplyStateCode
        ? String(transportInfo.placeOfSupplyStateCode).trim().padStart(2, '0').slice(-2)
        : null;
    const clientSupplyType = transportInfo.supplyTypeDisplay || null;
    const derivedCode = result.placeOfSupplyStateCode;
    const derivedSupplyType = result.supplyTypeDisplay;

    const warnings = [];

    if (clientPlaceCode && clientPlaceCode !== derivedCode) {
        warnings.push({
            code: 'PLACE_OF_SUPPLY_MISMATCH',
            message: 'Incorrect Place of Supply as per GST law. Document uses derived place of supply (Bill-To).'
        });
    }

    if (clientSupplyType && clientSupplyType !== derivedSupplyType) {
        return {
            error: `GST type must be derived as per law. Expected ${derivedSupplyType} based on Bill-To state. IGST not allowed for intra-state supply when seller and buyer are in same state.`
        };
    }

    transportInfo.placeOfSupplyStateCode = result.placeOfSupplyStateCode;
    transportInfo.placeOfSupplyStateName = result.placeOfSupplyStateName;
    transportInfo.placeOfSupply = result.placeOfSupplyStateName;
    transportInfo.supplyTypeDisplay = result.supplyTypeDisplay;

    return {
        data: { ...doc, transportInfo },
        warnings
    };
}

module.exports = {
    deriveGstContext,
    applyGstContextToDocument,
    resolveBuyerState,
    resolveSellerState,
    normalizeStateCode
};
