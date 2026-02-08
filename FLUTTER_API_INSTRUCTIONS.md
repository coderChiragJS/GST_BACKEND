# Flutter – Backend API integration instructions

Use this as the single source of truth when integrating the Flutter app with this GST Billing Backend.

---

## Base URL and auth

- **Base URL:** Same for all endpoints. Example: `https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev` (no `/api` prefix).
- **Auth:** All endpoints except login/register require the JWT in the header:
  - `Authorization: Bearer <token>`
- **Login:** `POST /auth/login` with body `{ "email": "<string>", "password": "<string>" }`. Response includes `token` and `user`. Store the token and send it on every subsequent request.

---

## GST and master APIs (all require auth)

Call these with the same base URL and `Authorization: Bearer <token>`.

### 1. Place of supply (for IGST vs CGST+SGST)

- **Endpoint:** `POST /gst/place-of-supply`
- **Body (JSON):**
  - `supplyType` (required): `"goods"` or `"services"`
  - `sellerStateCode` (optional): 2-digit state code of supplier, e.g. `"26"`
  - `sellerStateName` (optional): state name of supplier
  - At least one of: `buyerStateCode`, `buyerStateName`, `buyerGstin`, `shippingStateCode`, `shippingStateName`
- **Response (200):**
  - `placeOfSupplyStateCode`: string, e.g. `"07"`
  - `placeOfSupplyStateName`: string, e.g. `"Delhi"`
  - `supplyTypeDisplay`: `"intrastate"` or `"interstate"`
- **Usage:** Use this before or when building an invoice to decide whether to show IGST (interstate) or CGST+SGST (intrastate). When saving the invoice, send back these values inside `transportInfo` (see Invoice APIs below).

### 2. Master – list of states

- **Endpoint:** `GET /master/states`
- **Response (200):** Array of `{ "code": "01", "name": "Jammu and Kashmir" }`, etc. Use for state dropdowns and validation.

### 3. State from GSTIN

- **Endpoint:** `GET /gst/state-from-gstin?gstin=<15-char GSTIN>`
- **Response (200):** `{ "stateCode": "07", "stateName": "Delhi" }`
- **Error (400):** `{ "error": "Invalid GSTIN", "code": "INVALID_GSTIN" }`
- **Usage:** When user enters buyer GSTIN, call this to auto-fill state and place of supply.

### 4. HSN/SAC rate (optional)

- **Endpoint:** `GET /gst/hsn-rate?code=<HSN or SAC code>`
- **Response (200):** `{ "code": "8471", "description": "...", "gstRate": 18 }`
- **Error (404):** `{ "error": "HSN/SAC code not found", "code": "NOT_FOUND" }`
- **Usage:** Pre-fill GST rate on invoice line or product when user selects HSN/SAC.

### 5. Validate GSTIN (optional)

- **Endpoint:** `GET /gst/validate-gstin?gstin=<15-char GSTIN>`
- **Response (200):** `{ "valid": true|false, "stateCode": "07"|null, "stateName": "Delhi"|null, "message": "Valid"|"Invalid GSTIN format" }`
- **Usage:** Validate format and get state in one call.

---

## Invoice APIs (all require auth)

- **Create:** `POST /business/<businessId>/invoices`
- **List:** `GET /business/<businessId>/invoices` with optional query: `?status=saved`, `?status=cancelled`, `?status=draft`, `?search=<string>`, `?fromDate=`, `?toDate=`, `?limit=100` (default 100, max 100), `?nextToken=<opaque>` (for pagination; use the `nextToken` from the previous response when present to fetch the next page).
- **Get one:** `GET /business/<businessId>/invoices/<invoiceId>`
- **Update:** `PUT /business/<businessId>/invoices/<invoiceId>`
- **Delete:** `DELETE /business/<businessId>/invoices/<invoiceId>`
- **Generate PDF:** `POST /business/<businessId>/invoices/<invoiceId>/pdf` with body `{ "templateId": "classic" }`. Response includes `pdfUrl`.

### Invoice create/update – required and optional fields

- **Required for all creates:** `invoiceNumber`, `type` (`"taxInvoice"` or `"billOfSupply"`), `status` (`"draft"` or `"saved"` or `"cancelled"`), `seller` (at least `firmName`, `gstNumber`).
- **Required when `status` is `"saved"`:** `buyerName`, at least one item in `items`, `globalDiscountType` (`"percentage"` or `"flat"`), `globalDiscountValue` (number).
- **When `status` is `"draft"`:** `buyerName` and `items` can be empty/omitted; `globalDiscountType` and `globalDiscountValue` can be omitted (default 0/percentage).
- **Address fields:** Backend accepts both `""` and `null` for `shippingAddress` and `buyerAddress`; `null` is coerced to `""`. Sending either will not cause validation to fail.
- **Place of supply on invoice:** When saving an invoice, you may send inside `transportInfo` (in addition to existing fields like `placeOfSupply`, `vehicleNumber`, etc.):
  - `placeOfSupplyStateCode`: string, e.g. `"07"`
  - `placeOfSupplyStateName`: string, e.g. `"Delhi"`
  - `supplyTypeDisplay`: `"intrastate"` or `"interstate"`
  These can come from the response of `POST /gst/place-of-supply` so the PDF and app show the same supply type.

### Validation errors

- On 400, the body includes `"code": "VALIDATION_FAILED"` and an array of field errors. **Party** create/update returns `errors: [ { "field": "shippingAddress.pincode", "message": "Pincode must be at least 6 digits" }, ... ]` (dot path in `field`). **Invoice** create/update returns `details` with Zod shape (`path`, `message`). Use `code` for programmatic handling; show `errors` or `details` so the user knows which field failed.

### Status-only update

- To cancel an invoice: `PUT .../invoices/<id>` with body `{ "status": "cancelled" }`.
- To move a draft to saved: `PUT .../invoices/<id>` with full invoice payload and `"status": "saved"` (must satisfy saved validation).

---

## Error format

- APIs use `{ "error": "<message>", "code": "<ERROR_CODE>" }` for 400/404/500 where applicable. Use `code` for programmatic handling.

---

## Checklist for Flutter

1. Use one base URL for auth, business, invoices, GST, and master.
2. Send `Authorization: Bearer <token>` on every request except login/register.
3. For invoice create: always send `globalDiscountType` and `globalDiscountValue` when status is `saved`. You may send `shippingAddress` and `buyerAddress` as `""` or `null`; both are accepted.
4. Call `POST /gst/place-of-supply` when building an invoice to get intrastate/interstate; store and send `placeOfSupplyStateCode`, `placeOfSupplyStateName`, `supplyTypeDisplay` in `transportInfo` when saving the invoice.
5. Use `GET /master/states` for state dropdowns; use `GET /gst/state-from-gstin` or `GET /gst/validate-gstin` when user enters GSTIN.
6. On 400 from invoice create/update, read `response.body` and show or log `details` for validation errors. For party create/update, use `response.body.errors` (array of `{ field, message }`) to show which field failed.
7. For **Create Quotation** flow: use **[FLUTTER_QUOTATION_COMPLETE_GUIDE.md](FLUTTER_QUOTATION_COMPLETE_GUIDE.md)** (one file with everything for quotation). For **Create Invoice** flow: use this doc and invoice endpoints only.
8. For **trial and packages** (new feature): use **[FLUTTER_NEW_FEATURE_PACKAGE_AND_TRIAL.md](FLUTTER_NEW_FEATURE_PACKAGE_AND_TRIAL.md)** for app-side changes only.
