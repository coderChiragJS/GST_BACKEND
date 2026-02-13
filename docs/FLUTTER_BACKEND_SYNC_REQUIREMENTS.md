# Flutter Frontend - Backend Synchronization Requirements

**Date:** February 13, 2026  
**Backend Version:** 1.1.0  
**Backend API Base URL:** `https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev`  
**Purpose:** Ensure Flutter app matches backend API contracts exactly

**Status:** ✅ Backend Updated - Ready for Frontend Implementation

---

## 📋 QUICK START SUMMARY

### What Changed in Backend (v1.1.0)
✅ **Sales Debit Note:** New fields added (`referenceInvoiceId`, `referenceInvoiceNumber`, `reason`, `shippingName`, `shippingGstin`)  
✅ **Party Validation:** Pincode now numeric-only (regex: `/^[0-9]{6}$/`)  
✅ **All Documents:** Added `shippingName` and `shippingGstin` fields  
✅ **Query Support:** Filter debit notes by `referenceInvoiceId`  

### What You Need to Do in Flutter
1. **Update Party Model** - Use nested `Address` objects (not flat fields)
2. **Add Missing Fields** - Add `shippingName` and `shippingGstin` to all document models
3. **Update Debit Note** - Add new fields for reference invoice and reason
4. **Fix Delivery Challan** - Use `challanNumber` and `challanDate` (not `invoiceNumber`/`invoiceDate`)
5. **Update Validation** - Match backend pincode regex, make GST optional

### Estimated Effort
- **Critical Changes:** 1-2 days (Party model restructure)
- **High Priority:** 1 day (Add missing fields)
- **Total:** 3-5 days

### Testing Environment
- **API Base:** `https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev`
- **Backend Version:** 1.1.0
- **All endpoints ready for testing**

---

## ✅ BACKEND UPDATES COMPLETED

The following backend updates have been completed:
- ✅ Sales Debit Note: Added `referenceInvoiceId`, `referenceInvoiceNumber`, `reason` fields
- ✅ Sales Debit Note: Added `shippingName`, `shippingGstin` fields
- ✅ Party Validation: Updated pincode to numeric-only regex
- ✅ All Documents: Added `shippingName`, `shippingGstin` fields (Invoice, Quotation, Challan, Debit Note)
- ✅ Query Support: Added `referenceInvoiceId` filter for debit notes list

See `BACKEND_UPDATES_CHANGELOG.md` for detailed changes.

---

## 🚨 CRITICAL CHANGES REQUIRED

### 1. **SHIPPING ADDRESS STRUCTURE - MUST FIX IMMEDIATELY**

#### ❌ Current Frontend Implementation (INCORRECT)
```dart
// Party Model - Current (WRONG)
class Party {
  // Flat shipping address fields
  String? shippingGst;
  String? shippingCompanyName;
  String? shippingStreet;
  String? shippingCity;
  String? shippingState;
  String? shippingPincode;
  String? shippingCountry;
}
```

