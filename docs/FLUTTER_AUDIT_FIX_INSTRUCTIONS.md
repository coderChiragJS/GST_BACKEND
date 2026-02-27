# Flutter Integration Guide: Backend Audit Fixes

## Overview

This document describes **backend changes** deployed on **27 Feb 2026** as part of a comprehensive audit. These changes improve data integrity, security, and GST compliance. **No existing request/response schemas have changed.** All existing API contracts remain backward-compatible.

The Flutter app needs to handle **new error responses** from the backend. If these errors are not handled, the app may show raw error messages or crash on certain edge cases.

---

## Base URL

```
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
```

---

## Changes That Require Frontend Updates

### 1. Cancelled Document Edit Guard (C1)

**What changed:** Credit Notes, Sales Debit Notes, and Delivery Challans now block editing when their status is `cancelled`. Previously only Invoices had this guard.

**Affected endpoints:**
- `PUT /business/:businessId/credit-notes/:creditNoteId`
- `PUT /business/:businessId/sales-debit-notes/:salesDebitNoteId`
- `PUT /business/:businessId/delivery-challans/:deliveryChallanId`

**New error response (HTTP 403):**

```json
{
  "message": "Cancelled credit notes cannot be edited",
  "code": "CANCELLED_DOCUMENT_EDIT_FORBIDDEN"
}
```

The `message` varies by document type (`"Cancelled sales debit notes cannot be edited"`, `"Cancelled delivery challans cannot be edited"`). The `code` is always `CANCELLED_DOCUMENT_EDIT_FORBIDDEN`.

**Flutter action required:**
- Hide or disable the **Edit** button on the document detail screen when `status == "cancelled"` for Credit Notes, Sales Debit Notes, and Delivery Challans.
- This should already be done for Invoices. Apply the same logic to these three document types.
- If the edit button is somehow tapped, handle the `403` response gracefully with a snackbar/dialog.

```dart
// Example guard in Flutter
if (document.status == 'cancelled') {
  // Hide edit button or show "Cannot edit cancelled document"
}
```

---

### 2. Invoice Deletion Guard (C5)

**What changed:** Invoices with linked Payment Receipts or TDS Vouchers can no longer be deleted. The user must delete the linked documents first.

**Affected endpoint:**
- `DELETE /business/:businessId/invoices/:invoiceId`

**New error response (HTTP 409):**

```json
{
  "message": "Cannot delete invoice with linked payments or TDS vouchers. Delete the payment receipts and TDS vouchers first.",
  "code": "LINKED_DOCUMENTS_EXIST",
  "paidAmount": 500,
  "tdsAmount": 221
}
```

**Flutter action required:**
- When the user taps **Delete** on an invoice, handle the `409` status code.
- Show a dialog/snackbar with the error message. You can use the `paidAmount` and `tdsAmount` fields to show a more helpful message:

```dart
if (response.statusCode == 409) {
  final data = jsonDecode(response.body);
  showDialog(
    // title: "Cannot Delete Invoice"
    // content: data['message']
    // Optionally show: "Paid: ₹${data['paidAmount']}, TDS: ₹${data['tdsAmount']}"
  );
}
```

- Alternatively, you can proactively check `paidAmount > 0 || tdsAmount > 0` on the invoice object and disable/hide the delete button.

---

### 3. Credit Note Amount Validation (M4)

**What changed:** When creating or updating a Credit Note with a `referenceInvoiceId`, the backend now validates that the Credit Note's grand total does not exceed the referenced invoice's grand total.

**Affected endpoints:**
- `POST /business/:businessId/credit-notes`
- `PUT /business/:businessId/credit-notes/:creditNoteId`

**New error response (HTTP 400):**

```json
{
  "message": "Credit note amount (2360) cannot exceed referenced invoice total (1180)",
  "code": "CN_EXCEEDS_INVOICE"
}
```

**Flutter action required:**
- Handle the `400` response with code `CN_EXCEEDS_INVOICE` on the Credit Note create/edit screen.
- Show the error message in a snackbar or inline error. The message includes both amounts for clarity.
- Optionally, add client-side validation: when the user selects a reference invoice, fetch its grand total and compare before submitting.

