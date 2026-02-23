# Flutter: TDS Voucher Integration

**Backend implementation status:** The TDS voucher feature is implemented and verified (balance formula, per-invoice validation, receipt over-allocation fix, and unit tests). Use this document for Flutter integration.

---

## 1. What is a TDS voucher?

A **TDS voucher** records **TDS (Tax Deducted at Source) collected** from a customer. When a customer deducts TDS and pays you the net amount, you:

1. Record the **TDS amount collected** (voucher).
2. **Allocate** that TDS to one or more **invoices** for that customer.

- **Balance due** on an invoice = **Invoice total − Amount paid − TDS deducted**.
- TDS voucher is **separate** from payment receipts: receipts record **money received** and update `paidAmount`; TDS vouchers record **TDS deducted** and update `tdsAmount` on invoices.
- **Voucher number** must start with **`TD`** (e.g. `TD-1`, `TD-000001`). Each number is unique per business.

---

## 2. Base URL and auth

- **Base URL:** Same as your existing API (e.g. invoices, receipts).
- **Auth:** All TDS voucher endpoints require:
  - **Header:** `Authorization: Bearer <token>`
  - User must have access to the **business** (same as `requireBusiness` for receipts).

---

## 3. API summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/business/:businessId/tds-vouchers/invoices-for-party` | List invoices for a party (customer) with balance info – for **Settle Invoice** screen |
| POST | `/business/:businessId/tds-vouchers` | Create TDS voucher (with allocations) |
| GET | `/business/:businessId/tds-vouchers` | List TDS vouchers (with filters and pagination) |
| GET | `/business/:businessId/tds-vouchers/:voucherId` | Get single TDS voucher |
| PUT | `/business/:businessId/tds-vouchers/:voucherId` | Update TDS voucher |
| DELETE | `/business/:businessId/tds-vouchers/:voucherId` | Delete TDS voucher |
| POST | `/business/:businessId/tds-vouchers/:voucherId/pdf` | Generate TDS voucher PDF (all details) |

**Path parameters:** `businessId` (required), `voucherId` (required for get/update/delete/pdf).

---

## 4. API details

### 4.1 List invoices for party (Settle Invoice)

Used to show **invoices for a selected customer** with **grandTotal, paidAmount, tdsAmount, balanceDue** so the user can allocate TDS to them.

**Request**

- **Method:** `GET`
- **Path:** `/business/:businessId/tds-vouchers/invoices-for-party`
- **Query parameters:**

| Parameter | Type | Required | Notes |
|-----------|------|----------|--------|
| partyId | string | **Yes** | Customer/party ID – must match `buyerId` on invoices |
| limit | number | No | 1–100, default 100 |
| nextToken | string | No | Pagination token from previous response |

**Example:** `GET /business/biz123/tds-vouchers/invoices-for-party?partyId=cust456&limit=50`

**Response: 200 OK**

```json
{
  "invoices": [
    {
      "invoiceId": "inv-uuid-1",
      "invoiceNumber": "INV-001",
      "invoiceDate": "2025-01-15",
      "grandTotal": 11800,
      "paidAmount": 5000,
      "tdsAmount": 0,
      "balanceDue": 6800
    }
  ],
  "count": 1,
  "nextToken": "eyJQSyI6IlVTRVIj..."
}
```

| Field | Type | Notes |
|-------|------|--------|
| invoices | array | Invoices for this party with balance info |
| invoices[].invoiceId | string | Use for allocations |
| invoices[].invoiceNumber | string | Display |
| invoices[].invoiceDate | string | ISO date |
| invoices[].grandTotal | number | Invoice total |
| invoices[].paidAmount | number | Amount paid (from receipts) |
| invoices[].tdsAmount | number | TDS already allocated to this invoice |
| invoices[].balanceDue | number | grandTotal − paidAmount − tdsAmount |
| count | number | Length of `invoices` in this page |
| nextToken | string | Present if more pages; send in next request |

**Errors**

- **400** – Missing `businessId` or `partyId`. Body: `{ "message": "..." }`.
- **400** – Invalid `nextToken`. Body: `{ "message": "Invalid nextToken" }`.

---

### 4.2 Create TDS voucher

**Request**