#### ✅ Required Implementation (CORRECT)
```dart
// Address Model - CREATE THIS
class Address {
  final String street;
  final String city;
  final String state;
  final String pincode;
  final String country;
  final String? gst;           // Optional
  final String? companyName;   // Optional

  Address({
    required this.street,
    required this.city,
    required this.state,
    required this.pincode,
    this.country = 'India',
    this.gst,
    this.companyName,
  });

  // JSON serialization
  Map<String, dynamic> toJson() => {
    'street': street,
    'city': city,
    'state': state,
    'pincode': pincode,
    'country': country,
    if (gst != null) 'gst': gst,
    if (companyName != null) 'companyName': companyName,
  };

  factory Address.fromJson(Map<String, dynamic> json) => Address(
    street: json['street'] ?? '',
    city: json['city'] ?? '',
    state: json['state'] ?? '',
    pincode: json['pincode'] ?? '',
    country: json['country'] ?? 'India',
    gst: json['gst'],
    companyName: json['companyName'],
  );

  // Helper to convert to single line string
  String toSingleLineString() {
    final parts = <String>[
      if (companyName?.isNotEmpty ?? false) companyName!,
      street,
      city,
      state,
      pincode,
      country,
    ];
    return parts.join(', ');
  }
}

// Party Model - UPDATED
class Party {
  final String partyId;
  final String companyName;
  final String? gstNumber;      // Optional in backend
  final String mobile;
  final String? email;
  
  // NESTED ADDRESS OBJECTS (not flat fields)
  final Address billingAddress;
  final Address? shippingAddress;  // Can be null
  final bool sameAsBilling;
  
  final int paymentTerms;
  final double openingBalance;
  final String openingBalanceType;
  final String partyType;
  final String gstTreatment;
  final String taxPreference;
  final bool tdsApplicable;
  final bool tcsApplicable;

  Party({
    required this.partyId,
    required this.companyName,
    this.gstNumber,
    required this.mobile,
    this.email,
    required this.billingAddress,
    this.shippingAddress,
    this.sameAsBilling = false,
    this.paymentTerms = 0,
    this.openingBalance = 0.0,
    this.openingBalanceType = 'TO_RECEIVE',
    this.partyType = 'Individual',
    this.gstTreatment = 'Regular',
    this.taxPreference = 'Inclusive',
    this.tdsApplicable = false,
    this.tcsApplicable = false,
  });

  // JSON serialization for API
  Map<String, dynamic> toJson() => {
    'companyName': companyName,
    if (gstNumber != null && gstNumber!.isNotEmpty) 'gstNumber': gstNumber,
    'mobile': mobile,
    if (email != null && email!.isNotEmpty) 'email': email,
    'billingAddress': billingAddress.toJson(),
    'sameAsBilling': sameAsBilling,
    if (shippingAddress != null) 'shippingAddress': shippingAddress!.toJson(),
    'paymentTerms': paymentTerms,
    'openingBalance': openingBalance,
    'openingBalanceType': openingBalanceType,
    'partyType': partyType,
    'gstTreatment': gstTreatment,
    'taxPreference': taxPreference,
    'tdsApplicable': tdsApplicable,
    'tcsApplicable': tcsApplicable,
  };

  factory Party.fromJson(Map<String, dynamic> json) => Party(
    partyId: json['partyId'] ?? '',
    companyName: json['companyName'] ?? '',
    gstNumber: json['gstNumber'],
    mobile: json['mobile'] ?? '',
    email: json['email'],
    billingAddress: Address.fromJson(json['billingAddress'] ?? {}),
    shippingAddress: json['shippingAddress'] != null 
        ? Address.fromJson(json['shippingAddress']) 
        : null,
    sameAsBilling: json['sameAsBilling'] ?? false,
    paymentTerms: json['paymentTerms'] ?? 0,
    openingBalance: (json['openingBalance'] ?? 0).toDouble(),
    openingBalanceType: json['openingBalanceType'] ?? 'TO_RECEIVE',
    partyType: json['partyType'] ?? 'Individual',
    gstTreatment: json['gstTreatment'] ?? 'Regular',
    taxPreference: json['taxPreference'] ?? 'Inclusive',
    tdsApplicable: json['tdsApplicable'] ?? false,
    tcsApplicable: json['tcsApplicable'] ?? false,
  );

  // Helper methods
  String get fullBillingAddress => billingAddress.toSingleLineString();
  
  String get fullShippingAddress {
    if (sameAsBilling || shippingAddress == null) {
      return fullBillingAddress;
    }
    return shippingAddress!.toSingleLineString();
  }
}
```

#### 📝 Party API Endpoints

