# Flutter – Credit Note Feature Implementation Guide

## Core Concept

> **Reuse the Sales Debit Note UI.**  
> Credit Note has the same data structure and flow as Sales Debit Note. Use the same screens; change only the API base path, document prefix (`CN-`), and labels.

---

## Document Numbering

| Document            | Prefix | Example     |
|---------------------|--------|-------------|
| Sales Debit Note    | `SDN-` | `SDN-000001`|
| Credit Note         | `CN-`  | `CN-000001` |

Numbers are **independent** per document type. Credit Note has its own sequence.

---

## Important: Backend Update (Credit Note & Sales Debit Note)

The backend now supports **`referenceInvoiceDate`** on both **Credit Note** and **Sales Debit Note** (GST Rule 53 compliance).

| Change | Applies To | Flutter Action |
|--------|------------|----------------|
| `referenceInvoiceDate` | Credit Note, Sales Debit Note | Add this optional field to both forms when linking to an original invoice |

**Details:**
- **Type:** string (ISO date, e.g. `"2026-02-20"`)
- **Required:** No
- **Use:** When you have `referenceInvoiceNumber`, send `referenceInvoiceDate` as well for GST compliance

If you already have a Sales Debit Note form, add `referenceInvoiceDate` there too. Both documents reference the original invoice; send the date when you have it—the backend accepts and stores it for GST compliance.

---

## API Endpoints

