# Backend Updates Required for Frontend Synchronization

**Date:** February 13, 2026  
**Priority:** High  
**Estimated Total Effort:** 2-3 days

---

## 🚨 CRITICAL UPDATES REQUIRED

### 1. **Sales Debit Note - Add Missing Fields**

**Priority:** 🔴 Critical  
**Effort:** 1-2 hours  
**Impact:** Frontend cannot link debit notes to original invoices or provide reason

#### Current Schema
```javascript
// src/controllers/salesDebitNoteController.js
const baseSalesDebitNoteSchema = z.object({
    id: z.string().optional().nullable(),
    salesDebitNoteId: z.string().optional().nullable(),
    invoiceNumber: z.string().min(1, 'Sales Debit Note Number is required'),
    invoiceDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    status: salesDebitNoteStatusEnum,
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().min(1, 'buyerName is required'),
    buyerGstin: z.string().optional().default(''),
    buyerAddress: z.preprocess(...),
    shippingAddress: z.preprocess(...),
    items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
    // ... rest of fields
});
```

#### Required Updates
```javascript
// src/controllers/salesDebitNoteController.js

const baseSalesDebitNoteSchema = z.object({
    id: z.string().optional().nullable(),
    salesDebitNoteId: z.string().optional().nullable(),
    invoiceNumber: z.string().min(1, 'Sales Debit Note Number is required'),
    invoiceDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    status: salesDebitNoteStatusEnum,
    
    // ✅ ADD THESE FIELDS
    referenceInvoiceId: z.string().nullable().optional(),
    referenceInvoiceNumber: z.string().nullable().optional(),
    reason: z.string().optional().default(''),
    
    seller: sellerSchema,
    buyerId: z.string().nullable().optional(),
    buyerName: z.string().min(1, 'buyerName is required'),
    buyerGstin: z.string().optional().default(''),
    buyerAddress: z.preprocess(
        (val) => (val == null ? '' : val),
        z.string().optional().default('')
    ),
    shippingAddress: z.preprocess(
        (val) => (val == null ? '' : val),
        z.string().optional().default('')
    ),
    items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
    additionalCharges: z.array(additionalChargeSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']),
    globalDiscountValue: z.number().nonnegative(),
    tcsInfo: tcsInfoSchema.nullable().optional(),
    transportInfo: transportInfoSchema.nullable().optional(),
    bankDetails: bankDetailsSnapshotSchema.nullable().optional(),
    otherDetails: otherDetailsSchema.nullable().optional(),
    customFields: z.array(customFieldSchema).optional().default([]),
    termsAndConditions: z.array(z.string()).optional().default([]),
    notes: z.string().optional().default(''),
    signatureUrl: z.string().nullable().optional(),
    stampUrl: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional()
});
```

#### Update All Status Schemas
```javascript
const savedNoteSchema = baseSalesDebitNoteSchema.extend({
    status: z.literal('saved')
});

const draftNoteSchema = baseSalesDebitNoteSchema.extend({
    status: z.literal('draft'),
    buyerName: z.string().optional().default(''),
    items: z.array(lineItemSchema).optional().default([]),
    globalDiscountType: z.enum(['percentage', 'flat']).optional().default('percentage'),
    globalDiscountValue: z.number().nonnegative().optional().default(0)
});

const cancelledNoteSchema = baseSalesDebitNoteSchema.extend({
    status: z.literal('cancelled')
});
```

#### Files to Update
- `src/controllers/salesDebitNoteController.js` - Add fields to schema
- `src/models/salesDebitNoteModel.js` - No changes needed (uses passthrough)

#### Testing
```bash
# Test creating debit note with new fields
curl -X POST https://your-api.com/business/{businessId}/sales-debit-notes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceNumber": "SDN-001",
    "invoiceDate": "2024-01-15",
    "status": "saved",
    "referenceInvoiceId": "original-invoice-uuid",
    "referenceInvoiceNumber": "INV-100",
    "reason": "Additional charges for express delivery",
    "seller": {...},
    "buyerName": "Test Buyer",
    "items": [...]
  }'
```