**Create Party:**
```http
POST /parties
Authorization: Bearer <token>
Content-Type: application/json

{
  "companyName": "ABC Traders",
  "gstNumber": "27ABCDE1234F1Z5",  // Optional
  "mobile": "9876543210",
  "email": "abc@example.com",      // Optional
  "billingAddress": {
    "street": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "country": "India"
  },
  "sameAsBilling": false,
  "shippingAddress": {
    "street": "456 Warehouse Road",
    "city": "Navi Mumbai",
    "state": "Maharashtra",
    "pincode": "400614",
    "country": "India",
    "companyName": "ABC Warehouse"  // Optional
  },
  "paymentTerms": 30,
  "openingBalance": 5000,
  "openingBalanceType": "TO_RECEIVE",
  "partyType": "Company",
  "gstTreatment": "Regular",
  "taxPreference": "Inclusive",
  "tdsApplicable": false,
  "tcsApplicable": false
}
```

**Validation Rules:**
- `companyName`: Required, min 2 characters
- `gstNumber`: **OPTIONAL** (not required), must match GST format if provided
- `mobile`: Required, must match regex `^[6-9]\d{9}$`
- `email`: Optional, must be valid email format if provided
- `billingAddress`: Required, all nested fields (street, city, state, pincode) required
- `pincode`: Must be exactly 6 digits (string format)
- `sameAsBilling`: Boolean, if `false`, `shippingAddress` is **required**
- `shippingAddress`: Required if `sameAsBilling = false`, optional if `true`

---

### 2. **DOCUMENT MODELS - ADD MISSING FIELDS**

#### ❌ Current Implementation (INCOMPLETE)
```dart
class Invoice {
  String buyerAddress;
  String? shippingAddress;
  // Missing: shippingName, shippingGstin
}
```

#### ✅ Required Implementation (COMPLETE)
```dart
class Invoice {
  // ... existing fields ...
  
  // Buyer/Billing Information
  final String? buyerId;
  final String buyerName;
  final String buyerGstin;
  final String buyerAddress;  // Flat string
  
  // Shipping/Consignee Information (separate from buyer)
  final String? shippingName;    // ADD THIS - for separate consignee
  final String? shippingGstin;   // ADD THIS - for separate consignee GST
  final String? shippingAddress; // Flat string, empty if same as billing
  
  // ... rest of fields ...
}

class Quotation {
  // Same fields as Invoice
  final String? buyerId;
  final String buyerName;
  final String buyerGstin;
  final String buyerAddress;
  final String? shippingName;    // ADD THIS
  final String? shippingGstin;   // ADD THIS
  final String? shippingAddress;
  // ... rest of fields ...
}

class DeliveryChallan {
  // Same fields as Invoice
  final String? buyerId;
  final String buyerName;
  final String buyerGstin;
  final String buyerAddress;
  final String? shippingName;    // ADD THIS
  final String? shippingGstin;   // ADD THIS
  final String? shippingAddress;
  // ... rest of fields ...
}

class SalesDebitNote {
  // Same fields as Invoice
  final String? buyerId;
  final String buyerName;
  final String buyerGstin;
  final String buyerAddress;
  final String? shippingName;    // ADD THIS
  final String? shippingGstin;   // ADD THIS
  final String? shippingAddress;
  // ... rest of fields ...
}
```

#### 📝 When to Use Shipping Fields

**Use Case 1: Same Billing and Shipping**
```dart
// When party's sameAsBilling = true OR shipping address same as billing
Invoice(
  buyerName: party.companyName,
  buyerGstin: party.gstNumber ?? '',
  buyerAddress: party.fullBillingAddress,
  shippingName: '',      // Empty
  shippingGstin: '',     // Empty
  shippingAddress: '',   // Empty - backend will use buyerAddress
)
```

**Use Case 2: Different Shipping Address (Same Company)**
```dart
// When party has different shipping address but same company
Invoice(
  buyerName: party.companyName,
  buyerGstin: party.gstNumber ?? '',
  buyerAddress: party.fullBillingAddress,
  shippingName: '',      // Empty - same company
  shippingGstin: '',     // Empty - same GST
  shippingAddress: party.fullShippingAddress,  // Different address
)
```

