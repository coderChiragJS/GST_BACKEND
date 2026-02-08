# Flutter – Package & Trial: App-Side Changes

**For the Flutter developer.** The backend now has a **trial + package** system. This doc describes what changed and what you need to do on the app side.

---

## 1. What changed on the backend

- **Trial:** On signup, every user gets a free trial. Trial length is set globally by admin (e.g. 14 days). You don’t call any extra API for “starting” trial; it’s automatic at register.
- **Restriction:** Creating an **invoice** and creating a **quotation** are allowed only if:
  - the user is still on **active trial** (today ≤ trial end date), **or**
  - the user has an **active package** with remaining usage (invoices and/or quotations left).
- **Packages:** Admin creates packages (e.g. “Starter”: 100 invoices + 100 quotations). Users can **list packages**, **purchase** one, and **see their current subscription and remaining usage**.

So on the app you must:

1. **Handle 403** when create invoice or create quotation is not allowed, and show an “upgrade / buy package” flow.
2. **Use 3 new APIs:** list packages, purchase package, get my subscription/usage.
3. **Optionally** show trial/subscription status (trial end date or remaining counts) using “get my subscription”.

---

## 2. New APIs (same base URL + auth)

Use the same **base URL** and **`Authorization: Bearer <token>`** as the rest of the app.

### 2.1 List packages (for purchase)

- **Method:** `GET`
- **URL:** `{baseUrl}/packages`
- **Headers:** `Authorization: Bearer <token>`
- **Success (200):**
```json
{
  "packages": [
    {
      "packageId": "<uuid>",
      "name": "Starter",
      "price": 999,
      "invoiceLimit": 100,
      "quotationLimit": 100,
      "validityDays": 365,
      "isActive": true
    }
  ]
}
```
- Only **active** packages are returned. Use this on a “Plans” or “Upgrade” screen.

### 2.2 Purchase a package

- **Method:** `POST`
- **URL:** `{baseUrl}/user/subscriptions`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
```json
{
  "packageId": "<uuid-from-list-packages>"
}
```
- **Success (201):**
```json
{
  "subscription": {
    "subscriptionId": "<uuid>",
    "packageId": "<uuid>",
    "packageName": "Starter",
    "invoiceLimit": 100,
    "quotationLimit": 100,
    "invoicesUsed": 0,
    "quotationsUsed": 0,
    "startDate": "2025-02-01T00:00:00.000Z",
    "endDate": "2026-02-01T00:00:00.000Z",
    "createdAt": "..."
  }
}
```
- **Errors:** `400` if `packageId` missing; `404` if package not found or inactive; `401` if not logged in.

**Note:** Payment can be offline or integrated later; the backend only records the subscription. Your UI can show “Purchase” and then call this API (e.g. after payment confirmation or “Confirm purchase”).

### 2.3 Get my subscription / usage

- **Method:** `GET`
- **URL:** `{baseUrl}/user/subscription`
- **Headers:** `Authorization: Bearer <token>`
- **Success (200):**

When user has **no** active subscription (and may be on trial or expired):

```json
{
  "hasActiveSubscription": false,
  "subscription": null,
  "remainingInvoices": 0,
  "remainingQuotations": 0
}
```

When user **has** an active package:

```json
{
  "hasActiveSubscription": true,
  "subscription": {
    "subscriptionId": "<uuid>",
    "packageId": "<uuid>",
    "packageName": "Starter",
    "invoiceLimit": 100,
    "quotationLimit": 100,
    "invoicesUsed": 10,
    "quotationsUsed": 5,
    "startDate": "...",
    "endDate": "..."
  },
  "remainingInvoices": 90,
  "remainingQuotations": 95
}
```

- **Use this to:** Show “X invoices left, Y quotations left” or “Trial ends on …” (trial is when `hasActiveSubscription` is false and user is still within trial – you can get trial end date from login/user profile if you store it, or add a separate “me” endpoint later). For now you can show “Upgrade” when `hasActiveSubscription` is false and you get 403 on create.

---

## 3. Behavior change: Create Invoice & Create Quotation can return 403

- **Before:** `POST /business/<businessId>/invoices` and `POST /business/<businessId>/quotations` could return 400 (validation) or 201 (success).
- **Now:** They can also return **403 Forbidden** when the user has no active trial and no active package with remaining usage.

**403 response body:**

```json
{
  "error": "No active trial or package. Please purchase a package to create invoices/quotations."
}
```

**What to do in the app:**

1. When you get **403** on **create invoice** or **create quotation**, don’t treat it as a generic “forbidden” only.
2. Show a clear message, e.g.:  
   **“You’ve reached the limit of your trial”** or **“No active trial or package. Please purchase a package to create invoices/quotations.”**
3. Offer a way to open the **Packages / Upgrade** screen (e.g. button “View plans” or “Buy package” that navigates to the screen where you list packages and allow purchase).

So in your HTTP client or repository layer:

- On **403** for `POST .../invoices` or `POST .../quotations`, read `body.error` and show it (or the short message above) and navigate to Packages/Upgrade when the user taps “View plans”.

---

## 4. Suggested app-side changes (checklist)

| # | Change | Details |
|---|--------|--------|
| 1 | **Handle 403 on create** | For `POST .../invoices` and `POST .../quotations`, if response is 403, show message and a “View plans” / “Upgrade” action that opens the packages screen. |
| 2 | **Packages / Upgrade screen** | New screen that calls `GET /packages`, shows list of plans (name, price, invoice limit, quotation limit, validity). Each plan has a “Buy” / “Purchase” button. |
| 3 | **Purchase flow** | On “Purchase” for a package, call `POST /user/subscriptions` with `{ "packageId": "<id>" }`. On success, show success message and go back or to home; optionally refresh “my subscription” so remaining counts are updated. |
| 4 | **My subscription / usage** | Call `GET /user/subscription` (e.g. after login or on profile/settings). Show: “X invoices left, Y quotations left” when `hasActiveSubscription` is true; when false, show “Trial” or “No active package” and a link/button to “View plans”. |
| 5 | **Optional: trial end date** | If your login or user response includes `trialEndDate`, you can show “Trial ends on &lt;date>” and, when past that date, encourage upgrade when they hit 403. |

---

## 5. Summary for Flutter

- **New endpoints:**  
  - `GET /packages` → list plans  
  - `POST /user/subscriptions` with `{ "packageId" }` → purchase  
  - `GET /user/subscription` → my subscription and remaining invoices/quotations  
- **New behavior:** Create invoice and create quotation can return **403** with message *“No active trial or package. Please purchase a package to create invoices/quotations.”* → show that message and a way to open the packages/upgrade screen.  
- **New UI:** Packages/Upgrade screen (list + purchase), and optionally a place to show subscription status and remaining usage (e.g. profile or dashboard).

Use this file together with **FLUTTER_API_INSTRUCTIONS.md** (invoices, auth, GST) and **FLUTTER_QUOTATION_COMPLETE_GUIDE.md** (quotations). No other backend doc is required for these app-side changes.
