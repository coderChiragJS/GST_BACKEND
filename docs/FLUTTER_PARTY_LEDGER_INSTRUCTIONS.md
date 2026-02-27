# Flutter Integration Guide: Party Ledger

## Overview

The Party Ledger feature provides a complete financial ledger for each party (customer/supplier). It tracks all transactions -- Invoices, Payment Receipts, TDS Vouchers, Credit Notes, and Sales Debit Notes -- and computes running balances automatically.

**This feature is entirely new. No existing APIs, models, or functionality have been changed.** Only new routes were added to `api.js` and new PDF functions were added to `invoicePdfService.js`. All existing endpoints continue to work exactly as before.

---

## Base URL

```
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
```

All endpoints require:

```
Authorization: Bearer <token>
Content-Type: application/json
```

---

## API Endpoints

### 1. Ledger Summary (Debtors & Creditors List)

Shows all parties grouped into two tabs: **Debtors** (parties who owe you money) and **Creditors** (parties you owe money to).

```
GET /business/:businessId/ledger/summary
```

**Query Parameters:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| search    | string | No       | Filter parties by name or GSTIN (case-insensitive) |

**cURL Example:**

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/business/b97d9bae-7da2-448c-b67b-b847911eb39c/ledger/summary" \
  -H "Authorization: Bearer <token>"