**Use Case 3: Third-Party Consignee (Drop Shipping)**
```dart
// When goods ship to a different company (consignee)
Invoice(
  buyerName: party.companyName,
  buyerGstin: party.gstNumber ?? '',
  buyerAddress: party.fullBillingAddress,
  shippingName: 'XYZ Logistics Pvt Ltd',     // Different company
  shippingGstin: '29XYZAB1234C1Z9',          // Different GST
  shippingAddress: 'Warehouse 5, Bangalore', // Different address
)
```

---

### 3. **DELIVERY CHALLAN - FIELD NAME CORRECTIONS**

#### ❌ Current Implementation (WRONG)
```dart
// DO NOT use Invoice model field names
DeliveryChallan(
  invoiceNumber: 'DC-001',  // WRONG
  invoiceDate: '2024-01-01', // WRONG
)
```

#### ✅ Required Implementation (CORRECT)
```dart
class DeliveryChallan {
  final String deliveryChallanId;  // Primary ID from backend
  final String id;                 // Same as deliveryChallanId
  final String challanNumber;      // NOT invoiceNumber
  final String? challanDate;       // NOT invoiceDate
  final String status;             // 'pending', 'delivered', 'cancelled'
  
  // Seller info
  final Seller seller;
  
  // Buyer info (same as invoice)
  final String? buyerId;
  final String buyerName;
  final String buyerGstin;
  final String buyerAddress;
  final String? shippingName;
  final String? shippingGstin;
  final String? shippingAddress;
  
  // Items, charges, discounts (same as invoice)
  final List<LineItem> items;
  final List<AdditionalCharge> additionalCharges;
  final String globalDiscountType;
  final double globalDiscountValue;
  
  // Transport, bank, other details (same as invoice)
  final TransportInfo? transportInfo;
  final BankDetails? bankDetails;
  final OtherDetails? otherDetails;
  
  // Additional fields
  final List<CustomField> customFields;
  final List<String> termsAndConditions;
  final String notes;
  final String? signatureUrl;
  final String? stampUrl;
  final String? createdAt;
  final String? updatedAt;

  DeliveryChallan({
    required this.deliveryChallanId,
    required this.id,
    required this.challanNumber,
    this.challanDate,
    required this.status,
    required this.seller,
    this.buyerId,
    required this.buyerName,
    this.buyerGstin = '',
    this.buyerAddress = '',
    this.shippingName = '',
    this.shippingGstin = '',
    this.shippingAddress = '',
    required this.items,
    this.additionalCharges = const [],
    required this.globalDiscountType,
    required this.globalDiscountValue,
    this.transportInfo,
    this.bankDetails,
    this.otherDetails,
    this.customFields = const [],
    this.termsAndConditions = const [],
    this.notes = '',
    this.signatureUrl,
    this.stampUrl,
    this.createdAt,
    this.updatedAt,
  });

  Map<String, dynamic> toJson() => {
    'challanNumber': challanNumber,  // NOT invoiceNumber
    'challanDate': challanDate,      // NOT invoiceDate
    'status': status,
    'seller': seller.toJson(),
    if (buyerId != null) 'buyerId': buyerId,
    'buyerName': buyerName,
    'buyerGstin': buyerGstin,
    'buyerAddress': buyerAddress,
    'shippingName': shippingName,
    'shippingGstin': shippingGstin,
    'shippingAddress': shippingAddress,
    'items': items.map((e) => e.toJson()).toList(),
    'additionalCharges': additionalCharges.map((e) => e.toJson()).toList(),
    'globalDiscountType': globalDiscountType,
    'globalDiscountValue': globalDiscountValue,
    if (transportInfo != null) 'transportInfo': transportInfo!.toJson(),
    if (bankDetails != null) 'bankDetails': bankDetails!.toJson(),
    if (otherDetails != null) 'otherDetails': otherDetails!.toJson(),
    'customFields': customFields.map((e) => e.toJson()).toList(),
    'termsAndConditions': termsAndConditions,
    'notes': notes,
    if (signatureUrl != null) 'signatureUrl': signatureUrl,
    if (stampUrl != null) 'stampUrl': stampUrl,
  };

  factory DeliveryChallan.fromJson(Map<String, dynamic> json) => DeliveryChallan(
    deliveryChallanId: json['deliveryChallanId'] ?? json['id'] ?? '',
    id: json['id'] ?? json['deliveryChallanId'] ?? '',
    challanNumber: json['challanNumber'] ?? '',
    challanDate: json['challanDate'],
    status: json['status'] ?? 'pending',
    seller: Seller.fromJson(json['seller'] ?? {}),
    buyerId: json['buyerId'],
    buyerName: json['buyerName'] ?? '',
    buyerGstin: json['buyerGstin'] ?? '',
    buyerAddress: json['buyerAddress'] ?? '',
    shippingName: json['shippingName'] ?? '',
    shippingGstin: json['shippingGstin'] ?? '',
    shippingAddress: json['shippingAddress'] ?? '',
    items: (json['items'] as List?)?.map((e) => LineItem.fromJson(e)).toList() ?? [],
    additionalCharges: (json['additionalCharges'] as List?)?.map((e) => AdditionalCharge.fromJson(e)).toList() ?? [],
    globalDiscountType: json['globalDiscountType'] ?? 'percentage',
    globalDiscountValue: (json['globalDiscountValue'] ?? 0).toDouble(),
    transportInfo: json['transportInfo'] != null ? TransportInfo.fromJson(json['transportInfo']) : null,
    bankDetails: json['bankDetails'] != null ? BankDetails.fromJson(json['bankDetails']) : null,
    otherDetails: json['otherDetails'] != null ? OtherDetails.fromJson(json['otherDetails']) : null,
    customFields: (json['customFields'] as List?)?.map((e) => CustomField.fromJson(e)).toList() ?? [],
    termsAndConditions: (json['termsAndConditions'] as List?)?.map((e) => e.toString()).toList() ?? [],
    notes: json['notes'] ?? '',
    signatureUrl: json['signatureUrl'],
    stampUrl: json['stampUrl'],
    createdAt: json['createdAt'],
    updatedAt: json['updatedAt'],
  );
}
```

