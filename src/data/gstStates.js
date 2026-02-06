/**
 * GST state codes and names for India (CBIC). Used by place-of-supply,
 * state-from-GSTIN, and validate-GSTIN. No database; read-only reference.
 */
const GST_STATES = [
    { code: '01', name: 'Jammu and Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '25', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: '26', name: 'Maharashtra' },
    { code: '27', name: 'Goa' },
    { code: '28', name: 'Karnataka' },
    { code: '29', name: 'Kerala' },
    { code: '30', name: 'Tamil Nadu' },
    { code: '31', name: 'Puducherry' },
    { code: '32', name: 'Andaman and Nicobar Islands' },
    { code: '33', name: 'Telangana' },
    { code: '34', name: 'Andhra Pradesh' },
    { code: '35', name: 'Ladakh' },
    { code: '36', name: 'Lakshadweep' }
];

const stateByCode = new Map(GST_STATES.map((s) => [s.code, s]));
const stateByNameLower = new Map(
    GST_STATES.map((s) => [s.name.toLowerCase().trim(), s])
);

function getStateByCode(code) {
    if (!code || typeof code !== 'string') return null;
    const normalized = code.trim().padStart(2, '0').slice(-2);
    return stateByCode.get(normalized) || null;
}

function getStateByGstin(gstin) {
    if (!gstin || typeof gstin !== 'string' || gstin.length < 2) return null;
    const code = gstin.trim().slice(0, 2);
    return getStateByCode(code);
}

function getStateByName(name) {
    if (!name || typeof name !== 'string') return null;
    return stateByNameLower.get(name.toLowerCase().trim()) || null;
}

function getAllStates() {
    return GST_STATES.slice().sort((a, b) => a.code.localeCompare(b.code));
}

function isValidStateCode(code) {
    return getStateByCode(code) !== null;
}

module.exports = {
    GST_STATES,
    getStateByCode,
    getStateByGstin,
    getStateByName,
    getAllStates,
    isValidStateCode
};
