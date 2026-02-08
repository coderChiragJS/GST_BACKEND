# Flutter – Quotation feature: complete guide

**Use only this file** for implementing the **Create Quotation** flow. Everything you need is here: API endpoints, request fields, UI flow, and screen-by-screen instructions. No need to open any other doc for quotation.

---

## Base URL and auth (same as rest of app)

- **Base URL:** e.g. `https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev` (no `/api` prefix).
- **Auth:** Send `Authorization: Bearer <token>` on every quotation request. Get token from `POST /auth/login` with `{ "email", "password" }`.
- **businessId:** Get from `GET /business`; user selects one business. Use that `businessId` in all quotation URLs below.

---

## Quotation API endpoints

| Action        | Method | URL |
|---------------|--------|-----|
| Create        | POST   | `/business/<businessId>/quotations` |
| List          | GET    | `/business/<businessId>/quotations?status=...&search=...&fromDate=...&toDate=...&limit=100&nextToken=...` |
| Get one       | GET    | `/business/<businessId>/quotations/<quotationId>` |
| Update        | PUT    | `/business/<businessId>/quotations/<quotationId>` |
| Delete        | DELETE | `/business/<businessId>/quotations/<quotationId>` (response 204, no body) |
| Generate PDF  | POST   | `/business/<businessId>/quotations/<quotationId>/pdf` with body `{ "templateId": "classic" }` → response has `pdfUrl` |

---

## Request body: what to send (create/update)

**Always required:** `quotationNumber`, `status`, `seller` (at least `firmName`, `gstNumber`).

**Status values:** `draft` | `sent` | `accepted` | `rejected` | `expired`.

- **draft:** Buyer and items can be empty. Use for “Save as draft” or first create.
- **sent:** Backend requires `buyerName` (min 1 char) and at least one item in `items`. Use when user “Sends” or “Finalises” the quote.

**Optional / same as invoice where applicable:**

- `quotationDate`, `validUntil` (date strings; validUntil = quote expiry).
- `buyerId`, `buyerName`, `buyerGstin`, `buyerAddress`, `shippingAddress`.
- `items`: array of line items. Each: `itemId`, `itemName`, `hsnSac`, `quantity`, `unit`, `unitPrice`, `discountType` (`"percentage"` or `"flat"`), `discountValue`, `discountPercent`, `gstPercent`, `taxInclusive`, `cessType`, `cessValue`.
- `additionalCharges`: `[ { name, amount, gstPercent, hsnSac?, isTaxInclusive? } ]`.
- `globalDiscountType`: `"percentage"` or `"flat"`; `globalDiscountValue`: number.
- `tcsInfo`: optional `{ percentage, basis: "taxableAmount" | "finalAmount" }`.
- `bankDetails`: `{ bankName?, accountHolderName?, accountNumber?, ifscCode?, branch?, upiId? }`.
- `contactPersons`: `[ { "name": "...", "phone": "...", "email": "..." } ]` (quotation-only; at least `name` per entry).
- `termsAndConditions`: array of strings.
- `notes`: string.
- `signatureUrl`, `stampUrl`: URLs or `null`.
- `customFields`: `[ { "name": "...", "value": "..." } ]`.

**Validation errors:** On 400, body has `"code": "VALIDATION_FAILED"` and `details` (array of path/message). Show them next to the relevant fields.

---

## UI: build exactly these 4 screens (Gimbook reference)

Match the layout and elements of the 4 screens you have in the design. Navigation between them can be scroll on one page or separate routes (e.g. Screen 1 → scroll or tap to Screen 2; “Optional Details” opens Screen 3; Screen 4 = Screen 3 with “Add Another Field” at bottom).

---

### Screen 1 – Create Quotation (main form)

**Header (top bar)**  
- Left: back arrow, step indicator (e.g. “1”).  
- Right: yellow **Save** button.

**Below header**  
- **Quotation number** (e.g. “1”) and **Date** (e.g. 08-02-2026) with calendar icon; **Edit** link next to date to change it.  
- **Valid until** can sit here or in optional details (API: `validUntil`).

**Seller block**  
- Show seller/company name (e.g. “PAPER INFRA”) with a right arrow (chevron) – tappable to view or edit seller.  
- Blue link: **+ Dispatch Address** (optional; adds/edits dispatch address).

**Section: Buyer Details** (person icon)  
- One prominent yellow button with plus icon: **Select Buyer**.  
- On tap: open party picker; set `buyerId`, `buyerName`, `buyerGstin`, `buyerAddress`, `shippingAddress` from selected party.

**Section: Items / Services** (box/package icon, expandable with ^)  
- One prominent yellow button with plus icon: **Add Item**.  
- On tap: add a line item (product/service); same fields as invoice line item.  
- List added items above the button; allow edit/delete per row.

**Section: Quotation Summary** (grid icon)  
- Row: **Item Subtotal** → show amount (e.g. ₹ 0); blue **View Breakdown** link with info icon (opens breakdown of items/totals).  
- Row: **Total Amount** → show amount (e.g. ₹ 0), bold.  
- Two yellow buttons: **+ Add Additional Charge**, **+ Add Discount**.

**API:** On first load of this screen, create draft: `POST /business/<businessId>/quotations` with `status: "draft"`, `quotationNumber`, `quotationDate`, `seller`. Store returned `quotationId`. On **Save**, call `PUT .../quotations/<quotationId>` with current form data (`status: "draft"` or `"sent"`).

---

### Screen 2 – Quotation Summary (with Optional Details block)

**Header**  
- Same as Screen 1: back, step “1”, yellow **Save**.