#### 📝 Delivery Challan API

**Create:**
```http
POST /business/{businessId}/delivery-challans
Authorization: Bearer <token>

{
  "challanNumber": "DC-001",    // NOT invoiceNumber
  "challanDate": "2024-01-15",  // NOT invoiceDate
  "status": "pending",
  // ... rest same as invoice structure
}
```

**Update Status:**
```http
PUT /business/{businessId}/delivery-challans/{challanId}

{
  "status": "delivered"
}
```

---

### 4. **SALES DEBIT NOTE - ADD MISSING FIELDS**

#### ❌ Current Implementation (INCOMPLETE)
```dart
class SalesDebitNote {
  String invoiceNumber;
  String invoiceDate;
  // Missing: reason, referenceInvoiceId, referenceInvoiceNumber
}
```

#### ✅ Required Implementation (COMPLETE)

**✅ BACKEND UPDATED:** These fields are now available in backend v1.1.0
```dart
class SalesDebitNote {
  final String salesDebitNoteId;
  final String id;
  final String invoiceNumber;  // Used for debit note number
  final String? invoiceDate;
  final String? dueDate;
  final String status;  // 'draft', 'saved', 'cancelled'
  
  // ✅ NEW FIELDS (Available in backend v1.1.0)
  final String? referenceInvoiceId;     // Original invoice ID
  final String? referenceInvoiceNumber; // Original invoice number
  final String reason;                  // Reason for debit note
  final String? shippingName;           // Separate consignee name
  final String? shippingGstin;          // Separate consignee GSTIN
  
  // ... rest same as invoice ...

  Map<String, dynamic> toJson() => {
    'invoiceNumber': invoiceNumber,
    'invoiceDate': invoiceDate,
    'dueDate': dueDate,
    'status': status,
    'referenceInvoiceId': referenceInvoiceId,
    'referenceInvoiceNumber': referenceInvoiceNumber,
    'reason': reason,
    'shippingName': shippingName,
    'shippingGstin': shippingGstin,
    // ... rest of fields
  };
}
```