---

### 2. **Party Model - Stricter Pincode Validation**

**Priority:** 🟡 Medium  
**Effort:** 15 minutes  
**Impact:** Frontend expects numeric-only pincodes, backend allows any 6 characters

#### Current Validation
```javascript
// src/controllers/partyController.js
const addressSchema = z.object({
    street: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string()
        .min(6, "Pincode must be at least 6 digits")
        .max(6, "Pincode must be at most 6 digits"),  // ❌ Allows non-numeric
    country: z.string().default('India'),
    gst: z.string().optional(),
    companyName: z.string().optional()
}).strict();
```

#### Required Update
```javascript
// src/controllers/partyController.js
const addressSchema = z.object({
    street: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string()
        .regex(/^[0-9]{6}$/, "Pincode must be exactly 6 digits"),  // ✅ Numeric only
    country: z.string().default('India'),
    gst: z.string().optional(),
    companyName: z.string().optional()
}).strict();
```

#### Files to Update
- `src/controllers/partyController.js` - Update addressSchema

#### Testing
```bash
# Should succeed
curl -X POST https://your-api.com/parties \
  -H "Authorization: Bearer <token>" \
  -d '{"billingAddress": {"pincode": "400001", ...}}'

# Should fail with validation error
curl -X POST https://your-api.com/parties \
  -H "Authorization: Bearer <token>" \
  -d '{"billingAddress": {"pincode": "40000A", ...}}'
```

---

## 📋 OPTIONAL ENHANCEMENTS

### 3. **Add Shipping Name/GSTIN Validation (Optional)**

**Priority:** 🟢 Low  
**Effort:** 30 minutes  
**Impact:** Better validation for third-party consignee scenarios

#### Current Schema
```javascript
// Invoice, Quotation, DeliveryChallan, SalesDebitNote controllers
shippingName: z.string().optional().default(''),
shippingGstin: z.string().optional().default(''),
```

#### Suggested Enhancement
```javascript
// Add validation when shippingName is provided
const baseInvoiceSchema = z.object({
    // ... existing fields ...
    shippingName: z.string().optional().default(''),
    shippingGstin: z.string()
        .optional()
        .default('')
        .refine(
            (val) => {
                if (!val || val === '') return true;
                return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(val);
            },
            { message: 'Invalid shipping GSTIN format' }
        ),
    // ... rest of fields ...
});
```

#### Files to Update
- `src/controllers/invoiceController.js`
- `src/controllers/quotationController.js`
- `src/controllers/deliveryChallanController.js`
- `src/controllers/salesDebitNoteController.js`

---

### 4. **Add API Endpoint for Debit Note from Invoice**

**Priority:** 🟢 Low  
**Effort:** 2-3 hours  
**Impact:** Simplifies frontend workflow for creating debit notes

#### New Endpoint
```javascript
// src/controllers/salesDebitNoteController.js

async createFromInvoice(req, res) {
    try {
        const userId = req.user.userId;
        const { businessId, invoiceId } = req.params;
        
        // Get original invoice
        const Invoice = require('../models/invoiceModel');
        const originalInvoice = await Invoice.getById(userId, businessId, invoiceId);
        
        if (!originalInvoice) {
            return res.status(404).json({ message: 'Original invoice not found' });
        }
        
        // Validate request body (should have reason and items)
        const validation = createSalesDebitNoteSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation failed',
                error: validation.error.errors[0].message,
                details: validation.error.errors,
                code: 'VALIDATION_FAILED'
            });
        }
        
        // Create debit note with reference to original invoice
        const debitNoteData = {
            ...validation.data,
            referenceInvoiceId: originalInvoice.invoiceId,
            referenceInvoiceNumber: originalInvoice.invoiceNumber,
            // Copy seller and buyer info from original invoice
            seller: originalInvoice.seller,
            buyerId: originalInvoice.buyerId,
            buyerName: originalInvoice.buyerName,
            buyerGstin: originalInvoice.buyerGstin,
            buyerAddress: originalInvoice.buyerAddress,
            shippingAddress: originalInvoice.shippingAddress,
            shippingName: originalInvoice.shippingName,
            shippingGstin: originalInvoice.shippingGstin,
        };
        
        const note = await SalesDebitNote.create(userId, businessId, debitNoteData);
        
        return res.status(201).json({ salesDebitNote: note });
    } catch (error) {
        console.error('Create Sales Debit Note from Invoice Error:', error);
        return res.status(500).json({
            message: 'Internal Server Error',
            error: error.message
        });
    }
}
```

