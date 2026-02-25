# Business API – Request & Response Reference

All endpoints require authentication: `Authorization: Bearer <token>`.

Base URL example: `https://your-api.execute-api.region.amazonaws.com/dev`

---

## 1. Create Business

**POST** `/business`

**Request body (JSON):**

| Field | Type | Required | Validation / Notes |
|-------|------|----------|--------------------|
| firmName | string | Yes | Min 2 characters |
| mobile | string | Yes | Exactly 10 digits |
| address | object | Yes | See below |
| gstNumber | string | No | Optional |
| pan | string | No | Optional |
| email | string | No | Valid email format |
| dispatchAddress | object | No | Optional; { street?, city?, state?, pincode? } |
| companyLogoUrl | string | No | Valid URL |
| customFields | object | No | Key-value pairs |
| bankAccounts | array | No | See bank account object below |
| transporters | array | No | See transporter object below |
| termsTemplates | array | No | See terms template object below |
| defaultSignatureUrl | string | No | Valid URL or empty string |
| defaultStampUrl | string | No | Valid URL or empty string |

**address (required):**
```json
{
  "street": "optional",
  "city": "required, min 1 char",
  "state": "required, min 1 char",
  "pincode": "optional"
}
```

**bankAccounts (optional) – each item:**
```json
{
  "id": "string, required",
  "accountName": "string, required, max 100",
  "bankName": "string, required, max 100",
  "accountNumber": "string, required, max 50",
  "ifscCode": "string, required, format: 4 letters + 0 + 6 alphanumeric",
  "branch": "string, optional, max 100",
  "upiId": "string, optional, max 100",
  "isDefault": "boolean, default false"
}
```

**transporters (optional) – each item:**
```json
{
  "id": "string, required (internal ID)",
  "transporterId": "string, required, max 50",
  "name": "string, required, max 100",
  "isDefault": "boolean, default false"
}
```

**termsTemplates (optional) – each item:**
```json
{
  "id": "string, required",
  "name": "string, required, max 100",
  "terms": "array of strings, required, min 1, each max 500",
  "isDefault": "boolean, default false"
}
```

**Example request:**
```json
{
  "firmName": "My Firm Pvt Ltd",
  "gstNumber": "27AABCU9603R1ZM",
  "pan": "AABCU9603R",
  "mobile": "9876543210",
  "email": "contact@myfirm.com",
  "address": {
    "street": "123 Main Road",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  },
  "dispatchAddress": {
    "street": "Warehouse 1",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400002"
  }
}
```

**Response – 201 Created:**
```json
{
  "message": "Business Profile Created",
  "business": {
    "userId": "user-uuid",
    "businessId": "business-uuid",
    "firmName": "My Firm Pvt Ltd",
    "gstNumber": "27AABCU9603R1ZM",
    "pan": "AABCU9603R",
    "mobile": "9876543210",
    "email": "contact@myfirm.com",
    "address": { "street": "123 Main Road", "city": "Mumbai", "state": "Maharashtra", "pincode": "400001" },
    "dispatchAddress": { "street": "Warehouse 1", "city": "Mumbai", "state": "Maharashtra", "pincode": "400002" },
    "companyLogoUrl": null,
    "customFields": null,
    "bankAccounts": [],
    "transporters": [],
    "termsTemplates": [],
    "defaultSignatureUrl": null,
    "defaultStampUrl": null,
    "approvalStatus": "PENDING",
    "isActive": false,
    "createdAt": "2025-02-25T10:00:00.000Z",
    "updatedAt": "2025-02-25T10:00:00.000Z"
  }
}
```

**Error – 400 Bad Request (validation):**
```json
{
  "error": "Firm Name is required"
}
```
or
```json
{
  "error": "Mobile must be a 10-digit number",
  "details": [ ... ]
}
```

**Error – 401:** Missing or invalid token.

**Error – 500:** `{ "error": "Internal Server Error", "details": "..." }`

---

## 2. List My Businesses

**GET** `/business`

No request body. No query parameters required.

