# Delivery Challan API Specification

## Base Configuration
- **Base URL**: `https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev`
- **Authentication**: Bearer JWT token (from `/auth/login`)
- **Header**: `Authorization: Bearer <token>`
- **Content-Type**: `application/json`

---

## Status Values

The Delivery Challan uses the following status values:

- `pending` - Initial state, shows as "Not Delivered" in UI
- `delivered` - After user marks as delivered
- `cancelled` - User cancelled the challan

---

## API Endpoints

### 1. Create Delivery Challan

**Endpoint**: `POST /business/{businessId}/delivery-challans`

**Request Body**:
```json
{
  "status": "pending",
  "challanNumber": "DC-0001",
  "challanDate": "2026-02-12",
  "seller": {
    "firmName": "My Firm",
    "gstNumber": "29ABCDE1234F1Z5",
    "address": {
      "street": "123 Street",
      "city": "City",
      "state": "State",
      "pincode": "560001"
    },
    "dispatchAddress": {
      "street": "Warehouse St",
      "city": "City",
      "state": "State",
      "pincode": "560048"
    },
    "mobile": "9876543210",
    "email": "firm@example.com",
    "stateCode": "29",
    "logoUrl": "https://example.com/logo.png"
  },
  "buyerId": "party-id-here",
  "buyerName": "Buyer Name",
  "buyerGstin": "27ABCDE1234F1Z3",
  "buyerAddress": "Full billing address",
  "shippingAddress": "Full shipping address",
  "items": [
    {
      "itemId": "product-id",
      "itemName": "Product Name",
      "hsnSac": "1001",
      "quantity": 10,
      "unit": "Nos",
      "unitPrice": 500,
      "discountType": "percentage",
      "discountValue": 5,
      "discountPercent": 5,
      "gstPercent": 18,
      "taxInclusive": true,
      "cessType": "Percentage",
      "cessValue": 2
    }
  ],
  "additionalCharges": [
    {
      "name": "Packing Charges",
      "amount": 200,
      "gstPercent": 18,
      "hsnSac": "9985",
      "isTaxInclusive": false
    }
  ],
  "globalDiscountType": "percentage",
  "globalDiscountValue": 3,
  "tcsInfo": {
    "percentage": 1,
    "basis": "finalAmount"
  },
  "transportInfo": {
    "vehicleNumber": "KA01AB1234",
    "mode": "By Road",
    "transporterName": "Transport Co",
    "transporterId": "TRANS123",
    "docNo": "LR-00045",
    "docDate": "2026-02-12",
    "approxDistance": 350,
    "placeOfSupply": "Karnataka",
    "dateOfSupply": "2026-02-12",
    "placeOfSupplyStateCode": "29",
    "placeOfSupplyStateName": "Karnataka",
    "supplyTypeDisplay": "interstate"
  },
  "bankDetails": {
    "bankName": "State Bank of India",
    "accountHolderName": "My Firm",
    "accountNumber": "12345678901",
    "ifscCode": "SBIN0001234",
    "branch": "MG ROAD",
    "upiId": "firm@sbi"
  },
  "otherDetails": {
    "reverseCharge": false,
    "poNumber": "PO-123456",
    "poDate": "2026-02-12",
    "challanNumber": "CH-7890",
    "eWayBillNumber": "EWB-000111222"
  },
  "customFields": [
    {
      "name": "Order Ref",
      "value": "ORD-9988"
    }
  ],
  "termsAndConditions": [
    "Goods to be returned if not accepted.",
    "All disputes subject to seller city jurisdiction."
  ],
  "notes": "Thank you for your business!",
  "signatureUrl": "https://example.com/signature.png",
  "stampUrl": "https://example.com/stamp.png"
}
```

**Response** (201 Created):
```json
{
  "deliveryChallan": {
    "deliveryChallanId": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
    "id": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
    "challanNumber": "DC-0001",
    "challanDate": "2026-02-12",
    "status": "pending",
    "... all fields from request ...",
    "createdAt": "2026-02-12T12:15:45.013Z",
    "updatedAt": "2026-02-12T12:15:45.013Z"
  }
}
```

---

### 2. List Delivery Challans

**Endpoint**: `GET /business/{businessId}/delivery-challans`

**Query Parameters**:
- `status` (optional): `pending` | `delivered` | `cancelled`
- `fromDate` (optional): ISO date `YYYY-MM-DD` (filters by challanDate >= fromDate)
- `toDate` (optional): ISO date `YYYY-MM-DD` (filters by challanDate <= toDate)
- `search` (optional): Search text (matches buyerName or challanNumber)
- `limit` (optional): Number 1-100 (default: 100)
- `nextToken` (optional): Pagination token from previous response

**Example**: `GET /business/{businessId}/delivery-challans?status=pending&limit=50`

**Response** (200 OK):
```json
{
  "deliveryChallans": [
    {
      "deliveryChallanId": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
      "challanNumber": "DC-0001",
      "challanDate": "2026-02-12",
      "status": "pending",
      "buyerName": "Test Buyer Pvt Ltd",
      "buyerGstin": "27ABCDE1234F1Z3",
      "... all other fields ..."
    }
  ],
  "count": 1,
  "nextToken": "base64-encoded-token-if-more-pages"
}
```

**Note**: `nextToken` is only included if there are more pages available.

---

### 3. Get Delivery Challan by ID

**Endpoint**: `GET /business/{businessId}/delivery-challans/{challanId}`

