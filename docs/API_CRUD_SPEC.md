# API CRUD Specification — Invoice, Quotation, Sales Debit Note, Delivery Challan

Reference for frontend (e.g. Flutter) to verify all CRUD and PDF endpoints. Every request and response field is listed so nothing is missed.

---

## 1. Authentication and base URL

- **Authentication:** Send a valid JWT in the `Authorization` header:
  - `Authorization: Bearer <token>`
- **Base URL:** Configure in the app (e.g. `https://your-api.execute-api.region.amazonaws.com/dev`). All paths below are relative to this base.
- **Content-Type:** `application/json` for request bodies.

All endpoints in this document (except health) require authentication. Business-scoped endpoints also require that the user has access to the given `businessId`.

---

## 2. Voucher numbers (format and uniqueness)

Each document type has a **voucher number** that must follow a fixed prefix and be unique per business for that type.

| Document | Field | Prefix | Example |
|----------|-------|--------|--------|
| Invoice | invoiceNumber | **INV-** | INV-000001, INV-2026-01 |
| Quotation | quotationNumber | **QTN-** | QTN-000001, QTN-2026-01 |
| Sales Debit Note | invoiceNumber | **SDN-** | SDN-000001, SDN-001 |
| Delivery Challan | challanNumber | **DC-** | DC-000001, DC-2026-01 |

- **Format:** The value must start with the prefix (case-sensitive). The rest can be digits, hyphens, etc. (e.g. `INV-000001`).
- **Uniqueness:** Within a business, the same voucher number cannot be used twice for the same document type. Creating or updating a document with a number that is already in use returns **409 Conflict** with `code: "VOUCHER_NUMBER_TAKEN"`.
- **On delete:** When a document is deleted, its voucher number is released and can be used again.

---

## 3. Shared types (reused across documents)

These shapes are used in Invoice, Quotation, Sales Debit Note, and/or Delivery Challan. Reference them by name in the per-document sections.

### Line item (items[])

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| itemId | string | Yes | |
| itemName | string | Yes | |
| hsnSac | string | No | Default `""` |
| quantity | number | Yes | ≥ 0 |
| unit | string | No | Default `"Nos"` |
| unitPrice | number | Yes | ≥ 0 |
| discountType | string | Yes | `"percentage"` \| `"flat"` |
| discountValue | number | Yes | ≥ 0 |
| discountPercent | number | Yes | ≥ 0 |
| gstPercent | number | Yes | 0–100 |
| taxInclusive | boolean | No | Default `false` |
| cessType | string | Yes | `"Percentage"` \| `"Fixed"` \| `"Per Unit"` |
| cessValue | number | Yes | ≥ 0 |

### Additional charge (additionalCharges[])

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| name | string | Yes | |
| amount | number | Yes | ≥ 0 |
| gstPercent | number | Yes | 0–100 |
| hsnSac | string | No | Default `""` |
| isTaxInclusive | boolean | No | Default `false` |

### TCS info (tcsInfo)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| percentage | number | Yes | ≥ 0 |
| basis | string | Yes | `"taxableAmount"` \| `"finalAmount"` |

### Transport info (transportInfo)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| vehicleNumber | string \| null | No | |
| mode | string \| null | No | |
| transporterName | string \| null | No | |
| transporterId | string \| null | No | |
| docNo | string \| null | No | |
| docDate | string \| null | No | |
| approxDistance | number | No | ≥ 0 |
| placeOfSupply | string \| null | No | |
| dateOfSupply | string \| null | No | |
| placeOfSupplyStateCode | string \| null | No | |
| placeOfSupplyStateName | string \| null | No | |
| supplyTypeDisplay | string \| null | No | `"intrastate"` \| `"interstate"` |

### Bank details (bankDetails)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| bankName | string \| null | No | |
| accountHolderName | string \| null | No | |
| accountNumber | string \| null | No | |
| ifscCode | string \| null | No | |
| branch | string \| null | No | |
| upiId | string \| null | No | |