**Response – 200 OK:**
```json
[
  {
    "userId": "user-uuid",
    "businessId": "business-uuid",
    "firmName": "My Firm Pvt Ltd",
    "gstNumber": "27AABCU9603R1ZM",
    "pan": "AABCU9603R",
    "mobile": "9876543210",
    "email": "contact@myfirm.com",
    "address": { "street": "123 Main Road", "city": "Mumbai", "state": "Maharashtra", "pincode": "400001" },
    "dispatchAddress": { ... },
    "companyLogoUrl": null,
    "customFields": null,
    "bankAccounts": [],
    "transporters": [],
    "termsTemplates": [],
    "defaultSignatureUrl": null,
    "defaultStampUrl": null,
    "approvalStatus": "PENDING",
    "isActive": false,
    "createdAt": "2025-02-25T10:00:00.000Z",
    "updatedAt": "2025-02-25T10:00:00.000Z"
  }
]
```
Returns an array of businesses for the authenticated user (may be empty `[]`).

**Error – 401:** Missing or invalid token.

**Error – 500:** `{ "error": "Internal Server Error", "details": "..." }`

---

## 3. Update Business

**PUT** `/business/:businessId`

**URL:** `businessId` is required (UUID of the business). The business must belong to the authenticated user (enforced by middleware).

**Request body (JSON):** All fields are optional; send only the fields you want to update. Same types and validation as create.

| Field | Type | Notes |
|-------|------|--------|
| firmName | string | Min 2 characters |
| gstNumber | string | Optional |
| pan | string | Optional |
| mobile | string | Exactly 10 digits |
| email | string | Valid email |
| address | object | { street?, city, state, pincode? } |
| dispatchAddress | object | Optional; can be null |
| companyLogoUrl | string | URL or null/empty |
| customFields | object | Optional |
| bankAccounts | array | Same shape as create |
| transporters | array | Same shape as create |
| termsTemplates | array | Same shape as create |
| defaultSignatureUrl | string | URL or null/empty |
| defaultStampUrl | string | URL or null/empty |
| isActive | boolean | Typically set by admin |

**Example request (partial update):**
```json
{
  "firmName": "My Firm Pvt Ltd (Updated)",
  "mobile": "9876543210",
  "address": {
    "street": "456 New Road",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400003"
  }
}
```

**Response – 200 OK:**
```json
{
  "message": "Business Updated",
  "business": {
    "userId": "user-uuid",
    "businessId": "business-uuid",
    "firmName": "My Firm Pvt Ltd (Updated)",
    "gstNumber": "27AABCU9603R1ZM",
    "pan": "AABCU9603R",
    "mobile": "9876543210",
    "email": "contact@myfirm.com",
    "address": { "street": "456 New Road", "city": "Mumbai", "state": "Maharashtra", "pincode": "400003" },
    "dispatchAddress": { ... },
    "companyLogoUrl": null,
    "customFields": null,
    "bankAccounts": [],
    "transporters": [],
    "termsTemplates": [],
    "defaultSignatureUrl": null,
    "defaultStampUrl": null,
    "approvalStatus": "PENDING",
    "isActive": false,
    "createdAt": "2025-02-25T10:00:00.000Z",
    "updatedAt": "2025-02-25T11:00:00.000Z"
  }
}
```

**Error – 400 Bad Request:**
```json
{
  "error": "Business ID is required"
}
```
or validation error:
```json
{
  "error": "Mobile must be a 10-digit number",
  "details": [ ... ]
}
```

**Error – 401:** Missing or invalid token.

**Error – 403:** Business does not belong to user (requireBusiness middleware).

**Error – 404:** Business not found (returns 500 in current implementation if update fails).

**Error – 500:** `{ "error": "Internal Server Error", "details": "..." }`

---

## 4. Delete / Remove Business

**Not implemented.** There is no `DELETE /business/:businessId` endpoint in this backend. Businesses are not deleted via API; only create, list, and update are supported.

---

## Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/business` | Create business (required: firmName, mobile, address) |
| GET | `/business` | List all businesses of the logged-in user |
| PUT | `/business/:businessId` | Update business (partial body allowed) |
| DELETE | — | Not available |

**Auth:** All requests must include header: `Authorization: Bearer <token>` (obtain token via `POST /auth/login`).
