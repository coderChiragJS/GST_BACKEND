# GST Determination – Backend Implementation Plan

**Goal:** Update the backend so place of supply and GST type (CGST+SGST vs IGST) are **derived from Bill-To only**, per the GST DETERMINATION LOGIC (India – Goods) spec. Transport/delivery state is **informational only** and must not control GST.

---

## Phase 1: GST Derivation Service

**Task 1.1 – Create `src/services/gstDeterminationService.js`**

- **Inputs:** Seller state (code or from GSTIN), buyer/Bill-To state (from `buyerGstin` → `buyerStateCode` → `buyerStateName`). Optionally a flag or data to know if there is a separate Ship-To (for logging only; place of supply is always Bill-To state for goods).
- **Logic:**
  - Resolve **buyer state** from: buyerGstin (first 2 digits) → buyerStateCode → buyerStateName. If none, return error or null.
  - **Place of supply** = buyer state (Bill-To). No use of shipping/delivery state.
  - **Supply type:** `supplier.state === placeOfSupply` → `intrastate` (CGST+SGST), else `interstate` (IGST).
- **Output:** `{ placeOfSupplyStateCode, placeOfSupplyStateName, supplyTypeDisplay: 'intrastate'|'interstate' }`.
- Use existing `src/data/gstStates.js` (getStateByCode, getStateByGstin, getStateByName). Add a small helper to normalize state code (e.g. 2-digit string).

**Deliverable:** One module with a single exported function, e.g. `deriveGstContext(sellerStateCode, buyerGstin, buyerStateCode, buyerStateName)`.

---

## Phase 2: Place-of-Supply API

**Task 2.1 – Update `src/controllers/gstController.js` – `placeOfSupply`**

- **Remove** use of `shippingStateCode` and `shippingStateName` for place of supply and supply type.
- **Use only Bill-To:** Pass `sellerStateCode` (or from sellerStateName), `buyerGstin`, `buyerStateCode`, `buyerStateName` to the new GST derivation service.
- Return: `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay`.
- Error when buyer state cannot be resolved (e.g. missing buyerGstin/buyerStateCode/buyerStateName).

**Result:** API response is always derived from Bill-To only; no transport/shipping input for GST.

---

## Phase 3: PDF / Document Context – Derive, Don’t Trust Transport

**Task 3.1 – Update `src/services/invoicePdfService.js` – `getSupplyTypeContext(doc, seller, totals)`**

- **Stop** reading `transportInfo.supplyTypeDisplay` or `transportInfo.placeOfSupplyStateCode` for GST type or place of supply.
- **Derive** place of supply and supply type from **doc + seller:**
  - Seller state: `seller.stateCode` or first 2 digits of `seller.gstNumber`.
  - Buyer state: `doc.buyerGstin` → `doc.buyerStateCode` → `doc.buyerStateName`.
- Call the new GST derivation service (or inline the same logic) to get `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay`.
- Return: `isInterstate`, `showCgstSgst`, `summaryCgstAmount`, `summarySgstAmount`, **placeOfSupplyDisplay** = derived place of supply state name (for “Place of Supply” on PDF).
- If buyer state cannot be derived, decide a safe default (e.g. treat as interstate) and document it.

**Task 3.2 – Optional: Delivery State for “where truck goes”**

- If the app wants to show “where the truck goes” on the PDF, add a separate field, e.g. **deliveryStateDisplay** (or **shippedToStateDisplay**), from `doc.transportInfo` (e.g. a new optional field like `deliveryStateCode` / `deliveryStateName` or reuse existing transport fields with a clear label). Do **not** use this for GST or for the “Place of Supply” line.
- Templates use **Place of Supply** only for the derived Bill-To state; use **Delivery State** (or similar label) for delivery/ship-to state if shown.

**Result:** “Place of Supply” on invoice/challan/debit note PDF = Bill-To state (derived). GST type = derived. Transport/delivery = display only.

---

## Phase 4: Invoice Create/Update – Validations and Stored Values

**Task 4.1 – Before saving invoice (create and update)**

- After Zod validation, **derive** place of supply and supply type using the GST derivation service (seller from invoice.seller, buyer from invoice: buyerGstin, buyerStateCode, buyerStateName).
- If buyer state cannot be derived, reject with 400 (e.g. “Place of supply cannot be determined. Provide buyer state or GSTIN.”).

**Task 4.2 – Validation 7.1 (Place of Supply consistency)**

- If the client sent `transportInfo.placeOfSupplyStateCode` (or similar) and it **differs** from the **derived** place of supply state code:
  - Either: add a **warning** in the response, e.g. `warnings: [{ code: 'PLACE_OF_SUPPLY_MISMATCH', message: 'Incorrect Place of Supply as per GST law. Document uses derived place of supply (Bill-To).' }]`, and **overwrite** stored GST context with derived values.
  - Or: reject with 400 and ask client to remove/align. Recommended: **warn + overwrite** so backend is always source of truth.

**Task 4.3 – Validation 7.2 (GST type)**