### Other details (otherDetails)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| reverseCharge | boolean | No | Default `false` |
| poNumber | string \| null | No | |
| poDate | string \| null | No | |
| challanNumber | string \| null | No | |
| eWayBillNumber | string \| null | No | |

### Custom field (customFields[])

| Field | Type | Required |
|-------|------|----------|
| name | string | Yes |
| value | string | Yes |

### Seller (seller)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| firmName | string | Yes | Non-empty |
| gstNumber | string | Yes | Non-empty |
| *(any other keys)* | * | No | Backend uses passthrough; extra fields accepted |

### Contact person (contactPersons[] — Quotation only)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| name | string | Yes | Non-empty |
| phone | string | No | |
| email | string | No | Valid email or `""` |

### Quotation seller (seller — Quotation)

Same as **Seller** above, plus:

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| dispatchAddress | object \| null | No | e.g. `{ "street": "..." }`; passthrough |

---

## 4. Common error responses

- **400 — Validation failed (create/update):**
  ```json
  {
    "message": "Validation failed",
    "error": "<first error message>",
    "details": [ { "path": [...], "message": "..." } ],
    "code": "VALIDATION_FAILED"
  }
  ```
- **409 — Voucher number already in use (create/update):**
  Returned when the voucher number is already used by another document of the same type in the same business.
  ```json
  {
    "message": "Voucher number already in use",
    "code": "VOUCHER_NUMBER_TAKEN",
    "field": "invoiceNumber"
  }
  ```
  `field` is one of: `invoiceNumber`, `quotationNumber`, `challanNumber`. Frontend should show a clear error and ask the user to choose a different number.
- **400 — Invalid nextToken (list):**
  ```json
  { "message": "Invalid nextToken" }
  ```
- **400 — Missing URL param (e.g. businessId):**
  ```json
  { "message": "Business ID is required in URL" }
  ```
- **400 — Invalid templateId (PDF):**
  ```json
  {
    "message": "Invalid templateId",
    "allowedTemplates": ["classic", "modern", ...]
  }
  ```
- **404 — Resource not found:**
  ```json
  { "message": "Invoice not found" }
  ```
  (Replace with "Quotation not found", "Sales Debit Note not found", or "Delivery Challan not found" as appropriate.)
- **500 — Internal server error:**
  ```json
  {
    "message": "Internal Server Error",
    "error": "<optional error string>"
  }
  ```
- **503 — Quotation PDF generation failed:**
  ```json
  {
    "message": "PDF generation failed",
    "error": "<optional error string>"
  }
  ```

---

## 5. Invoice

**Path prefix:** `GET/POST/PUT/DELETE` under `/business/:businessId/invoices` or `/business/:businessId/invoices/:invoiceId`.  
Use **invoiceId** in the URL for get/update/delete/PDF (returned as `invoice.invoiceId` or `invoice.id` from create/get).

### 4.1 Create invoice

**Request**

- **Method:** `POST`
- **Path:** `/business/:businessId/invoices`
- **Path params:** `businessId` (required)
- **Body:** JSON. Validation is **status-discriminated**:

**When `status` is `"saved"` or `"cancelled"`:**
- All base fields required as below; `buyerName` required; `items` array required with at least one line item.

**When `status` is `"draft"`:**
- `buyerName` optional (default `""`).
- `items` optional (default `[]`).
- `globalDiscountType` optional (default `"percentage"`), `globalDiscountValue` optional (default `0`).

