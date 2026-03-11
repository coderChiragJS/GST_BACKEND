# Admin Panel Guide: Packages & Subscriptions

This document is for the **React admin panel**. It explains what fields you need on the package screens, how to map them to the backend, and what behaviour to expect. You don’t need to think about backend internals – just follow these rules.

---

## 1. What is a package?

In the admin panel, a **package** is a plan you sell to users. Each package defines:

- How much the user pays.
- Whether usage is **limited** by number of invoices/quotations, or **unlimited** for a time period / lifetime.
- Whether the package is currently available for purchase.

When a user buys a package for a business, the system creates a **subscription** for that business. All “Create” actions (invoice, quotation, receipt, party, product, cash/bank actions, etc.) depend on:

- The user’s **trial** status, and
- Whether they have an **active subscription** for the selected business.

---

## 2. Package types (what the admin should see)

In the React admin UI, show **Package Type** as a dropdown with these options:

- **Usage limited**
- **Monthly unlimited**
- **Yearly unlimited**
- **Lifetime**

Meaning in simple words:

- **Usage limited**:  
  User gets a fixed number of invoices and quotations. There is **no time limit**; access ends only when counts are used.

- **Monthly unlimited**:  
  User gets **unlimited** invoices and quotations for about **1 month** from purchase.

- **Yearly unlimited**:  
  User gets **unlimited** invoices and quotations for about **1 year** from purchase.

- **Lifetime**:  
  User gets **unlimited** invoices and quotations **forever** (no time expiry).

---

## 3. Fields on the Create / Edit Package form

For each package, the admin panel should expose these fields:

- **Name**  
  - Text input, required.  
  - Example: `Silver`, `Gold Yearly Unlimited`, `Lifetime Unlimited`.

- **Price**  
  - Number input, required.  
  - Example: `499`, `10000`, `0` (for free plans).

- **Package Type**  
  - Dropdown with options:
    - `Usage limited`
    - `Monthly unlimited`
    - `Yearly unlimited`
    - `Lifetime`

- **Invoice limit**  
  - Number input.  
  - **Required only for Usage limited.**

- **Quotation limit**  
  - Number input.  
  - **Required only for Usage limited.**

- **Active**  
  - Checkbox:
    - Checked → package is visible and can be purchased.
    - Unchecked → package is not shown to users (existing subscriptions are not affected).

You do **not** need to show internal fields like `packageType`/`billingPeriod` to the admin – just map the UI values correctly when calling the backend.

---

## 4. How to map the form to backend fields

When you send data to the backend (`/admin/packages`), map the fields like this:

### 4.1 Package type mapping

- **Usage limited**
  - `packageType = "usage_limited"`
  - `billingPeriod = null`

- **Monthly unlimited**
  - `packageType = "time_unlimited"`
  - `billingPeriod = "monthly"`

- **Yearly unlimited**
  - `packageType = "time_unlimited"`
  - `billingPeriod = "yearly"`

- **Lifetime**
  - `packageType = "lifetime"`
  - `billingPeriod = null`

### 4.2 Limits mapping

- For **Usage limited**:
  - `invoiceLimit` = value from the form (e.g. `100`)
  - `quotationLimit` = value from the form (e.g. `50`)

- For **Monthly/Yearly unlimited** and **Lifetime**:
  - `invoiceLimit` and `quotationLimit` must still be numbers (for compatibility), but are **not** used to block access.
  - You can:
    - Either keep the UI inputs and pass whatever the admin enters (commonly `0`), or
    - Auto-fill `invoiceLimit = 0`, `quotationLimit = 0` in your code.

### 4.3 Active flag

- Checkbox → `isActive`:
  - Checked → `isActive = true`
  - Unchecked → `isActive = false`

Only `isActive = true` packages are returned by the user-facing `/packages` API.

---

## 5. Validation rules (React form)

Apply these simple validations in the admin panel:

- **Name**
  - Required, non-empty string.

- **Price**
  - Required, number ≥ 0.

- **Package Type**
  - Required, one of the 4 options above.

- **Invoice limit & Quotation limit**
  - If **Usage limited**:
    - Both required.
    - Integers ≥ 0.
  - If **Monthly unlimited**, **Yearly unlimited**, or **Lifetime**:
    - You can allow them to be optional or auto-fill with `0`.

No other fields are required for the admin panel – the backend handles subscription dates and usage counters automatically.

---

## 6. Examples (for admin reference)

These are examples of what the admin might enter in the form and what will be sent to the backend.

### 6.1 Usage-limited package

- Name: `Silver`  
- Price: `499`  
- Type: `Usage limited`  
- Invoice limit: `100`  
- Quotation limit: `50`  
- Active: checked  

Backend payload (simplified):

```json
{
  "name": "Silver",
  "price": 499,
  "invoiceLimit": 100,
  "quotationLimit": 50,
  "packageType": "usage_limited",
  "billingPeriod": null,
  "isActive": true
}
```

### 6.2 Yearly unlimited package

- Name: `Gold Yearly Unlimited`  
- Price: `10000`  
- Type: `Yearly unlimited`  
- Invoice limit: `0` (or any number – ignored)  
- Quotation limit: `0` (ignored)  
- Active: checked  

Backend payload:

```json
{
  "name": "Gold Yearly Unlimited",
  "price": 10000,
  "invoiceLimit": 0,
  "quotationLimit": 0,
  "packageType": "time_unlimited",
  "billingPeriod": "yearly",
  "isActive": true
}
```

### 6.3 Lifetime unlimited package

- Name: `Lifetime Unlimited`  
- Price: `25000`  
- Type: `Lifetime`  
- Invoice limit: `0`  
- Quotation limit: `0`  
- Active: checked  

Backend payload:

```json
{
  "name": "Lifetime Unlimited",
  "price": 25000,
  "invoiceLimit": 0,
  "quotationLimit": 0,
  "packageType": "lifetime",
  "billingPeriod": null,
  "isActive": true
}
```

---

## 7. What happens after purchase (for understanding only)

You don’t need to code this in the admin panel, but it explains behaviour that you might see in reports:

- When a user buys a package:
  - The backend creates a **subscription** with:
    - Package type and billing period as configured above.
    - For **Monthly/Yearly unlimited**: an `endDate` about 1 month / 1 year after purchase.
    - For **Usage limited** and **Lifetime**: no time-based expiry (`endDate` is `null` for Lifetime; usage counts are ignored for unlimited).

- If the user already has an active **Usage limited** subscription for that business, and buys another **Usage limited** package:
  - Limits are **added** on top of the existing ones (cumulative).

- If they buy a different type (e.g. from limited to yearly unlimited):
  - A **new** subscription is created with the new rules.

The frontend (web/mobile) uses a separate endpoint (`/user/document-access`) to decide whether the user can still create documents. As admin, you only need to ensure packages are configured correctly using this guide.

---

## 8. Quick checklist for the React admin panel

- **Create / Edit Package screen**
  - Fields: Name, Price, Type, Invoice Limit, Quotation Limit, Active.
  - Map Type → `packageType`/`billingPeriod` as described.
  - Apply the simple validation rules above.

- **Package list screen**
  - Show:
    - Name
    - Price
    - Type (render from `packageType` + `billingPeriod` into human text)
    - Active (Yes/No)

Following this document will keep the admin panel simple while matching the backend subscription and access logic exactly.

