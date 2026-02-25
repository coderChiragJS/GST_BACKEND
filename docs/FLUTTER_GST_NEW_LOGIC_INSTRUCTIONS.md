# Flutter – GST New Logic: Remove Old Logic & Implement Correct Flow

This document tells the Flutter team exactly what to remove, what to change, and what to implement so the app matches the backend’s **GST determination logic** (Bill-To only; no transport/delivery for tax).

**Legal basis:** IGST Act, 2017 — **Section 10(1)(a)** (Normal Sale: place of supply = location of buyer) and **Section 10(1)(b)** (Bill-To / Ship-To: place of supply = location of person who is billed, i.e. Bill-To; delivery location does not affect GST). Supply type (intrastate vs interstate) per **Section 7**.

---

## 1. Core rule (must follow in Flutter)

- **Place of Supply** (for GST) = **state of the person who is billed (Bill-To / buyer)**. It is **not** the delivery/shipping state and **not** a user-selected value.
- **GST type** (IGST vs CGST+SGST) = **derived only** from: seller state vs place of supply (Bill-To state). Same state → CGST+SGST; different state → IGST.
- **Transport / delivery state** = “where the truck goes”. Use it **only** for **Place of Delivery** (display). It must **never** be sent or used for place of supply or GST type.

**In one line:** GST is decided by who is billed (Bill-To), not by where the truck goes.

---

## 2. What to REMOVE in Flutter (old logic)

- **Do not** send `shippingStateCode` or `shippingStateName` to **Place of Supply API** for the purpose of getting place of supply or supply type. Backend ignores them for GST.
- **Do not** let the user **select or override** “Place of Supply” for tax. Place of supply must come only from **Bill-To (buyer)** (via API or from saved document).
- **Do not** use the value from the **transport/delivery screen** as “Place of Supply” on the invoice/challan/debit note. That value is **Place of Delivery** only.
- **Do not** show a single “Place of Supply” field that is actually filled from the transport/delivery screen. Split into:
  - **Place of Supply** = from Bill-To (API or backend-derived); read-only for tax.
  - **Place of Delivery** = from transport screen (where goods are delivered); optional, display only.
- **Do not** ignore backend **400** or **warnings** on invoice/challan/debit note create or update. You must handle them (see below).

---

## 3. Place of Supply API – new contract

**Endpoint:** `POST /gst/place-of-supply`

**Request body (only these for GST):**

| Field              | Type   | Required | Notes                                        |
|--------------------|--------|----------|----------------------------------------------|
| sellerStateCode    | string | No*      | 2-digit state code of supplier              |
| sellerStateName    | string | No*      | State name of supplier                       |
| sellerGstNumber    | string | No*      | Seller GSTIN (first 2 digits used as state) |
| buyerGstin         | string | No*      | Buyer GSTIN (first 2 digits = buyer state)  |
| buyerStateCode     | string | No*      | Buyer state code                             |
| buyerStateName     | string | No*      | Buyer state name                             |

*At least one of sellerStateCode, sellerStateName, sellerGstNumber is needed for supply type.  
*At least one of buyerGstin, buyerStateCode, buyerStateName is required. Backend returns 400 if buyer state cannot be determined.

**Do not send (ignored for GST):** `supplyType`, `shippingStateCode`, `shippingStateName`.

**Response (200):**

```json
{
  "placeOfSupplyStateCode": "23",
  "placeOfSupplyStateName": "Madhya Pradesh",
  "supplyTypeDisplay": "interstate"
}
```

**Response (400):**

```json
{
  "error": "Place of supply cannot be determined. Provide buyer state (buyerGstin, buyerStateCode, or buyerStateName).",
  "code": "INVALID_INPUT"
}
```

**When to call:** When you have seller state and buyer (Bill-To) state. For example: when user selects/enters buyer or buyer GSTIN, or when opening the transport section. Use **only** seller + buyer fields; do **not** send shipping/delivery state for this API.

---

## 4. Invoice / Delivery Challan / Sales Debit Note – create and update

### 4.1 Backend behaviour (what Flutter must align with)

- Backend **always derives** place of supply and supply type from **Bill-To (buyer)** and seller. It **overwrites** any `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` (and `placeOfSupply`) in `transportInfo` with the derived values when saving.
- For **saved** invoice (and **saved** debit note, **delivered** challan): if buyer state cannot be derived, backend returns **400** and does not save.
- If the client sends a **different** supply type than derived (e.g. client sent interstate but backend derived intrastate), backend returns **400** and does not save.
- If the client sends a different **place of supply state** than derived, backend still saves but returns **warnings** in the response.

### 4.2 What to send in `transportInfo`

**You may send (for display / transport only):**

- `vehicleNumber`, `mode`, `transporterName`, `transporterId`, `docNo`, `docDate`, `approxDistance`, `dateOfSupply`
- **Place of Delivery** (where the truck goes): `placeOfDelivery`, `placeOfDeliveryStateCode`, `placeOfDeliveryStateName` — use these for the **“Place of Delivery”** label on the PDF/app. Do **not** use them for “Place of Supply” or for GST type.

**Do not rely on client-sent values for GST:**

- You can still send `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` (e.g. from Place of Supply API) so the UI can show them before save, but backend will **overwrite** them with derived values. So after save, always use the **saved document** (or API) for Place of Supply and supply type.

### 4.3 Response handling – errors and warnings

