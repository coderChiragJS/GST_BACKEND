# GST Billing Backend – API Reference

Base URL: `https://your-api-domain.com` (or `http://localhost:3000` for local)

All authenticated endpoints require header:  
`Authorization: Bearer <jwt_token>`

---

## Admin APIs

Admin routes require a valid JWT for a user with **admin role**.

---

### 1. Get complete user list (with business & subscription)

**GET** `/admin/users`

**Query (optional):**
| Param     | Type   | Default | Description        |
|-----------|--------|--------|--------------------|
| `limit`   | number | 50     | Max 100            |
| `nextToken` | string | -    | Pagination token   |

**Request example:**
```http
GET /admin/users?limit=20
Authorization: Bearer <admin_jwt_token>
```

**Response 200:**
```json
{
  "users": [
    {
      "userId": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "USER",
      "approvalStatus": "APPROVED",
      "subscriptionActive": false,
      "trialStartDate": "2025-01-01T00:00:00.000Z",
      "trialEndDate": "2025-01-15T00:00:00.000Z",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "businesses": [
        {
          "userId": "uuid",
          "businessId": "uuid",
          "firmName": "ABC Traders",
          "gstNumber": "27XXXXX...",
          "approvalStatus": "APPROVED",
          "isActive": true
        }
      ],
      "subscription": {
        "subscriptionId": "uuid",
        "packageId": "uuid",
        "packageName": "Pro Plan",
        "invoiceLimit": 100,
        "quotationLimit": 50,
        "invoicesUsed": 10,
        "quotationsUsed": 5,
        "startDate": "2025-01-10T00:00:00.000Z"
      },
      "hasPurchasedPackage": true,
      "remainingInvoices": 90,
      "remainingQuotations": 45
    }
  ],
  "nextToken": "base64_encoded_cursor_or_null"
}
```

---

### 2. Get payment list (mapped with user IDs)

**GET** `/admin/payments`

**Query (optional):**
| Param       | Type   | Default | Description      |
|-------------|--------|--------|------------------|
| `limit`    | number | 50     | Max 100          |
| `nextToken`| string | -      | Pagination token |

**Request example:**
```http
GET /admin/payments?limit=50
Authorization: Bearer <admin_jwt_token>
```

**Response 200:**
```json
{
  "payments": [
    {
      "PK": "PAYMENT",
      "SK": "ORD_xxx",
      "orderId": "ORD_xxx",
      "userId": "user-uuid",
      "packageId": "package-uuid",
      "amountPaise": 10000,
      "status": "SUCCESS",
      "gatewayRef": "PHONEPE_REF",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:01:00.000Z"
    }
  ],
  "nextToken": "base64_encoded_cursor_or_null"
}
```

---

### 3. List available packages

**GET** `/admin/packages`

**Request example:**
```http
GET /admin/packages
Authorization: Bearer <admin_jwt_token>
```