#### 📝 Sales Debit Note API

**Create:**
```http
POST /business/{businessId}/sales-debit-notes
Authorization: Bearer <token>

{
  "invoiceNumber": "SDN-001",  // Debit note number
  "invoiceDate": "2024-01-15",
  "status": "saved",
  "referenceInvoiceId": "uuid-of-original-invoice",
  "referenceInvoiceNumber": "INV-100",
  "reason": "Additional charges for express delivery",
  "shippingName": "XYZ Logistics Pvt Ltd",
  "shippingGstin": "29XYZAB1234C1Z9",
  // ... rest same as invoice structure
}
```

**Query by Reference Invoice:**
```http
GET /business/{businessId}/sales-debit-notes?referenceInvoiceId={invoiceId}
Authorization: Bearer <token>
```

**Note:** Backend supports `'draft'` status. You CAN use draft status for incomplete debit notes.

---

### 5. **VALIDATION UPDATES**

#### Pincode Validation
```dart
// Current regex validation is fine, but backend only checks length
// Keep your regex for better UX
final pincodeRegex = RegExp(r'^[0-9]{6}$');

String? validatePincode(String? value) {
  if (value == null || value.isEmpty) {
    return 'Pincode is required';
  }
  if (!pincodeRegex.hasMatch(value)) {
    return 'Pincode must be exactly 6 digits';
  }
  return null;
}
```

#### GST Number Validation
```dart
// IMPORTANT: GST is OPTIONAL in backend
final gstRegex = RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$');

String? validateGstNumber(String? value) {
  // Allow empty - GST is optional
  if (value == null || value.isEmpty) {
    return null;  // Valid - optional field
  }
  if (!gstRegex.hasMatch(value)) {
    return 'Invalid GSTIN format';
  }
  return null;
}
```

#### Mobile Validation
```dart
final mobileRegex = RegExp(r'^[6-9]\d{9}$');

String? validateMobile(String? value) {
  if (value == null || value.isEmpty) {
    return 'Mobile number is required';
  }
  if (!mobileRegex.hasMatch(value)) {
    return 'Invalid mobile number (must start with 6-9 and be 10 digits)';
  }
  return null;
}
```

---

## 📋 COMPLETE API ENDPOINTS REFERENCE

### Party APIs
```
POST   /parties                    - Create party
GET    /parties                    - List all parties
GET    /parties/{partyId}          - Get single party
PUT    /parties/{partyId}          - Update party
DELETE /parties/{partyId}          - Delete party (soft delete)
```

### Invoice APIs
```
POST   /business/{businessId}/invoices              - Create invoice
GET    /business/{businessId}/invoices              - List invoices
GET    /business/{businessId}/invoices/{invoiceId}  - Get invoice
PUT    /business/{businessId}/invoices/{invoiceId}  - Update invoice
DELETE /business/{businessId}/invoices/{invoiceId}  - Delete invoice
POST   /business/{businessId}/invoices/{invoiceId}/pdf - Generate PDF
```

### Quotation APIs
```
POST   /business/{businessId}/quotations                  - Create quotation
GET    /business/{businessId}/quotations                  - List quotations
GET    /business/{businessId}/quotations/{quotationId}    - Get quotation
PUT    /business/{businessId}/quotations/{quotationId}    - Update quotation
DELETE /business/{businessId}/quotations/{quotationId}    - Delete quotation
POST   /business/{businessId}/quotations/{quotationId}/pdf - Generate PDF
```

