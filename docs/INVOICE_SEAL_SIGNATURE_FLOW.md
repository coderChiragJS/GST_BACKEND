# Invoice Seal & Signature – Full Flow Analysis

This document traces how seal (stamp) and signature images appear in the **Invoice** PDF, from API to template.

---

## 1. API entry point

| Method | Path | Controller |
|--------|------|------------|
| `POST` | `/business/:businessId/invoices/:invoiceId/pdf` | `invoicePdfController.generatePdf` |

**Route:** `src/routes/api.js` (line ~90)  
**Middleware:** `authMiddleware`, `requireBusiness`

**Request body (JSON):**
```json
{ "templateId": "classic" }
```
Allowed `templateId`: `classic`, `modern`, `minimal`.

---

## 2. Controller: load invoice, call PDF service

**File:** `src/controllers/invoicePdfController.js`

```
generatePdf(req, res)
  → userId, businessId, invoiceId from req.params
  → templateId from req.body
  → Invoice.getById(userId, businessId, invoiceId)   ← full document from DynamoDB
  → if !invoice → 404
  → invoicePdfService.generateAndUploadInvoicePdf({ userId, businessId, invoice, templateId })
  → res.json({ pdfUrl, invoiceId, templateId })
```

**Important:** The controller does **not** load the business. It passes only the **invoice** document. There is **no fallback** to `business.defaultSignatureUrl` / `business.defaultStampUrl` for invoices (unlike Sales Debit Note and Delivery Challan).

So for the invoice PDF, seal and signature come **only** from the invoice record: `invoice.stampUrl` and `invoice.signatureUrl`.

---

## 3. Where invoice gets `signatureUrl` and `stampUrl`

### 3.1 Schema (create/update)

**File:** `src/controllers/invoiceController.js`

- `baseInvoiceSchema` includes:
  - `signatureUrl: z.string().nullable().optional()`
  - `stampUrl: z.string().nullable().optional()`
- Create: `Invoice.create(userId, businessId, validation.data)` → validated body (including these two if sent) is passed to the model.
- Update: `Invoice.update(..., validation.data)` → same.

So if the client sends `signatureUrl` and `stampUrl` in the invoice create/update body, they are accepted and passed to the model.

### 3.2 Persistence

**File:** `src/models/invoiceModel.js`

- **create:** `newInvoice = { PK, SK, invoiceId, businessId, userId, ...invoiceData, id, createdAt, updatedAt }`.  
  So every top-level field in `invoiceData` (including `signatureUrl`, `stampUrl`) is stored.
- **getById:** Returns the full DynamoDB `Item`. So when the PDF controller calls `Invoice.getById(...)`, the returned invoice includes `signatureUrl` and `stampUrl` if they were ever stored.
- **update:** Builds an update expression from `updateData` keys; if the client sends `signatureUrl` / `stampUrl` in the update body, they are updated.

**Conclusion:** Seal and signature for the invoice PDF are whatever is stored on that invoice. If the frontend does not send `signatureUrl` / `stampUrl` on create or update, they stay missing and the PDF will not show them. The invoice flow does **not** use business defaults.

---

## 4. PDF service: HTML generation

**File:** `src/services/invoicePdfService.js`

### 4.1 `generateAndUploadInvoicePdf`

```js
async function generateAndUploadInvoicePdf({ userId, businessId, invoice, templateId }) {
    const html = await renderInvoiceHtml(invoice, templateId);
    const pdfBuffer = await generatePdfBuffer(html);
    const pdfUrl = await uploadPdfToS3({ userId, businessId, invoiceId: invoice.invoiceId || invoice.id, templateId, pdfBuffer });
    return pdfUrl;
}
```

- The **same** `invoice` object from the controller (from DB) is passed to `renderInvoiceHtml`. No merging with business defaults.

### 4.2 `renderInvoiceHtml(invoice, templateId)`

- Loads the requested template (e.g. `invoices/classic.html`) and compiles it with Handlebars.
- Builds a **context** object:
  - `invoice` ← the full invoice (so `invoice.stampUrl`, `invoice.signatureUrl` are whatever is on the document)
  - `seller`, `buyerAddress`, `shippingAddress`, `showShippingAddress`, `hasDispatchAddress`, `bankDetails`, `hasBankDetails`, `transportInfo`, `hasTransportInfo`, `termsAndConditions`, `customFields`, `totals`
- Returns `template(context)` → HTML string with `{{invoice.stampUrl}}` and `{{invoice.signatureUrl}}` resolved.

So if the invoice has no `stampUrl`/`signatureUrl`, the template’s `{{#if invoice.stampUrl}}` / `{{#if invoice.signatureUrl}}` blocks do not render the `<img>` tags.

---

## 5. Invoice template (classic) – where seal and sign are rendered

**File:** `src/templates/invoices/classic.html` (lines 314–326)

