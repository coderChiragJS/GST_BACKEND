# Subscription / trial restriction — API reference

**Feature:** If a user does **not** have an active subscription **or** the trial period has expired, they must **not** be allowed to create invoices or quotations, and must be **restricted from opening** the invoice or quotation creation screens.

Base URL: `https://your-api-domain.com`  
Authenticated requests: `Authorization: Bearer <jwt_token>`

---

## For: Mobile App

The mobile app must call the API below to know if the user can open creation screens. When the user **cannot** create, do not open the "Create Invoice" or "Create Quotation" screens and show the returned `message` (e.g. upgrade prompt).

---

### 1. Get document access (can user create invoices/quotations?)

**GET** `/user/document-access`

**Request:**
```http
GET /user/document-access
Authorization: Bearer <user_jwt_token>
```

**Response 200 – Can create (on trial):**
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

**Response 200 – Can create (has package, limits left):**
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

**Response 200 – Cannot create (trial expired, no package):**
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

**Response 200 – Cannot create (package limits exhausted):**
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

**Response 401:** `{ "error": "Unauthorized" }`

**Mobile behaviour:** If `canCreateDocuments` is `true` → allow opening creation screens. If `false` → do **not** open creation screens; show `message` to the user.

---

### 2. Create invoice / quotation (backend enforces same rule)

If the user has no active trial and no subscription with remaining limits, the backend returns **403** on create. Use the above API so the app never needs to hit this 403 for normal flows.

**POST** `/business/:businessId/invoices`  
**Request:** (body as per your invoice create API)  
**Response 403:** `{ "error": "No active trial or package. Please purchase a package to create invoices/quotations." }`

**POST** `/business/:businessId/quotations`  
**Request:** (body as per your quotation create API)  
**Response 403:** same as above

---

## For: Admin Panel

No new APIs were added for the admin panel for this feature. The restriction applies to **end-users** (mobile app) only.

Admin panel continues to use existing APIs (user list, payments, packages, settings, approve, etc.). To see which users have active trial/subscription and remaining limits, use the existing **GET /admin/users** API (each user object includes `trialEndDate`, `hasPurchasedPackage`, `remainingInvoices`, `remainingQuotations`).

---

## Summary

| Audience     | API / behaviour |
|-------------|------------------|
| **Mobile App** | **GET /user/document-access** — call to know if user can open "Create Invoice" / "Create Quotation" screens. When `canCreateDocuments` is `false`, do not open those screens and show `message`. |
| **Mobile App** | **POST** create invoice / quotation — backend returns **403** when user has no active trial and no subscription with remaining limits. |
| **Admin Panel** | No new API. Use **GET /admin/users** to see user trial and subscription details. |