**Base invoice body (all fields that can appear):**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| id | string | No | Ignored on create |
| invoiceNumber | string | Yes | Non-empty; must start with **INV-** (e.g. INV-000001). Unique per business. |
| invoiceDate | string \| null | No | |
| dueDate | string \| null | No | |
| type | string | Yes | `"taxInvoice"` \| `"billOfSupply"` |
| status | string | Yes | `"draft"` \| `"saved"` \| `"cancelled"` |
| seller | object | Yes | See **Seller** (shared) |
| buyerId | string \| null | No | |
| buyerName | string | Yes for saved/cancelled; optional for draft | |
| buyerGstin | string | No | Default `""` |
| buyerStateCode | string \| null | No | |
| buyerStateName | string \| null | No | |
| buyerAddress | string | No | Default `""` |
| shippingName | string | No | Default `""` |
| shippingGstin | string | No | Default `""` |
| shippingAddress | string | No | Default `""` |
| items | array | Yes for saved/cancelled; optional for draft | Array of **Line item**; min 1 for saved/cancelled |
| additionalCharges | array | No | Default `[]`; **Additional charge** |
| globalDiscountType | string | Yes for saved/cancelled; optional for draft | `"percentage"` \| `"flat"` |
| globalDiscountValue | number | Yes for saved/cancelled; optional for draft | ≥ 0 |
| tcsInfo | object \| null | No | **TCS info** |
| transportInfo | object \| null | No | **Transport info** |
| bankDetails | object \| null | No | **Bank details** |
| otherDetails | object \| null | No | **Other details** |
| customFields | array | No | Default `[]`; **Custom field** |
| termsAndConditions | array | No | Default `[]`; array of strings |
| terms | array | No | Default `[]`; array of strings |
| roundOff | number \| null | No | |
| notes | string | No | Default `""` |
| signatureUrl | string \| null | No | |
| stampUrl | string \| null | No | |

**Success response:** `201 Created`

```json
{
  "invoice": {
    "PK": "...",
    "SK": "...",
    "invoiceId": "<uuid>",
    "businessId": "...",
    "userId": "...",
    "id": "<same as invoiceId>",
    "invoiceNumber": "...",
    "invoiceDate": "...",
    "dueDate": null,
    "type": "taxInvoice",
    "status": "saved",
    "seller": { ... },
    "buyerId": null,
    "buyerName": "...",
    "buyerGstin": "",
    "buyerStateCode": null,
    "buyerStateName": null,
    "buyerAddress": "",
    "shippingName": "",
    "shippingGstin": "",
    "shippingAddress": "",
    "items": [ ... ],
    "additionalCharges": [],
    "globalDiscountType": "percentage",
    "globalDiscountValue": 0,
    "tcsInfo": null,
    "transportInfo": null,
    "bankDetails": null,
    "otherDetails": null,
    "customFields": [],
    "termsAndConditions": [],
    "terms": [],
    "roundOff": null,
    "notes": "",
    "signatureUrl": null,
    "stampUrl": null,
    "createdAt": "<ISO8601>",
    "updatedAt": "<ISO8601>"
  }
}
```

Use `invoice.invoiceId` or `invoice.id` for subsequent GET/PUT/DELETE/PDF. Ignore `PK`/`SK` for frontend logic.

**Error responses:** 400 (validation / businessId), 500.

---

### 4.2 List invoices

**Request**

- **Method:** `GET`
- **Path:** `/business/:businessId/invoices`
- **Path params:** `businessId` (required)
- **Query params:**

| Param | Type | Required | Notes |
|-------|------|----------|--------|
| status | string | No | Filter: `draft`, `saved`, `cancelled` |
| fromDate | string | No | Date filter (invoiceDate >= fromDate) |
| toDate | string | No | Date filter (invoiceDate <= toDate) |
| search | string | No | Matches buyerName or invoiceNumber (case-insensitive) |
| limit | number | No | 1–100, default 100 |
| nextToken | string | No | Opaque base64url; use from previous list response for next page |

**Success response:** `200 OK`

```json
{
  "invoices": [ { /* full invoice object per 4.1 response */ } ],
  "count": 0,
  "nextToken": "<base64url or omitted if no more pages>"
}
```

**Error responses:** 400 (missing businessId, invalid nextToken), 500.

---

### 4.3 Get invoice by ID

**Request**

- **Method:** `GET`
- **Path:** `/business/:businessId/invoices/:invoiceId`
- **Path params:** `businessId`, `invoiceId` (required)

**Success response:** `200 OK`

```json
{
  "invoice": { /* full invoice object; same shape as create response */ }
}
```

**Error responses:** 404, 500.

---

### 4.4 Update invoice

**Request**