```html
<td class="right" style="width:50%;">
  Certified that the particular given above are true and correct<br><br>
  {{#if invoice.stampUrl}}
  <img src="{{invoice.stampUrl}}" alt="Stamp" style="max-height:60px; max-width:120px; margin-bottom:8px;" />
  <br>
  {{/if}}
  {{#if invoice.signatureUrl}}
  <img src="{{invoice.signatureUrl}}" alt="Signature" style="max-height:50px; max-width:180px; margin-bottom:4px;" />
  <br>
  {{/if}}
  <b>For, {{seller.firmName}}</b><br><br><br>
  Authorised Signatory
</td>
```

- Stamp is rendered first (if `invoice.stampUrl` is truthy), then signature (if `invoice.signatureUrl` is truthy), then “For, firmName” and “Authorised Signatory”.
- Handlebars `{{#if value}}` is false for `null`, `undefined`, `""`, `false`, `[]`. So empty string or missing field → no image.

**Same idea** in `invoices/modern.html` and `invoices/minimal.html`: they use `invoice.stampUrl` and `invoice.signatureUrl`.

---

## 6. PDF generation (Puppeteer) – possible cause of missing images

**File:** `src/services/invoicePdfService.js` – `generatePdfBuffer(html)`

```js
await page.setContent(html, { waitUntil: 'domcontentloaded' });
const pdfBuffer = await page.pdf({ ... });
```

- `waitUntil: 'domcontentloaded'` means the PDF is generated as soon as the DOM is ready. It does **not** wait for external resources (e.g. images from S3) to finish loading.
- So when the HTML contains `<img src="https://...s3.../stamp.png">`, the browser may not have completed the image request before `page.pdf()` runs, and the PDF can show empty or missing seal/signature even when the invoice has valid URLs.

**Recommendation:** For PDFs that include external images (stamp/signature), wait for network to settle before generating the PDF, for example:

- Use `waitUntil: 'networkidle0'` in `setContent`, or
- After `setContent`, wait for image load (e.g. `page.waitForSelector('img[src*="uploads"]', { timeout: 5000 })` or a short `page.waitForTimeout(2000)`), then call `page.pdf()`.

This applies to **invoice**, **sales debit note**, and **delivery challan** PDFs whenever seal/signature URLs point to external hosts (e.g. S3).

---

## 7. End-to-end flow summary

```
Flutter (or any client)
  → POST /business/:id/invoices  with body including signatureUrl, stampUrl (optional)
  → invoiceController validates, Invoice.create() stores full payload
  → Invoice record in DynamoDB has signatureUrl, stampUrl if sent

Later: generate PDF
  → POST /business/:id/invoices/:invoiceId/pdf  with body { templateId: "classic" }
  → invoicePdfController.generatePdf
      → invoice = Invoice.getById(userId, businessId, invoiceId)   [full item]
      → generateAndUploadInvoicePdf({ userId, businessId, invoice, templateId })
  → renderInvoiceHtml(invoice, templateId)
      → context = { invoice, seller, ... }   [invoice unchanged]
      → Handlebars renders classic.html → HTML with <img src="{{invoice.stampUrl}}"> etc.
  → generatePdfBuffer(html)
      → Puppeteer setContent(html, { waitUntil: 'domcontentloaded' })
      → page.pdf()   [images may not be loaded yet]
  → uploadPdfToS3(pdfBuffer) → pdfUrl returned to client
```

**When seal/signature show:**

1. Invoice document has non-empty `signatureUrl` and/or `stampUrl` (from create/update).
2. Those URLs are reachable from the server (e.g. S3 public or same region).
3. Puppeteer has time to load the images before `page.pdf()` (see section 6).

**When they don’t:**

1. Frontend never sent `signatureUrl`/`stampUrl` on create/update, or sent empty → not stored.
2. Or PDF is generated before external images finish loading (domcontentloaded timing).

---

## 8. Comparison with Sales Debit Note and Delivery Challan

| Document    | Seal/sign source in template | Fallback to business defaults? |
|------------|------------------------------|---------------------------------|
| Invoice    | `invoice.stampUrl` / `invoice.signatureUrl` | **No** – controller does not pass business; service uses only the document. |
| Sales Debit Note | `invoice.stampUrl` / `invoice.signatureUrl` (note passed as `invoice`) | **Yes** – controller fetches business and passes it; service merges `note.signatureUrl \|\| business.defaultSignatureUrl` (and same for stamp). |
| Delivery Challan | `challan.stampUrl` / `challan.signatureUrl` | **Yes** – same as SDN: business fetched and defaults merged when document URLs are missing. |

So for **invoice**, adding a fallback to `business.defaultSignatureUrl` / `business.defaultStampUrl` (like SDN/DC) would require:

- In `invoicePdfController.generatePdf`: fetch business with `Business.getById(userId, businessId)` and pass it to the service.
- In `generateAndUploadInvoicePdf`: accept optional `business`, build `invoiceWithDefaults = { ...invoice, signatureUrl: invoice.signatureUrl || business?.defaultSignatureUrl, stampUrl: invoice.stampUrl || business?.defaultStampUrl }`, and call `renderInvoiceHtml(invoiceWithDefaults, templateId)`.

This would make invoice behaviour consistent with SDN/DC when the document has no seal/signature URLs.