### Delivery Challan APIs
```
POST   /business/{businessId}/delivery-challans              - Create challan
GET    /business/{businessId}/delivery-challans              - List challans
GET    /business/{businessId}/delivery-challans/{challanId}  - Get challan
PUT    /business/{businessId}/delivery-challans/{challanId}  - Update challan
DELETE /business/{businessId}/delivery-challans/{challanId}  - Delete challan
POST   /business/{businessId}/delivery-challans/{challanId}/pdf - Generate PDF
```

### Sales Debit Note APIs
```
POST   /business/{businessId}/sales-debit-notes                      - Create note
GET    /business/{businessId}/sales-debit-notes                      - List notes
GET    /business/{businessId}/sales-debit-notes/{salesDebitNoteId}   - Get note
PUT    /business/{businessId}/sales-debit-notes/{salesDebitNoteId}   - Update note
DELETE /business/{businessId}/sales-debit-notes/{salesDebitNoteId}   - Delete note
POST   /business/{businessId}/sales-debit-notes/{salesDebitNoteId}/pdf - Generate PDF
```

### Other APIs
```
GET    /gst/place-of-supply?state={stateName}  - Get state code and info
GET    /user/document-access                   - Check if user can create documents
```

---

## 🧪 TESTING CHECKLIST

### Party Creation/Update
- [ ] Create party with nested `billingAddress` object
- [ ] Create party with nested `shippingAddress` object
- [ ] Create party with `sameAsBilling = true` (no shipping address)
- [ ] Create party with `sameAsBilling = false` (shipping address required)
- [ ] Create party without GST number (optional field)
- [ ] Update party and verify shipping address syncs if `sameAsBilling = true`
- [ ] Verify pincode is exactly 6 digits
- [ ] Verify mobile matches regex `^[6-9]\d{9}$`

### Invoice Creation
- [ ] Create invoice with `shippingAddress` empty (same as billing)
- [ ] Create invoice with different `shippingAddress`
- [ ] Create invoice with `shippingName` and `shippingGstin` (third-party consignee)
- [ ] Verify `buyerAddress` and `shippingAddress` are flat strings
- [ ] Create draft invoice with minimal fields
- [ ] Create saved invoice with all required fields
- [ ] Verify tax calculations match backend

### Quotation Creation
- [ ] Create draft quotation with minimal fields
- [ ] Create sent quotation with all required fields
- [ ] Add contact persons array
- [ ] Verify no transport info is sent
- [ ] Update status to accepted/rejected/expired

### Delivery Challan Creation
- [ ] Create challan with `challanNumber` (NOT `invoiceNumber`)
- [ ] Create challan with `challanDate` (NOT `invoiceDate`)
- [ ] Create pending challan
- [ ] Update status to delivered
- [ ] Verify `deliveryChallanId` is returned and used

### Sales Debit Note Creation
- [ ] Create debit note with `invoiceNumber` (for debit note number)
- [ ] Create draft debit note (backend supports it)
- [ ] Create saved debit note
- [ ] Test `referenceInvoiceId` and `referenceInvoiceNumber` fields
- [ ] Test `reason` field
- [ ] Test `shippingName` and `shippingGstin` fields
- [ ] Query debit notes by `referenceInvoiceId`

---

## 🔄 MIGRATION STEPS

### Step 1: Update Models (1-2 days)
1. Create `Address` class with nested structure
2. Update `Party` model to use `Address` objects
3. Add `shippingName` and `shippingGstin` to all document models
4. Update `DeliveryChallan` to use correct field names
5. Update `SalesDebitNote` model (add fields or mark as local-only)

### Step 2: Update API Services (1 day)
1. Update party creation/update API calls with new JSON structure
2. Update document creation API calls to include new shipping fields
3. Update delivery challan API to use correct field names

### Step 3: Update UI Forms (1-2 days)
1. Update party form to work with nested address structure
2. Add shipping name/GST fields to document forms
3. Update delivery challan form field names
4. Update sales debit note form (if backend adds fields)

### Step 4: Update Validation (0.5 day)
1. Make GST number optional in party validation
2. Ensure pincode validation matches backend (numeric-only 6 digits)
3. Update mobile validation regex
4. Add validation for new debit note fields