**Success (201/200) with optional warnings:**

```json
{
  "invoice": { ... },
  "warnings": [
    {
      "code": "PLACE_OF_SUPPLY_MISMATCH",
      "message": "Incorrect Place of Supply as per GST law. Document uses derived place of supply (Bill-To)."
    }
  ]
}
```

- If `warnings` is present, show the message to the user (e.g. toast or inline). Document is still saved; GST on the document is the **derived** one.

**Error (400) – do not save:**

```json
{
  "message": "Place of supply cannot be determined. Provide buyer state or GSTIN.",
  "code": "GST_DETERMINATION_FAILED"
}
```

- **Action:** Show error; block save. Ask user to fill buyer state or buyer GSTIN.

```json
{
  "message": "GST type must be derived as per law. Expected intrastate based on Bill-To state. IGST not allowed for intra-state supply when seller and buyer are in same state.",
  "code": "GST_DETERMINATION_FAILED"
}
```

- **Action:** Show error; block save. Do not let user force IGST when seller and buyer are in same state.

---

## 5. UI/UX – what to show where

### 5.1 Place of Supply (legal – for GST)

- **Source:** Response of `POST /gst/place-of-supply` (seller + buyer only), or from the **saved document** after create/update (backend stores derived values in `transportInfo`).
- **Label:** “Place of Supply”.
- **Behaviour:** **Read-only** for tax. Do not let user type or select a different “Place of Supply” for GST. You can show it as text or disabled field.
- **When to refresh:** When buyer (Bill-To) or seller state changes, call Place of Supply API and update the displayed Place of Supply and supply type (IGST vs CGST+SGST).

### 5.2 Place of Delivery (where truck goes)

- **Source:** User input on **transport/delivery screen** (state where goods are delivered). Store in `transportInfo` as `placeOfDelivery` and/or `placeOfDeliveryStateCode`, `placeOfDeliveryStateName`.
- **Label:** “Place of Delivery” (or “Delivery State” / “Shipped To State”). **Do not** use the label “Place of Supply” for this.
- **Behaviour:** Optional; for display and eWay/transport only. Never used for GST.

### 5.3 Supply type (IGST vs CGST+SGST)

- **Source:** Same as Place of Supply (API or saved document). `supplyTypeDisplay`: `"intrastate"` → CGST+SGST; `"interstate"` → IGST.
- **Behaviour:** **Read-only**; derived only. Do not let user select IGST vs CGST+SGST. Show tax breakdown (IGST or CGST+SGST) based on this value.

### 5.4 Transport screen

- Keep fields: vehicle number, transporter, LR/GR, date of supply, **Place of Delivery** (state where goods are delivered).
- **Remove:** Using this screen to set or change “Place of Supply” for GST, or sending delivery/shipping state to the Place of Supply API for GST.
- Optional: When the user opens the transport screen, you can call Place of Supply API (with seller + buyer only) to show the **current** Place of Supply and supply type for reference; do not send transport/delivery state to that API.

---

## 6. Step-by-step checklist for Flutter

- [ ] **Place of Supply API:** Remove sending `shippingStateCode`, `shippingStateName`, `supplyType` in the request body. Send only seller (state or GSTIN) and buyer (GSTIN or state code/name).
- [ ] **Place of Supply API:** Handle 400 when buyer state is missing; show error and do not use a fallback from transport/delivery.
- [ ] **Invoice/Challan/Debit note create:** For saved/delivered status, ensure buyer has state or GSTIN so backend can derive. Handle 400 `GST_DETERMINATION_FAILED` (show message, block save).
- [ ] **Invoice/Challan/Debit note update:** Same as create; handle 400 and **warnings** in response.
- [ ] **Warnings:** When response contains `warnings` (e.g. `PLACE_OF_SUPPLY_MISMATCH`), show the message to the user; document is already saved with correct derived GST.
- [ ] **UI – Place of Supply:** Show only derived value (from API or saved document). Make it read-only for tax. Do not allow user to select or type a different “Place of Supply” for GST.
- [ ] **UI – Place of Delivery:** Add or rename a field for “Place of Delivery” (or “Delivery State”) on the transport screen; store in `transportInfo.placeOfDelivery` / `placeOfDeliveryStateCode` / `placeOfDeliveryStateName`; do not use for GST.
- [ ] **UI – Supply type:** Do not let user choose IGST vs CGST+SGST; show the breakdown based on `supplyTypeDisplay` from API or saved document.
- [ ] **After save:** When loading a saved invoice/challan/debit note, use the **saved** `transportInfo.placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` (these are now backend-derived). Use `placeOfDelivery*` for “Place of Delivery” if present.

---

## 7. Summary

| Topic              | Old (remove)                    | New (implement)                                      |
|--------------------|----------------------------------|------------------------------------------------------|
| Place of Supply API| Send shipping state for GST      | Send only seller + buyer; no shipping state          |
| Place of Supply    | From transport / user selection | From Bill-To only (API or saved doc); read-only      |
| Place of Delivery  | Mixed with Place of Supply       | Separate field; transport screen only; display only  |
| GST type           | User or transport can override   | Derived only; show, do not let user change           |
| Create/update      | Ignore backend GST errors        | Handle 400 and warnings; block save on 400            |

Following these instructions will align Flutter with the backend’s GST logic and remove the old behaviour everywhere.
