# Test Instructions - Backend v1.1.0

**Date:** February 13, 2026  
**Backend Version:** 1.1.0  
**Test Script:** `test-complete-flow-v1.1.0.js`

---

## 🎯 What This Test Covers

This comprehensive test script validates **ALL** features of Backend v1.1.0, including:

### ✅ New Features (v1.1.0)
- **Party:** Nested address structure with numeric pincode validation
- **Invoice:** `shippingName` and `shippingGstin` fields
- **Quotation:** `shippingName` and `shippingGstin` fields
- **Delivery Challan:** `shippingName` and `shippingGstin` fields
- **Sales Debit Note:** `referenceInvoiceId`, `referenceInvoiceNumber`, `reason` fields
- **Sales Debit Note:** `shippingName` and `shippingGstin` fields
- **Query:** Filter debit notes by `referenceInvoiceId`
- **Backward Compatibility:** Documents without new fields still work

### ✅ Complete Flow
1. User registration & login
2. Business creation (complete profile)
3. Party creation (nested addresses)
4. Product creation
5. Invoice creation (with shipping consignee)
6. Quotation creation (with shipping consignee)
7. Delivery Challan creation (with shipping consignee)
8. Sales Debit Note creation (with reference invoice & reason)
9. Query debit notes by invoice
10. List all documents
11. Backward compatibility test

---

## 🚀 How to Run

### Prerequisites
```bash
# Install axios if not already installed
npm install axios
```

### Run the Test
```bash
# From project root
node test-complete-flow-v1.1.0.js
```

### Expected Output
The script will:
1. Create a new user with timestamp
2. Create all document types
3. Generate PDFs for all documents
4. Query and list documents
5. Test backward compatibility
6. Print summary of all created resources

**Total Time:** ~30-60 seconds

---

## 📊 Test Scenarios

### Scenario 1: Party with Nested Address
```javascript
{
  billingAddress: {
    street: "...",
    city: "...",
    state: "...",
    pincode: "400001",  // ✅ Numeric validation
    country: "India"
  },
  shippingAddress: {
    street: "...",
    city: "...",
    state: "...",
    pincode: "410210",  // ✅ Numeric validation
    country: "India"
  },
  sameAsBilling: false
}
```

**Validates:**
- Nested address structure
- Numeric-only pincode
- Separate shipping address

---

### Scenario 2: Invoice with Shipping Consignee
```javascript
{
  buyerName: "Test Buyer Corp",
  buyerGstin: "27XYZAB1234C1Z9",
  buyerAddress: "101 Buyer Street, Mumbai...",
  
  // ✅ NEW FIELDS (v1.1.0)
  shippingName: "XYZ Logistics Warehouse Pvt Ltd",
  shippingGstin: "29XYZLOG1234D1Z8",
  shippingAddress: "Warehouse 3, Navi Mumbai..."
}
```

**Validates:**
- Third-party consignee support
- Separate shipping company name
- Separate shipping GSTIN

---

### Scenario 3: Sales Debit Note with Reference
```javascript
{
  invoiceNumber: "SDN-001",
  
  // ✅ NEW FIELDS (v1.1.0)
  referenceInvoiceId: "uuid-of-original-invoice",
  referenceInvoiceNumber: "INV-001",
  reason: "Additional charges for express delivery...",
  shippingName: "GHI Receiving Center Ltd",
  shippingGstin: "27GHIREC1234G1Z5"
}
```

**Validates:**
- Link to original invoice
- Reason for debit note
- Shipping consignee fields

---

### Scenario 4: Query Debit Notes by Invoice
```http
GET /business/{businessId}/sales-debit-notes?referenceInvoiceId={invoiceId}
```

**Validates:**
- Query filter working
- Returns only related debit notes
- Correct data structure

---

### Scenario 5: Backward Compatibility
```javascript
// Invoice without new fields - should still work
{
  invoiceNumber: "INV-002",
  buyerName: "Test Buyer",
  // No shippingName, no shippingGstin
  items: [...]
}

// Debit Note without new fields - should still work
{
  invoiceNumber: "SDN-002",
  buyerName: "Test Buyer",
  // No referenceInvoiceId, no reason
  items: [...]
}
```

**Validates:**
- Old API requests still work
- New fields are truly optional
- No breaking changes

---

## ✅ Success Criteria

The test is successful if:

1. ✅ All API calls return 2xx status codes
2. ✅ All documents are created successfully
3. ✅ All PDFs are generated successfully
4. ✅ New fields are stored and retrieved correctly
5. ✅ Query by referenceInvoiceId works
6. ✅ Backward compatibility maintained
7. ✅ No errors in console output

---

## 📝 Sample Output