### Step 5: Testing (2-3 days)
1. Test all party CRUD operations
2. Test all document CRUD operations
3. Test address handling in all scenarios
4. Test PDF generation with new fields
5. End-to-end testing of complete flows

### Step 6: Deployment
1. Deploy backend changes first (if any)
2. Deploy Flutter app updates
3. Monitor for API errors
4. Verify existing data still loads correctly

---

## ✅ BACKEND UPDATES COMPLETED

The following updates have been completed in backend v1.1.0:

1. **✅ Sales Debit Note - Fields Added:**
   - `referenceInvoiceId` - Link to original invoice
   - `referenceInvoiceNumber` - Original invoice number
   - `reason` - Explanation for debit note
   - `shippingName` - Separate consignee name
   - `shippingGstin` - Separate consignee GSTIN
   - Query support: `?referenceInvoiceId={id}`

2. **✅ Party Pincode - Validation Updated:**
   - Now requires numeric-only 6 digits: `/^[0-9]{6}$/`
   - Rejects alphanumeric pincodes

3. **✅ All Document Types - Fields Added:**
   - `shippingName` and `shippingGstin` added to Invoice, Quotation, Challan, Debit Note
   - Consistent structure across all document types

See `BACKEND_UPDATES_CHANGELOG.md` for detailed information.

---

## ❓ FAQ

**Q: Why nested address structure instead of flat fields?**  
A: Backend stores addresses as nested objects in DynamoDB. Flat fields would require backend refactoring, which is more risky.

**Q: Can we keep flat fields in frontend and convert before API call?**  
A: Not recommended - adds complexity, error-prone, and makes debugging harder. Better to match backend structure.

**Q: What if user has old party data with flat fields?**  
A: Implement migration logic to convert old flat structure to new nested structure on app update.

**Q: Why are shippingName and shippingGstin separate from shippingAddress?**  
A: They represent a different company (consignee) receiving goods, not just a different address. Important for drop-shipping and third-party logistics.

**Q: Should we validate GST number format in frontend?**  
A: Yes, for better UX. But allow empty values since backend makes it optional.

**Q: What happens if we don't fix shipping address structure?**  
A: Party creation/update API calls will fail with validation errors. Existing parties may load incorrectly.

---

## 📝 SUMMARY OF CHANGES

| Change | Priority | Estimated Effort | Breaking Change | Backend Status |
|--------|----------|------------------|-----------------|----------------|
| Party address structure | 🔴 Critical | 1-2 days | Yes | ✅ Ready |
| Add shipping name/GST to documents | 🟡 High | 0.5 day | No | ✅ Ready |
| Fix delivery challan field names | 🟡 High | 0.5 day | Yes | ✅ Ready |
| Sales debit note fields | 🟢 Medium | 0.5 day | No | ✅ Ready |
| Validation updates | 🟢 Low | 0.5 day | No | ✅ Ready |

**Total Estimated Effort:** 3-5 days  
**Backend Status:** ✅ All updates completed (v1.1.0)

**Recommended Approach:** Fix critical items first (Party address structure), then high priority items, then medium/low priority items.

**Backend Ready:** All backend changes are complete. You can start implementation immediately.

---

## 📧 SUPPORT

For questions or clarifications, contact backend team with:
- This document
- Specific API endpoint causing issues
- Request/response JSON examples
- Error messages from backend

**Backend API Base URL:** `https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev`  
**Backend Version:** 1.1.0  
**Authentication:** Bearer token from `/auth/login`

**Additional Resources:**
- `BACKEND_UPDATES_CHANGELOG.md` - Detailed changelog of backend updates
- `BACKEND_UPDATES_REQUIRED.md` - Original requirements document
- `API_REFERENCE.md` - Complete API documentation

---

**Document Version:** 1.1  
**Last Updated:** February 13, 2026  
**Backend Version:** 1.1.0  
**Status:** ✅ Backend Updated - Ready for Frontend Implementation
