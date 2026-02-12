# What the Frontend Must Send for Seal & Signature in PDFs

To show **stamp (seal)** and **signature** images in generated PDFs, the frontend must send two URL fields when creating or updating documents. Below is exactly what the backend expects.

---

## 1. Field names (exact)

| Field name       | Type   | Meaning                    |
|------------------|--------|----------------------------|
| `stampUrl`       | string | URL of the **stamp/seal** image  |
| `signatureUrl`   | string | URL of the **signature** image   |

- Use these names **exactly** (camelCase).
- Values must be **full URLs** (e.g. `https://...`), not file paths or keys.
- Both fields are **optional**. If you don’t send them, that document’s PDF may not show seal/signature (unless the backend falls back to business defaults for that document type).

---

## 2. Where to send them (by document type)

Send `stampUrl` and `signatureUrl` in the **request body** of the **create** and **update** APIs for each document type.

### Invoices

| Action | Method | Endpoint | Body must include |
|--------|--------|----------|--------------------|
| Create | `POST` | `/business/:businessId/invoices` | `stampUrl`, `signatureUrl` (optional) |
| Update | `PUT` / `PATCH` | `/business/:businessId/invoices/:invoiceId` | `stampUrl`, `signatureUrl` (optional) |

**Example (create):**
```json
{
  "invoiceNumber": "INV-001",
  "type": "taxInvoice",
  "status": "saved",
  "seller": { ... },
  "buyerName": "...",
  "items": [ ... ],
  "stampUrl": "https://your-bucket.s3.region.amazonaws.com/path/to/stamp.png",
  "signatureUrl": "https://your-bucket.s3.region.amazonaws.com/path/to/signature.png"
}
```

### Sales Debit Notes

| Action | Method | Endpoint | Body must include |
|--------|--------|----------|--------------------|
| Create | `POST` | `/business/:businessId/sales-debit-notes` | `stampUrl`, `signatureUrl` (optional) |
| Update | `PUT` / `PATCH` | `/business/:businessId/sales-debit-notes/:salesDebitNoteId` | `stampUrl`, `signatureUrl` (optional) |

Same two fields in the JSON body. If you don’t send them, the backend may use the **business** `defaultStampUrl` / `defaultSignatureUrl` when generating the PDF (if set in business/master settings).

### Delivery Challans

| Action | Method | Endpoint | Body must include |
|--------|--------|----------|--------------------|
| Create | `POST` | `/business/:businessId/delivery-challans` | `stampUrl`, `signatureUrl` (optional) |
| Update | `PUT` / `PATCH` | `/business/:businessId/delivery-challans/:challanId` | `stampUrl`, `signatureUrl` (optional) |

Same two fields. Fallback to business defaults applies here too when the document doesn’t have URLs.

### Quotations

| Action | Method | Endpoint | Body must include |
|--------|--------|----------|--------------------|
| Create | `POST` | `/business/:businessId/quotations` | `stampUrl`, `signatureUrl` (optional) |
| Update | `PUT` / `PATCH` | `/business/:businessId/quotations/:quotationId` | `stampUrl`, `signatureUrl` (optional) |

Same two fields in the body.

---

## 3. Where the frontend can get the URL values

1. **Upload first**  
   Use your existing “upload image” API. The response should return a **public URL** for the uploaded file (e.g. S3 URL).  
   - Use one URL for the **stamp** image → send as `stampUrl`.  
   - Use one URL for the **signature** image → send as `signatureUrl`.

2. **Business defaults (master settings)**  
   When the user saves default seal/signature in “business” or “master settings”, your app already calls something like:
   - `PATCH /business/:businessId` with `defaultStampUrl` and `defaultSignatureUrl`.

   When **creating or editing** an invoice (or SDN/challan/quotation), the frontend should:
   - Either send the **document-level** `stampUrl` and `signatureUrl` (e.g. from the current screen),  
   - Or, if the user did not set document-level images, send the **business** default URLs as `stampUrl` and `signatureUrl` in the document create/update body.

   So for **every** create/update of invoice, SDN, delivery challan, or quotation, the body should include:
   - `stampUrl`: either the document’s stamp URL or the business `defaultStampUrl`.
   - `signatureUrl`: either the document’s signature URL or the business `defaultSignatureUrl`.

That way the backend always has URLs to render in the PDF.

---

## 4. Summary checklist for frontend

- [ ] Use **exact** field names: `stampUrl`, `signatureUrl` (camelCase).
- [ ] Send **full HTTPS URLs** (e.g. from your upload API or S3), not file paths.
- [ ] Include both fields in the **body** of **create** and **update** for:
  - Invoices  
  - Sales Debit Notes  
  - Delivery Challans  
  - Quotations  
- [ ] When the user has not chosen a document-specific image, send the business `defaultStampUrl` and `defaultSignatureUrl` as that document’s `stampUrl` and `signatureUrl`.
- [ ] Do **not** rely on the backend “knowing” the business defaults for **invoices**: the invoice PDF uses only what is on the invoice record. So for invoices, always send `stampUrl` and `signatureUrl` in the request body (from upload or from business defaults).

If the frontend does the above, the backend templates will show seal and signature in the generated PDFs.