- **Method:** `PUT`
- **Path:** `/business/:businessId/invoices/:invoiceId`
- **Path params:** `businessId`, `invoiceId` (required)
- **Body:** JSON. **Partial** — only include fields that are changing. Every field from the base invoice body (4.1) is optional for update. Same types and rules (e.g. status, type, seller, items, etc.).

**Success response:** `200 OK`

```json
{
  "invoice": { /* full updated invoice object */ }
}
```

**Error responses:** 400 (validation), 404, 500.

---

### 4.5 Delete invoice

**Request**

- **Method:** `DELETE`
- **Path:** `/business/:businessId/invoices/:invoiceId`
- **Path params:** `businessId`, `invoiceId` (required)
- **Body:** None

**Success response:** `204 No Content` (no body).

**Error responses:** 404, 500.

---

### 4.6 Generate invoice PDF

**Request**

- **Method:** `POST`
- **Path:** `/business/:businessId/invoices/:invoiceId/pdf`
- **Path params:** `businessId`, `invoiceId` (required)
- **Body:** JSON

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| templateId | string | Yes | One of: `"classic"`, `"modern"`, `"minimal"` |

**Success response:** `200 OK`

```json
{
  "pdfUrl": "<signed or public URL to the generated PDF>",
  "invoiceId": "<invoiceId>",
  "templateId": "classic"
}
```

**Error responses:** 400 (missing IDs, invalid templateId), 404, 500.

---

## 6. Quotation

**Path prefix:** `/business/:businessId/quotations` and `/business/:businessId/quotations/:quotationId`.  
Use **quotationId** in the URL for get/update/delete/PDF (returned as `quotation.quotationId` or `quotation.id` from create/get).

### 5.1 Create quotation

**Request**

- **Method:** `POST`
- **Path:** `/business/:businessId/quotations`
- **Path params:** `businessId` (required)
- **Body:** JSON. Validation is **status-discriminated**:
  - **`status: "draft"`** — buyerName optional, items optional (default `[]`).
  - **`status: "sent"`** — buyerName required, items required with at least one item.
  - **`status: "accepted"` \| `"rejected"` \| `"expired"`** — same as base.

**Base quotation body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| id | string | No | Ignored on create |
| quotationNumber | string | Yes | Non-empty; must start with **QTN-** (e.g. QTN-000001). Unique per business. |
| quotationDate | string \| null | No | |
| validUntil | string \| null | No | |
| status | string | Yes | `"draft"` \| `"sent"` \| `"accepted"` \| `"rejected"` \| `"expired"` |
| seller | object | Yes | **Quotation seller** (firmName, gstNumber, dispatchAddress optional, passthrough) |
| buyerId | string \| null | No | |
| buyerName | string | Yes when status is `"sent"`; optional otherwise | Default `""` |
| buyerGstin | string | No | Default `""` |
| buyerStateCode | string \| null | No | |
| buyerStateName | string \| null | No | |
| buyerAddress | string | No | Default `""` |
| shippingName | string | No | Default `""` |
| shippingGstin | string | No | Default `""` |
| shippingAddress | string | No | Default `""` |
| items | array | Yes when status is `"sent"`; optional otherwise | **Line item**; default `[]` |
| additionalCharges | array | No | Default `[]` |
| globalDiscountType | string | No | Default `"percentage"` |
| globalDiscountValue | number | No | Default `0` |
| tcsInfo | object \| null | No | |
| bankDetails | object \| null | No | **Bank details** (no transportInfo/otherDetails on quotation) |
| contactPersons | array | No | Default `[]`; **Contact person** |
| customFields | array | No | Default `[]` |
| termsAndConditions | array | No | Default `[]` |
| terms | array | No | Default `[]` |
| notes | string | No | Default `""` |
| signatureUrl | string \| null | No | |
| stampUrl | string \| null | No | |

**Success response:** `201 Created`