- **Method:** `POST`
- **Path:** `/business/:businessId/tds-vouchers`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body (JSON):**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| voucherNumber | string | Yes | Must start with `TD` (e.g. `TD-1`, `TD-000001`) |
| voucherDate | string | Yes | Date of voucher (e.g. ISO `2025-01-20`) |
| partyId | string | No | Customer/party ID (should match invoice `buyerId` if provided) |
| partyName | string | Yes | Customer/party name |
| tdsAmountCollected | number | Yes | Total TDS amount (≥ 0) |
| allocations | array | Yes | At least one allocation; see below |

**Allocation object**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| invoiceId | string | Yes | From invoices-for-party or invoice list |
| invoiceNumber | string | Yes | For display |
| tdsAllocated | number | Yes | TDS amount to allocate to this invoice (≥ 0) |

**Validation rules (backend enforces):**

- Sum of all `allocations[].tdsAllocated` ≤ `tdsAmountCollected`.
- For each invoice, **total** TDS allocated (sum of all rows for that invoice) ≤ that invoice’s **balanceDue**.
- Each invoice must exist and (if `partyId` is sent) must belong to that party (`buyerId === partyId`).
- Voucher number must be unique per business.

**Example request body**

```json
{
  "voucherNumber": "TD-1",
  "voucherDate": "2025-01-20",
  "partyId": "cust456",
  "partyName": "ABC Pvt Ltd",
  "tdsAmountCollected": 1000,
  "allocations": [
    {
      "invoiceId": "inv-uuid-1",
      "invoiceNumber": "INV-001",
      "tdsAllocated": 600
    },
    {
      "invoiceId": "inv-uuid-2",
      "invoiceNumber": "INV-002",
      "tdsAllocated": 400
    }
  ]
}
```

**Response: 201 Created**

```json
{
  "voucher": {
    "voucherId": "uuid",
    "voucherNumber": "TD-1",
    "voucherDate": "2025-01-20",
    "partyId": "cust456",
    "partyName": "ABC Pvt Ltd",
    "tdsAmountCollected": 1000,
    "allocations": [
      { "invoiceId": "inv-uuid-1", "invoiceNumber": "INV-001", "tdsAllocated": 600 },
      { "invoiceId": "inv-uuid-2", "invoiceNumber": "INV-002", "tdsAllocated": 400 }
    ],
    "createdAt": "2025-01-20T10:00:00.000Z",
    "updatedAt": "2025-01-20T10:00:00.000Z"
  }
}
```

**Errors**

- **400** – Validation failed. Body: `{ "message": "...", "code": "VALIDATION_FAILED", "details": [...] }`. Common messages:
  - `Sum of TDS allocated cannot exceed TDS amount collected`
  - `Invoice not found: <invoiceId>`
  - `Invoice ... does not belong to the selected party`
  - `Total TDS allocated for invoice ... exceeds balance due`
- **409** – Voucher number already in use. Body: `{ "message": "Voucher number already in use", "code": "VOUCHER_NUMBER_TAKEN", "field": "voucherNumber" }`.

---

### 4.3 List TDS vouchers

**Request**

- **Method:** `GET`
- **Path:** `/business/:businessId/tds-vouchers`
- **Query parameters:**

| Parameter | Type | Required | Notes |
|-----------|------|----------|--------|
| partyId | string | No | Filter by party |
| fromDate | string | No | Vouchers on or after (e.g. ISO date) |
| toDate | string | No | Vouchers on or before |
| search | string | No | Search in voucher number and party name (or use `q`) |
| q | string | No | Same as `search` |
| limit | number | No | 1–100, default 100 |
| nextToken | string | No | Pagination token |

**Response: 200 OK**

```json
{
  "vouchers": [
    {
      "voucherId": "uuid",
      "voucherNumber": "TD-1",
      "voucherDate": "2025-01-20",
      "partyId": "cust456",
      "partyName": "ABC Pvt Ltd",
      "tdsAmountCollected": 1000,
      "allocations": [
        { "invoiceId": "...", "invoiceNumber": "INV-001", "tdsAllocated": 600 }
      ],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "count": 1,
  "nextToken": "eyJQSyI6..."
}
```

---

### 4.4 Get TDS voucher

**Request**

- **Method:** `GET`
- **Path:** `/business/:businessId/tds-vouchers/:voucherId`

**Response: 200 OK**