#### Add Route
```javascript
// src/routes/api.js
router.post(
    '/business/:businessId/invoices/:invoiceId/debit-note',
    auth,
    requireBusiness,
    salesDebitNoteController.createFromInvoice
);
```

#### Usage
```http
POST /business/{businessId}/invoices/{invoiceId}/debit-note
Authorization: Bearer <token>

{
  "invoiceNumber": "SDN-001",
  "invoiceDate": "2024-01-15",
  "status": "saved",
  "reason": "Additional charges for express delivery",
  "items": [
    {
      "itemId": "item-1",
      "itemName": "Express Delivery Charge",
      "quantity": 1,
      "unitPrice": 500,
      "gstPercent": 18,
      ...
    }
  ]
}
```

---

### 5. **Add Query Parameter for Debit Notes by Reference Invoice**

**Priority:** 🟢 Low  
**Effort:** 30 minutes  
**Impact:** Allows frontend to find all debit notes for a specific invoice

#### Update List Method
```javascript
// src/controllers/salesDebitNoteController.js

async listSalesDebitNotes(req, res) {
    try {
        const userId = req.user.userId;
        const { businessId } = req.params;

        if (!businessId) {
            return res
                .status(400)
                .json({ message: 'Business ID is required in URL' });
        }

        const { 
            status, 
            fromDate, 
            toDate, 
            search, 
            limit, 
            nextToken,
            referenceInvoiceId  // ✅ ADD THIS
        } = req.query;
        
        const parsedLimit = Math.min(
            Math.max(parseInt(limit, 10) || 100, 1),
            100
        );
        let exclusiveStartKey = null;
        if (nextToken) {
            try {
                exclusiveStartKey = JSON.parse(
                    Buffer.from(nextToken, 'base64url').toString('utf8')
                );
            } catch (_) {
                return res
                    .status(400)
                    .json({ message: 'Invalid nextToken' });
            }
        }

        const { items, lastEvaluatedKey } =
            await SalesDebitNote.listByBusiness(userId, businessId, {
                limit: parsedLimit,
                exclusiveStartKey
            });

        let notes = items;

        if (status) {
            notes = notes.filter((n) => n.status === status);
        }
        
        // ✅ ADD THIS FILTER
        if (referenceInvoiceId) {
            notes = notes.filter((n) => n.referenceInvoiceId === referenceInvoiceId);
        }
        
        if (fromDate) {
            const from = new Date(fromDate);
            notes = notes.filter(
                (n) => n.invoiceDate && new Date(n.invoiceDate) >= from
            );
        }
        if (toDate) {
            const to = new Date(toDate);
            notes = notes.filter(
                (n) => n.invoiceDate && new Date(n.invoiceDate) <= to
            );
        }
        if (search) {
            const s = String(search).toLowerCase();
            notes = notes.filter((n) => {
                const buyerName = (n.buyerName || '').toLowerCase();
                const number = (n.invoiceNumber || '').toLowerCase();
                return (
                    buyerName.includes(s) ||
                    number.includes(s)
                );
            });
        }

        const nextTokenOut = lastEvaluatedKey
            ? Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString(
                  'base64url'
              )
            : null;

        return res.json({
            salesDebitNotes: notes,
            count: notes.length,
            ...(nextTokenOut && { nextToken: nextTokenOut })
        });
    } catch (error) {
        console.error('List Sales Debit Notes Error:', error);
        return res.status(500).json({
            message: 'Internal Server Error',
            error: error.message
        });
    }
}
```