```json
{
  "quotation": {
    "PK": "...",
    "SK": "QUOTATION#...",
    "quotationId": "<uuid>",
    "businessId": "...",
    "userId": "...",
    "id": "<same as quotationId>",
    "quotationNumber": "...",
    "quotationDate": null,
    "validUntil": null,
    "status": "draft",
    "seller": { ... },
    "buyerId": null,
    "buyerName": "",
    "buyerGstin": "",
    "buyerStateCode": null,
    "buyerStateName": null,
    "buyerAddress": "",
    "shippingName": "",
    "shippingGstin": "",
    "shippingAddress": "",
    "items": [],
    "additionalCharges": [],
    "globalDiscountType": "percentage",
    "globalDiscountValue": 0,
    "tcsInfo": null,
    "bankDetails": null,
    "contactPersons": [],
    "customFields": [],
    "termsAndConditions": [],
    "terms": [],
    "notes": "",
    "signatureUrl": null,
    "stampUrl": null,
    "createdAt": "<ISO8601>",
    "updatedAt": "<ISO8601>"
  }
}
```

Use `quotation.quotationId` or `quotation.id` for subsequent calls.

**Error responses:** 400 (validation / businessId), 500.

---

### 5.2 List quotations

**Request**

- **Method:** `GET`
- **Path:** `/business/:businessId/quotations`
- **Query params:** `status`, `fromDate`, `toDate`, `search`, `limit`, `nextToken` (same semantics as Invoice list; filter by quotationDate and quotationNumber/buyerName).

**Success response:** `200 OK`

```json
{
  "quotations": [ { /* full quotation object */ } ],
  "count": 0,
  "nextToken": "<optional>"
}
```

**Error responses:** 400, 500.

---

### 5.3 Get quotation by ID

**Request:** `GET /business/:businessId/quotations/:quotationId`

**Success response:** `200 OK`

```json
{
  "quotation": { /* full quotation object */ }
}
```

**Error responses:** 404, 500.

---

### 5.4 Update quotation

**Request:** `PUT /business/:businessId/quotations/:quotationId`  
**Body:** Partial quotation (any subset of base quotation fields).

**Success response:** `200 OK`

```json
{
  "quotation": { /* full updated quotation object */ }
}
```

**Error responses:** 400, 404, 500.

---

### 5.5 Delete quotation

**Request:** `DELETE /business/:businessId/quotations/:quotationId`  
**Success response:** `204 No Content`  
**Error responses:** 404, 500.

---

### 5.6 Generate quotation PDF

**Request:** `POST /business/:businessId/quotations/:quotationId/pdf`  
**Body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| templateId | string | Yes | One of: `"classic"`, `"compact"`, `"modern"` |

**Success response:** `200 OK`

```json
{
  "pdfUrl": "<URL>",
  "quotationId": "<quotationId>",
  "templateId": "classic"
}
```

**Error responses:** 400 (invalid templateId), 404, 500, 503 (PDF generation failed).

---

## 7. Sales Debit Note

**Path prefix:** `/business/:businessId/sales-debit-notes` and `/business/:businessId/sales-debit-notes/:salesDebitNoteId`.  
Use **salesDebitNoteId** in the URL (returned as `salesDebitNote.salesDebitNoteId` or `salesDebitNote.id`).

**Note:** The document uses `invoiceNumber` and `invoiceDate` for the debit note’s own number and date (for templates). Use `referenceInvoiceId` and `referenceInvoiceNumber` to link to the original invoice.

### 6.1 Create sales debit note

**Request**

- **Method:** `POST`
- **Path:** `/business/:businessId/sales-debit-notes`
- **Path params:** `businessId` (required)
- **Body:** JSON. Status-discriminated:
  - **`status: "saved"` or `"cancelled"`** — buyerName required, items required (min 1).
  - **`status: "draft"`** — buyerName optional (default `""`), items optional (default `[]`), globalDiscountType/Value optional.