```
[======================================================================]
[SETUP]
[======================================================================]
Starting comprehensive test flow for Backend v1.1.0
Base URL: https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev

[======================================================================]
[STEP 1]
[======================================================================]
User Registration & Login
✅ Registered new user: uuid-123
✅ Logged in successfully. Token acquired.

[======================================================================]
[STEP 2]
[======================================================================]
Creating Business with Complete Profile
✅ Business created: business-uuid-456

[======================================================================]
[STEP 3]
[======================================================================]
Creating Party with Nested Address Structure (v1.1.0)
✅ Party created: party-uuid-789
Party billing address: { street: '...', city: '...', pincode: '400001' }
Party shipping address: { street: '...', city: '...', pincode: '410210' }

[======================================================================]
[STEP 4]
[======================================================================]
Creating Product
✅ Product created: product-uuid-012

[======================================================================]
[STEP 5]
[======================================================================]
Creating Invoice with Shipping Consignee Fields (v1.1.0)
✅ Invoice created: invoice-uuid-345
✅ Shipping consignee name: XYZ Logistics Warehouse Pvt Ltd
✅ Shipping consignee GSTIN: 29XYZLOG1234D1Z8
✅ Invoice PDF generated: https://...

[======================================================================]
[STEP 8]
[======================================================================]
Creating Sales Debit Note with Reference Invoice & Reason (v1.1.0)
✅ Sales Debit Note created: sdn-uuid-678
✅ Reference Invoice ID: invoice-uuid-345
✅ Reference Invoice Number: INV-1234567890-001
✅ Reason: Additional charges for express delivery...
✅ Shipping consignee name: GHI Receiving Center Ltd
✅ Shipping consignee GSTIN: 27GHIREC1234G1Z5
✅ Sales Debit Note PDF generated: https://...

[======================================================================]
[STEP 9]
[======================================================================]
Querying Debit Notes by Reference Invoice ID (v1.1.0)
✅ Found 1 debit note(s) for invoice invoice-uuid-345

[======================================================================]
[TEST SUMMARY]
[======================================================================]
All Tests Completed Successfully! ✅

📊 Created Resources:
   Business ID: business-uuid-456
   Party ID: party-uuid-789
   Product ID: product-uuid-012
   Invoice ID: invoice-uuid-345
   Quotation ID: quotation-uuid-901
   Delivery Challan ID: challan-uuid-234
   Sales Debit Note ID: sdn-uuid-678

✅ Verified Features (v1.1.0):
   ✓ Party with nested address structure
   ✓ Numeric pincode validation
   ✓ Invoice with shippingName & shippingGstin
   ✓ Quotation with shippingName & shippingGstin
   ✓ Delivery Challan with shippingName & shippingGstin
   ✓ Sales Debit Note with referenceInvoiceId
   ✓ Sales Debit Note with referenceInvoiceNumber
   ✓ Sales Debit Note with reason field
   ✓ Sales Debit Note with shippingName & shippingGstin
   ✓ Query debit notes by referenceInvoiceId
   ✓ Backward compatibility (documents without new fields)

🎉 Backend v1.1.0 - All Features Working Perfectly!

✅ Test script completed successfully
```

---

## 🐛 Troubleshooting

### Error: "Pincode must be exactly 6 digits"
**Cause:** Pincode contains non-numeric characters  
**Solution:** Ensure pincode is numeric-only (e.g., "400001" not "40000A")

### Error: "Shipping address is required when not same as billing"
**Cause:** `sameAsBilling = false` but no shipping address provided  
**Solution:** Provide shipping address or set `sameAsBilling = true`

### Error: "Could not resolve salesDebitNoteId"
**Cause:** Backend response structure mismatch  
**Solution:** Check backend model - should return `salesDebitNoteId` or `id`

### Error: "Invalid nextToken"
**Cause:** Pagination token corrupted  
**Solution:** Don't manually modify nextToken, use as-is from API

### Error: 401 Unauthorized
**Cause:** Token expired or invalid  
**Solution:** Re-run test (creates new user and token)

---

## 📊 Performance Metrics

**Expected Performance:**
- User Registration: < 1 second
- Business Creation: < 1 second
- Party Creation: < 1 second
- Product Creation: < 1 second
- Invoice Creation: < 2 seconds
- PDF Generation: 3-5 seconds
- Query Operations: < 1 second

**Total Test Duration:** 30-60 seconds

---

## 🔍 Verification Checklist

After running the test, verify:

- [ ] All 11 steps completed without errors
- [ ] Test summary shows all resources created
- [ ] All 11 features marked as verified (✓)
- [ ] PDFs generated successfully
- [ ] Query returned correct results
- [ ] Backward compatibility test passed
- [ ] No 4xx or 5xx errors in output

---

## 📧 Reporting Issues

If test fails, provide:

1. **Full console output** (copy entire terminal output)
2. **Step where it failed** (e.g., "STEP 5: Creating Invoice")
3. **Error message** (HTTP status + error details)
4. **Environment**:
   - Node version: `node --version`
   - Backend URL: Check BASE_URL in script
   - Timestamp: When test was run

---

## 🎯 Next Steps

After successful test:

1. ✅ Backend is verified and working
2. ✅ Share documentation with Flutter team
3. ✅ Deploy to production (if not already)
4. ✅ Monitor logs for any issues
5. ✅ Flutter team can start implementation

---

**Test Script Version:** 1.0  
**Backend Version:** 1.1.0  
**Last Updated:** February 13, 2026  
**Status:** ✅ Ready to Run