#### Usage
```http
GET /business/{businessId}/sales-debit-notes?referenceInvoiceId={invoiceId}
Authorization: Bearer <token>
```

---

### 6. **Add Validation for Delivery Challan Status Transitions**

**Priority:** 🟢 Low  
**Effort:** 1 hour  
**Impact:** Prevents invalid status changes

#### Current Implementation
```javascript
// src/controllers/deliveryChallanController.js
// Currently allows any status update
```

#### Suggested Enhancement
```javascript
// src/controllers/deliveryChallanController.js

async updateDeliveryChallan(req, res) {
    try {
        const userId = req.user.userId;
        const { businessId, challanId } = req.params;

        const validation = updateDeliveryChallanSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation failed',
                error: validation.error.errors[0].message,
                details: validation.error.errors,
                code: 'VALIDATION_FAILED'
            });
        }

        const existing = await DeliveryChallan.getById(
            userId,
            businessId,
            challanId
        );
        if (!existing) {
            return res
                .status(404)
                .json({ message: 'Delivery Challan not found' });
        }

        // ✅ ADD STATUS TRANSITION VALIDATION
        if (validation.data.status) {
            const currentStatus = existing.status;
            const newStatus = validation.data.status;
            
            // Define valid transitions
            const validTransitions = {
                'pending': ['delivered', 'cancelled'],
                'delivered': [],  // Cannot change once delivered
                'cancelled': []   // Cannot change once cancelled
            };
            
            if (!validTransitions[currentStatus]?.includes(newStatus)) {
                return res.status(400).json({
                    message: `Invalid status transition from ${currentStatus} to ${newStatus}`,
                    code: 'INVALID_STATUS_TRANSITION'
                });
            }
        }

        const challan = await DeliveryChallan.update(
            userId,
            businessId,
            challanId,
            validation.data
        );
        return res.json({ deliveryChallan: challan });
    } catch (error) {
        console.error('Update Delivery Challan Error:', error);
        return res.status(500).json({
            message: 'Internal Server Error',
            error: error.message
        });
    }
}
```

---

### 7. **Add Invoice Status Transition Validation**

**Priority:** 🟢 Low  
**Effort:** 1 hour  
**Impact:** Prevents invalid invoice status changes

#### Suggested Enhancement
```javascript
// src/controllers/invoiceController.js

async updateInvoice(req, res) {
    try {
        const userId = req.user.userId;
        const { businessId, invoiceId } = req.params;

        const validation = updateInvoiceSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation failed',
                error: validation.error.errors[0].message,
                details: validation.error.errors,
                code: 'VALIDATION_FAILED'
            });
        }

        const existing = await Invoice.getById(userId, businessId, invoiceId);
        if (!existing) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // ✅ ADD STATUS TRANSITION VALIDATION
        if (validation.data.status) {
            const currentStatus = existing.status;
            const newStatus = validation.data.status;
            
            // Define valid transitions
            const validTransitions = {
                'draft': ['saved', 'cancelled'],
                'saved': ['cancelled'],  // Can only cancel saved invoices
                'cancelled': []          // Cannot change once cancelled
            };
            
            if (!validTransitions[currentStatus]?.includes(newStatus)) {
                return res.status(400).json({
                    message: `Invalid status transition from ${currentStatus} to ${newStatus}`,
                    code: 'INVALID_STATUS_TRANSITION'
                });
            }
        }

        const invoice = await Invoice.update(userId, businessId, invoiceId, validation.data);
        return res.json({ invoice });
    } catch (error) {
        console.error('Update Invoice Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
```

---

### 8. **Add Bulk Status Update for Documents**

**Priority:** 🟢 Low  
**Effort:** 2-3 hours  
**Impact:** Allows frontend to mark multiple challans as delivered at once