---

### 4. Subscription Enforcement on Receipts & TDS (M6)

**What changed:** Payment Receipt and TDS Voucher creation routes now include the `canCreateDocument` middleware, which checks subscription limits. Previously these routes bypassed subscription checks.

**Affected endpoints:**
- `POST /business/:businessId/receipts`
- `POST /business/:businessId/tds-vouchers`

**Possible new error response (HTTP 403):**

```json
{
  "message": "Document creation limit reached for your current plan",
  "code": "DOCUMENT_LIMIT_REACHED"
}
```

**Flutter action required:**
- If you already handle subscription limit errors on Invoice/Quotation creation screens, apply the **same error handling** to Payment Receipt and TDS Voucher creation screens.
- No new UI is needed -- just make sure the `403` / `DOCUMENT_LIMIT_REACHED` error is caught and displayed.

---

## Changes That Do NOT Require Frontend Updates

These backend fixes improve data integrity silently. No new error codes or UI changes are needed.

### 5. Invoice Update Stock Consistency (C2)

**What changed:** When updating a saved invoice, if GST validation fails after stock has been reversed, the stock is now correctly reapplied. Previously, a failed update would leave inventory in an incorrect state.

**Impact on Flutter:** None. The user sees the same validation error as before; the backend now correctly handles the rollback internally.

---

### 6. Credit Note Inventory Adjustment (C3)

**What changed:** When a Credit Note is saved (status = `saved`), stock is now **added back** for the items (representing returned goods). When a saved Credit Note is deleted, that stock addition is reversed.

**Impact on Flutter:** None. Stock quantities on the Products screen will now correctly reflect credit note returns. No API changes.

---

### 7. Atomic Increment for paidAmount/tdsAmount (C6)

**What changed:** Payment Receipt and TDS Voucher create/update/delete operations now use DynamoDB atomic increments instead of read-modify-write to update `paidAmount` and `tdsAmount` on invoices. This prevents race conditions when multiple receipts/vouchers are processed concurrently.

**Impact on Flutter:** None. The API request/response format is identical. Invoice balance calculations are now more accurate under concurrent usage.

---

### 8. Delivery Challan Stock on 'delivered' Only (M1)

**What changed:** Stock deductions for Delivery Challans now only apply when the status is `delivered`. Previously, even `pending` challans deducted stock.

**Impact on Flutter:** None. Stock quantities will now be more accurate. If your DC creation screen defaults to `pending` status, stock will not be deducted until the status is changed to `delivered`.

---

## Error Code Reference (Quick Lookup)

| HTTP | Code | When | Document Types |
|------|------|------|----------------|
| 403 | `CANCELLED_DOCUMENT_EDIT_FORBIDDEN` | Editing a cancelled document | CN, SDN, DC |
| 409 | `LINKED_DOCUMENTS_EXIST` | Deleting invoice with linked receipts/TDS | Invoice |
| 400 | `CN_EXCEEDS_INVOICE` | Credit Note total > referenced invoice total | CN |
| 403 | `DOCUMENT_LIMIT_REACHED` | Subscription limit hit on create | Receipt, TDS |

---

## Testing Checklist for Flutter

Use this checklist to verify your app handles the new backend behavior:

- [ ] **Credit Note / SDN / DC detail screen**: Edit button is hidden/disabled when status is `cancelled`
- [ ] **Invoice detail screen**: Delete shows helpful error when `paidAmount > 0` or `tdsAmount > 0`
- [ ] **Credit Note create/edit**: Error displayed when CN amount exceeds referenced invoice total
- [ ] **Payment Receipt create**: Subscription limit error is handled (same as invoice creation)
- [ ] **TDS Voucher create**: Subscription limit error is handled (same as invoice creation)
- [ ] **Product stock**: Verify stock reflects credit note returns correctly
- [ ] **Product stock**: Verify pending delivery challans do not deduct stock
- [ ] **Invoice balance**: Verify `balanceDue` is correct after creating/deleting receipts and TDS vouchers

---

## No Breaking Changes

- All existing request payloads continue to work as before
- All existing response formats are unchanged
- No new required fields have been added to any create/update endpoint
- No existing fields have been removed or renamed
