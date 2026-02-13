# Backend GST API Specification

Use this document to implement backend APIs for correct GST rules (place of supply, IGST vs CGST/SGST, state master, HSN rates). The Flutter app will call these APIs to stay compliant with Indian GST.

---

## 1. Place of Supply

**Purpose:** Determine the correct **place of supply** as per GST law so the app can decide whether to show **IGST** (inter-state) or **CGST+SGST** (intra-state). Place of supply is destination-based and depends on type of supply and recipient location.

### Endpoint

```
POST /api/gst/place-of-supply
```

### Request body (JSON)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| supplyType | string | Yes | `"goods"` or `"services"` |
| sellerStateCode | string | No | 2-digit state code of supplier (e.g. "27" for Maharashtra). If missing, use sellerStateName. |
| sellerStateName | string | No | State name of supplier (e.g. "Maharashtra"). Used if sellerStateCode not provided. |
| buyerStateCode | string | No | 2-digit state code of recipient. |
| buyerStateName | string | No | State name of recipient. |
| buyerGstin | string | No | Recipient GSTIN (15 chars). First 2 digits = state code; can be used when state not sent. |
| shippingStateCode | string | No | State code of delivery location, if different from billing. |
| shippingStateName | string | No | State name of delivery location. |

**Note:** At least one of (buyerStateCode, buyerStateName, buyerGstin) or (shippingStateCode, shippingStateName) should be provided to determine place of supply. If only buyerGstin is sent, derive state from first 2 digits.

### Response (200 OK, JSON)

| Field | Type | Description |
|-------|------|-------------|
| placeOfSupplyStateCode | string | 2-digit state code (e.g. "27") |
| placeOfSupplyStateName | string | Full state name (e.g. "Maharashtra") |
| supplyTypeDisplay | string | `"intrastate"` or `"interstate"` — same state as seller = intrastate, else interstate |

### Business rules (implement on backend)

- **Goods (B2B):** Place of supply = location of recipient (buyer state). If shipping address state is provided and different, use shipping state as place of supply (destination of goods).
- **Goods (B2C):** Place of supply = location of recipient (delivery state). If not available, supplier location.
- **Services (B2B):** Place of supply = location of recipient (registered person’s state).
- **Services (B2C):** As per Section 12/13 of IGST Act (location of recipient; for some services, location of supplier). For a minimal implementation, use recipient state when available.
- **State from GSTIN:** First 2 characters of GSTIN are the state code. Maintain a static map of state code → state name (see Section 2).
- **supplyTypeDisplay:** Compare place of supply state with seller state (by code or normalized name). If same → `"intrastate"`; else → `"interstate"`.

### Example request

```json
{
  "supplyType": "goods",
  "sellerStateCode": "27",
  "buyerStateName": "Delhi",
  "buyerGstin": "07AABCU9603R1ZP"
}
```

### Example response

```json
{
  "placeOfSupplyStateCode": "07",
  "placeOfSupplyStateName": "Delhi",
  "supplyTypeDisplay": "interstate"
}
```

---

## 2. Master: List of States

**Purpose:** Single source of truth for Indian states (for Place of Supply dropdown, validation, and display). Frontend will use this instead of hardcoded list.

### Endpoint

```
GET /api/master/states
```

### Query parameters

None, or optional `?country=IN` for future use.

### Response (200 OK, JSON)

Array of state objects:

| Field | Type | Description |
|-------|------|-------------|
| code | string | 2-digit state code as per GST (e.g. "01", "27", "07") |
| name | string | Official state/UT name (e.g. "Jammu and Kashmir", "Maharashtra", "Delhi") |

### Example response

```json
[
  { "code": "01", "name": "Jammu and Kashmir" },
  { "code": "07", "name": "Delhi" },
  { "code": "27", "name": "Maharashtra" },
  { "code": "29", "name": "Karnataka" }
]
```

**Implementation note:** Use the official list of 37 states/UTs and their GST state codes (e.g. from CBIC/GST portal). Return all in a stable order (e.g. by code or name).

---

## 3. State from GSTIN

**Purpose:** Get state code and state name from a GSTIN so the app can auto-fill buyer state or place of supply and validate.

### Endpoint

```
GET /api/gst/state-from-gstin?gstin={gstin}
```

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| gstin | Yes | 15-character GSTIN (e.g. 27AABCU9603R1ZM) |

### Response (200 OK, JSON)

| Field | Type | Description |
|-------|------|-------------|
| stateCode | string | 2-digit state code (first 2 chars of GSTIN) |
| stateName | string | State/UT name corresponding to stateCode |

### Error response (400)

When GSTIN format is invalid (not 15 chars, or first 2 digits not a known state code):

```json
{
  "error": "Invalid GSTIN",
  "code": "INVALID_GSTIN"
}
```

### Example

Request: `GET /api/gst/state-from-gstin?gstin=27AABCU9603R1ZM`

Response:

```json
{
  "stateCode": "27",
  "stateName": "Maharashtra"
}
```

**Implementation:** Use the same state code → name map as in Section 2. Extract first 2 characters from GSTIN and return that state.

---

## 4. HSN / SAC → GST Rate (optional)

**Purpose:** Return GST rate (%) for a given HSN or SAC code so the app can pre-fill tax rate on invoice lines and product master. Backend can maintain the list from GST portal/CBIC and update when rates change.

### Endpoint

```
GET /api/gst/hsn-rate?code={code}
```

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| code | Yes | HSN or SAC code (e.g. "8471", "9983"). Min 2 digits. |

### Response (200 OK, JSON)

