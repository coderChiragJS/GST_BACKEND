
# Flutter Integration Guide: Cash & Bank Accounts

## Overview

This document explains how a Flutter developer should integrate the **Cash & Bank Accounts** module with the existing backend.

- Backend base URL:

```text
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
```

- All requests require:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

`businessId` is the currently selected business (for example: `7bfe9626-9f6d-4917-8e87-c0f8b789ea50`).

This module is **additive**. No existing APIs or flows have been changed.

---

## 1. Data Shapes

### 1.1 Account object

Returned by multiple endpoints:

```json
{
  "accountId": "e828633c-...",
  "name": "Cash",
  "type": "cash",             // "cash" or "bank"
  "closingBalance": 8000,
  "openingBalance": 0,
  "isDefault": true,
  "businessId": "7bfe9...",
  "userId": "3c04ad32-...",
  "bankDetails": null
}
```

### 1.2 Account transaction object

Returned by the account ledger endpoint:

```json
{
  "txnId": "cf5689b8-...",
  "type": "contra",           // "add" | "withdraw" | "contra" | "receipt" | "tds" | ...
  "direction": "in",          // "in" (credit) or "out" (debit)
  "amount": 2000,
  "balanceAfter": 2000,
  "referenceType": "CONTRA",  // e.g. "RECEIPT", "TDS_VOUCHER"
  "referenceId": null,
  "referenceNumber": null,
  "narration": "Cash to bank",
  "createdAt": "2026-03-06T09:49:52.047Z"
}
```

---

## 2. Cash & Bank Home Screen

This corresponds to the “Cash and Bank Accounts” screen in the reference app.

### 2.1 API – List accounts and balances

```http
GET /business/:businessId/accounts
```

**Response**

```json
{
  "cashBalance": 8000,
  "bankBalance": 2000,
  "accounts": [
    {
      "accountId": "e828633c-...",
      "name": "Cash",
      "type": "cash",
      "closingBalance": 8000,
      "openingBalance": 0,
      "isDefault": true
    },
    {
      "accountId": "0124e96b-...",
      "name": "HDFC Current A/C",
      "type": "bank",
      "closingBalance": 2000,
      "openingBalance": 0,
      "isDefault": false
    }
  ]
}
```

**UI mapping**

- Top cards:
  - **Cash Balance** → `cashBalance`
  - **Bank Balance** → `bankBalance`
- **All Accounts** list:
  - Name: `name`
  - Type: show an icon/label for `cash` vs `bank`
  - Closing balance: `closingBalance`
- Filters:
  - Both → all accounts
  - Bank → `account.type == 'bank'`
  - Cash → `account.type == 'cash'`

If there is no `Cash` account initially, call the **Create Account** endpoint once (see below) to create it.

---

## 3. Add / Edit Accounts

### 3.1 Create account (Add Account button)

```http
POST /business/:businessId/accounts
```

**Request body**

```json
{
  "name": "HDFC Current A/C",
  "type": "bank",           // "cash" or "bank"
  "openingBalance": 0       // optional
}
```

**Response**

```json
{
  "account": {
    "accountId": "0124e96b-...",
    "name": "HDFC Current A/C",
    "type": "bank",
    "openingBalance": 0,
    "closingBalance": 0,
    "isDefault": false
  }
}
```

**Flutter flow**

1. Show a form with:
   - `name` (required)
   - `type` (radio: Cash / Bank)
2. On success, refetch `GET /accounts` and update the screen.

> Note: There is currently no separate “update account” endpoint. If needed later, we can add it, but it is not required for initial integration.

---

## 4. Money Actions (bottom buttons)

The reference UI shows four bottom actions: `Add Money`, `Withdraw Money`, `Contra Entry`, `Add Account`. The backend exposes 3 APIs for money; “Add Account” uses the create endpoint from section 3.

### 4.1 Add Money

```http
POST /business/:businessId/accounts/:accountId/add-money
```

**Body**

```json
{
  "amount": 10000,
  "narration": "Opening cash"
}
```

**Response**

```json
{
  "account": {
    "accountId": "e828633c-...",
    "name": "Cash",
    "type": "cash",
    "closingBalance": 10000,
    "openingBalance": 0
  }
}
```

**UI behaviour**

- User selects an account card or row, then taps **Add Money**.
- Show a modal/bottom sheet with:
  - Amount (required, > 0)
  - Narration (optional)
- After success, update balances:
  - Easiest: refetch `GET /accounts`.

### 4.2 Withdraw Money

```http
POST /business/:businessId/accounts/:accountId/withdraw
```

**Body**

```json
{
  "amount": 500,
  "narration": "Paid office rent"
}
```

**Response**

Same as `add-money` but with a lower `closingBalance`.

**Error codes**

- `400 { "code": "INVALID_AMOUNT", "message": "Amount must be greater than zero" }`
- `400 { "code": "ACCOUNT_NOT_FOUND" }`
- `400 { "code": "INSUFFICIENT_BALANCE", "message": "Insufficient balance" }` – withdraw amount exceeds current account balance. Show a clear message (e.g. “Insufficient balance in this account”) and do not allow the operation.

Handle these with a simple error snackbar/dialog.

### 4.3 Contra Entry (Bank/Cash Transfer)

```http
POST /business/:businessId/accounts/contra
```

**Body**

```json
{
  "fromAccountId": "e828633c-...",   // required, must be different to toAccountId
  "toAccountId": "0124e96b-...",
  "amount": 2000,
  "narration": "Cash to bank"
}
```

