# Admin Panel – Complete Specification & Prompt

Use this document to build the **admin panel** for the GST Billing Backend. It includes authentication, all API endpoints, request/response shapes, validation rules, and suggested UI flows.

---

## 1. Overview

- **Purpose:** Admin panel for managing users, businesses, global settings (trial days), packages (subscription plans), and viewing expired-trial users.
- **Audience:** Admin users only (role `ADMIN`). Regular app users use a separate login and cannot access admin APIs.
- **Auth:** Admin must log in via `/admin/auth/login`. Use the returned JWT for all other admin requests in the `Authorization` header.

---

## 2. Base URL & Headers

- **Base URL:** Your deployed API base URL (e.g. `https://xxxx.execute-api.eu-north-1.amazonaws.com/dev` or `http://localhost:3000` for local).
- **Content-Type:** `application/json` for all request bodies.
- **Authorization (all protected routes):**  
  `Authorization: Bearer <JWT_TOKEN>`

If the token is missing or invalid/expired, APIs return `401`. If the user is not an admin, APIs return `403`.

---

## 3. Admin Authentication (No token required)

### 3.1 Register an admin (one-time / onboarding)

- **Method:** `POST`
- **URL:** `{baseUrl}/admin/auth/register`
- **Body:**
```json
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "password": "minimum6chars"
}
```
- **Validation:** Name min 2 chars; email valid; password min 6 chars.
- **Success:** `201`  
  `{ "message": "Admin user registered successfully.", "userId": "<uuid>" }`
- **Errors:** `400` validation, `409` email already exists, `500` server error.

### 3.2 Admin login

- **Method:** `POST`
- **URL:** `{baseUrl}/admin/auth/login`
- **Body:**
```json
{
  "email": "admin@example.com",
  "password": "yourpassword"
}
```
- **Success:** `200`  
```json
{
  "message": "Admin login successful",
  "token": "<JWT>",
  "user": {
    "userId": "<uuid>",
    "name": "Admin Name",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```
- **Errors:** `400` validation, `401` invalid credentials or not admin, `500` server error.

**UI:** Store `token` (e.g. in memory or secure storage). Send `Authorization: Bearer <token>` on every subsequent admin API call. Use `user` for display (name, email).

---

## 4. Global Settings (Trial Days)

New signups get a free trial. Trial length is a **global** value (same for all users), set by admin.

### 4.1 Get global trial days

- **Method:** `GET`
- **URL:** `{baseUrl}/admin/settings/trial-days`
- **Headers:** `Authorization: Bearer <token>`
- **Success:** `200`  
  `{ "trialDays": 14 }`
- **Errors:** `401` / `403` if not admin, `500` server error.

### 4.2 Set global trial days

- **Method:** `PUT`
- **URL:** `{baseUrl}/admin/settings/trial-days`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
```json
{
  "trialDays": 14
}
```
- **Validation:** `trialDays` must be a non-negative number (integer recommended, e.g. 7, 14, 30).
- **Success:** `200`  
  `{ "trialDays": 14 }`
- **Errors:** `400` missing/invalid `trialDays`, `401`/`403`, `500`.

**UI:** Settings screen with a single number input for “Default trial days for new users”, GET on load, PUT on Save.

---

## 5. Packages (Subscription plans)

Admins create and edit **packages** (e.g. “Starter”, “Pro”). Each package has a price, invoice limit, quotation limit, and optional validity in days. Users purchase a package to get usage after trial.

### 5.1 List all packages (admin)

- **Method:** `GET`
- **URL:** `{baseUrl}/admin/packages`
- **Headers:** `Authorization: Bearer <token>`
- **Success:** `200`  
```json
{
  "packages": [
    {
      "PK": "PACKAGE",
      "SK": "<packageId>",
      "packageId": "<uuid>",
      "name": "Starter",
      "price": 999,
      "invoiceLimit": 100,
      "quotationLimit": 100,
      "validityDays": 365,
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```
- **Note:** You can ignore `PK`/`SK` in the UI; use `packageId`, `name`, `price`, `invoiceLimit`, `quotationLimit`, `validityDays`, `isActive`, `createdAt`, `updatedAt`.

### 5.2 Create package

