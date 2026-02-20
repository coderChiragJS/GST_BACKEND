# Backend: Invoice Statement PDF (Payment History Only)

This document describes the API contract for **Invoice statement PDF**: a **separate** PDF that contains **only payment history** for an invoice (date and amount of each payment, total paid, balance due). The **invoice PDF is unchanged** and does not include payment history. The statement PDF lets users view or share a payment summary without opening the full invoice.

---

## 1. Purpose

- **App behaviour:** For a saved invoice, the user can tap **More → Invoice statement (PDF)**. The app requests a PDF URL from the backend and opens it in-app (same viewer as other PDFs).
- **PDF content:** A **standalone** document with **payment history only**: title “Payment statement”, invoice number reference, table of payments (date, amount, receipt number), **Total amount paid**, and **Balance due**. The **invoice PDF remains as-is** (no payment history added to it).

---

## 2. Endpoint

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/business/:businessId/invoices/:invoiceId/statement-pdf` | Generate invoice statement PDF; returns PDF URL |

- **Path parameters:** `businessId`, `invoiceId` (same as existing invoice APIs).
- **Auth:** Same as existing APIs: `Authorization: Bearer <token>`.
- **Base URL:** Same as for invoices and receipts.

---

## 3. Request

**Headers**

- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body (JSON, optional)**

| Field       | Type   | Required | Notes                                      |
|------------|--------|----------|--------------------------------------------|
| templateId | string | No       | PDF template; default `"classic"` if omitted |

Example:

```json
{
  "templateId": "classic"
}
```

---

## 4. Response

**Success: 200 OK**

Return a JSON object with the URL of the generated PDF (same pattern as existing invoice PDF and receipt PDF).

| Field   | Type   | Notes                                      |
|---------|--------|--------------------------------------------|
| pdfUrl  | string | Public URL to the generated PDF (e.g. S3)  |
| invoiceId | string | Optional; echo of the requested invoiceId  |
| templateId | string | Optional; echo of the template used       |

Example:

```json
{
  "pdfUrl": "https://your-bucket.s3.region.amazonaws.com/invoices/.../statement-classic.pdf",
  "invoiceId": "abb7c269-e7d0-497e-a878-5eb9fb14171e",
  "templateId": "classic"
}
```

**Errors**

- **404 Not Found** – Invoice does not exist or does not belong to the business. Body e.g. `{ "message": "Invoice not found" }`.
- **400 Bad Request** – Invalid request (e.g. invalid templateId). Body e.g. `{ "message": "...", "code": "VALIDATION_FAILED" }`.
- **500** – Server error. Body e.g. `{ "message": "...", "error": "..." }`.

---

## 5. PDF Content Requirements

The generated PDF is a **separate document** (no invoice content). It must include:

1. **Title and invoice reference**  
   - **Title:** e.g. “Payment statement”.
   - **Invoice reference:** e.g. “Invoice: INV-001” so the user knows which invoice the statement refers to.

2. **Payment history table**  
   - One row per payment applied to this invoice. For each payment include:
     - **Date** – receipt date (e.g. DD-MM-YYYY or as per locale).
     - **Amount** – amount applied to this invoice (allocated amount).
     - **Receipt number** (optional but recommended) – e.g. PR-000001.
   - **Totals:**
     - **Total amount paid** – sum of all payments (must match invoice `paidAmount`).
     - **Balance due** – invoice grand total minus total amount paid (show as 0.00 when fully paid).

3. **Data source for payment history**  
   - Backend should derive the list from **receipts that have an allocation for this invoice**.
   - For each such receipt, take the allocation row where `invoiceId` matches this invoice; use that row’s `allocatedAmount` and the receipt’s `receiptDate` and `receiptNumber`.
   - Sort by receipt date (ascending recommended).

If there are **no payments**, still show the payment history section with a line like “No payments recorded yet” and totals: **Total amount paid: ₹0.00**, **Balance due: ₹[grand total]**.

---

## 6. Backend Implementation Notes

- **Separate PDF:** The statement PDF is **not** the invoice PDF. Do **not** include invoice content (items, buyer, etc.). Generate a standalone document with only the payment statement (title, invoice number, payment table, totals). The invoice PDF remains unchanged.
- **Fetching payment history:** Query receipts that have at least one allocation with `invoiceId = :invoiceId`. From each receipt use: `receiptDate`, `receiptNumber`, and the allocation’s `allocatedAmount` for this invoice. Ensure the sum of these amounts equals the invoice’s `paidAmount` (already maintained by your receipt create/update/delete logic).
- **Rounding:** Format all amounts in the PDF to 2 decimal places. Balance due should be shown as 0.00 when the invoice is fully paid (e.g. when `paidAmount >= grandTotal` or balance &lt; 0.01).
- **URL lifetime:** Return a pre-signed or public URL with the same expiry/lifecycle policy as your existing invoice and receipt PDFs so the app can open it in a WebView or browser.

---

## 7. Frontend Usage

- The app calls **POST** `/business/{businessId}/invoices/{invoiceId}/statement-pdf` with body `{ "templateId": "classic" }`.
- On **200**, it opens the returned `pdfUrl` in the in-app PDF viewer (same as invoice/receipt PDFs).
- On **404** or other errors, it shows a friendly message (e.g. “Invoice statement PDF is not available yet”) so missing backend support does not confuse the user.

**Flutter (short):** User taps **More → Invoice statement (PDF)** on a saved invoice. Call **POST** `/business/{businessId}/invoices/{invoiceId}/statement-pdf` (same base URL and `Authorization: Bearer <token>`). Body: `{}` or `{ "templateId": "classic" }`. On **200**, open `response['pdfUrl']` in your in-app PDF viewer (same as invoice/receipt PDFs). On 404/400/500 show a short message (e.g. "Statement not available"). Reuse the same PDF viewer as for invoice and receipt PDFs.

---

## 8. Summary

| Item | Detail |
|------|--------|
| Endpoint | `POST /business/:businessId/invoices/:invoiceId/statement-pdf` |
| Body | Optional `{ "templateId": "classic" }` |
| Response | `200` → `{ "pdfUrl": "..." }` |
| PDF content | **Separate** payment statement only: title, invoice ref, payment table (date, amount, receipt no.), total paid, balance due. Invoice PDF unchanged. |
| Payment data | From receipts that allocate to this invoice; one row per payment; totals consistent with `paidAmount` |
