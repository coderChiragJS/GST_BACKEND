# Cash & Bank Accounts — Frontend Update (Error Handling)

This document describes **only the changes** required on the Flutter app following backend updates to the Cash & Bank Accounts module. No API request/response shapes have changed; only new error responses and recommended handling are added.

---

## Backend changes (summary)

1. **Withdraw** and **Contra** now reject operations that would make an account balance negative.
2. **Account ledger** pagination returns a clear error when `nextToken` is invalid.

---

## 1. Withdraw Money

**Endpoint:** `POST /business/:businessId/accounts/:accountId/withdraw`

**New error response:**

- **Status:** `400`
- **Body:** `{ "code": "INSUFFICIENT_BALANCE", "message": "Insufficient balance" }`

**When:** The withdraw amount is greater than the account's current balance.

**Frontend action:**

- In your existing error handling for this API, add a branch for `code == "INSUFFICIENT_BALANCE"`.
- Show a user-friendly message, e.g. **"Insufficient balance in this account"** (or use `message` from the response).
- Do not treat this as a generic error; the user should understand they cannot withdraw more than the available balance.

---

## 2. Contra Entry

**Endpoint:** `POST /business/:businessId/accounts/contra`

**New error response:**

- **Status:** `400`
- **Body:** `{ "code": "INSUFFICIENT_BALANCE", "message": "Insufficient balance in source account" }`

**When:** The "from" account's balance is less than the transfer amount.

**Frontend action:**

- In your existing error handling for this API, add a branch for `code == "INSUFFICIENT_BALANCE"`.
- Show a message such as **"Source account has insufficient balance"** (or use the backend `message`).

---

## 3. Account Ledger (transactions list)

**Endpoint:** `GET /business/:businessId/accounts/:accountId/transactions?limit=50&nextToken=<optional>`

**New error response:**

- **Status:** `400`
- **Body:** `{ "code": "INVALID_NEXT_TOKEN", "message": "Invalid nextToken" }`

**When:** The `nextToken` query parameter is missing, malformed, or no longer valid (e.g. corrupted or from an old session).

**Frontend action:**

- When you receive this error (e.g. on "load more"):
  - Clear any stored `nextToken` for this account.
  - Reload the first page (call the same endpoint **without** `nextToken`), or show a short message and let the user tap "Refresh" to reload from the start.

---

## Checklist for Flutter

- [x] **Withdraw Money:** Handle `code === "INSUFFICIENT_BALANCE"` and show "Insufficient balance in this account" (or similar).
  - Implemented in `lib/screens/accounts_screen.dart` — `_showAddWithdrawSheet` error handler checks `code == 'INSUFFICIENT_BALANCE'` and shows "Insufficient balance in this account".
  - Also added client-side validation: withdraw amount is checked against `closingBalance` before calling the API, with "Available: ₹ X" shown in the sheet.
- [x] **Contra Entry:** Handle `code === "INSUFFICIENT_BALANCE"` and show "Source account has insufficient balance" (or similar).
  - Implemented in `lib/screens/accounts_screen.dart` — `_showContraSheet` error handler checks `code == 'INSUFFICIENT_BALANCE'` and shows "Source account has insufficient balance".
  - Also added client-side validation: transfer amount is checked against source account balance before calling the API.
  - New Transfer UI added (was missing): "Transfer" button in bottom bar + full contra sheet with from/to account dropdowns, amount, narration.
- [x] **Account ledger:** On `code === "INVALID_NEXT_TOKEN"`, clear `nextToken` and reload the first page (or prompt the user to refresh).
  - Implemented in `lib/screens/account_ledger_screen.dart` — on `INVALID_NEXT_TOKEN`, `_nextToken` is cleared and `_load(initial: true)` is called to reload from the first page.

No changes to request bodies, success responses, or other endpoints are required.