- **Method:** `POST`
- **URL:** `{baseUrl}/admin/packages`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
```json
{
  "name": "Starter",
  "price": 999,
  "invoiceLimit": 100,
  "quotationLimit": 100,
  "validityDays": 365,
  "isActive": true
}
```
- **Validation:**
  - `name`: required, non-empty string.
  - `price`: required, number ≥ 0.
  - `invoiceLimit`: required, integer ≥ 0.
  - `quotationLimit`: required, integer ≥ 0.
  - `validityDays`: optional; integer ≥ 0 or `null` (no expiry).
  - `isActive`: optional; boolean, default `true`.
- **Success:** `201`  
  `{ "package": { ... same shape as one item in list ... } }`
- **Errors:** `400` with `code: "VALIDATION_FAILED"` and `error` / `details`, `401`/`403`, `500`.

### 5.3 Update package

- **Method:** `PUT`
- **URL:** `{baseUrl}/admin/packages/:packageId`
- **Headers:** `Authorization: Bearer <token>`
- **Body (all fields optional):**
```json
{
  "name": "Starter Plus",
  "price": 1999,
  "invoiceLimit": 200,
  "quotationLimit": 200,
  "validityDays": 365,
  "isActive": false
}
```
- **Validation:** Same types as create; only send fields you want to change.
- **Success:** `200`  
  `{ "package": { ... updated package ... } }`
- **Errors:** `400` validation, `404` package not found, `401`/`403`, `500`.

**UI:** Packages list page (table/cards); Add package form; Edit package form (prefill with existing package). Support enable/disable via `isActive`.

---

## 6. User & Business Approval

### 6.1 List pending reviews (businesses awaiting approval)

- **Method:** `GET`
- **URL:** `{baseUrl}/admin/pending`
- **Headers:** `Authorization: Bearer <token>`
- **Success:** `200`  
  Array of:
```json
{
  "business": {
    "userId": "<uuid>",
    "businessId": "<uuid>",
    "businessName": "...",
    "approvalStatus": "PENDING",
    ...
  },
  "user": {
    "userId": "<uuid>",
    "name": "User Name",
    "email": "user@example.com"
  }
}
```
- **Empty:** `200` with `[]`.

**UI:** “Pending reviews” list; each row shows business info + user name/email; actions: Approve business / Reject (if you add reject later).

### 6.2 Approve user

- **Method:** `POST`
- **URL:** `{baseUrl}/admin/approve`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
```json
{
  "userId": "<uuid>",
  "trialDays": 14
}
```
- **Validation:** `userId` required. `trialDays` optional (number; used to set user’s trial end date).
- **Success:** `200`  
  `{ "message": "User approved successfully.", "user": { ... updated user ... } }`
- **Errors:** `400` missing userId, `401`/`403`, `500`.

### 6.3 Approve business

- **Method:** `POST`
- **URL:** `{baseUrl}/admin/approve-business`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
```json
{
  "userId": "<uuid>",
  "businessId": "<uuid>"
}
```
- **Validation:** Both `userId` and `businessId` required.
- **Success:** `200`  
  `{ "message": "Business approved successfully.", "business": { ... updated business ... } }`
- **Errors:** `400` missing ids, `401`/`403`, `500`.

**UI:** From pending list, “Approve” button can call approve-business with that item’s `userId` and `business.businessId`. Optionally a separate “Approve user” flow using approve with `userId` and optional `trialDays`.

---

## 7. Expired trial users

Users whose trial has ended (no active package) cannot create invoices/quotations until they purchase a package. This endpoint lists them for follow-up (e.g. email, upsell).

### 7.1 List expired-trial users

- **Method:** `GET`
- **URL:** `{baseUrl}/admin/users/expired-trial`
- **Query (optional):**  
  - `limit` – number, 1–100, default 50.  
  - `nextToken` – string, for next page (returned by previous response).
- **Headers:** `Authorization: Bearer <token>`
- **Success:** `200`  
```json
{
  "users": [
    {
      "userId": "<uuid>",
      "name": "User Name",
      "email": "user@example.com",
      "trialStartDate": "2025-01-01T00:00:00.000Z",
      "trialEndDate": "2025-01-15T00:00:00.000Z",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "nextToken": "<opaque-string-or-null>"
}
```
- **Pagination:** If `nextToken` is present, pass it as query param `nextToken` to get the next page.
- **Errors:** `401`/`403`, `500`.

