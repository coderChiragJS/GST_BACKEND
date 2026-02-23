# TDS Voucher PDF

This document describes the **TDS voucher PDF** feature: generating a printable PDF with all TDS voucher details (business header, voucher number, date, party, TDS amount collected, and allocation-to-invoices table).

---

## 1. Overview

- **Purpose:** Generate a standalone PDF for a TDS voucher with full details for sharing or printing.
- **Endpoint:** `POST /business/:businessId/tds-vouchers/:voucherId/pdf`
- **Auth:** `Authorization: Bearer <token>`; user must have access to the business (`requireBusiness`).

The PDF includes:

- Business header (firm name, address, GSTIN)
- Voucher number, date, party (deductor)
- TDS amount collected
- Table of allocations: #, Invoice No, TDS Allocated (₹)
- Total TDS allocated
- Total TDS in words
- Authorised Signatory

---

## 2. API

### 2.1 Generate TDS voucher PDF

| Method | Path |
|--------|------|
| POST | `/business/:businessId/tds-vouchers/:voucherId/pdf` |

**Path parameters**

| Parameter | Type | Required | Notes |
|-----------|------|----------|--------|
| businessId | string | Yes | Business ID |
| voucherId | string | Yes | TDS voucher ID (from create/get) |

**Headers**

- `Authorization: Bearer <token>`
- `Content-Type: application/json` (optional; body can be empty)

**Body (optional)**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| templateId | string | No | `classic` (default). Other templates may be added later. |

**Example request**

```http
POST /business/biz123/tds-vouchers/voucher-uuid-456/pdf
Authorization: Bearer <your-jwt>
Content-Type: application/json

{}
```

Or with template:

```json
{ "templateId": "classic" }
```

**Response: 200 OK**

```json
{
  "pdfUrl": "https://bucket.s3.region.amazonaws.com/tds-vouchers/userId/biz123/voucher-uuid-456/classic.pdf",
  "voucherId": "voucher-uuid-456",
  "templateId": "classic"
}
```

| Field | Type | Notes |
|-------|------|--------|
| pdfUrl | string | Public URL of the generated PDF; open in browser or download. |
| voucherId | string | Same as path param. |
| templateId | string | Template used (e.g. `classic`). |

**Errors**

| Status | Body | Notes |
|--------|------|--------|
| 400 | `{ "message": "Business ID and Voucher ID are required in URL" }` | Missing path params. |
| 404 | `{ "message": "TDS voucher not found" }` | Invalid or deleted voucher. |
| 500 | `{ "message": "Failed to generate TDS voucher PDF", "error": "..." }` | Server error (e.g. template, S3). |

---

## 3. When to call

- **After creating a TDS voucher:** On success (201), optionally call this endpoint and show “Download PDF” or open `pdfUrl` in browser.
- **Voucher detail / view screen:** Add a “Download PDF” or “Print” button that calls this endpoint and opens or downloads the returned `pdfUrl`.

---

## 4. Flutter integration

- Use the same base URL and auth as other business APIs.
- After `POST .../tds-vouchers` returns 201 with `voucher.voucherId`, call:
  - `POST .../business/:businessId/tds-vouchers/:voucherId/pdf`
- On 200, use `pdfUrl` with `url_launcher` or a WebView to open/download the PDF.
- On voucher detail screen, add a button that calls the same PDF endpoint and then opens `pdfUrl`.

---

## 5. Backend references

| What | Location |
|------|----------|
| PDF controller | `src/controllers/tdsVoucherPdfController.js` |
| PDF service | `src/services/invoicePdfService.js` (`generateAndUploadTdsVoucherPdf`, `renderTdsVoucherHtml`, `uploadTdsVoucherPdfToS3`) |
| Template | `src/templates/tds-vouchers/classic.html` |
| Route | `src/routes/api.js` – `POST /business/:businessId/tds-vouchers/:voucherId/pdf` |

For full TDS voucher APIs (create, list, get, update, delete, invoices-for-party), see **FLUTTER_TDS_VOUCHER_INTEGRATION.md**.