**Base sales debit note body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| id | string | No | Ignored on create |
| salesDebitNoteId | string | No | Ignored on create |
| invoiceNumber | string | Yes | “Sales Debit Note Number” (display number for this note) |
| invoiceDate | string \| null | No | |
| dueDate | string \| null | No | |
| status | string | Yes | `"draft"` \| `"saved"` \| `"cancelled"` |
| referenceInvoiceId | string \| null | No | Link to original invoice |
| referenceInvoiceNumber | string \| null | No | Original invoice number for display |
| reason | string | No | Default `""` |
| seller | object | Yes | **Seller** |
| buyerId | string \| null | No | |
| buyerName | string | Yes for saved/cancelled; optional for draft | |
| buyerGstin | string | No | Default `""` |
| buyerStateCode | string \| null | No | |
| buyerStateName | string \| null | No | |
| buyerAddress | string | No | Default `""` |
| shippingName | string | No | Default `""` |
| shippingGstin | string | No | Default `""` |
| shippingAddress | string | No | Default `""` |
| items | array | Yes for saved/cancelled; optional for draft | **Line item**; min 1 for saved/cancelled |
| additionalCharges | array | No | Default `[]` |
| globalDiscountType | string | Yes for saved/cancelled; optional for draft | `"percentage"` \| `"flat"` |
| globalDiscountValue | number | Yes for saved/cancelled; optional for draft | ≥ 0 |
| tcsInfo | object \| null | No | |
| transportInfo | object \| null | No | |
| bankDetails | object \| null | No | |
| otherDetails | object \| null | No | |
| customFields | array | No | Default `[]` |
| termsAndConditions | array | No | Default `[]` |
| terms | array | No | Default `[]` |
| roundOff | number \| null | No | |
| notes | string | No | Default `""` |
| signatureUrl | string \| null | No | |
| stampUrl | string \| null | No | |

**Success response:** `201 Created`

```json
{
  "salesDebitNote": {
    "PK": "...",
    "SK": "SALES_DEBIT_NOTE#...",
    "salesDebitNoteId": "<uuid>",
    "id": "<same>",
    "businessId": "...",
    "userId": "...",
    "invoiceNumber": "...",
    "invoiceDate": null,
    "dueDate": null,
    "status": "saved",
    "referenceInvoiceId": null,
    "referenceInvoiceNumber": null,
    "reason": "",
    "seller": { ... },
    "buyerId": null,
    "buyerName": "...",
    "buyerGstin": "",
    "buyerStateCode": null,
    "buyerStateName": null,
    "buyerAddress": "",
    "shippingName": "",
    "shippingGstin": "",
    "shippingAddress": "",
    "items": [ ... ],
    "additionalCharges": [],
    "globalDiscountType": "percentage",
    "globalDiscountValue": 0,
    "tcsInfo": null,
    "transportInfo": null,
    "bankDetails": null,
    "otherDetails": null,
    "customFields": [],
    "termsAndConditions": [],
    "terms": [],
    "roundOff": null,
    "notes": "",
    "signatureUrl": null,
    "stampUrl": null,
    "createdAt": "<ISO8601>",
    "updatedAt": "<ISO8601>"
  }
}
```

Use `salesDebitNote.salesDebitNoteId` or `salesDebitNote.id` for subsequent calls.

**Error responses:** 400, 500.

---

### 6.2 List sales debit notes

**Request:** `GET /business/:businessId/sales-debit-notes`  
**Query params:** `status`, `fromDate`, `toDate`, `search`, `limit`, `nextToken`, and **`referenceInvoiceId`** (filter by linked invoice).

**Success response:** `200 OK`

```json
{
  "salesDebitNotes": [ { /* full sales debit note object */ } ],
  "count": 0,
  "nextToken": "<optional>"
}
```

**Error responses:** 400, 500.

---

### 6.3 Get sales debit note by ID

**Request:** `GET /business/:businessId/sales-debit-notes/:salesDebitNoteId`  
**Success response:** `200 OK`

```json
{
  "salesDebitNote": { /* full sales debit note object */ }
}
```

**Error responses:** 404, 500.

---

### 6.4 Update sales debit note

**Request:** `PUT /business/:businessId/sales-debit-notes/:salesDebitNoteId`  
**Body:** Partial (any subset of base sales debit note fields).  
**Success response:** `200 OK` with `{ "salesDebitNote": { ... } }`.  
**Error responses:** 400, 404, 500.

---

### 6.5 Delete sales debit note