**Response** (200 OK):
```json
{
  "deliveryChallan": {
    "deliveryChallanId": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
    "id": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
    "challanNumber": "DC-0001",
    "challanDate": "2026-02-12",
    "status": "pending",
    "... all other fields ..."
  }
}
```

**Response** (404 Not Found):
```json
{
  "message": "Delivery Challan not found"
}
```

---

### 4. Update Delivery Challan (Mark as Delivered)

**Endpoint**: `PUT /business/{businessId}/delivery-challans/{challanId}`

**Request Body** (partial update supported):
```json
{
  "status": "delivered"
}
```

**Response** (200 OK):
```json
{
  "deliveryChallan": {
    "deliveryChallanId": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
    "status": "delivered",
    "... all other fields ...",
    "updatedAt": "2026-02-12T12:15:49.155Z"
  }
}
```

---

### 5. Delete Delivery Challan

**Endpoint**: `DELETE /business/{businessId}/delivery-challans/{challanId}`

**Response**: `204 No Content` (empty body)

**Response** (404 Not Found):
```json
{
  "message": "Delivery Challan not found"
}
```

---

### 6. Generate Delivery Challan PDF

**Endpoint**: `POST /business/{businessId}/delivery-challans/{challanId}/pdf`

**Request Body**:
```json
{
  "templateId": "classic"
}
```

**Response** (200 OK):
```json
{
  "pdfUrl": "https://gst-billing-backend-dev-us-east-1-chirag-uploads.s3.us-east-1.amazonaws.com/delivery-challans/{userId}/{businessId}/{challanId}/classic.pdf",
  "deliveryChallanId": "b7f5438f-15c8-4c0d-b902-5017acef3c20",
  "templateId": "classic"
}
```

**Allowed Template IDs**: `["classic"]`

**Response** (400 Bad Request):
```json
{
  "message": "Invalid templateId",
  "allowedTemplates": ["classic"]
}
```

---

## Flutter Integration Guide

### Status Flow in UI

1. **Initial Creation**: Set `status: "pending"` → Display as "Not Delivered"
2. **Mark as Delivered**: Call `PUT /business/{businessId}/delivery-challans/{challanId}` with `{ "status": "delivered" }`
3. **Cancel**: Call `PUT` with `{ "status": "cancelled" }`

### List Screen Implementation

```dart
// Fetch pending/not delivered challans
GET /business/{businessId}/delivery-challans?status=pending

// Display in list:
- buyerName (bold top line)
- challanNumber & challanDate (subtitle)
- status badge ("Not Delivered" / "Delivered")
- Dropdown menu with "Mark as Delivered" option
```

### Create/Edit Screen

The payload structure is **identical to Invoice/Sales Debit Note**, so you can reuse your existing Flutter UI and models. Just ensure:

- Use `challanNumber` field (instead of `invoiceNumber`)
- Use `challanDate` field (instead of `invoiceDate`)
- Status enum: `pending`, `delivered`, `cancelled`

### Data Model Compatibility

```dart
// Delivery Challan uses the same structure as Invoice
// You can reuse:
- LineItem model
- AdditionalCharge model
- TransportInfo model
- BankDetails model
- Seller/Buyer models
- All calculation logic (totals, taxes, etc.)
```

### PDF Generation & Preview

After creating/saving a challan:

```dart
POST /business/{businessId}/delivery-challans/{challanId}/pdf
Body: { "templateId": "classic" }

// Response includes pdfUrl
// Display in in-app PDF viewer (same as invoice/debit note PDFs)
```

---

## Testing

A complete test script is available at `test-delivery-challan.js` that demonstrates:

1. User registration/login
2. Business creation
3. Party creation
4. Product creation
5. Delivery Challan creation (with all fields)
6. PDF generation
7. Status update (pending → delivered)
8. List filtering

**Run test**:
```bash
node test-delivery-challan.js
```

---

## Validation Rules

### Required Fields (for status: "delivered" or "pending"):
- `challanNumber` - String, min 1 character
- `buyerName` - String, min 1 character
- `items` - Array with at least 1 item (for delivered status)
- `seller.firmName` - String, min 1 character
- `seller.gstNumber` - String, min 1 character

### Optional Fields:
- All other fields (addresses, transport, bank details, etc.)

### Draft/Pending State:
- For `status: "pending"`, most fields can be empty/optional
- Allows saving incomplete challans

---

## Error Responses

### 400 Bad Request
```json
{
  "message": "Validation failed",
  "error": "Challan Number is required",
  "details": [...],
  "code": "VALIDATION_FAILED"
}
```

### 401 Unauthorized
```json
{
  "message": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "message": "Delivery Challan not found"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal Server Error",
  "error": "Error details..."
}
```

---

## Summary

The Delivery Challan feature is a complete clone of Invoice/Sales Debit Note with:

✅ **CRUD operations** (Create, Read, Update, Delete)  
✅ **Status tracking** (pending → delivered → cancelled)  
✅ **PDF generation** (classic template)  
✅ **List with filters** (status, date range, search, pagination)  
✅ **Full field support** (items, charges, transport, bank, etc.)  
✅ **Same payload structure** as Invoice (reuse Flutter UI/models)

**Key Differences from Invoice**:
- Uses `challanNumber` and `challanDate` fields
- Status: `pending`, `delivered`, `cancelled` (instead of draft/saved)
- PDF title: "DELIVERY CHALLAN"
- Simplified totals in PDF (focused on delivery, not payment)