**UI:** “Expired trials” table with columns: name, email, trial end date, etc. “Load more” or next page using `nextToken`.

---

## 8. Summary of Admin API Endpoints

| Purpose              | Method | Path                              | Auth   |
|----------------------|--------|-----------------------------------|--------|
| Register admin       | POST   | `/admin/auth/register`            | No     |
| Admin login          | POST   | `/admin/auth/login`               | No     |
| Get trial days       | GET    | `/admin/settings/trial-days`      | Bearer |
| Set trial days       | PUT    | `/admin/settings/trial-days`      | Bearer |
| List packages        | GET    | `/admin/packages`                 | Bearer |
| Create package       | POST   | `/admin/packages`                 | Bearer |
| Update package       | PUT    | `/admin/packages/:packageId`      | Bearer |
| Pending reviews      | GET    | `/admin/pending`                  | Bearer |
| Approve user         | POST   | `/admin/approve`                  | Bearer |
| Approve business     | POST   | `/admin/approve-business`         | Bearer |
| Expired trial users  | GET    | `/admin/users/expired-trial`      | Bearer |

All Bearer routes require the JWT from admin login and a user with role `ADMIN`.

---

## 9. Suggested Admin UI Structure

1. **Login** – Email + password → call `/admin/auth/login` → store token and redirect to dashboard.
2. **Dashboard** – Optional: summary counts (e.g. pending reviews, expired trials) by calling the relevant GETs.
3. **Settings** – Single screen: get/put trial days.
4. **Packages** – List (GET), Add (POST), Edit (PUT); show name, price, limits, validity, active flag.
5. **Pending reviews** – List (GET), Approve business (POST approve-business), optionally Approve user (POST approve).
6. **Expired trials** – List (GET with limit/nextToken), use for CRM/emails; no action required by API.

---

## 10. Error handling

- **401 Unauthorized:** Missing or invalid/expired token → redirect to login.
- **403 Forbidden:** User is not admin → show “Access denied”.
- **400 Bad Request:** Show `error` or `details` from body (e.g. validation message).
- **404 Not Found:** e.g. package not found when editing.
- **500 Internal Server Error:** Show generic message; log if needed.

Response bodies often look like:  
`{ "error": "Message" }` or `{ "code": "VALIDATION_FAILED", "error": "...", "details": [...] }`.

---

## 11. Prompt you can share with your developer

Copy the following as a single prompt for building the admin panel:

---

**Build an admin panel for a GST Billing Backend with the following:**

- **Auth:** Login page calling `POST /admin/auth/login` with `{ "email", "password" }`. Use the returned `token` as `Authorization: Bearer <token>` for all other requests. Optionally support one-time `POST /admin/auth/register` for creating the first admin.
- **Settings:** One screen to get and update global trial days: `GET /admin/settings/trial-days` and `PUT /admin/settings/trial-days` with body `{ "trialDays": number }`.
- **Packages:** List (`GET /admin/packages`), create (`POST /admin/packages` with name, price, invoiceLimit, quotationLimit, validityDays, isActive), edit (`PUT /admin/packages/:packageId` with same fields optional). Display name, price, limits, validity, active; allow create/edit and toggle active.
- **Pending reviews:** List pending businesses with `GET /admin/pending` (returns array of `{ business, user }`). Each item has an “Approve” action that calls `POST /admin/approve-business` with `{ "userId", "businessId" }` from that item.
- **Expired trials:** List users with expired trial via `GET /admin/users/expired-trial?limit=50`, with optional `nextToken` for next page. Display userId, name, email, trialEndDate (and optionally trialStartDate, createdAt).
- **Errors:** On 401, redirect to login; on 403 show “Admins only”; on 4xx show API `error` message; on 500 show a generic error.
- **Base URL:** Make the API base URL configurable (env or config) so it can point to dev/staging/production.

All request bodies are JSON; all protected routes need header `Authorization: Bearer <token>`.

---

You can share **this file** (`ADMIN_PANEL_PROMPT.md`) or the **Section 11 prompt** with your frontend/contractor so they have everything needed to implement the admin panel.
