# Flutter – Proforma Invoice Feature Implementation Guide

## Core Concept

> **No new screens to build.**  
> The existing Quotation screens (List, Create, Edit, Detail) are reused for both Quotations and Proforma Invoices.  
> The only thing that changes is a **`documentType` parameter** passed when navigating.

---

## Navigation Flow

```
Home Screen
│
├── Tap "Quotation"
│       └── QuotationListScreen(documentType: "quotation")
│                └── Create / Edit → QuotationFormScreen(documentType: "quotation")
│
└── Tap "Proforma Invoice"          ← ADD THIS TILE
        └── QuotationListScreen(documentType: "proforma")
                 └── Create / Edit → QuotationFormScreen(documentType: "proforma")
```

Same screens. Different `documentType` passed as a route argument.

---

## Home Screen Change

Add one new tile — **"Proforma Invoice"** — that navigates to the existing `QuotationListScreen` with `documentType: "proforma"`.

```dart
// Existing tile (no change)
HomeTile(
  label: 'Quotation',
  onTap: () => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => QuotationListScreen(documentType: 'quotation'),
    ),
  ),
),

// NEW tile
HomeTile(
  label: 'Proforma Invoice',
  onTap: () => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => QuotationListScreen(documentType: 'proforma'),
    ),
  ),
),
```

---

## Changes Needed in Existing Screens

### 1. `QuotationListScreen`

Accept a `documentType` parameter and use it to:
- Set the screen title
- Filter the list API call

```dart
class QuotationListScreen extends StatefulWidget {
  final String documentType; // 'quotation' or 'proforma'
  const QuotationListScreen({required this.documentType, ...});
}
```

**Screen title:**
```dart
String get screenTitle =>
    documentType == 'proforma' ? 'Proforma Invoices' : 'Quotations';
```

**List API call — add `documentType` query param:**
```dart
// Before (existing):
GET /business/{businessId}/quotations

// After (updated):
GET /business/{businessId}/quotations?documentType={documentType}
// e.g. ?documentType=quotation  OR  ?documentType=proforma
```

**"Create" button navigates to form with `documentType`:**
```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => QuotationFormScreen(
      documentType: documentType,   // pass through
    ),
  ),
);
```

---

### 2. `QuotationFormScreen` (Create / Edit)

Accept a `documentType` parameter and use it to:
- Set the screen title
- Set the document number prefix
- Include `documentType` in the API request body

```dart
class QuotationFormScreen extends StatefulWidget {
  final String documentType;           // 'quotation' or 'proforma'
  final ProformaInvoice? existing;     // null for create, non-null for edit
  const QuotationFormScreen({required this.documentType, this.existing, ...});
}
```

**Screen title:**
```dart
String get screenTitle {
  if (existing != null) {
    return documentType == 'proforma' ? 'Edit Proforma Invoice' : 'Edit Quotation';
  }
  return documentType == 'proforma' ? 'Create Proforma Invoice' : 'Create Quotation';
}
```

**Document number prefix:**
```dart
String get numberPrefix => documentType == 'proforma' ? 'PRF-' : 'QTN-';

// Auto-generate number: PRF-000001 or QTN-000001
String nextDocNumber = '$numberPrefix${nextSequence.toString().padLeft(6, '0')}';
```

**API request body — add `documentType`:**
```dart
Map<String, dynamic> buildRequestBody() {
  return {
    'documentType': documentType,     // ADD THIS
    'quotationNumber': docNumberController.text,
    'quotationDate': selectedDate,
    'status': selectedStatus,
    'seller': seller.toJson(),
    'buyerName': buyerNameController.text,
    // ... rest of existing fields unchanged
  };
}
```

**API call — same endpoint for both:**
```dart
// Create
POST /business/{businessId}/quotations

// Update
PUT /business/{businessId}/quotations/{quotationId}
```

---

### 3. `QuotationDetailScreen`

Accept `documentType` and use it only for the title.

