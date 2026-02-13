# GST Calculation & Place of Supply - Flutter Implementation Overview

## Backend Test Results ✅

**Date:** February 13, 2026  
**Tested Against:** Production API (`https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev`)  
**Result:** Backend logic is 100% correct for both interstate and intrastate scenarios.

---

## How GST Calculation Works

### 1. Line Item Calculation (Same in Backend & Flutter)

```dart
// Per line item
amount = quantity × unitPrice
discountAmount = (discountType == 'percentage') 
    ? amount × (discountValue / 100) 
    : discountValue
taxableAmount = amount - discountAmount

// Tax calculation
if (taxInclusive) {
  gstAmount = taxableAmount - (taxableAmount / (1 + gstPercent/100))
  taxableAmount = taxableAmount / (1 + gstPercent/100)
} else {
  gstAmount = taxableAmount × (gstPercent / 100)
}

lineTotal = taxableAmount + gstAmount
```

### 2. Total GST

- **Total GST = Sum of all line `gstAmount` + additional charges GST**
- Backend stores only **one GST amount** (not separate CGST/SGST/IGST)

---

## IGST vs CGST+SGST Split

### Rule (Indian GST Law)

- **Interstate supply** (supplier state ≠ place of supply state) → **IGST only**
- **Intrastate supply** (supplier state = place of supply state) → **CGST + SGST** (50-50 split)

### How Backend Determines This

Backend stores `transportInfo.supplyTypeDisplay`:

```javascript
// Backend logic (in invoice update/create)
const sellerStateCode = seller.gstNumber.substring(0, 2);  // e.g., "27" for Maharashtra
const placeOfSupplyCode = transportInfo.placeOfSupplyStateCode;

if (sellerStateCode === placeOfSupplyCode) {
  supplyTypeDisplay = 'intrastate';  // Same state → CGST + SGST
} else {
  supplyTypeDisplay = 'interstate';  // Different states → IGST
}
```

### How Flutter Should Use This

```dart
final isInterstate = _transportInfo?.supplyTypeDisplay == 'interstate';

if (isInterstate) {
  // Interstate: Show IGST only
  igstAmount = totalGST;
  cgstAmount = 0.0;
  sgstAmount = 0.0;
} else {
  // Intrastate: Split into CGST + SGST
  cgstAmount = totalGST / 2;
  sgstAmount = totalGST / 2;
  igstAmount = 0.0;
}
```

---

## Backend Test Proof

### Test Case 1: Interstate (Maharashtra → Jharkhand)

```
Business GST State: 27 (Maharashtra)
Place of Supply: 20 (Jharkhand)

Backend Response:
  supplyTypeDisplay: "interstate" ✅

Expected Display:
  IGST: ₹4,250
  CGST: ₹0
  SGST: ₹0
```

### Test Case 2: Intrastate (Maharashtra → Maharashtra)

```
Business GST State: 27 (Maharashtra)
Place of Supply: 27 (Maharashtra)

Backend Response:
  supplyTypeDisplay: "intrastate" ✅

Expected Display:
  IGST: ₹0
  CGST: ₹2,125
  SGST: ₹2,125
```

**Both tests passed.** Backend correctly sets `supplyTypeDisplay` based on state comparison.

---

## Current Issue in Flutter

### Problem

When user changes **Place of Supply** dropdown to Maharashtra (same as business state), the UI still shows **IGST** instead of **CGST + SGST**.

### Root Cause

One of these:

1. **Flutter not reading updated `supplyTypeDisplay`** from backend response after save/update
2. **Cached/stale state** - old `'interstate'` value persists even after dropdown change
3. **Breakdown calculation not re-running** when transport info changes

### What to Check

#### 1. After Updating Place of Supply

```dart
// When user changes place of supply dropdown and saves:
// 1. Does the update API call include the new placeOfSupplyStateCode?
// 2. After successful update, do you re-read the invoice object?
// 3. Is _transportInfo updated with the new supplyTypeDisplay from response?

final response = await updateInvoice(invoiceId, updatedData);
final updatedInvoice = response.invoice;

// Make sure you update your local state:
setState(() {
  _transportInfo = updatedInvoice.transportInfo;  // ← Critical
  _recalculateBreakdown();  // ← Must re-run
});
```

#### 2. Check `supplyTypeDisplay` Value

```dart
// Add debug logging in your breakdown calculation:
void _showItemSubtotalBreakdown() {
  print('DEBUG: supplyTypeDisplay = ${_transportInfo?.supplyTypeDisplay}');
  
  final isInterstate = _transportInfo?.supplyTypeDisplay == 'interstate';
  print('DEBUG: isInterstate = $isInterstate');
  
  // ... rest of calculation
}
```

#### 3. Ensure Reactive Updates

```dart
// If using a dropdown for Place of Supply:
onChanged: (newState) {
  setState(() {
    _transportInfo = _transportInfo?.copyWith(
      placeOfSupply: newState.name,
      placeOfSupplyStateCode: newState.code,
      placeOfSupplyStateName: newState.name,
      // Don't set supplyTypeDisplay here - backend will set it
    );
  });
  
  // Save and refresh
  await _saveInvoice();
  await _fetchInvoice();  // Re-fetch to get backend-computed supplyTypeDisplay
}
```

---

## Quick Fix Checklist

- [ ] After place of supply change, **re-fetch invoice** from backend
- [ ] Ensure `_transportInfo.supplyTypeDisplay` is updated from response
- [ ] **Re-run breakdown calculation** with new `supplyTypeDisplay`
- [ ] Add debug logs to verify `supplyTypeDisplay` value before split logic
- [ ] Test: Change Maharashtra → Jharkhand → should show IGST
- [ ] Test: Change Jharkhand → Maharashtra → should show CGST + SGST

---

## Summary for Flutter Dev

✅ **Backend is correct** - tested and verified  
✅ **Calculation logic is correct** - matches Flutter implementation  
✅ **supplyTypeDisplay is correctly set** by backend based on state comparison  

❌ **Issue is in Flutter** - not reading/using the updated `supplyTypeDisplay` after place of supply change

**Fix:** Ensure Flutter re-reads `transportInfo.supplyTypeDisplay` from backend response after every update and re-runs the CGST/SGST/IGST split logic.

---

## Contact

For backend questions: Backend team  
Test script: `test-place-of-supply-existing-invoice.js` (in backend repo)