**Base path:** `/business/{businessId}/credit-notes`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/business/{businessId}/credit-notes` | Create Credit Note |
| GET    | `/business/{businessId}/credit-notes` | List Credit Notes |
| GET    | `/business/{businessId}/credit-notes/{creditNoteId}` | Get single Credit Note |
| PUT    | `/business/{businessId}/credit-notes/{creditNoteId}` | Update Credit Note |
| DELETE | `/business/{businessId}/credit-notes/{creditNoteId}` | Delete Credit Note |
| POST   | `/business/{businessId}/credit-notes/{creditNoteId}/pdf` | Generate PDF |

All endpoints require `Authorization: Bearer {token}` and a valid `businessId` that belongs to the user.

---

## List Credit Notes

### Request
```
GET /business/{businessId}/credit-notes?status={status}&fromDate={date}&toDate={date}&search={query}&limit={n}&nextToken={token}&referenceInvoiceId={invoiceId}
```

**Query parameters (all optional):**
| Param | Type | Description |
|-------|------|-------------|
| status | string | `draft`, `saved`, or `cancelled` |
| fromDate | string | ISO date, e.g. `2026-02-01` |
| toDate | string | ISO date |
| search | string | Search in buyer name and credit note number |
| limit | number | 1–100, default 100 |
| nextToken | string | For pagination |
| referenceInvoiceId | string | Filter by linked invoice ID |

### Response (200)
```json
{
  "creditNotes": [
    {
      "creditNoteId": "uuid",
      "id": "uuid",
      "invoiceNumber": "CN-000001",
      "invoiceDate": "2026-02-26",
      "dueDate": "2026-03-26",
      "status": "saved",
      "referenceInvoiceId": "uuid-or-null",
      "referenceInvoiceNumber": "INV-001",
      "referenceInvoiceDate": "2026-02-20",
      "reason": "Sales return",
      "seller": { "firmName": "...", "gstNumber": "..." },
      "buyerId": "uuid-or-null",
      "buyerName": "Buyer Co",
      "buyerGstin": "",
      "buyerStateCode": "27",
      "buyerStateName": "Maharashtra",
      "buyerAddress": "...",
      "shippingName": "",
      "shippingGstin": "",
      "shippingAddress": "",
      "items": [...],
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
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "count": 1,
  "nextToken": "base64-encoded-or-null"
}
```

---

## Create Credit Note

### Request
```
POST /business/{businessId}/credit-notes
Content-Type: application/json
```

### Request Body Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| invoiceNumber | string | Yes | Must start with `CN-`, e.g. `CN-000001` |
| invoiceDate | string | No | ISO date |
| dueDate | string | No | ISO date |
| status | string | Yes | `draft`, `saved`, or `cancelled` |
| referenceInvoiceId | string | No | Original invoice ID |
| referenceInvoiceNumber | string | No | Original invoice number (GST Rule 53) |
| referenceInvoiceDate | string | No | Original invoice date (GST Rule 53) |
| reason | string | No | Reason for credit note |
| seller | object | Yes | See below |
| buyerId | string | No | Party ID |
| buyerName | string | Yes (if status=saved) | Buyer name |
| buyerGstin | string | No | |
| buyerStateCode | string | No | |
| buyerStateName | string | No | |
| buyerAddress | string | No | |
| shippingName | string | No | |
| shippingGstin | string | No | |
| shippingAddress | string | No | |
| items | array | Yes (if status=saved) | At least 1 item |
| additionalCharges | array | No | |
| globalDiscountType | string | Yes | `percentage` or `flat` |
| globalDiscountValue | number | Yes | |
| tcsInfo | object | No | `{ percentage, basis }` |
| transportInfo | object | No | |
| bankDetails | object | No | |
| otherDetails | object | No | |
| customFields | array | No | `[{ name, value }]` |
| termsAndConditions | array | No | |
| terms | array | No | |
| roundOff | number | No | |
| notes | string | No | |
| signatureUrl | string | No | |
| stampUrl | string | No | |

**Draft:** For `status: "draft"`, `buyerName` and `items` may be empty.

**Seller object (required):**
```json
{
  "firmName": "Seller Firm Name",
  "gstNumber": "27AABCA1234F1Z1"
}
```
`seller` can include extra fields (address, mobile, etc.) via passthrough.

**Line item object:**
```json
{
  "itemId": "product-uuid",
  "itemName": "Product Name",
  "hsnSac": "1001",
  "quantity": 1,
  "unit": "Nos",
  "unitPrice": 100,
  "discountType": "percentage",
  "discountValue": 10,
  "discountPercent": 10,
  "gstPercent": 18,
  "taxInclusive": false,
  "cessType": "Percentage",
  "cessValue": 0
}
```

**Additional charge object:**
```json
{
  "name": "Freight",
  "amount": 50,
  "gstPercent": 18,
  "hsnSac": "",
  "isTaxInclusive": false
}
```

### Example Create Request (saved)
```json
{
  "invoiceNumber": "CN-000001",
  "invoiceDate": "2026-02-26",
  "dueDate": "2026-03-26",
  "status": "saved",
  "referenceInvoiceNumber": "INV-001",
  "referenceInvoiceDate": "2026-02-20",
  "reason": "Sales return",
  "seller": {
    "firmName": "My Firm",
    "gstNumber": "27AABCA1234F1Z1"
  },
  "buyerName": "Customer Co",
  "buyerGstin": "",
  "buyerStateCode": "27",
  "buyerStateName": "Maharashtra",
  "buyerAddress": "Pune, MH",
  "items": [
    {
      "itemId": "product-uuid",
      "itemName": "Product A",
      "hsnSac": "1001",
      "quantity": 2,
      "unit": "Nos",
      "unitPrice": 50,
      "discountType": "percentage",
      "discountValue": 0,
      "discountPercent": 0,
      "gstPercent": 18,
      "taxInclusive": false,
      "cessType": "Percentage",
      "cessValue": 0
    }
  ],
  "additionalCharges": [],
  "globalDiscountType": "percentage",
  "globalDiscountValue": 0,
  "notes": ""
}
```

### Response (201)
```json
{
  "creditNote": {
    "creditNoteId": "uuid",
    "id": "uuid",
    "invoiceNumber": "CN-000001",
    "invoiceDate": "2026-02-26",
    "status": "saved",
    "buyerName": "Customer Co",
    "items": [...],
    "createdAt": "...",
    "updatedAt": "..."
  },
  "warnings": []
}
```
`warnings` is optional and may contain GST-related messages.

---

## Get Credit Note

### Request
```
GET /business/{businessId}/credit-notes/{creditNoteId}
```

### Response (200)
```json
{
  "creditNote": {
    "creditNoteId": "uuid",
    "invoiceNumber": "CN-000001",
    "invoiceDate": "2026-02-26",
    "status": "saved",
    "buyerName": "...",
    "items": [...],
    "seller": {...},
    ...
  }
}
```

### Response (404)
```json
{
  "message": "Credit Note not found"
}
```

---

## Update Credit Note

### Request
```
PUT /business/{businessId}/credit-notes/{creditNoteId}
Content-Type: application/json
```

**Body:** Same structure as Create, but all fields optional (partial update).

### Response (200)
```json
{
  "creditNote": { ... },
  "warnings": []
}
```

---

## Delete Credit Note

### Request
```
DELETE /business/{businessId}/credit-notes/{creditNoteId}
```

### Response (204)
No body.

### Response (404)
```json
{
  "message": "Credit Note not found"
}
```

---

## Generate PDF

### Request
```
POST /business/{businessId}/credit-notes/{creditNoteId}/pdf
Content-Type: application/json

{
  "templateId": "classic",
  "copyType": "original"
}
```

**Body parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| templateId | string | Yes | `classic` (only option currently) |
| copyType | string | No | `original`, `duplicate`, or `triplicate`. Default: `original` |

### Response (200)
```json
{
  "pdfUrl": "https://bucket.s3.region.amazonaws.com/credit-notes/.../classic_original.pdf",
  "creditNoteId": "uuid",
  "templateId": "classic",
  "copyType": "original"
}
```

Use `pdfUrl` to open or download the PDF (e.g. `url_launcher` or in-app viewer).

### Response (404)
```json
{
  "message": "Credit Note not found"
}
```

### Response (503)
```json
{
  "message": "Failed to generate PDF"
}
```

---

## Error Handling

| HTTP | Code | Meaning | Flutter Action |
|------|------|---------|----------------|
| 400 | VALIDATION_FAILED | Invalid field (e.g. wrong prefix) | Show validation message |
| 400 | GST_DETERMINATION_FAILED | GST/state derivation failed | Show error message |
| 403 | — | No trial/package or no create permission | Show upgrade / package message |
| 404 | — | Credit Note not found | Show “Document not found” |
| 409 | VOUCHER_NUMBER_TAKEN | `invoiceNumber` already used | Suggest next available number |
| 500 | — | Internal server error | Show generic error |

**Validation error response (400):**
```json
{
  "message": "Validation failed",
  "error": "Credit Note number must start with CN-",
  "details": [...],
  "code": "VALIDATION_FAILED"
}
```

**Duplicate number response (409):**
```json
{
  "message": "Voucher number already in use",
  "code": "VOUCHER_NUMBER_TAKEN",
  "field": "invoiceNumber"
}
```

---

## UI Implementation (Same as Sales Debit Note)

### 1. Home Screen
Add a **“Credit Note”** tile that navigates to the Credit Note list screen (same pattern as Sales Debit Note).

### 2. Credit Note List Screen
- Title: `"Credit Notes"`
- API: `GET /business/{businessId}/credit-notes`
- Use `creditNotes` from response
- “Create” opens the Credit Note create/edit form
- List item shows `invoiceNumber`, `buyerName`, `status`, `invoiceDate`

### 3. Credit Note Create / Edit Form
- Title: `"Create Credit Note"` or `"Edit Credit Note"`
- Number prefix: `CN-` (auto-generate, e.g. `CN-000001`)
- Same fields as Sales Debit Note form
- Validation: `invoiceNumber` must start with `CN-`
- On create: `POST /business/{businessId}/credit-notes`
- On update: `PUT /business/{businessId}/credit-notes/{creditNoteId}`

### 4. Credit Note Detail Screen
- Title: `"Credit Note"`
- API: `GET /business/{businessId}/credit-notes/{creditNoteId}`
- PDF: `POST /business/{businessId}/credit-notes/{creditNoteId}/pdf` with `{ "templateId": "classic" }`
- Use `pdfUrl` from response for download/open

---

## Implementation Checklist

- [ ] **Home:** Add “Credit Note” tile
- [ ] **List screen:** `GET /business/{businessId}/credit-notes`, show `creditNotes`
- [ ] **referenceInvoiceDate:** Add to Credit Note form (and Sales Debit Note form) when linking to original invoice
- [ ] **Create screen:** Form with `CN-` prefix, `POST` to create
- [ ] **Edit screen:** Load by ID, `PUT` to update
- [ ] **Detail screen:** Load by ID, PDF action
- [ ] **Validation:** `invoiceNumber` must start with `CN-`
- [ ] **Errors:** Handle 409 (next number), 400, 404, 403
- [ ] **PDF:** Call PDF endpoint, use `pdfUrl`

---

## Differences from Sales Debit Note

| Aspect | Sales Debit Note | Credit Note |
|--------|------------------|-------------|
| Base path | `/sales-debit-notes` | `/credit-notes` |
| Path param | `salesDebitNoteId` | `creditNoteId` |
| Number prefix | `SDN-` | `CN-` |
| Response key | `salesDebitNote` / `salesDebitNotes` | `creditNote` / `creditNotes` |
| Purpose | Increase amount (undercharge) | Decrease amount (return/overcharge) |

Request/response structure is the same; only paths, IDs, prefixes, and labels differ.