```dart
String get screenTitle =>
    documentType == 'proforma' ? 'Proforma Invoice' : 'Quotation';
```

**PDF download — no change needed:**
```dart
// Same call for both quotation and proforma:
POST /business/{businessId}/quotations/{quotationId}/pdf
{
  "templateId": "classic",
  "copyType": "original"
}
// Backend auto-detects proforma and uses the correct PDF template.
```

---

## Summary of All Changes

| What | Change |
|---|---|
| Home Screen | Add "Proforma Invoice" tile that opens `QuotationListScreen(documentType: 'proforma')` |
| `QuotationListScreen` | Accept `documentType` param → set title + add `?documentType=` to API call |
| `QuotationFormScreen` | Accept `documentType` param → set title, number prefix (`PRF-` or `QTN-`), add `documentType` to request body |
| `QuotationDetailScreen` | Accept `documentType` param → set title only |
| PDF API call | No change — backend auto-uses proforma template |
| All other logic | No change — same form fields, same validation, same flow |

---

## Document Numbering

| Module | Prefix | Example |
|---|---|---|
| Quotation | `QTN-` | `QTN-000001` |
| Proforma Invoice | `PRF-` | `PRF-000001` |

Numbers are **independent** — the backend keeps them in separate indexes so `PRF-000001` and `QTN-000001` can both exist for the same business.

---

## Backend Updates

| Change | Details |
|--------|---------|
| **Proforma validation** | When `documentType: 'proforma'`, both `QTN-` and `PRF-` prefixes are accepted for `quotationNumber`. Error message if invalid: "Quotation number must start with QTN- or PRF-." |
| **List filter** | When `documentType=proforma`, the API returns only documents whose `quotationNumber` starts with `PRF-` (not by stored `documentType` field). |
| **Document numbers** | All document numbers are stored and returned in normalized form (no spaces after the hyphen). Use `PRF-000001`, not `PRF- 000001`. The backend normalizes on create/update. |

---

## API Quick Reference

### List
```
GET /business/{businessId}/quotations?documentType=quotation   → Quotations only
GET /business/{businessId}/quotations?documentType=proforma    → Proforma only
```

### Create
```
POST /business/{businessId}/quotations
Body: { "documentType": "proforma", "quotationNumber": "PRF-000001", ... }
```

### Update
```
PUT /business/{businessId}/quotations/{quotationId}
Body: { "documentType": "proforma", "quotationNumber": "PRF-000001", ... }
```

### Delete
```
DELETE /business/{businessId}/quotations/{quotationId}
```

### PDF
```
POST /business/{businessId}/quotations/{quotationId}/pdf
Body: { "templateId": "classic", "copyType": "original" }
```
> Backend auto-detects proforma — no need to pass `outputType`.

---

## Error Handling

| HTTP Status | Code | Meaning | Flutter Action |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | Invalid field (e.g. wrong number prefix) | Show validation error |
| 409 | `VOUCHER_NUMBER_TAKEN` | Number already used | Auto-increment to next available number |
| 404 | — | Not found | Show "Document not found" |
| 503 | — | PDF generation failed | Show "PDF generation failed, try again" |

---

## Implementation Checklist

- [ ] **Home Screen:** Add "Proforma Invoice" tile → `QuotationListScreen(documentType: 'proforma')`
- [ ] **QuotationListScreen:** Add `documentType` parameter
  - [ ] Screen title changes based on `documentType`
  - [ ] API call adds `?documentType={documentType}`
  - [ ] "Create" navigates to `QuotationFormScreen(documentType: documentType)`
- [ ] **QuotationFormScreen:** Add `documentType` parameter
  - [ ] Screen title changes
  - [ ] Document number prefix: `PRF-` for proforma, `QTN-` for quotation
  - [ ] Request body includes `"documentType": documentType`
- [ ] **QuotationDetailScreen:** Add `documentType` parameter for title only
- [ ] **PDF download:** No change needed