- If the client sent `transportInfo.supplyTypeDisplay` and it **differs** from the **derived** supply type: **block save** with 400, e.g. “GST type must be derived as per law. Expected [intrastate|interstate] based on Bill-To state.”

**Task 4.4 – Validation 7.3 (Invalid IGST)**

- If derived supply type is **intrastate** but client sent interstate/IGST: **block save** with 400, e.g. “IGST not allowed for intra-state supply.”

**Task 4.5 – What to store**

- **Always store derived GST context** on the document (e.g. in `transportInfo` or a dedicated `gstContext`): `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` from the derivation service. PDF and APIs then read these stored derived values (or recompute the same way) so there is a single source of truth.
- **transportInfo** can still store: vehicle, LR, transporter, date of supply, and optionally **delivery state** (for “Delivery State” / “Shipped To State” on PDF). None of these are used for GST determination.

**Files:** `src/controllers/invoiceController.js` (createInvoice, updateInvoice). Optionally a small helper that runs derivation + validations and returns derived payload + warnings/error.

---

## Phase 5: Delivery Challan and Sales Debit Note

**Task 5.1 – Same derivation and validations**

- Delivery challan and sales debit note have the same buyer/shipping/transport structure. Apply the **same** logic:
  - **Derive** place of supply and supply type from seller + Bill-To (buyer) only.
  - On create/update: run validations 7.1 (warn + overwrite), 7.2 (block wrong tax type), 7.3 (block IGST for intra-state).
  - Store derived `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` on the document.
- **PDF:** They already use `getSupplyTypeContext`. Once that is updated (Phase 3), challans and debit notes will show derived place of supply and GST type automatically.

**Files:** `src/controllers/deliveryChallanController.js`, `src/controllers/salesDebitNoteController.js` (create/update flows). Reuse the same validation/derivation helper as invoice.

---

## Phase 6: Templates and Labels

**Task 6.1 – “Place of Supply” vs “Delivery State”**

- **Place of Supply** on PDF = **only** the derived Bill-To state (from `placeOfSupplyDisplay` from `getSupplyTypeContext`). Do not use transport screen input for this label.
- If you show “where the truck goes,” use a **different label**, e.g. **“Delivery State”** or **“Shipped To State”**, and a separate variable (e.g. `deliveryStateDisplay`) from transport data, not “Place of Supply.”

**Task 6.2 – Template files to touch**

- `src/templates/invoices/classic.html`, `src/templates/invoices/modern.html`
- `src/templates/delivery-challans/classic.html`
- `src/templates/sales-debit-notes/classic.html`
- Quotation templates if they show place of supply (use derived from buyer/shipping per quotation logic; keep “Place of Supply” for tax meaning).

Ensure “Place of Supply” always comes from derived context; any delivery/ship-to state uses a different label and variable.

---

## Phase 7: Quotations (If Applicable)

**Task 7.1 – Quotation place of supply**

- Quotations may not have a “saved” GST type yet. Use the same **derivation** rule: place of supply = Bill-To state (buyerGstin → buyerStateCode → buyerStateName). If quotation has shipping address, do **not** use shipping state for “Place of Supply” on the quotation PDF; use buyer state only for the “Place of Supply” line. Adjust `getQuotationPlaceOfSupply` / `getQuotationSupplyContext` in `invoicePdfService.js` accordingly.

---

## Phase 8: API Response and Frontend

**Task 8.1 – Invoice/challan/debit note create/update response**

- When validation 7.1 triggers: include `warnings` array in success response so the app can show “Place of supply was corrected as per GST law.”
- When 7.2 or 7.3 triggers: return 400 with a clear message so the app can block save and show the error.

**Task 8.2 – Place-of-supply API**

- Document that the API now returns **only** Bill-To–based place of supply. Frontend should not send shipping state for GST; it can send it for other purposes (e.g. eWay or “Delivery State” display) but backend will ignore it for GST.

---

## Order of Implementation (Summary)

1. **Phase 1** – GST derivation service.
2. **Phase 2** – Place-of-supply API (Bill-To only).
3. **Phase 3** – `getSupplyTypeContext` derive from doc + seller; optional delivery state for “where truck goes.”
4. **Phase 4** – Invoice create/update: derive, validate (7.1 warn, 7.2/7.3 block), store derived GST context.
5. **Phase 5** – Same for delivery challan and sales debit note.
6. **Phase 6** – Templates: “Place of Supply” = derived only; “Delivery State” = separate label if needed.
7. **Phase 7** – Quotations (derive place of supply from buyer only).
8. **Phase 8** – Response shape and docs for frontend.

---

## Out of Scope (Per Spec)

- Reverse Charge (RCM)
- Services, exports, SEZ, imports, job work
- Changes to GST amount calculation (only breakup CGST+SGST vs IGST and place of supply source/labels)

---

## Golden Rules (For Code Comments)

- GST follows the BILL, not the TRUCK.
- Place of Supply is derived (Bill-To state), not selected.
- Invoice/transport text does not override GST law.
