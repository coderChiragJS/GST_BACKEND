# Flutter Guide: Subscription / Trial Access for All Create Forms

## 1. Overview

The backend enforces **one central rule** for all create forms:

> A user can create new records **only if**:
> - Their **trial is still active**, **or**
> - They have an **active subscription** for the business with remaining **usage limits** (for usage-limited packages) or an **active time window** (for time-based or lifetime packages).

If this rule is not satisfied, all guarded create APIs will respond with **HTTP 403** and an error message.

Read-only and update operations remain available so users can still view/edit data and purchase packages.

Base URL:

```text
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
```

---

## 2. Backend behaviour

### 2.1 Package types (for reference)

Each package has:

- `packageType`:
  - `usage_limited` – limited invoices/quotations, no time expiry.
  - `time_unlimited` – unlimited invoices/quotations, expires by `billingPeriod`.
  - `lifetime` – unlimited invoices/quotations, no expiry.
- `billingPeriod`:
  - `monthly` or `yearly` (used only when `packageType == "time_unlimited"`).

Subscriptions store these fields and also:

- `startDate`
- `endDate`:
  - `null` for `usage_limited` and `lifetime`.
  - For `time_unlimited`: computed from `billingPeriod` (start + 1 month/year).

### 2.2 Guarded create APIs (blocked when not allowed)

These POST endpoints are protected by the `canCreateDocument` gate.

**Business & Parties**

- `POST /business` – Create Business  
- `POST /parties` – Create Party  

**Products & Inventory**

- `POST /business/:businessId/products` – Create Product  
- `POST /business/:businessId/products/:productId/stock` – Stock Adjustment  

**Cash & Bank**

- `POST /business/:businessId/accounts` – Create Cash/Bank Account  
- `POST /business/:businessId/accounts/:accountId/add-money` – Add Money  
- `POST /business/:businessId/accounts/:accountId/withdraw` – Withdraw Money  
- `POST /business/:businessId/accounts/contra` – Contra Entry  

**Invoices & Quotations**

- `POST /business/:businessId/invoices` – Create Invoice  
- `POST /business/:businessId/quotations` – Create Quotation  

**Other documents**

- `POST /business/:businessId/sales-debit-notes` – Create Sales Debit Note  
- `POST /business/:businessId/credit-notes` – Create Credit Note  
- `POST /business/:businessId/delivery-challans` – Create Delivery Challan  
- `POST /business/:businessId/receipts` – Create Payment Receipt  
- `POST /business/:businessId/tds-vouchers` – Create TDS Voucher  

When access is denied, typical responses:

```json
HTTP 403
{
  "error": "Your trial has expired and you have no active package. Purchase a package to create invoices and quotations."
}
```

or

```json
HTTP 403
{
  "error": "Your package limits are exhausted. Purchase a package to create more invoices and quotations."
}
```

### 2.3 Endpoints that are NOT blocked

Always allowed (subscription gate does not apply):

- **Auth & profile**
  - `/auth/*` – login/register/forgot/reset
  - `GET /user/profile`, `PUT /user/profile`
- **Admin & packages**
  - `/admin/*`
  - `POST /user/subscriptions` – purchase package
  - `POST /payments/phonepe/create`, `POST /payments/phonepe/callback`
- **Read / update / delete**
  - All `GET` routes
  - All `PUT` routes
  - All `DELETE` routes
  - PDF routes (`.../pdf`, `.../statement-pdf`, `.../packing-slip-pdf`)
  - Reports and ledgers:
    - `GET /business/:businessId/reports/:reportType`
    - `POST /business/:businessId/reports/:reportType/pdf`
    - `GET /business/:businessId/ledger/summary`
    - `GET /business/:businessId/parties/:partyId/ledger`
    - `POST /business/:businessId/parties/:partyId/ledger-pdf`
- **Other**
  - `POST /upload`
  - `GET /invoice-templates`
  - `GET /health`

---

## 3. Access-check API for Flutter

Use this endpoint to know if the user can create **any** guarded document:

```http
GET /user/document-access
Authorization: Bearer <token>
```

### 3.1 Response shape

Examples:

**Usage-limited package (current behaviour):**

```json
{
  "canCreateDocuments": true,
  "onTrial": false,
  "trialEndDate": "2026-02-27T18:03:57.954Z",
  "hasActiveSubscription": true,
  "remainingInvoices": 24,
  "remainingQuotations": 50,
  "subscription": {
    "subscriptionId": "09e92509-e038-421e-a5aa-558b2614808f",
    "packageId": "c8494251-8083-41a1-b5b8-52a1dd1767f8",
    "packageName": "gold",
    "packageType": "usage_limited",
    "billingPeriod": null,
    "invoiceLimit": 25,
    "quotationLimit": 50,
    "invoicesUsed": 1,
    "quotationsUsed": 0,
    "startDate": "2026-03-05T09:49:30.026Z",
    "endDate": null
  },
  "message": null
}
```

**Time-unlimited or lifetime (conceptual example):**

