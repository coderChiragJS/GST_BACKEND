# Frontend: Place of Supply & GST Data/Calculation — Deep Analysis

This document confirms what the Flutter app sends and calculates for place of supply, supply type (interstate/intrastate), and GST (IGST vs CGST+SGST), and documents the fix applied so the frontend **always sends correct data** to the backend.

---

## 1. Data flow summary

| Step | What happens |
|------|----------------|
| 1 | User sets buyer and/or **Place of Supply** (in Transport modal or by buyer’s state/GSTIN). |
| 2 | App calls **POST /gst/place-of-supply** with seller state, buyer state/GSTIN, and optional **manual** place (shipping state name). |
| 3 | Backend returns `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` (`"intrastate"` or `"interstate"`). |
| 4 | App stores these in `_transportInfo` and uses `supplyTypeDisplay` for **display** (CGST+SGST vs IGST) and for **save**. |
| 5 | On save, app calls `_fetchPlaceOfSupply(...)` again (with manual place if user set it), then builds `Invoice` with `transportInfo: _transportInfo` and sends `inv.toJson()` (which includes `transportInfo.toJson()`). |

---

## 2. What the frontend sends (payload)

### 2.1 TransportInfo (in invoice / debit note / challan payload)

From `lib/models/invoice.dart` — `TransportInfo.toJson()`:

- `placeOfSupply` — display name (e.g. `"Maharashtra"`).
- `placeOfSupplyStateCode` — 2-digit code (e.g. `"26"`).
- `placeOfSupplyStateName` — full name (e.g. `"Maharashtra"`).
- `supplyTypeDisplay` — `"intrastate"` or `"interstate"`.

So the frontend **does send** the correct place-of-supply and supply-type fields.

### 2.2 Items (line-level GST)

From `lib/models/invoice.dart` — `InvoiceLineItem`:

- Each line has `gstPercent` and computed `gstAmount` (total GST for that line).
- **No** line-level CGST/SGST/IGST split; the split is only at **invoice** level, derived from `transportInfo.supplyTypeDisplay`.
- `InvoiceLineItem.toJson()` sends `gstPercent`, not pre-split amounts. Total GST is the same for interstate (IGST) and intrastate (CGST+SGST); only the **label** changes.

So item-level data is **correct**: one total GST per line; supply type is sent in `transportInfo.supplyTypeDisplay` for the backend/PDF to split.

### 2.3 Invoice totals

- `grandTotal`, `taxableValue`, etc. are computed from items + additionalCharges − discount + TCS.
- They do **not** depend on interstate vs intrastate; only the **breakdown label** (IGST vs CGST+SGST) depends on `supplyTypeDisplay`.

So the frontend sends **correct** totals and **correct** `transportInfo` for the backend to render IGST or CGST+SGST.

---

## 3. Calculations (UI and logic)

### 3.1 Place-of-supply fetch

- **File:** `lib/screens/create_invoice_screen.dart` — `_fetchPlaceOfSupply({String? manualPlaceOfSupplyName})`.
- **When manual place is used:**  
  `manualPlaceOfSupplyName != null && manualPlaceOfSupplyName.isNotEmpty` → `useManualPlaceOfSupply = true` → **buyer GSTIN is not sent** to the place-of-supply API, so the backend uses the chosen place (e.g. Maharashtra) and returns intrastate when same as seller.
- **Backend response** is merged into `_transportInfo`: `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay`.

So when the user **manually** selects place of supply, the app **does** ask the API with that place and no GSTIN, and stores the returned supply type.

### 3.2 GST breakdown (display)

- **File:** `lib/screens/create_invoice_screen.dart` — `_showItemSubtotalBreakdown()`.
- `isInterstate = _transportInfo?.supplyTypeDisplay == 'interstate'`.
- `cgstAmount = isInterstate ? 0.0 : gstAmount / 2`
- `sgstAmount = isInterstate ? 0.0 : gstAmount - cgstAmount`
- `igstAmount = isInterstate ? gstAmount : 0.0`

So the **display** logic is correct and consistent with `supplyTypeDisplay`.

### 3.3 When place of supply is re-fetched (before save)

- On **Save** (invoice, debit note, delivery challan, draft), the app calls `await _fetchPlaceOfSupply(...)` **before** building the payload.
- **Bug (fixed):** Previously we called `_fetchPlaceOfSupply()` with **no** `manualPlaceOfSupplyName`. So we sent **buyer GSTIN** to the API. If the backend prioritizes GSTIN over shipping state name, it could return **interstate** (e.g. from buyer’s state) and overwrite a user-chosen **intrastate** (e.g. Maharashtra).
- **Fix:** If the user has already set a place of supply (`_transportInfo?.placeOfSupply` non-empty), we now call:
  - `_fetchPlaceOfSupply(manualPlaceOfSupplyName: _transportInfo!.placeOfSupply)`
  so the backend receives the **manual** place and we **omit** buyer GSTIN. The API then returns the correct supply type (e.g. intrastate for Maharashtra), and we send that in `transportInfo` in the payload.

Applied in:

- `_saveInvoice()`
- `_saveSalesDebitNote()` (both save paths that use `_fetchPlaceOfSupply`)
- `_saveDeliveryChallan()`
- `_saveDraft()`

So **before every save**, the frontend now re-fetches place of supply **respecting** the user’s manual place when set, and then sends the **correct** `transportInfo` (including `supplyTypeDisplay`) in the payload.

---

## 4. Confirmation checklist

| Check | Status |
|-------|--------|
| TransportInfo in payload includes `placeOfSupply`, `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` | Yes (`TransportInfo.toJson()`) |
| Manual place of supply triggers API call **without** buyer GSTIN | Yes (`useManualPlaceOfSupply` → `buyerGstin: null`) |
| GST breakdown (CGST/SGST/IGST) uses `_transportInfo?.supplyTypeDisplay` | Yes (`_showItemSubtotalBreakdown`) |
| Item-level GST is total GST only; no wrong split at line level | Yes (single `gstAmount` per line) |
| Before save, we re-fetch place of supply **with manual place** when user set it | Yes (fix applied in all save flows) |
| Saved invoice/debit note/challan is built with **current** `_transportInfo` after await | Yes (inv built after `await _fetchPlaceOfSupply(...)`) |

---

## 5. Conclusion

- **Data:** The frontend sends the **correct** place-of-supply and supply-type data in `transportInfo` and correct item and totals in the payload.
- **Calculation:** Place-of-supply is fetched from the backend with manual place honoured (no GSTIN when user set place); GST breakdown in the UI is derived from `supplyTypeDisplay` and is correct.
- **Fix:** Re-fetch before save now passes the user’s manual place of supply when set, so the backend does not overwrite it with a GSTIN-based result; the frontend then sends the correct `supplyTypeDisplay` (and related fields) in every save.

If the **PDF** still shows the wrong tax type (e.g. IGST when place of supply is Maharashtra and seller is Maharashtra), the issue is in the **backend PDF generator**: it must use the **saved** `transportInfo.supplyTypeDisplay` (or place-of-supply state vs seller state) to decide IGST vs CGST+SGST, and **must not** recompute from buyer GSTIN. See `BACKEND_GST_API_SPEC.md` §7 (Invoice PDF Generation).
