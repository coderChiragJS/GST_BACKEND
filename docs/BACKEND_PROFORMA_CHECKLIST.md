# Backend Proforma Invoice — Verification Checklist

Proforma reuses the **existing quotation flow** (same endpoints, same table). No structural changes to quotations are required. The backend differentiates via `documentType` and `PRF-` prefix.

---

## What the Backend Already Supports

| Component | Status | Notes |
|-----------|--------|-------|
| **Schema** | ✅ | `documentType: 'quotation' \| 'proforma'` in `baseQuotationSchema` |
| **Number validation** | ✅ | Regex accepts both: `/^(QTN\|PRF)-.+/` |
| **Voucher index** | ✅ | `PROFORMA_INVOICE` as separate doc type — PRF- and QTN- sequences are independent |
| **Create** | ✅ | Uses `VoucherIndex.DOC_TYPES.PROFORMA_INVOICE` when `documentType === 'proforma'` |
| **List** | ✅ | Filters by `?documentType=proforma` → only proforma; `?documentType=quotation` → only quotation |
| **Update / Delete** | ✅ | Voucher handling uses `existing.documentType` or payload `documentType` |
| **PDF** | ✅ | Auto-detects `quotation.documentType === 'proforma'` and uses `proforma.html` template |

---

## Quick Verification (No Code Change Needed)

1. **List proforma only**
   ```http
   GET /business/{businessId}/quotations?documentType=proforma
   ```
   Response should contain only records where `documentType === 'proforma'`.

2. **Create proforma**
   ```http
   POST /business/{businessId}/quotations
   Content-Type: application/json
   {
     "documentType": "proforma",
     "quotationNumber": "PRF-000001",
     "quotationDate": "2026-02-26",
     "status": "draft",
     "seller": { "firmName": "...", "gstNumber": "..." },
     "buyerName": "",
     "items": []
   }
   ```
   Should return `201` with the created quotation including `documentType: "proforma"`.

3. **PDF**
   ```http
   POST /business/{businessId}/quotations/{quotationId}/pdf
   { "templateId": "classic" }
   ```
   For a proforma document, the backend uses the proforma template based on stored `documentType`.

---

## Prefix Consistency Validation (Implemented)

The schema includes a `.refine()` that ensures:

- `documentType === 'proforma'` → `quotationNumber` must start with `PRF-`
- `documentType === 'quotation'` → `quotationNumber` must start with `QTN-`

If a mismatch is sent (e.g. `documentType: 'proforma'` with `quotationNumber: 'QTN-000001'`), the API returns 400 with a clear message.

---

## Summary

**No backend changes are required** if:

- Quotation controller has `documentType` in schema and `PROFORMA_INVOICE` in voucher handling
- List filters by `documentType` query param
- PDF controller checks `quotation.documentType === 'proforma'`
- Voucher index includes `PROFORMA_INVOICE`

Quotation flow remains unchanged. Proforma is supported by `documentType` and the `PRF-` prefix.