```json
{
  "canCreateDocuments": true,
  "onTrial": false,
  "trialEndDate": "2026-02-27T18:03:57.954Z",
  "hasActiveSubscription": true,
  "remainingInvoices": null,
  "remainingQuotations": null,
  "subscription": {
    "subscriptionId": "...",
    "packageId": "...",
    "packageName": "Gold Yearly Unlimited",
    "packageType": "time_unlimited",
    "billingPeriod": "yearly",
    "invoiceLimit": 0,
    "quotationLimit": 0,
    "invoicesUsed": 0,
    "quotationsUsed": 0,
    "startDate": "2026-04-01T00:00:00.000Z",
    "endDate": "2027-04-01T00:00:00.000Z"
  },
  "message": null
}
```

**Blocked – trial expired and no subscription:**

```json
{
  "canCreateDocuments": false,
  "onTrial": false,
  "trialEndDate": "2026-03-01T00:00:00.000Z",
  "hasActiveSubscription": false,
  "remainingInvoices": 0,
  "remainingQuotations": 0,
  "subscription": null,
  "message": "Your trial has expired and you have no active package. Purchase a package to create invoices and quotations."
}
```

Field meanings:

- `canCreateDocuments`: `true` → all guarded create forms are allowed.
- `onTrial`: `true` when still in trial period.
- `remainingInvoices` / `remainingQuotations`:
  - Number for `usage_limited`.
  - `null` for `time_unlimited` and `lifetime`.
- `subscription.packageType` / `subscription.billingPeriod`:
  - Used to show the current plan (limited vs monthly/yearly unlimited vs lifetime).
- `message`: user-facing explanation when access is blocked.

---

## 4. Flutter implementation guidelines

### 4.1 Load access state

- On app start and when the user switches business:

  1. Call `GET /user/document-access`.
  2. Store:
     - `canCreateDocuments`
     - `message`
     - `subscription.packageType`, `subscription.billingPeriod`, `subscription.endDate`

- If the call fails (network error), fall back to normal UI but still handle 403 responses on submit.

### 4.2 Home/dashboard

When `canCreateDocuments == false`:

- **Disable or hide all create actions**:
  - Create Invoice / Quotation
  - Create Receipt / Credit Note / Debit Note / Delivery Challan / TDS Voucher
  - Add Party / Add Product
  - Cash & Bank: Add Account / Add Money / Withdraw / Contra
  - Create Business (if exposed)

- Show a subscription banner:
  - Title: e.g. “Subscription required to create records”
  - Body: use `message` from `/user/document-access`
  - Action: button to open the subscription/packages screen.

### 4.3 Create screens (all guarded forms)

Even if navigation is disabled, always handle HTTP 403 on submit:

- For any guarded POST request:
  - If `statusCode == 403`:
    - Read `error` from response body.
    - Show dialog/snackbar with this text.
    - Optionally navigate to the subscription screen.

Pseudo-code:

```dart
try {
  final response = await api.createInvoice(payload);
  // success flow
} on ApiException catch (e) {
  if (e.statusCode == 403) {
    showError(e.error ?? 'You cannot create documents. Please purchase a package.');
    // optionally navigate to subscription page
  } else {
    showError('Something went wrong. Please try again.');
  }
}
```

### 4.4 Screen checklist

- **Business & Party**
  - Disable “Create Business” / “Add Party” when `canCreateDocuments == false`.

- **Products & Inventory**
  - Disable “Add Product” and “Adjust Stock” actions when `canCreateDocuments == false`.

- **Cash & Bank**
  - Disable:
    - Add Account
    - Add Money
    - Withdraw
    - Contra Entry
  - Keep account and ledger views enabled.

- **All document create screens**
  - Invoice, Quotation, Sales Debit Note, Credit Note, Delivery Challan
  - Payment Receipt, TDS Voucher
  - Guard navigation using `canCreateDocuments`.
  - Always handle 403 on submit.

- **Reports, Ledgers, PDFs**
  - No change; they remain accessible regardless of subscription state.

---

## 5. Displaying package information in the app

Use:

- `GET /packages` to list available packages (show `name`, `price`, `packageType`, `billingPeriod`, `invoiceLimit`, `quotationLimit`).
- `GET /user/subscription` to show the current subscription:
  - `packageType`, `billingPeriod`
  - For `usage_limited`: show remaining invoice/quotation counts.
  - For `time_unlimited`: show expiry date (`endDate`) and “unlimited invoices/quotations”.
  - For `lifetime`: show “lifetime” with unlimited usage.

---

## 6. Summary

- Backend supports **three package types**:
  - `usage_limited` (limited invoices/quotations).
  - `time_unlimited` (monthly/yearly unlimited, time-bound).
  - `lifetime` (unlimited, never expires).
- All create forms are gated by a single rule, exposed via `GET /user/document-access` (`canCreateDocuments`).
- Flutter should:
  - Use `canCreateDocuments` to enable/disable any create button.
  - Use `/packages` and `/user/subscription` to display plan details.
  - Always handle 403 errors from guarded create APIs and route the user to subscription flows when necessary.

