# Flutter: Proforma Only – Home / Create (No New Home Item)

**This document is only for Proforma.** All other home "Create" options (Invoice, Quotation, Sales Debit Note, Delivery Challan, Receipt, TDS Voucher) are already implemented. Do not change them.

---

## What you need to do for Proforma

### 1. Do not add "Create Proforma" on the home page

- Proforma is **not** a separate document to create from the home screen.
- Your existing home Create list (Invoice, Quotation, Receipt, etc.) should **stay as it is**. Do not add a "Create Proforma" or "Proforma Invoice" option there.

### 2. Where Proforma lives: Quotation detail only

- Proforma is a **PDF variant of a Quotation**. The user flow is:
  1. User creates or opens a **Quotation** (existing flow).
  2. On the **quotation detail** screen, user has a "Download" / PDF menu (existing).
  3. Add **one new option** in that menu: **"Download as Proforma"** (or "Proforma PDF").
  4. When the user taps it, call the **same** quotation PDF API with **`outputType: 'proforma'`** in the request body. Use the returned `pdfUrl` the same way as for the normal quotation PDF (open or download).

### 3. API (same endpoint as quotation PDF)

- **Endpoint:** `POST /business/:businessId/quotations/:quotationId/pdf` (already in use).
- **Body:** Add optional `"outputType": "proforma"` when the user chooses "Download as Proforma". Example: `{ "templateId": "classic", "outputType": "proforma" }`.
- **Response:** Same as today (`pdfUrl`, etc.); you may see `outputType: "proforma"` in the response. Use `pdfUrl` as you do for the normal quotation PDF.

Full request/response and step-by-step integration: **see `FLUTTER_PROFORMA_PDF.md`.**

---

## Recommendation (agreed approach)

- **Main path:** Use the **quotation-centric flow**. User creates or opens a Quotation → on quotation detail they choose **"Download as Proforma"** to get the Proforma PDF. This is the single, standard path: quotation → proforma.
- **Home "Proforma Invoice" card:** Treat it as **optional**. You can offer a shortcut card on the home that opens the same Create Quotation form and, after save, offers "Download as Proforma" (or auto-opens the proforma PDF). If you prefer a simpler home and one clear path, **remove** the home Proforma card and keep only: Create Quotation → quotation detail → "Download as Proforma". That way the home stays simple and the flow is consistent (quotation first, then proforma when needed).

---

## Summary

| Topic | Action |
|-------|--------|
| Home Create list | **No change.** Do not add "Create Proforma". |
| Quotation detail screen | Add one menu item: **"Download as Proforma"**. On tap: call quotation PDF API with `outputType: 'proforma'`, then open/download `pdfUrl`. |
| API details | Use **`FLUTTER_PROFORMA_PDF.md`** for endpoint, body, response, and code steps. |

All other document types and home Create behaviour remain as already implemented.