**Response**

```json
{
  "from": {
    "accountId": "e828633c-...",
    "closingBalance": 8000,
    "name": "Cash",
    "type": "cash"
  },
  "to": {
    "accountId": "0124e96b-...",
    "closingBalance": 2000,
    "name": "HDFC Current A/C",
    "type": "bank"
  }
}
```

**Error codes**

- `INVALID_CONTRA` – missing accounts or `fromAccountId == toAccountId`.
- `INVALID_AMOUNT` – `amount <= 0`.
- `ACCOUNT_NOT_FOUND` – one of the accounts does not exist.
- `INSUFFICIENT_BALANCE` – source account balance is less than the transfer amount. Show a message like “Source account has insufficient balance” and do not complete the transfer.

**UI behaviour**

- Show a dialog or bottom sheet with:
  - From Account (dropdown of accounts)
  - To Account (dropdown, excluding the selected “from”)
  - Amount, Narration.
- After success, refresh `GET /accounts`.

---

## 5. Account Detail Screen (Ledger)

For each account row, you can navigate to a detail screen listing its transactions (similar to your existing transaction lists).

### 5.1 API – get ledger for an account

```http
GET /business/:businessId/accounts/:accountId/transactions?limit=50&nextToken=<optional>
```

**Response**

```json
{
  "account": {
    "accountId": "0124e96b-...",
    "name": "HDFC Current A/C",
    "type": "bank",
    "closingBalance": 2000
  },
  "transactions": [
    {
      "txnId": "cf5689b8-...",
      "type": "contra",
      "direction": "in",
      "amount": 2000,
      "balanceAfter": 2000,
      "referenceType": "CONTRA",
      "referenceId": null,
      "referenceNumber": null,
      "narration": "Cash to bank",
      "createdAt": "2026-03-06T09:49:52.047Z"
    }
  ],
  "nextToken": null
}
```

**UI behaviour**

- Show `account.name` as the title.
- For each transaction:
  - Description: use `narration` or fallback to a label based on `type`:
    - `add` → “Add Money”
    - `withdraw` → “Withdraw Money”
    - `contra` → “Contra Entry”
    - `receipt` → “Payment Receipt”
    - `tds` → “TDS Voucher”
  - Amount:
    - If `direction == 'in'` → show as **Credit** (green).
    - If `direction == 'out'` → show as **Debit** (red).
  - Date: parse `createdAt`.
- For pagination:
  - If `nextToken` is not `null`, call the same endpoint with `?nextToken=<value>` to load the next page.
  - If the backend returns `400 { "code": "INVALID_NEXT_TOKEN" }` (e.g. corrupted or expired token), clear the stored nextToken and reload the first page.

---

## 6. Interaction With Existing Modules

### 6.1 Payment Receipts

The backend already has `accountId` and `accountName` fields in the receipt schema. After the recent changes:

- On **create**, if a receipt is successfully created, the backend **credits** the chosen account (or will default to Cash in future iterations).
- On **delete**, the backend attempts to **debit** the same amount from that account.

**Action for Flutter**

- On the Payment Receipt create/edit screen:
  - Add a dropdown to select an account.
  - Populate it from `GET /business/:businessId/accounts`.

**Request body keys (unchanged, already present):**

```json
{
  "accountId": "0124e96b-...",
  "accountName": "HDFC Current A/C",
  ...
}
```

If you don’t send `accountId`, the backend will eventually use the default Cash account by convention (depending on configuration).

### 6.2 TDS Vouchers

When a TDS voucher is created or deleted, the backend **best-effort** adjusts the default account using:

- `withdrawMoney` on create (TDS outflow).
- `addMoney` on delete (reversal).

No required UI changes at this point; you can keep the TDS flow as-is.

---

## 7. Notes and Limitations

- No existing endpoints or response formats were changed; this module is strictly additive.
- Current implementation assumes:
  - One default **Cash** account per business (you create it via `POST /accounts`).
  - Bank accounts are user-defined.
- Integration from Receipts/TDS to Accounts is **one-way** (backend updates balances on document create/delete). Editing existing receipts/vouchers will not currently rebalance historical account movements; this can be improved later if needed.

---

## 8. Flutter Checklist

1. **Home tile**
   - Add a “Cash & Bank Accounts” tile on the dashboard, navigate to Cash & Bank screen.

2. **Cash & Bank Accounts screen**
   - On load: call `GET /business/:businessId/accounts`.
   - Show:
     - Cash Balance (top card).
     - Bank Balance (top card).
     - All Accounts list with filter (Both / Bank / Cash).

3. **Add Account**
   - Use `POST /business/:businessId/accounts`.
   - After success: refresh list.

4. **Add Money / Withdraw Money**
   - Use `POST /accounts/:accountId/add-money` and `POST /accounts/:accountId/withdraw`.
   - Reuse your existing bottom-bar style and button colors.

5. **Contra Entry**
   - Use `POST /accounts/contra`.
   - Validate from/to are different before sending request.

6. **Account Detail**
   - Navigate to `GET /accounts/:accountId/transactions`.
   - Display transactions with credit/debit styling, support pagination via `nextToken`.

7. **Payment Receipt screen**
   - Fetch accounts and allow picking an account for each receipt.
   - Send `accountId` and `accountName` in the body; backend will connect it to Cash/Bank accounts.