**Request:** `DELETE /business/:businessId/sales-debit-notes/:salesDebitNoteId`  
**Success response:** `204 No Content`.  
**Error responses:** 404, 500.

---

### 6.6 Generate sales debit note PDF

**Request:** `POST /business/:businessId/sales-debit-notes/:salesDebitNoteId/pdf`  
**Body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| templateId | string | Yes | Only `"classic"` allowed |

**Success response:** `200 OK`

```json
{
  "pdfUrl": "<URL>",
  "salesDebitNoteId": "<salesDebitNoteId>",
  "templateId": "classic"
}
```

**Error responses:** 400 (invalid templateId), 404, 500.

---

## 8. Delivery Challan

**Path prefix:** `/business/:businessId/delivery-challans` and `/business/:businessId/delivery-challans/:challanId`.  
Use **challanId** in the URL (same value as `deliveryChallan.deliveryChallanId` or `deliveryChallan.id`).

**Note:** Delivery Challan uses **challanNumber** and **challanDate** (not invoiceNumber/invoiceDate).

### 7.1 Create delivery challan

**Request**

- **Method:** `POST`
- **Path:** `/business/:businessId/delivery-challans`
- **Path params:** `businessId` (required)
- **Body:** JSON. Status-discriminated:
  - **`status: "delivered"` or `"cancelled"`** — buyerName required, items required (min 1).
  - **`status: "pending"`** — buyerName optional (default `""`), items optional (default `[]`), globalDiscountType/Value optional.

**Base delivery challan body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| id | string | No | Ignored on create |
| deliveryChallanId | string | No | Ignored on create |
| challanNumber | string | Yes | Non-empty; must start with **DC-** (e.g. DC-000001). Unique per business. |
| challanDate | string \| null | No | |
| status | string | Yes | `"pending"` \| `"delivered"` \| `"cancelled"` |
| seller | object | Yes | **Seller** |
| buyerId | string \| null | No | |
| buyerName | string | Yes for delivered/cancelled; optional for pending | |
| buyerGstin | string | No | Default `""` |
| buyerStateCode | string \| null | No | |
| buyerStateName | string \| null | No | |
| buyerAddress | string | No | Default `""` |
| shippingName | string | No | Default `""` |
| shippingGstin | string | No | Default `""` |
| shippingAddress | string | No | Default `""` |
| items | array | Yes for delivered/cancelled; optional for pending | **Line item**; min 1 for delivered/cancelled |
| additionalCharges | array | No | Default `[]` |
| globalDiscountType | string | Yes for delivered/cancelled; optional for pending | `"percentage"` \| `"flat"` |
| globalDiscountValue | number | Yes for delivered/cancelled; optional for pending | ≥ 0 |
| tcsInfo | object \| null | No | |
| transportInfo | object \| null | No | |
| bankDetails | object \| null | No | |
| otherDetails | object \| null | No | |
| customFields | array | No | Default `[]` |
| termsAndConditions | array | No | Default `[]` |
| terms | array | No | Default `[]` |
| roundOff | number \| null | No | |
| notes | string | No | Default `""` |
| signatureUrl | string \| null | No | |
| stampUrl | string \| null | No | |

**Success response:** `201 Created`

```json
{
  "deliveryChallan": {
    "PK": "...",
    "SK": "DELIVERY_CHALLAN#...",
    "deliveryChallanId": "<uuid>",
    "id": "<same>",
    "businessId": "...",
    "userId": "...",
    "challanNumber": "...",
    "challanDate": null,
    "status": "pending",
    "seller": { ... },
    "buyerId": null,
    "buyerName": "...",
    "buyerGstin": "",
    "buyerStateCode": null,
    "buyerStateName": null,
    "buyerAddress": "",
    "shippingName": "",
    "shippingGstin": "",
    "shippingAddress": "",
    "items": [ ... ],
    "additionalCharges": [],
    "globalDiscountType": "percentage",
    "globalDiscountValue": 0,
    "tcsInfo": null,
    "transportInfo": null,
    "bankDetails": null,
    "otherDetails": null,
    "customFields": [],
    "termsAndConditions": [],
    "terms": [],
    "roundOff": null,
    "notes": "",
    "signatureUrl": null,
    "stampUrl": null,
    "createdAt": "<ISO8601>",
    "updatedAt": "<ISO8601>"
  }
}
```

