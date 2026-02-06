/**
 * HSN/SAC codes with GST rate (%). Read-only reference for GET /api/gst/hsn-rate.
 * Source: GST rate schedule (CBIC). Expand as needed.
 */
const HSN_RATES = [
    { code: '84', description: 'Nuclear reactors, boilers, machinery', gstRate: 18 },
    { code: '8471', description: 'Computers and data processing machines', gstRate: 18 },
    { code: '85', description: 'Electrical machinery and equipment', gstRate: 18 },
    { code: '8517', description: 'Telephones and communication equipment', gstRate: 18 },
    { code: '04', description: 'Dairy produce; birds eggs; natural honey', gstRate: 0 },
    { code: '0402', description: 'Milk and cream', gstRate: 0 },
    { code: '04029990', description: 'Other milk and cream', gstRate: 0 },
    { code: '10', description: 'Cereals', gstRate: 0 },
    { code: '9983', description: 'Information technology support services', gstRate: 18 },
    { code: '99831', description: 'Information technology support and management', gstRate: 18 },
    { code: '998313', description: 'IT infrastructure and network management', gstRate: 18 },
    { code: '9997', description: 'Other professional, technical and business services', gstRate: 18 },
    { code: '0007', description: 'Handling and storage services', gstRate: 18 },
    { code: '9971', description: 'Rental or leasing services', gstRate: 18 },
    { code: '9965', description: 'Goods transport services', gstRate: 18 },
    { code: '9985', description: 'Support services', gstRate: 18 },
    { code: '25', description: 'Salt; sulphur; earths and stone', gstRate: 5 },
    { code: '28', description: 'Inorganic chemicals', gstRate: 18 },
    { code: '39', description: 'Plastics and articles thereof', gstRate: 18 },
    { code: '48', description: 'Paper and paperboard', gstRate: 12 },
    { code: '49', description: 'Printed books, newspapers', gstRate: 0 },
    { code: '72', description: 'Iron and steel', gstRate: 18 },
    { code: '73', description: 'Articles of iron or steel', gstRate: 18 },
    { code: '94', description: 'Furniture; bedding; lamps', gstRate: 18 },
    { code: '0', description: 'General', gstRate: 18 }
];

const byCode = new Map(HSN_RATES.map((r) => [String(r.code).trim(), r]));

function getHsnRate(code) {
    if (!code || typeof code !== 'string') return null;
    const normalized = String(code).trim();
    if (normalized.length < 2) return null;
    if (byCode.has(normalized)) return byCode.get(normalized);
    for (let len = normalized.length - 1; len >= 2; len--) {
        const prefix = normalized.slice(0, len);
        if (byCode.has(prefix)) return byCode.get(prefix);
    }
    return null;
}

module.exports = {
    HSN_RATES,
    getHsnRate
};