**Response 200:**
```json
{
  "packages": [
    {
      "PK": "PACKAGE",
      "SK": "package-uuid",
      "packageId": "package-uuid",
      "name": "Pro Plan",
      "price": 999,
      "invoiceLimit": 100,
      "quotationLimit": 50,
      "validityDays": null,
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 4. Get single package (Read)

**GET** `/admin/packages/:packageId`

**Request example:**
```http
GET /admin/packages/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <admin_jwt_token>
```

**Response 200:**
```json
{
  "package": {
    "packageId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Pro Plan",
    "price": 999,
    "invoiceLimit": 100,
    "quotationLimit": 50,
    "validityDays": null,
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Response 404:** `{ "error": "Package not found" }`

---

### 5. Create package

**POST** `/admin/packages`

**Request body:**
```json
{
  "name": "Pro Plan",
  "price": 999,
  "invoiceLimit": 100,
  "quotationLimit": 50,
  "validityDays": null,
  "isActive": true
}
```

| Field           | Type    | Required | Description              |
|-----------------|---------|----------|--------------------------|
| `name`         | string  | Yes      | Package name             |
| `price`        | number  | Yes      | Price (e.g. in INR)      |
| `invoiceLimit` | number  | Yes      | Invoice limit            |
| `quotationLimit`| number  | Yes      | Quotation limit          |
| `validityDays` | number \| null | No  | Optional; null = no expiry |
| `isActive`     | boolean | No       | Default true             |

**Response 201:**
```json
{
  "package": {
    "packageId": "new-uuid",
    "name": "Pro Plan",
    "price": 999,
    "invoiceLimit": 100,
    "quotationLimit": 50,
    "validityDays": null,
    "isActive": true,
    "createdAt": "2025-01-15T00:00:00.000Z",
    "updatedAt": "2025-01-15T00:00:00.000Z"
  }
}
```

**Response 400:** `{ "code": "VALIDATION_FAILED", "error": "...", "details": [...] }`

---

### 6. Update package

**PUT** `/admin/packages/:packageId`

**Request body (all optional):**
```json
{
  "name": "Pro Plan Updated",
  "price": 1299,
  "invoiceLimit": 150,
  "quotationLimit": 75,
  "validityDays": null,
  "isActive": false
}
```

**Response 200:**
```json
{
  "package": {
    "packageId": "uuid",
    "name": "Pro Plan Updated",
    "price": 1299,
    "invoiceLimit": 150,
    "quotationLimit": 75,
    "validityDays": null,
    "isActive": false,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-15T12:00:00.000Z"
  }
}
```

**Response 404:** `{ "error": "Package not found" }`

---

### 7. Delete package

**DELETE** `/admin/packages/:packageId`

**Request example:**
```http
DELETE /admin/packages/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <admin_jwt_token>
```

**Response 200:**
```json
{
  "message": "Package deleted successfully",
  "packageId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response 404:** `{ "error": "Package not found" }`

---

## Mobile App APIs

**Document creation rules:** A user may create invoices and quotations only if they have an **active trial** (today ≤ trial end date) or an **active subscription** with at least one remaining invoice or quotation limit. If not, the app must not allow the user to open the invoice or quotation creation screens, and the backend will return **403** on create. Use **GET /user/document-access** to get `canCreateDocuments` and optional `message` for the UI.

---

### 8. Get user profile

**GET** `/user/profile`

**Request example:**
```http
GET /user/profile
Authorization: Bearer <user_jwt_token>
```

**Response 200:**
```json
{
  "userId": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "USER",
  "trialStartDate": "2025-01-01T00:00:00.000Z",
  "trialEndDate": "2025-01-15T00:00:00.000Z",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Response 401:** `{ "error": "Unauthorized" }`  
**Response 404:** `{ "error": "User not found" }`

---

### 8b. Get document access (invoice/quotation creation eligibility)

**Use this to decide whether to show or block the "Create Invoice" and "Create Quotation" screens.**  
If `canCreateDocuments` is `false`, the user must not be allowed to open invoice or quotation creation screens. The backend also returns **403** on POST create if the user has no active trial and no active subscription with remaining limits.

**GET** `/user/document-access`

**Request example:**
```http
GET /user/document-access
Authorization: Bearer <user_jwt_token>
```

**Response 200 – User can create (on trial):**
```json
{
  "canCreateDocuments": true,
  "onTrial": true,
  "trialEndDate": "2025-01-15T00:00:00.000Z",
  "hasActiveSubscription": false,
  "remainingInvoices": null,
  "remainingQuotations": null,
  "subscription": null,
  "message": null
}
```

**Response 200 – User can create (has package with remaining limits):**
```json
{
  "canCreateDocuments": true,
  "onTrial": false,
  "trialEndDate": "2025-01-10T00:00:00.000Z",
  "hasActiveSubscription": true,
  "remainingInvoices": 90,
  "remainingQuotations": 45,
  "subscription": {
    "subscriptionId": "uuid",
    "packageId": "uuid",
    "packageName": "Pro Plan",
    "invoiceLimit": 100,
    "quotationLimit": 50,
    "invoicesUsed": 10,
    "quotationsUsed": 5,
    "startDate": "2025-01-01T00:00:00.000Z"
  },
  "message": null
}
```

**Response 200 – User cannot create (trial expired, no package):**
```json
{
  "canCreateDocuments": false,
  "onTrial": false,
  "trialEndDate": "2025-01-05T00:00:00.000Z",
  "hasActiveSubscription": false,
  "remainingInvoices": 0,
  "remainingQuotations": 0,
  "subscription": null,
  "message": "Your trial has expired and you have no active package. Purchase a package to create invoices and quotations."
}
```

**Response 200 – User cannot create (package limits exhausted):**
```json
{
  "canCreateDocuments": false,
  "onTrial": false,
  "trialEndDate": "2025-01-05T00:00:00.000Z",
  "hasActiveSubscription": false,
  "remainingInvoices": 0,
  "remainingQuotations": 0,
  "subscription": null,
  "message": "Your package limits are exhausted. Purchase a package to create more invoices and quotations."
}
```

**App behaviour:** When `canCreateDocuments` is `false`, hide or disable "Create Invoice" and "Create Quotation" and show `message` (e.g. upgrade prompt). When `canCreateDocuments` is `true`, allow opening creation screens; optionally show `trialEndDate` or `remainingInvoices` / `remainingQuotations` in the UI.

---

### 9. Update user profile

**PUT** `/user/profile`

**Request body (at least one required):**
```json
{
  "name": "John Doe Updated",
  "email": "john.new@example.com"
}
```

| Field   | Type   | Required | Description        |
|---------|--------|----------|--------------------|
| `name`  | string | No*      | Min 2 characters   |
| `email` | string | No*      | Valid email; must be unique |

*At least one of `name` or `email` is required.

**Response 200:**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "userId": "uuid",
    "name": "John Doe Updated",
    "email": "john.new@example.com",
    "role": "USER"
  }
}
```

**Response 400:** `{ "error": "At least one of name or email is required for update" }`  
**Response 409:** `{ "error": "Email already in use by another account" }`

---

### 10. Forgot password (request OTP)

**POST** `/auth/forgot-password`

No auth required.

**Request body:**
```json
{
  "email": "user@example.com"
}
```

**Response 200:**
```json
{
  "message": "If this email is registered, an OTP has been sent.",
  "otpForTesting": "1234"
}
```

- OTP is valid for **10 minutes**.
- `otpForTesting` is for development only (dummy OTP; no SMS/email). Remove or hide in production when real OTP is used.

---

### 11. Reset password (verify OTP + set new password)

**POST** `/auth/reset-password`

No auth required.

**Request body:**
```json
{
  "email": "user@example.com",
  "otp": "1234",
  "newPassword": "newSecurePassword123"
}
```

| Field         | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| `email`       | string | Yes      | Same as forgot-password |
| `otp`         | string | Yes      | 4-digit OTP        |
| `newPassword` | string | Yes      | Min 6 characters   |

**Response 200:**
```json
{
  "message": "Password updated successfully."
}
```

**Response 400:**  
- `{ "error": "Invalid or expired OTP. Please request a new one." }`  
- `{ "error": "OTP has expired. Please request a new one." }`  
- `{ "error": "Invalid OTP." }`

---

## Common auth (used by both Mobile & Admin)

---

### 12. Register (user)

**POST** `/auth/register`

**Request body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response 201:** `{ "message": "User registered successfully.", "userId": "uuid" }`  
**Response 409:** `{ "error": "User with this email already exists" }`

---

### 13. Login (user)

**POST** `/auth/login`

**Request body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response 200:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "userId": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "USER"
  }
}
```

**Response 401:** `{ "error": "Invalid credentials" }`

---

### 14. Admin login

**POST** `/admin/auth/login`

(Use your existing admin login request/response; include in shared doc if needed.)

---

## Error format

- **4xx/5xx** – JSON body, e.g. `{ "error": "Message" }` or `{ "error": "...", "details": "..." }`.
- **Validation** – `{ "code": "VALIDATION_FAILED", "error": "...", "details": [...] }`.

---

## Quick summary table

| #  | Method | Endpoint                          | Auth   | Use           |
|----|--------|-----------------------------------|--------|---------------|
| 1  | GET    | `/admin/users`                    | Admin  | User list     |
| 2  | GET    | `/admin/payments`                 | Admin  | Payment list  |
| 3  | GET    | `/admin/packages`                 | Admin  | List packages |
| 4  | GET    | `/admin/packages/:packageId`      | Admin  | Get package   |
| 5  | POST   | `/admin/packages`                 | Admin  | Create package|
| 6  | PUT    | `/admin/packages/:packageId`      | Admin  | Update package|
| 7  | DELETE | `/admin/packages/:packageId`      | Admin  | Delete package|
| 8  | GET    | `/user/profile`                  | User   | Get profile   |
| 8b | GET    | `/user/document-access`          | User   | Can create invoices/quotations? (trial + subscription) |
| 9  | PUT    | `/user/profile`                  | User   | Update profile|
| 10 | POST   | `/auth/forgot-password`           | Public | Request OTP   |
| 11 | POST   | `/auth/reset-password`            | Public | Set new password |
| 12 | POST   | `/auth/register`                 | Public | Register      |
| 13 | POST   | `/auth/login`                    | Public | Login         |

Share this file with the **mobile** and **admin panel** teams. Replace the base URL with your actual API URL before sharing.