**Quotation Summary section** (grid icon)  
- **Item Subtotal** (e.g. ₹ 0) and **View Breakdown** (blue, info icon).  
- **Total Amount** (e.g. ₹ 0), bold.  
- Three yellow buttons: **+ Add Additional Charge**, **+ Add Discount**, **+ Add TCS**.

**Optional Details section** (expandable/collapsible with caret ^)  
- **Bank Details:** If set, show e.g. “ICICI Bank”, masked account “XXXXXX8087”, branch “NARSINGI II” with **Change** and **X** (remove).  
- **Contact Person Details:** **+ Add** (yellow) to add contact person(s).  
- **Notes:** **+ Add** (yellow) to add notes.  
- **Terms and Conditions:** If set, show text (e.g. “1. This is an electronically generated document. 2. All disputes are subject to seller city jurisdiction.”) with **Change** and **X** (remove). No separate “+ Add” – add/edit via Change.

Tapping **Change** or **+ Add** for these can open Screen 3 (Optional Details) or inline forms. **Save** again calls `PUT .../quotations/<quotationId>` with full payload including `bankDetails`, `contactPersons`, `notes`, `termsAndConditions`.

---

### Screen 3 – Optional Details (full screen)

**Header**  
- Back, step “1”, yellow **Save**.

**Title:** **Optional Details** (with expand/collapse caret ^ if needed).

**Bank Details** (bank icon)  
- Card: bank name (e.g. ICICI Bank), masked account (e.g. XXXXXX8087), branch (e.g. NARSINGI II).  
- **Change** (refresh icon) to pick another bank or edit.  
- **X** to clear/remove.

**Contact Person Details** (phone icon)  
- Yellow **+ Add** to add a contact (name, phone, email). Show list of added contacts; allow edit/remove.

**Notes** (notepad icon)  
- Yellow **+ Add** to add/edit notes (single text field).

**Terms and Conditions** (notepad icon)  
- Card with current terms (e.g. “1. This is an electronically generated document. 2. All disputes are subject to seller city jurisdiction.”).  
- **X** to remove, **Change** to edit (e.g. pick template or type).

**Signature and Stamp** (signature/stamp icon)  
- Toggle **ON/OFF**. When ON: show a light yellow box with a signature line and text **Tap to edit signature** (and optionally stamp). Upload or draw signature/stamp; set `signatureUrl`, `stampUrl` in payload or clear when OFF.

**API:** All fields map to the same `PUT .../quotations/<quotationId>` payload: `bankDetails`, `contactPersons`, `notes`, `termsAndConditions`, `signatureUrl`, `stampUrl`.

---

### Screen 4 – Optional Details + Add Another Field

Same as **Screen 3** (same header, Bank Details, Contact Person Details, Notes, Terms and Conditions, Signature and Stamp).

**At the bottom**  
- Blue button: **+ Add Another Field**.  
- On tap: add a custom field (name + value). Show list of custom fields; allow edit/remove.  
- API: send as `customFields`: `[ { "name": "...", "value": "..." } ]` in `PUT .../quotations/<quotationId>`.

---

## Field-to-API mapping (same 4 screens)

| Screen / element | API field(s) |
|------------------|--------------|
| Screen 1: Quotation number, Date, Edit | `quotationNumber`, `quotationDate` |
| Screen 1: Valid until (if shown) | `validUntil` |
| Screen 1: Seller (PAPER INFRA), Dispatch | `seller` (firmName, gstNumber, address, dispatchAddress, etc.) |
| Screen 1: Select Buyer | `buyerId`, `buyerName`, `buyerGstin`, `buyerAddress`, `shippingAddress` |
| Screen 1: Add Item, list | `items[]` (itemId, itemName, hsnSac, quantity, unit, unitPrice, discountType, discountValue, discountPercent, gstPercent, taxInclusive, cessType, cessValue) |
| Screen 1–2: Item Subtotal, Total, View Breakdown | Computed from `items`, `additionalCharges`, `globalDiscountType`, `globalDiscountValue`, `tcsInfo` |
| Screen 1–2: Add Additional Charge, Add Discount, Add TCS | `additionalCharges`, `globalDiscountType`/`globalDiscountValue`, `tcsInfo` |
| Screen 2–3: Bank Details | `bankDetails` |
| Screen 2–3: Contact Person Details | `contactPersons` |
| Screen 2–3: Notes | `notes` |
| Screen 2–3: Terms and Conditions | `termsAndConditions` |
| Screen 3: Signature and Stamp | `signatureUrl`, `stampUrl` |
| Screen 4: Add Another Field | `customFields` |

---

## Other flows (list, open, delete, PDF)

- **List quotations:** `GET /business/<businessId>/quotations?limit=100` (optional: `status`, `search`, `fromDate`, `toDate`, `nextToken`). Show list; “Load more” if `nextToken` present.
- **Open one:** `GET /business/<businessId>/quotations/<quotationId>` → fill Screens 1–4 with response `quotation`.
- **Delete:** `DELETE /business/<businessId>/quotations/<quotationId>` (204) → remove from list or go back.
- **Generate PDF:** `POST /business/<businessId>/quotations/<quotationId>/pdf` with body `{ "templateId": "classic" }` → use `pdfUrl` to open or download.

---

## Errors

- **400** + `VALIDATION_FAILED`: show `details` on the form.
- **404**: quotation or business not found; show message and go back or refresh.
- **401**: token missing/expired; redirect to login.

---

## Short summary

- One document type = either invoice **or** quotation. Same `businessId`; different APIs (`/invoices` vs `/quotations`).
- Quotation: create draft with `POST .../quotations`, then always update with `PUT .../quotations/<quotationId>`. Use `status: "draft"` or `"sent"` as above.
- Reuse optional-details UI from invoice; add **Valid until** and **Contact person(s)** for quotation only.
- Quotation list and invoice list are separate screens; do not mix.