```

**cURL Example with search:**

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/business/b97d9bae-7da2-448c-b67b-b847911eb39c/ledger/summary?search=sunrise" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**

```json
{
  "debtors": {
    "totalToCollect": 4909753.12,
    "parties": [
      {
        "partyId": "82bf4c29-e3e5-4725-b2f7-5e841de6aef0",
        "partyName": "SUNRISE PAPERS",
        "currentBalance": 4463424.36
      },
      {
        "partyId": "cce22ca3-ce58-4900-8621-811de21516af",
        "partyName": "Test Customer Pvt Ltd",
        "currentBalance": 446328.76
      }
    ]
  },
  "creditors": {
    "totalToPay": 0,
    "parties": []
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| debtors.totalToCollect | number | Sum of all debtor balances (amount others owe you) |
| debtors.parties | array | List of parties with positive balance |
| creditors.totalToPay | number | Sum of all creditor balances (amount you owe others) |
| creditors.parties | array | List of parties with negative balance |
| parties[].partyId | string | UUID of the party (use this for detail/PDF calls) |
| parties[].partyName | string | Company name of the party |
| parties[].currentBalance | number | Current outstanding balance (always positive) |

**How balance is determined:**
- A party whose total invoices + debit notes exceed their payments + credit notes has a **positive** balance and appears under **Debtors**
- A party whose payments + credit notes exceed their invoices + debit notes has a **negative** balance and appears under **Creditors**
- Parties with zero balance do not appear in either list
- The party's `openingBalance` and `openingBalanceType` (TO_RECEIVE / TO_PAY) from the party master are included in the calculation

---

### 2. Party Ledger Detail

Returns the full transaction-by-transaction ledger for a single party with opening balance, closing balance, and optional date range filtering.

```
GET /business/:businessId/parties/:partyId/ledger
```

**Path Parameters:**

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| businessId | string | Yes      | Business UUID |
| partyId    | string | Yes      | Party UUID (from ledger summary or party list) |

**Query Parameters:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| fromDate  | string | No       | Start date in `YYYY-MM-DD` format |
| toDate    | string | No       | End date in `YYYY-MM-DD` format |

**cURL Example (This Month):**

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/business/b97d9bae-7da2-448c-b67b-b847911eb39c/parties/cce22ca3-ce58-4900-8621-811de21516af/ledger?fromDate=2026-02-01&toDate=2026-02-28" \
  -H "Authorization: Bearer <token>"
```

**cURL Example (All Time -- omit date params):**

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/business/b97d9bae-7da2-448c-b67b-b847911eb39c/parties/cce22ca3-ce58-4900-8621-811de21516af/ledger" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**

```json
{
  "party": {
    "partyId": "fcc75d41-c727-4a4c-917c-26505cccc0af",
    "partyName": "Test Customer Pvt Ltd",
    "gstin": "29XXXXX1234X1Z5",
    "address": "Flat 101, Galaxy Apts, Himachal, Madhya Pradesh, 560001",
    "mobile": "9876543211",
    "email": "customer@test.com"
  },
  "period": {
    "from": "2026-02-17",
    "to": "2026-02-19"
  },
  "openingBalance": 7816.69,
  "transactions": [
    {
      "date": "2026-02-17",
      "particulars": "Sales",
      "voucherType": "Invoice",
      "voucherNumber": "INV-000001",
      "debit": 26.5,
      "credit": 0
    },
    {
      "date": "2026-02-17",
      "particulars": "Sales",
      "voucherType": "Invoice",
      "voucherNumber": "INV-000003",
      "debit": 2650,
      "credit": 0
    },
    {
      "date": "2026-02-18",
      "particulars": "Sales",
      "voucherType": "Sales Debit Note",
      "voucherNumber": "SDN-000004",
      "debit": 265,
      "credit": 0
    },
    {
      "date": "2026-02-19",
      "particulars": "Cash",
      "voucherType": "Payment Receipt",
      "voucherNumber": "PR-0012",
      "debit": 0,
      "credit": 100
    }
  ],
  "totalDebit": 55641.15,
  "totalCredit": 227.07,
  "closingBalance": 63230.77,
  "currentBalance": 46910.85
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| party | object | Party details (name, GSTIN, address, mobile, email) |
| period.from | string or null | Start date of filter (null if all-time) |
| period.to | string or null | End date of filter (null if all-time) |
| openingBalance | number | Balance at start of period. If date filter is applied, this includes the party's `openingBalance` from master + all transactions before `fromDate` |
| transactions | array | Ledger rows within the period, sorted by date (oldest first) |
| totalDebit | number | Sum of all `debit` values in the transactions array |
| totalCredit | number | Sum of all `credit` values in the transactions array |
| closingBalance | number | `openingBalance + totalDebit - totalCredit` |
| currentBalance | number | Overall all-time balance (ignores date filter) |

**Transaction Object Fields:**

| Field | Type | Description |
|-------|------|-------------|
| date | string | Transaction date in `YYYY-MM-DD` format (e.g. `"2026-02-17"`) |
| particulars | string | Category label (see table below) |
| voucherType | string | Document type (see table below) |
| voucherNumber | string | Document number (e.g. INV-000019, PR-000001) |
| debit | number | Amount that increases outstanding (0 if not applicable) |
| credit | number | Amount that decreases outstanding (0 if not applicable) |

**Transaction Type Mapping:**

| Document Type | particulars | voucherType | Debit | Credit |
|---------------|------------|-------------|-------|--------|
| Invoice | "Sales" | "Invoice" | grandTotal | 0 |
| Sales Debit Note | "Sales" | "Sales Debit Note" | grandTotal | 0 |
| Credit Note | "Return" | "Credit Note" | 0 | grandTotal |
| Payment Receipt | paymentMode in title case (e.g. "Cash", "Upi", "Cheque", "Bank") | "Payment Receipt" | 0 | amountCollected |
| TDS Voucher | "TDS" | "TDS" | 0 | tdsAmountCollected |

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "Party ID is required" }` | Missing partyId in URL |
| 404 | `{ "message": "Party not found" }` | Party does not exist for this user |

**Important Notes:**
- Only documents with `status: "saved"` are included. Drafts and cancelled documents are excluded.
- The `closingBalance` formula is: `openingBalance + totalDebit - totalCredit`
- When no date filter is provided, `openingBalance` equals the party's `openingBalance` from the party master, and `closingBalance` equals `currentBalance`

---

### 3. Generate Party Ledger PDF

Generates a Party Statement PDF (matching the standard Indian accounting format) and uploads it to S3. Returns the public URL.

```
POST /business/:businessId/parties/:partyId/ledger-pdf
```

**Path Parameters:**

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| businessId | string | Yes      | Business UUID |
| partyId    | string | Yes      | Party UUID |

**Request Body:**

```json
{
  "fromDate": "2026-02-01",
  "toDate": "2026-02-28",
  "templateId": "classic"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| fromDate | string | No | null | Start date (YYYY-MM-DD). Omit for all-time |
| toDate | string | No | null | End date (YYYY-MM-DD). Omit for all-time |
| templateId | string | No | "classic" | PDF template. Currently only "classic" is available |

**cURL Example:**

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/business/b97d9bae-7da2-448c-b67b-b847911eb39c/parties/cce22ca3-ce58-4900-8621-811de21516af/ledger-pdf" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"fromDate":"2026-02-01","toDate":"2026-02-28","templateId":"classic"}'
```

**Response (200 OK):**

```json
{
  "pdfUrl": "https://gst-billing-backend-dev-us-east-1-chirag-uploads.s3.us-east-1.amazonaws.com/ledger/.../party-ledger-classic.pdf",
  "partyId": "cce22ca3-ce58-4900-8621-811de21516af",
  "templateId": "classic"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| pdfUrl | string | Public S3 URL of the generated PDF |
| partyId | string | Party UUID |
| templateId | string | Template used |

**PDF Layout:**
The generated PDF contains:
1. **Business header** -- Your firm name and address
2. **"Party Statement" title**
3. **Statement To** -- Party name, address, GSTIN
4. **Period** -- Date range (if specified)
5. **Opening Balance** row
6. **Transaction table** -- Date, Particulars, Voucher Type, Voucher Number, Debit, Credit
7. **Totals** row -- Total Debit, Total Credit
8. **Closing Balance** row

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "Party ID is required" }` | Missing partyId |
| 400 | `{ "message": "Invalid templateId", "allowedTemplates": ["classic"] }` | Invalid template |
| 404 | `{ "message": "Party not found" }` | Party does not exist |

---

## Date Range Filter Presets

The Flutter app should provide common presets for the date range filter. Compute these dates in Dart and pass them as `fromDate` / `toDate` query parameters.

| Label | fromDate | toDate |
|-------|----------|--------|
| All Time | *(omit both)* | *(omit both)* |
| This Month | First day of current month | Last day of current month |
| Last Month | First day of previous month | Last day of previous month |
| Last 3 Months | 3 months ago from today | Today |
| This Financial Year | Apr 1 of current FY | Mar 31 of current FY |
| Custom Range | User-selected start date | User-selected end date |

**Dart example for "This Month":**

```dart
final now = DateTime.now();
final fromDate = DateTime(now.year, now.month, 1).toIso8601String().split('T')[0];
final toDate = DateTime(now.year, now.month + 1, 0).toIso8601String().split('T')[0];
// Call: GET /business/$businessId/parties/$partyId/ledger?fromDate=$fromDate&toDate=$toDate
```

---

## Flutter Implementation Guide

### Screen 1: Ledger List (Debtors / Creditors)

**Route:** Dashboard -> "Ledger" icon

**API Call:** `GET /business/:businessId/ledger/summary`

**UI Elements:**
- Two tabs at top: **Debtors** (default active) and **Creditors**
- Search bar below tabs: filter by party name, GST number, or mobile
- Summary row at top of each tab:
  - Debtors tab: "To Collect" with `debtors.totalToCollect` formatted as currency
  - Creditors tab: "To Pay" with `creditors.totalToPay` formatted as currency
- Party list: Each card shows:
  - `partyName` (left, bold)
  - "Current Balance" label + `currentBalance` formatted as currency (right)
  - Three-dot menu (optional: View Ledger, Download PDF, Share)
- Tap on any party card -> navigate to Screen 2
- Empty state: "No debtors found" / "No creditors found"

**When to call:** Every time the screen is opened or pulled to refresh. The search filter should be debounced (300ms) and appended as `?search=<term>`.

---

### Screen 2: Party Ledger Detail

**Route:** Ledger List -> tap a party

**API Call:** `GET /business/:businessId/parties/:partyId/ledger?fromDate=&toDate=`

**UI Elements:**
- **Header area:**
  - Party name (large, bold)
  - "Current Party Balance" card showing `currentBalance` prominently
  - "Send Payment Reminder" button (WhatsApp deep link with party mobile)
- **"Party Ledger" section:**
  - Date range dropdown (default: "This Month") at top-right
  - PDF preview card showing business name, address, "Statement To" party info
  - "View PDF" button in center of preview -> calls PDF endpoint, opens in viewer
  - Action buttons row below preview: Download, Print, Email, Share, WhatsApp
- **"All transactions" section:**
  - Header: "All transactions" (left) + "View all" link (right)
  - Each transaction card shows:
    - `voucherType` (bold, e.g. "Invoice", "TDS Voucher")
    - `voucherNumber` (smaller text below)
    - `date` formatted as DD-MM-YYYY (below voucher number)
    - Amount on the right: show `debit` if > 0, else show `credit`
    - For invoices: optionally show PAID/UNPAID/PARTIALLY PAID badge

**When to refresh:** When the date range filter changes, re-call the API with new `fromDate`/`toDate`.

---

### Screen 3: PDF Viewer

**API Call:** `POST /business/:businessId/parties/:partyId/ledger-pdf`

**Body:** `{ "fromDate": "...", "toDate": "...", "templateId": "classic" }`

**UI:** 
- Show loading indicator while PDF generates
- Open the returned `pdfUrl` in a bottom-sheet PDF viewer (use `flutter_pdfview` or similar)
- Share buttons at bottom: Download, Print, Email, Share, WhatsApp

---

## Dart Model Classes

```dart
// Ledger Summary
class LedgerSummary {
  final LedgerGroup debtors;
  final LedgerGroup creditors;

  LedgerSummary.fromJson(Map<String, dynamic> json)
      : debtors = LedgerGroup.fromJson(json['debtors']),
        creditors = LedgerGroup.fromJson(json['creditors']);
}

class LedgerGroup {
  final double totalAmount; // totalToCollect or totalToPay
  final List<LedgerParty> parties;

  LedgerGroup.fromJson(Map<String, dynamic> json)
      : totalAmount = (json['totalToCollect'] ?? json['totalToPay'] ?? 0).toDouble(),
        parties = (json['parties'] as List).map((p) => LedgerParty.fromJson(p)).toList();
}

class LedgerParty {
  final String partyId;
  final String partyName;
  final double currentBalance;

  LedgerParty.fromJson(Map<String, dynamic> json)
      : partyId = json['partyId'] ?? '',
        partyName = json['partyName'] ?? '',
        currentBalance = (json['currentBalance'] ?? 0).toDouble();
}

// Party Ledger Detail
class PartyLedger {
  final PartyInfo party;
  final LedgerPeriod period;
  final double openingBalance;
  final List<LedgerTransaction> transactions;
  final double totalDebit;
  final double totalCredit;
  final double closingBalance;
  final double currentBalance;

  PartyLedger.fromJson(Map<String, dynamic> json)
      : party = PartyInfo.fromJson(json['party']),
        period = LedgerPeriod.fromJson(json['period']),
        openingBalance = (json['openingBalance'] ?? 0).toDouble(),
        transactions = (json['transactions'] as List).map((t) => LedgerTransaction.fromJson(t)).toList(),
        totalDebit = (json['totalDebit'] ?? 0).toDouble(),
        totalCredit = (json['totalCredit'] ?? 0).toDouble(),
        closingBalance = (json['closingBalance'] ?? 0).toDouble(),
        currentBalance = (json['currentBalance'] ?? 0).toDouble();
}

class PartyInfo {
  final String partyId;
  final String partyName;
  final String gstin;
  final String address;
  final String mobile;
  final String email;

  PartyInfo.fromJson(Map<String, dynamic> json)
      : partyId = json['partyId'] ?? '',
        partyName = json['partyName'] ?? '',
        gstin = json['gstin'] ?? '',
        address = json['address'] ?? '',
        mobile = json['mobile'] ?? '',
        email = json['email'] ?? '';
}

class LedgerPeriod {
  final String? from;
  final String? to;

  LedgerPeriod.fromJson(Map<String, dynamic> json)
      : from = json['from'],
        to = json['to'];
}

class LedgerTransaction {
  final String date;
  final String particulars;
  final String voucherType;
  final String voucherNumber;
  final double debit;
  final double credit;

  LedgerTransaction.fromJson(Map<String, dynamic> json)
      : date = json['date'] ?? '',
        particulars = json['particulars'] ?? '',
        voucherType = json['voucherType'] ?? '',
        voucherNumber = json['voucherNumber'] ?? '',
        debit = (json['debit'] ?? 0).toDouble(),
        credit = (json['credit'] ?? 0).toDouble();

  /// The display amount (positive number for either side)
  double get amount => debit > 0 ? debit : credit;

  /// Whether this is a debit entry
  bool get isDebit => debit > 0;
}
```

---

## API Service Methods (Dart)

```dart
class LedgerApiService {
  final String baseUrl;
  final String token;

  LedgerApiService({required this.baseUrl, required this.token});

  Map<String, String> get _headers => {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  };

  /// Fetch Debtors & Creditors summary
  Future<LedgerSummary> getLedgerSummary(String businessId, {String? search}) async {
    final queryParams = search != null ? '?search=${Uri.encodeComponent(search)}' : '';
    final response = await http.get(
      Uri.parse('$baseUrl/business/$businessId/ledger/summary$queryParams'),
      headers: _headers,
    );
    return LedgerSummary.fromJson(jsonDecode(response.body));
  }

  /// Fetch party ledger detail
  Future<PartyLedger> getPartyLedger(
    String businessId,
    String partyId, {
    String? fromDate,
    String? toDate,
  }) async {
    final params = <String, String>{};
    if (fromDate != null) params['fromDate'] = fromDate;
    if (toDate != null) params['toDate'] = toDate;
    final query = params.isNotEmpty ? '?${params.entries.map((e) => '${e.key}=${e.value}').join('&')}' : '';
    final response = await http.get(
      Uri.parse('$baseUrl/business/$businessId/parties/$partyId/ledger$query'),
      headers: _headers,
    );
    return PartyLedger.fromJson(jsonDecode(response.body));
  }

  /// Generate party ledger PDF and return the URL
  Future<String> generatePartyLedgerPdf(
    String businessId,
    String partyId, {
    String? fromDate,
    String? toDate,
    String templateId = 'classic',
  }) async {
    final body = <String, dynamic>{'templateId': templateId};
    if (fromDate != null) body['fromDate'] = fromDate;
    if (toDate != null) body['toDate'] = toDate;
    final response = await http.post(
      Uri.parse('$baseUrl/business/$businessId/parties/$partyId/ledger-pdf'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final data = jsonDecode(response.body);
    return data['pdfUrl'];
  }
}
```

---

## UI Consistency (Important)

The Ledger screens **must** follow the existing app's design system. Do NOT create a separate or custom UI style. Reuse the same theme, components, and patterns already used across the app.

**Reuse from existing screens:**

- **Colors:** Use the same primary color (dark navy), accent color, background color, card colors, and text colors already defined in the app theme. Do not introduce new colors.
- **Font sizes and weights:** Match the existing text styles -- screen titles, section headers, card titles, body text, captions. Use the same `TextStyle` or theme text styles (e.g. `Theme.of(context).textTheme.titleLarge`).
- **AppBar:** Use the same AppBar style as other screens (e.g. Invoices, Parties, TDS). Same back arrow, title style, and overflow menu icon.
- **Cards and list tiles:** Reuse the same card shape, elevation, border radius, and padding used in Invoice list, Party list, and Receipt list screens.
- **Search bar:** Reuse the same search bar component used in Invoice list or Party list screens. Same placeholder text style, icon, and border.
- **Tabs:** Use the same tab bar style as any existing tabbed screen in the app. Same indicator color, label style, and unselected style.
- **Buttons:** Reuse the same button styles -- primary buttons, outline buttons, icon buttons -- already in the app.
- **Amount formatting:** Use the same currency formatter (Indian number format with rupee symbol) used in Invoice, Receipt, and other screens.
- **Date formatting:** Use the same date display format (DD-MM-YYYY or DD/MM/YYYY) as used elsewhere in the app.
- **Empty states:** Use the same empty state illustration/message pattern used in other list screens.
- **Loading indicators:** Use the same shimmer/skeleton or circular progress indicator used in other screens.
- **Spacing and padding:** Use the same margins and padding values as existing screens.

**Reference screens for design:**
- **Ledger list (Debtors/Creditors tabs)** -> Take reference from the Party list screen or Invoice list screen
- **Party Ledger detail** -> Take reference from the Invoice detail or Payment Receipt detail screen
- **PDF preview and share actions** -> Take reference from the Invoice PDF or Statement PDF screen (same bottom action bar with Download, Print, Email, Share, WhatsApp icons)
- **"Current Party Balance" card** -> Style it like the summary cards already used in the app (same border radius, background, font size)
- **Transaction list items** -> Style like Invoice list items (type label bold on left, amount on right, date and number below in smaller text)

**Do NOT:**
- Introduce new colors, fonts, or icon styles
- Create custom widgets when existing reusable widgets already serve the same purpose
- Use different padding/margin values than the rest of the app
- Use a different date or currency format

---

## Flutter Implementation Checklist

- [ ] Add "Ledger" icon/button on the main dashboard
- [ ] Create Dart model classes (`LedgerSummary`, `PartyLedger`, `LedgerTransaction`, etc.)
- [ ] Create API service methods for all 3 endpoints
- [ ] Build Ledger list screen with Debtors/Creditors tabs
- [ ] Implement search bar with debounced filtering (300ms)
- [ ] Show aggregate "To Collect" / "To Pay" at top of each tab
- [ ] Build Party Ledger detail screen
- [ ] Display current party balance as a prominent card
- [ ] Add date range filter dropdown (This Month, Last Month, Last 3 Months, This FY, Custom)
- [ ] Show transaction list with voucher type, number, date, and amount
- [ ] Show PDF preview card with business and party info
- [ ] Implement "View PDF" button -> call PDF endpoint -> open in viewer
- [ ] Add share action buttons (Download, Print, Email, Share, WhatsApp)
- [ ] Add "Send Payment Reminder" button with WhatsApp deep link
- [ ] Handle empty states (no transactions, no debtors/creditors)
- [ ] Handle loading states and error states

---

## Changes to Existing Code

**No existing APIs, models, or functionality have been changed.** The party ledger is a purely additive feature.

**New files created:**
- `src/services/partyLedgerService.js` -- Core logic for computing ledger
- `src/controllers/partyLedgerController.js` -- API endpoints
- `src/templates/party-ledger/classic.html` -- PDF template

**Existing files modified (additive only):**
- `src/routes/api.js` -- 3 new routes added at the end (no existing routes changed)
- `src/services/invoicePdfService.js` -- New PDF functions added at the end (no existing functions changed)

**All existing endpoints remain unchanged.** Invoices, Quotations, Receipts, TDS, Credit Notes, Sales Debit Notes, Delivery Challans -- everything works exactly as before.

---

## Bug Fixes Applied (Post-Initial Release)

The following issues were identified during verification and have been fixed in the deployed API. The Flutter developer does **not** need to do anything special -- the API now returns correct data.

| # | Issue | What Was Wrong | Fix |
|---|-------|----------------|-----|
| 1 | **Sales Debit Note / Credit Note field names** | Code looked for `salesDebitNoteDate`, `salesDebitNoteNumber`, `creditNoteDate`, `creditNoteNumber` -- fields that don't exist. SDN and CN documents reuse `invoiceDate` and `invoiceNumber` for template compatibility. | Updated `getDocDate` and `getDocNumber` to read `doc.invoiceDate` and `doc.invoiceNumber` for both CREDIT_NOTE and SALES_DEBIT_NOTE types. |
| 2 | **Dates returned in mixed formats** | Invoice dates were `2026-02-16T00:00:00.000`, receipts were `2026-02-19`, SDN fell back to createdAt `2026-02-18T13:51:54.330Z`. | All dates are now normalized to `YYYY-MM-DD` format (e.g. `"2026-02-18"`). |
| 3 | **Date range filter end-of-day exclusion** | `toDate` filter used `Date` object comparison, which could exclude transactions on the last day of the period. | Switched to string comparison on normalized `YYYY-MM-DD` dates, making `toDate` fully inclusive. |
| 4 | **Payment mode all caps** | `particulars` for Payment Receipts was `.toUpperCase()` → `"CASH"`. | Changed to title case → `"Cash"`, `"Bank"`, `"Upi"`, etc. |

**What this means for Flutter:**
- All `transaction.date` values are guaranteed `YYYY-MM-DD` strings -- parse them directly
- All `transaction.voucherNumber` values are populated (SDN shows `"SDN-000004"`, not `""`)
- `transaction.particulars` for receipts is title case ("Cash"), not uppercase ("CASH")