| Field | Type | Description |
|-------|------|-------------|
| code | string | HSN/SAC code as requested (normalized) |
| description | string | Short description of the item/service |
| gstRate | number | GST rate in percentage (e.g. 0, 0.25, 3, 5, 12, 18, 28) |

### Response (404)

When code is not found:

```json
{
  "error": "HSN/SAC code not found",
  "code": "NOT_FOUND"
}
```

### Example

Request: `GET /api/gst/hsn-rate?code=8471`

Response:

```json
{
  "code": "8471",
  "description": "Computers and data processing machines",
  "gstRate": 18
}
```

**Implementation:** Maintain a table or JSON of HSN/SAC codes with description and gstRate (from GST rate schedule). Support exact match; optionally support prefix match (e.g. "84" returns rate for chapter 84 if no exact match).

---

## 5. GSTIN Validation (optional)

**Purpose:** Validate GSTIN format and optionally check existence (e.g. via GST portal API if available). Return state info so app can auto-fill.

### Endpoint

```
GET /api/gst/validate-gstin?gstin={gstin}
```

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| gstin | Yes | 15-character GSTIN |

### Response (200 OK, JSON)

| Field | Type | Description |
|-------|------|-------------|
| valid | boolean | true if format (and optionally existence) is valid |
| stateCode | string | 2-digit state code from GSTIN |
| stateName | string | State name |
| message | string | Optional; e.g. "Valid" or "Invalid format" |

### Example (valid)

```json
{
  "valid": true,
  "stateCode": "27",
  "stateName": "Maharashtra",
  "message": "Valid"
}
```

### Example (invalid)

```json
{
  "valid": false,
  "stateCode": null,
  "stateName": null,
  "message": "Invalid GSTIN format"
}
```

**Implementation:** Validate length (15), pattern (alphanumeric), and first 2 digits as known state code. Optionally call GST portal public validation API if you have integration.

---

## 6. Invoice Save/Load with Supply Type (optional)

**Purpose:** When saving an invoice, backend stores place of supply and supply type. When loading, backend returns them so the app shows the correct tax breakdown (IGST vs CGST+SGST) consistently.

### Invoice payload (existing or new fields)

Ensure invoice API accepts and returns:

| Field | Type | Description |
|-------|------|-------------|
| sellerStateCode | string | Supplier state code (or derived from seller profile) |
| placeOfSupplyStateCode | string | From place-of-supply API or user selection |
| placeOfSupplyStateName | string | For display |
| supplyTypeDisplay | string | `"intrastate"` or `"interstate"` |

When **creating/updating** an invoice, frontend may send:

- `placeOfSupply` (state name or code) — from user selection or from place-of-supply API response.
- Optionally `supplyTypeDisplay` if already computed on frontend.

When **returning** an invoice (GET invoice by id, list, etc.), include:

- `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` so the app can show CGST+SGST vs IGST without recomputing.

**Implementation:** Persist these fields in your invoice table. You may compute `supplyTypeDisplay` on save (compare seller state with place of supply) if not sent by the client.

---

## 7. Invoice PDF Generation — Use Saved Supply Type

**Purpose:** The PDF must show the same tax type (IGST vs CGST+SGST) as the saved invoice. Do **not** recompute interstate/intrastate from buyer GSTIN when rendering the PDF.

**Required behaviour:**

- When generating the invoice PDF (e.g. `POST /business/{businessId}/invoices/{invoiceId}/pdf`):
  1. Load the saved invoice (including `transportInfo.placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay`).
  2. For the **"Place of Supply"** label: use `transportInfo.placeOfSupply` or `transportInfo.placeOfSupplyStateName`.
  3. For **tax breakdown (IGST vs CGST+SGST)**: use the saved `transportInfo.supplyTypeDisplay`:
     - If `supplyTypeDisplay === 'interstate'` → show **IGST** (full GST as IGST).
     - If `supplyTypeDisplay === 'intrastate'` (or same state as seller) → show **CGST** and **SGST** (half each).

**Do not:** Recompute supply type from buyer GSTIN (first 2 digits) when rendering the PDF. That can contradict the user’s manual place-of-supply and produces a mismatch: e.g. "Place of Supply: Maharashtra" with "Add : IGST" (wrong; for Maharashtra → Maharashtra it must be CGST+SGST).

---

## Summary: Implement in this order

| Priority | API | Method | Purpose |
|----------|-----|--------|---------|
| 1 | `/api/gst/place-of-supply` | POST | Get place of supply and intrastate/interstate for correct IGST vs CGST+SGST |
| 2 | `/api/master/states` | GET | State list for dropdowns and validation |
| 3 | `/api/gst/state-from-gstin` | GET | State from GSTIN for auto-fill and validation |
| 4 | `/api/gst/hsn-rate?code=` | GET | Optional; HSN/SAC → GST rate |
| 5 | `/api/gst/validate-gstin?gstin=` | GET | Optional; GSTIN validation + state |
| 6 | Invoice schema | - | Optional; persist and return place of supply and supply type |

---

## Authentication

Assume all above APIs require the same authentication as the rest of your app (e.g. Bearer token in `Authorization` header). Document your auth scheme and base URL so the frontend can be configured (e.g. `BASE_URL/api/...`).

---

## Base URL and versioning

- Base URL example: `https://your-api.com/api` or `https://your-api.com/v1`.
- Use consistent error format, e.g. `{ "error": "message", "code": "ERROR_CODE" }` with appropriate HTTP status (400, 404, 500).

This spec is enough to implement the backend so the Flutter app can apply correct GST rules (place of supply, IGST vs CGST/SGST) and optional HSN rate and GSTIN validation.