Use `deliveryChallan.deliveryChallanId` or `deliveryChallan.id` as **challanId** in URL for get/update/delete/PDF.

**Error responses:** 400, 500.

---

### 7.2 List delivery challans

**Request:** `GET /business/:businessId/delivery-challans`  
**Query params:** `status`, `fromDate`, `toDate`, `search`, `limit`, `nextToken` (filters use challanDate and challanNumber/buyerName).

**Success response:** `200 OK`

```json
{
  "deliveryChallans": [ { /* full delivery challan object */ } ],
  "count": 0,
  "nextToken": "<optional>"
}
```

**Error responses:** 400, 500.

---

### 7.3 Get delivery challan by ID

**Request:** `GET /business/:businessId/delivery-challans/:challanId`  
**Success response:** `200 OK`

```json
{
  "deliveryChallan": { /* full delivery challan object */ }
}
```

**Error responses:** 404, 500.

---

### 7.4 Update delivery challan

**Request:** `PUT /business/:businessId/delivery-challans/:challanId`  
**Body:** Partial (any subset of base delivery challan fields).  
**Success response:** `200 OK` with `{ "deliveryChallan": { ... } }`.  
**Error responses:** 400, 404, 500.

---

### 7.5 Delete delivery challan

**Request:** `DELETE /business/:businessId/delivery-challans/:challanId`  
**Success response:** `204 No Content`.  
**Error responses:** 404, 500.

---

### 7.6 Generate delivery challan PDF

**Request:** `POST /business/:businessId/delivery-challans/:challanId/pdf`  
**Body:**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| templateId | string | Yes | Only `"classic"` allowed |

**Success response:** `200 OK`

```json
{
  "pdfUrl": "<URL>",
  "deliveryChallanId": "<challanId>",
  "templateId": "classic"
}
```

**Error responses:** 400 (invalid templateId), 404, 500.

---

## 9. Quick reference — URL path params

| Module | List/Create path | Get/Update/Delete/PDF path | ID param name |
|--------|------------------|----------------------------|----------------|
| Invoice | `/business/:businessId/invoices` | `/business/:businessId/invoices/:invoiceId` | invoiceId |
| Quotation | `/business/:businessId/quotations` | `/business/:businessId/quotations/:quotationId` | quotationId |
| Sales Debit Note | `/business/:businessId/sales-debit-notes` | `/business/:businessId/sales-debit-notes/:salesDebitNoteId` | salesDebitNoteId |
| Delivery Challan | `/business/:businessId/delivery-challans` | `/business/:businessId/delivery-challans/:challanId` | challanId |

---

## 10. Frontend checklist (easy to miss)

- **Invoice create:** For `status: "draft"`, buyerName and items can be empty; for `status: "saved"` or `"cancelled"`, buyerName and at least one item required. `type` must be `"taxInvoice"` or `"billOfSupply"`.
- **Quotation create:** For `status: "sent"`, buyerName and at least one item required. Quotation has `contactPersons` and `validUntil`; no `transportInfo`/`otherDetails` in schema; no `roundOff`.
- **Sales Debit Note:** Uses `invoiceNumber` as the debit note’s display number; use `referenceInvoiceId` / `referenceInvoiceNumber` for the original invoice. List supports `referenceInvoiceId` query param.
- **Delivery Challan:** Uses `challanNumber` and `challanDate` (not invoiceNumber/invoiceDate).
- **List pagination:** `nextToken` is opaque base64url; send it back as the `nextToken` query param for the next page. `limit` 1–100, default 100.
- **Update:** All four modules accept a **partial** body; only send fields that change.
- **Response IDs:** Use `invoiceId`/`quotationId`/`salesDebitNoteId`/`deliveryChallanId` or `id` from the response document for URLs; do not rely on `PK`/`SK`.
