# Flutter: Send These Fields So Backend Accepts and Stores Them

**Verified against backend schemas** (invoice, salesDebitNote, deliveryChallan, quotation controllers). Field names, types, and which document types have which fields match the backend.

The backend **accepts and persists** the fields below. Implement them in your Flutter app and include them in the request body when creating or updating Invoice, Sales Debit Note, Delivery Challan, or Quotation.

### Voucher numbers (required format and uniqueness)

| Document | Field | Prefix | Example |
|----------|-------|--------|--------|
| Invoice | invoiceNumber | **INV-** | INV-000001 |
| Quotation | quotationNumber | **QTN-** | QTN-000001 |
| Sales Debit Note | invoiceNumber | **SDN-** | SDN-000001 |
| Delivery Challan | challanNumber | **DC-** | DC-000001 |

- **Format:** Value must start with the prefix (case-sensitive). Rest can be digits/hyphens (e.g. INV-000001).
- **Uniqueness:** Each number must be unique per business for that document type. If the user enters a number already in use, the API returns **409** with `code: "VOUCHER_NUMBER_TAKEN"` and `field`. Show a clear error and ask for a different number.

---

## 1. Fields to Add and Send

### 1.1 Document-level (all four types where applicable)

| Field | Type | Where to use | How to get the value |
|-------|------|--------------|------------------------|
| **buyerStateCode** | `String?` | Invoice, Debit Note, Delivery Challan, Quotation | 2-digit GST state code of the **selected buyer/party**. Derive from buyer GSTIN (first 2 characters) or from party master if you store state code. Example: `"22"` for Chhattisgarh. |
| **buyerStateName** | `String?` | Invoice, Debit Note, Delivery Challan, Quotation | Full state name of the buyer. From party master or state list. Example: `"Chhattisgarh"`. |
| **terms** | `List<String>?` | Invoice, Debit Note, Delivery Challan, Quotation | Same as or copy of your terms text. Backend stores both `terms` and `termsAndConditions`; send both if you use both, or send the same list in both. |
| **roundOff** | `double?` | Invoice, Debit Note, Delivery Challan only | Round-off amount (can be positive or negative). Example: `0.04` or `-0.02`. Omit for Quotation. |

### 1.2 Challan number (where it goes)

| Document | Field | When to send |
|----------|-------|--------------|
| **Invoice, Debit Note** | **otherDetails.challanNumber** | `String?`. When the user enters a challan number, send it (e.g. `"2"`). Send `null` when not applicable. |
| **Delivery Challan** | **challanNumber** (at root) | `String` (required). This is the document number for the challan, not inside `otherDetails`. |

### 1.3 Line items (all document types that have items)

| Field | Type | Notes |
|-------|------|--------|
| **cessType** | `String` | Use one of: `"Percentage"`, `"Fixed"`, `"Per Unit"`. Backend accepts all three. `"Per Unit"` = cessValue is rupees per quantity. |

---

## 2. Flutter Implementation Checklist

### 2.1 Model / DTO

- Add to your **invoice** (and debit note, delivery challan, quotation) model:
  - `buyerStateCode` (nullable String)
  - `buyerStateName` (nullable String)
  - `terms` (nullable List<String>; or reuse same as termsAndConditions)
  - `roundOff` (nullable double) — **not** for Quotation.
- Ensure **otherDetails** includes **challanNumber** (nullable String) for Invoice and Debit Note.
- In **line item** model, ensure **cessType** can be `"Percentage"`, `"Fixed"`, or `"Per Unit"`.

### 2.2 Where to set the values

- **buyerStateCode / buyerStateName**: When user selects a **party/buyer**, set from:
  - Party’s state code and state name if stored in party master, or
  - First 2 characters of `buyerGstin` → state code, then map to state name from your state list (or from `GET /api/master/states`).
- **terms**: Populate from your terms UI; can be same as `termsAndConditions` or a separate list.
- **roundOff**: Set when you compute final amount and apply round-off (e.g. round to nearest rupee). Send the signed difference (positive or negative).
- **otherDetails.challanNumber**: Set when user fills “Challan Number” in the form; otherwise send `null`.

### 2.3 When to send

- **Create**: Include all fields above in the JSON body for create (POST) requests.
- **Update**: Include the same fields in the JSON body for update (PUT/PATCH) so they are stored; omit only if you intentionally clear them (then send `null` or empty as appropriate).

### 2.4 JSON serialization

- In `toJson()` (or equivalent), include:
  - `buyerStateCode`
  - `buyerStateName`
  - `terms` (array of strings)
  - `roundOff` (number or null) for Invoice, Debit Note, Delivery Challan
  - `otherDetails.challanNumber` for Invoice and Debit Note
- For line items, include **cessType** with one of `"Percentage"`, `"Fixed"`, `"Per Unit"`.

---

## 3. Document-Type Summary (what each payload has)

| Section | Invoice | Debit Note | Delivery Challan | Quotation |
|---------|---------|------------|------------------|-----------|
| Document keys | invoiceNumber, invoiceDate, dueDate, type, status | invoiceNumber, invoiceDate, dueDate, referenceInvoiceId, referenceInvoiceNumber, reason, status | challanNumber, challanDate, status | quotationNumber, quotationDate, validUntil, status |
| buyerStateCode, buyerStateName | Yes | Yes | Yes | Yes |
| roundOff | Yes | Yes | Yes | No |
| terms | Yes | Yes | Yes | Yes |
| otherDetails (incl. challanNumber) | Yes | Yes | Yes | No |
| transportInfo | Yes | Yes | Yes | No |
| contactPersons | No | No | No | Yes |
| Line items cessType | Percentage / Fixed / Per Unit | Same | Same | Same |

---

## 4. Example snippet (conceptual)

```dart
// When building invoice payload:
final payload = {
  'invoiceNumber': invoiceNumber,
  'invoiceDate': invoiceDate,
  'dueDate': dueDate,
  'type': type,
  'status': status,
  'seller': seller.toJson(),
  'buyerId': buyerId,
  'buyerName': buyerName,
  'buyerGstin': buyerGstin,
  'buyerStateCode': buyerStateCode,   // ADD: from party or GSTIN
  'buyerStateName': buyerStateName,   // ADD: from party or state list
  'buyerAddress': buyerAddress,
  // ... shipping, items, additionalCharges, globalDiscountType/Value, tcsInfo,
  'transportInfo': transportInfo.toJson(),
  'bankDetails': bankDetails.toJson(),
  'otherDetails': {
    'reverseCharge': otherDetails.reverseCharge,
    'poNumber': otherDetails.poNumber,
    'poDate': otherDetails.poDate,
    'challanNumber': otherDetails.challanNumber,  // send value when user enters it
    'eWayBillNumber': otherDetails.eWayBillNumber,
  },
  'customFields': customFields.map((e) => e.toJson()).toList(),
  'termsAndConditions': termsAndConditions,
  'terms': terms,                    // ADD: same as or copy of terms
  'roundOff': roundOff,             // ADD: for Invoice/Debit Note/Challan
  'notes': notes,
  'signatureUrl': signatureUrl,
  'stampUrl': stampUrl,
};
```

For **line items**, ensure each item has:

```dart
'cessType': item.cessType,  // "Percentage", "Fixed", or "Per Unit"
'cessValue': item.cessValue,
```

---

## 5. Backend confirmation

The backend **validates and stores** all of the above. No extra API version or headers are required. Sending these fields in create/update requests is enough for the backend to accept and persist them.