#### New Endpoint
```javascript
// src/controllers/deliveryChallanController.js

async bulkUpdateStatus(req, res) {
    try {
        const userId = req.user.userId;
        const { businessId } = req.params;
        const { challanIds, status } = req.body;

        if (!Array.isArray(challanIds) || challanIds.length === 0) {
            return res.status(400).json({ 
                message: 'challanIds must be a non-empty array' 
            });
        }

        if (!['pending', 'delivered', 'cancelled'].includes(status)) {
            return res.status(400).json({ 
                message: 'Invalid status value' 
            });
        }

        const results = [];
        const errors = [];

        for (const challanId of challanIds) {
            try {
                const existing = await DeliveryChallan.getById(
                    userId,
                    businessId,
                    challanId
                );
                
                if (!existing) {
                    errors.push({ challanId, error: 'Not found' });
                    continue;
                }

                const updated = await DeliveryChallan.update(
                    userId,
                    businessId,
                    challanId,
                    { status }
                );
                
                results.push(updated);
            } catch (error) {
                errors.push({ challanId, error: error.message });
            }
        }

        return res.json({
            updated: results.length,
            failed: errors.length,
            results,
            errors
        });
    } catch (error) {
        console.error('Bulk Update Delivery Challans Error:', error);
        return res.status(500).json({
            message: 'Internal Server Error',
            error: error.message
        });
    }
}
```

#### Add Route
```javascript
// src/routes/api.js
router.put(
    '/business/:businessId/delivery-challans/bulk-status',
    auth,
    requireBusiness,
    deliveryChallanController.bulkUpdateStatus
);
```

---

## 📊 SUMMARY TABLE

| Update | Priority | Effort | Breaking Change | Files Affected |
|--------|----------|--------|-----------------|----------------|
| Sales Debit Note fields | 🔴 Critical | 1-2 hours | No | `salesDebitNoteController.js` |
| Pincode validation | 🟡 Medium | 15 min | No | `partyController.js` |
| Shipping GSTIN validation | 🟢 Low | 30 min | No | All document controllers |
| Create debit note from invoice | 🟢 Low | 2-3 hours | No | `salesDebitNoteController.js`, `api.js` |
| Query debit notes by invoice | 🟢 Low | 30 min | No | `salesDebitNoteController.js` |
| Challan status transitions | 🟢 Low | 1 hour | No | `deliveryChallanController.js` |
| Invoice status transitions | 🟢 Low | 1 hour | No | `invoiceController.js` |
| Bulk status update | 🟢 Low | 2-3 hours | No | `deliveryChallanController.js`, `api.js` |

**Total Estimated Effort:** 8-12 hours (1-2 days)

---

## 🔧 IMPLEMENTATION PRIORITY

### Phase 1: Critical (Must Do Before Frontend Deployment)
1. ✅ Sales Debit Note - Add `referenceInvoiceId`, `referenceInvoiceNumber`, `reason` fields
2. ✅ Pincode validation - Add numeric-only regex

**Effort:** 2-3 hours  
**Deadline:** Before frontend team starts testing

### Phase 2: High Priority (Should Do Soon)
3. Shipping GSTIN validation
4. Query debit notes by reference invoice

**Effort:** 1 hour  
**Timeline:** Within 1 week

### Phase 3: Nice to Have (Future Enhancements)
5. Create debit note from invoice endpoint
6. Status transition validation
7. Bulk status update

**Effort:** 4-7 hours  
**Timeline:** Next sprint

---

## 🧪 TESTING REQUIREMENTS

### After Phase 1 Updates

**Test Sales Debit Note:**
```bash
# Create with new fields
curl -X POST $BASE_URL/business/$BUSINESS_ID/sales-debit-notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceNumber": "SDN-001",
    "invoiceDate": "2024-01-15",
    "status": "saved",
    "referenceInvoiceId": "uuid-of-original-invoice",
    "referenceInvoiceNumber": "INV-100",
    "reason": "Additional charges for express delivery",
    "seller": {
      "firmName": "Test Firm",
      "gstNumber": "27ABCDE1234F1Z5"
    },
    "buyerName": "Test Buyer",
    "items": [{
      "itemId": "item-1",
      "itemName": "Express Delivery",
      "quantity": 1,
      "unitPrice": 500,
      "discountType": "flat",
      "discountValue": 0,
      "discountPercent": 0,
      "gstPercent": 18,
      "taxInclusive": false,
      "cessType": "Percentage",
      "cessValue": 0
    }],
    "globalDiscountType": "flat",
    "globalDiscountValue": 0
  }'

# Verify fields are stored
curl -X GET $BASE_URL/business/$BUSINESS_ID/sales-debit-notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Test Pincode Validation:**
```bash
# Should succeed
curl -X POST $BASE_URL/parties \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "companyName": "Test Party",
    "mobile": "9876543210",
    "billingAddress": {
      "street": "123 Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "country": "India"
    },
    "sameAsBilling": true
  }'