```json
{
  "voucher": {
    "voucherId": "uuid",
    "voucherNumber": "TD-1",
    "voucherDate": "2025-01-20",
    "partyId": "cust456",
    "partyName": "ABC Pvt Ltd",
    "tdsAmountCollected": 1000,
    "allocations": [...],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors**

- **404** – `{ "message": "TDS voucher not found" }`.

---

### 4.5 Update TDS voucher

**Request**

- **Method:** `PUT`
- **Path:** `/business/:businessId/tds-vouchers/:voucherId`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body (JSON):** All fields optional. Send only what you want to change.

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| voucherNumber | string | No | Must start with `TD`; must be unique |
| voucherDate | string | No | |
| partyId | string | No | |
| partyName | string | No | |
| tdsAmountCollected | number | No | |
| allocations | array | No | Same shape as create; if sent, **replaces** all allocations |

If `allocations` is sent, backend **reverts** old allocations from invoices and **applies** new ones. Same validation as create (sum ≤ collected, per-invoice total ≤ balanceDue).

**Example (change allocations only):**

```json
{
  "allocations": [
    { "invoiceId": "inv-1", "invoiceNumber": "INV-001", "tdsAllocated": 1000 }
  ]
}
```

**Response: 200 OK**

```json
{
  "voucher": { ... }
}
```

**Errors**

- **400** – Validation failed (same codes as create).
- **404** – TDS voucher not found.
- **409** – New voucher number already in use (`VOUCHER_NUMBER_TAKEN`).

---

### 4.6 Delete TDS voucher

**Request**

- **Method:** `DELETE`
- **Path:** `/business/:businessId/tds-vouchers/:voucherId`

**Response: 204 No Content** (empty body on success)

**Errors**

- **404** – `{ "message": "TDS voucher not found" }`.

On success, backend **reverts** all TDS allocations from the affected invoices (subtracts from `invoice.tdsAmount`) and releases the voucher number.

---

## 5. UI flow (recommended)

### Screen 1: TDS vouchers list

- **Route:** e.g. `/tds-vouchers` or a tab/section “TDS Vouchers”.
- **API:** `GET /business/:businessId/tds-vouchers` with optional `partyId`, `fromDate`, `toDate`, `search`/`q`, `limit`, `nextToken`.
- **UI:** Table or list: voucher number, date, party name, TDS amount collected, optional actions (View, Edit, Delete).
- **Action:** “Create TDS Voucher” → Navigate to **Create flow**.

### Screen 2: Create TDS voucher (step 1 – header)

- **Fields:**
  - **Voucher number** – Text field; must start with `TD` (e.g. `TD-1`). You can auto-suggest next number (e.g. from last voucher in list + 1) or let user type.
  - **Voucher date** – Date picker (e.g. ISO date string).
  - **Select buyer / party** – Dropdown or search from your **parties/customers** list. Store `partyId` and `partyName`.
  - **TDS amount collected** – Number (₹), ≥ 0.
- **Action:** “Settle Invoice” or “Allocate to invoices” → Navigate to **Settle Invoice** (step 2).

### Screen 3: Settle Invoice (allocate TDS to invoices)

- **API:** `GET /business/:businessId/tds-vouchers/invoices-for-party?partyId=<selected partyId>`.
- **UI:** Show list of invoices for this party with columns: Invoice number, Date, Grand total, Paid, TDS (already), **Balance due**, and an input for **TDS to allocate** per row (or per selected rows).
- **Business rules in UI:**
  - For each invoice, **TDS to allocate** ≤ **Balance due**.
  - Sum of “TDS to allocate” across selected rows ≤ **TDS amount collected** (from step 1).
- **Action:** “Save” / “Create voucher” → Call **Create TDS voucher** with:
  - `voucherNumber`, `voucherDate`, `partyId`, `partyName`, `tdsAmountCollected` from step 1.
  - `allocations`: one entry per invoice that has “TDS to allocate” > 0: `{ invoiceId, invoiceNumber, tdsAllocated }`.
- On **201**, show success; optionally call **Generate TDS voucher PDF** and show “Download PDF” or open `pdfUrl` in browser.

### Screen 4: View / Edit TDS voucher

- **API:** `GET /business/:businessId/tds-vouchers/:voucherId` to load.
- **View:** Show voucher header and allocations (read-only). Add “Download PDF” / “Print” that calls **POST /business/:businessId/tds-vouchers/:voucherId/pdf** and opens or downloads the returned `pdfUrl`.
- **Edit:** Same fields as create; “Settle Invoice” can call **invoices-for-party** again and send **Update** with new `allocations` (and optionally other fields). Use `PUT /business/:businessId/tds-vouchers/:voucherId`.

### Screen 5: Delete

- **API:** `DELETE /business/:businessId/tds-vouchers/:voucherId`.
- On **204**, remove from list or navigate back to list.

---

## 6. Business logic (Flutter side)

- **Balance due:** Always use **balanceDue** from the API for each invoice. Do not recompute from grandTotal/paidAmount/tdsAmount unless you have the same formula: `balanceDue = grandTotal - paidAmount - tdsAmount`.
- **Voucher number:** Must start with `TD`; backend rejects others with 400. Uniqueness is enforced by backend (409 if taken).
- **Allocations:**
  - Sum of `tdsAllocated` ≤ `tdsAmountCollected`.
  - Per invoice: total TDS you allocate to that invoice (one or more rows) ≤ that invoice’s **balanceDue**.
- **Party:** `partyId` in the voucher should be the same as `buyerId` on the invoices you allocate to; backend validates when `partyId` is provided.
- **Invoice list for party:** Use **invoices-for-party** for the “Settle Invoice” screen. Your party/customer list can come from your existing parties API; use the same `partyId` (or `buyerId`) when calling invoices-for-party.

---

## 7. Error handling (Flutter)

- **400** – Show `message`; if `code === "VALIDATION_FAILED"`, you can show `details` for field-level errors. If message says “exceeds balance due”, highlight the offending invoice/allocation.
- **404** – “TDS voucher not found” or “Invoice not found”.
- **409** – “Voucher number already in use”: ask user to change voucher number.
- **500** – Generic server error; show `message` or a generic message.

---

## 8. References (backend)

| What | Location |
|------|----------|
| TDS voucher controller (all handlers) | `src/controllers/tdsVoucherController.js` |
| TDS voucher model (CRUD) | `src/models/tdsVoucherModel.js` |
| Balance helper (balanceDue formula) | `src/utils/invoiceBalance.js` |
| Voucher number (TD prefix, claim/release) | `src/models/voucherIndexModel.js` (DOC_TYPES.TDS_VOUCHER) |
| Routes | `src/routes/api.js` (GET invoices-for-party, POST/GET/PUT/DELETE tds-vouchers, POST tds-vouchers/:voucherId/pdf) |
| TDS voucher PDF | `src/controllers/tdsVoucherPdfController.js`, `src/services/invoicePdfService.js` (generateAndUploadTdsVoucherPdf), `src/templates/tds-vouchers/classic.html` |
| Invoice `tdsAmount` (exposed in list/get) | `src/controllers/invoiceController.js` |
| Statement PDF (TDS + balance) | `src/controllers/invoiceStatementPdfController.js`, `src/services/invoicePdfService.js`, `src/templates/statements/classic.html` |

---

## 9. Quick reference – request/response shapes

**Invoices for party (response):**

```json
{
  "invoices": [
    {
      "invoiceId": "string",
      "invoiceNumber": "string",
      "invoiceDate": "string",
      "grandTotal": number,
      "paidAmount": number,
      "tdsAmount": number,
      "balanceDue": number
    }
  ],
  "count": number,
  "nextToken": "string | null"
}
```

**Create voucher (request):**

```json
{
  "voucherNumber": "string (^TD.+)",
  "voucherDate": "string",
  "partyId": "string | null",
  "partyName": "string",
  "tdsAmountCollected": number,
  "allocations": [
    { "invoiceId": "string", "invoiceNumber": "string", "tdsAllocated": number }
  ]
}
```

**Create voucher (response 201):** `{ "voucher": { voucherId, voucherNumber, voucherDate, partyId, partyName, tdsAmountCollected, allocations[], createdAt, updatedAt } }`

**List vouchers (response 200):** `{ "vouchers": [ {...} ], "count": number, "nextToken": "string | null" }`

**Get voucher (response 200):** `{ "voucher": { ... } }`

**Update voucher (request):** Same fields as create, all optional. **Response 200:** `{ "voucher": { ... } }`

**Delete voucher:** **204** no content.

**Generate TDS voucher PDF (request):** `POST /business/:businessId/tds-vouchers/:voucherId/pdf` with optional body `{ "templateId": "classic" }`.

**Generate TDS voucher PDF (response 200):** `{ "pdfUrl": "https://...", "voucherId": "uuid", "templateId": "classic" }`