# Should fail
curl -X POST $BASE_URL/parties \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "companyName": "Test Party",
    "mobile": "9876543210",
    "billingAddress": {
      "street": "123 Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "40000A",
      "country": "India"
    },
    "sameAsBilling": true
  }'
```

---

## 📝 IMPLEMENTATION CHECKLIST

### Sales Debit Note Updates
- [ ] Update `baseSalesDebitNoteSchema` in `salesDebitNoteController.js`
- [ ] Add `referenceInvoiceId` field (string, nullable, optional)
- [ ] Add `referenceInvoiceNumber` field (string, nullable, optional)
- [ ] Add `reason` field (string, optional, default empty)
- [ ] Update `savedNoteSchema` to include new fields
- [ ] Update `draftNoteSchema` to include new fields
- [ ] Update `cancelledNoteSchema` to include new fields
- [ ] Test create with new fields
- [ ] Test update with new fields
- [ ] Test list and verify new fields are returned
- [ ] Update API documentation

### Pincode Validation Updates
- [ ] Update `addressSchema` in `partyController.js`
- [ ] Change pincode validation to regex `/^[0-9]{6}$/`
- [ ] Test valid numeric pincode (should pass)
- [ ] Test alphanumeric pincode (should fail)
- [ ] Test 5-digit pincode (should fail)
- [ ] Test 7-digit pincode (should fail)
- [ ] Update API documentation

### Documentation Updates
- [ ] Update `API_REFERENCE.md` with new fields
- [ ] Update `DELIVERY_CHALLAN_API_SPEC.md` if needed
- [ ] Add examples showing new fields
- [ ] Document validation rules
- [ ] Share updated docs with frontend team

---

## 🚀 DEPLOYMENT NOTES

1. **Backward Compatibility:**
   - All new fields are optional
   - Existing documents will continue to work
   - No migration required for existing data

2. **Database Changes:**
   - No schema changes needed (DynamoDB is schemaless)
   - New fields will be stored automatically

3. **API Versioning:**
   - No version bump needed (backward compatible)
   - New fields are additive only

4. **Frontend Coordination:**
   - Deploy backend changes first
   - Wait for confirmation backend is live
   - Then deploy frontend with new field support

---

## 📧 COMMUNICATION

### To Frontend Team:
```
Subject: Backend Updates Complete - Sales Debit Note & Pincode Validation

Hi Team,

Backend updates are now complete and deployed to [environment]:

✅ Sales Debit Note now supports:
   - referenceInvoiceId
   - referenceInvoiceNumber
   - reason

✅ Party pincode validation now requires numeric-only 6 digits

You can now proceed with frontend implementation as per the 
FLUTTER_BACKEND_SYNC_REQUIREMENTS.md document.

API Documentation: [link to updated docs]
Test Environment: [environment URL]

Let me know if you need any clarification.
```

---

## ❓ FAQ

**Q: Will existing sales debit notes break after this update?**  
A: No, all new fields are optional. Existing notes will continue to work.

**Q: Do we need to migrate existing party pincodes?**  
A: Not immediately, but you may want to run a validation script to identify invalid pincodes.

**Q: Can we add more fields to debit notes later?**  
A: Yes, the schema is extensible. Just add to the base schema.

**Q: Should we validate pincode format in frontend too?**  
A: Yes, for better UX. But backend validation is the source of truth.

**Q: What if frontend sends old format without new fields?**  
A: It will work fine - new fields default to null/empty.

---

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Status:** Ready for Implementation
