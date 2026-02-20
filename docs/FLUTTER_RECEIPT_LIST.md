# Flutter: Receipt List — Pagination, Search, and Filter

Instructions for implementing the **payment receipt list** in the Flutter app with **pagination**, **search**, and **filter** (party + date range).

---

## 1. API

**Endpoint:** `GET /business/:businessId/receipts`

**Query parameters:**

| Parameter   | Type   | Required | Description |
|------------|--------|----------|-------------|
| `limit`    | number | No       | Page size, 1–100. Default: 100. |
| `nextToken`| string | No       | Opaque token for the next page. Use the value returned in the previous response. |
| `search` or `q` | string | No | Search by receipt number or party name (case-insensitive, substring). |
| `partyId`  | string | No       | Filter by party. Only receipts for this party are returned. |
| `fromDate` | string | No       | Filter: receipt date ≥ fromDate. Format: `YYYY-MM-DD`. |
| `toDate`   | string | No       | Filter: receipt date ≤ toDate. Format: `YYYY-MM-DD`. |

**Response (200):**

```json
{
  "receipts": [ { "receiptId", "receiptNumber", "receiptDate", "partyId", "partyName", "amountCollected", "paymentMode", "allocations", ... } ],
  "count": 10,
  "nextToken": "optional-opaque-string"
}
```

- If there are more results, `nextToken` is present. Send it in the next request to get the next page.
- If there are no more results, `nextToken` is omitted.

**Note:** Search and filters are applied **per page**. So with a large list, the first page might return fewer than `limit` items when filters/search are used. Use `nextToken` to load more; the same filters and search are applied on each request.

---

## 2. Flutter implementation

### 2.1 API client

```dart
// Example: list receipts with optional pagination, search, and filters
Future<ReceiptListResponse> listReceipts(
  String businessId, {
  int limit = 20,
  String? nextToken,
  String? search,
  String? partyId,
  String? fromDate,  // YYYY-MM-DD
  String? toDate,   // YYYY-MM-DD
}) async {
  final queryParams = <String, String>{
    'limit': limit.toString(),
  };
  if (nextToken != null && nextToken.isNotEmpty) queryParams['nextToken'] = nextToken;
  if (search != null && search.trim().isNotEmpty) queryParams['search'] = search.trim();
  if (partyId != null && partyId.isNotEmpty) queryParams['partyId'] = partyId;
  if (fromDate != null && fromDate.isNotEmpty) queryParams['fromDate'] = fromDate;
  if (toDate != null && toDate.isNotEmpty) queryParams['toDate'] = toDate;

  final uri = Uri.parse('$baseUrl/business/$businessId/receipts').replace(queryParameters: queryParams);
  final res = await http.get(uri, headers: {'Authorization': 'Bearer $token'});
  if (res.statusCode != 200) throw ApiException(res);
  final json = jsonDecode(res.body);
  return ReceiptListResponse.fromJson(json);
}

class ReceiptListResponse {
  final List<Receipt> receipts;
  final int count;
  final String? nextToken;
  ReceiptListResponse({required this.receipts, required this.count, this.nextToken});
  factory ReceiptListResponse.fromJson(Map<String, dynamic> j) => ReceiptListResponse(
    receipts: (j['receipts'] as List?)?.map((e) => Receipt.fromJson(e)).toList() ?? [],
    count: j['count'] ?? 0,
    nextToken: j['nextToken'] as String?,
  );
}
```

---

### 2.2 Pagination

**Behaviour:**

- First load: call API with `limit` (e.g. 20), no `nextToken`.
- When user scrolls to the bottom (or taps “Load more”): call API with same `limit` and the `nextToken` from the last response.
- Append new `receipts` to the list; replace stored `nextToken` with the new one (or clear if null).
- If `nextToken` is null, there are no more pages.

**State to keep:**

- `List<Receipt> receipts`
- `String? nextToken` (null when no more pages)
- `bool isLoading` (e.g. while fetching)
- `bool hasMore => nextToken != null && nextToken!.isNotEmpty`

**Load more example:**

```dart
Future<void> loadMore() async {
  if (isLoading || !hasMore) return;
  isLoading = true;
  try {
    final res = await listReceipts(businessId, limit: 20, nextToken: nextToken, search: searchQuery, partyId: selectedPartyId, fromDate: fromDate, toDate: toDate);
    receipts.addAll(res.receipts);
    nextToken = res.nextToken;
  } finally {
    isLoading = false;
  }
}
```

Use a scroll controller to call `loadMore()` when the user reaches the end of the list, or a “Load more” button that calls `loadMore()`.

---

### 2.3 Search

**UI:** A search field (e.g. in the app bar or above the list). User types to search by **receipt number** or **party name**.

**Behaviour:**

- **Option A (recommended):** Debounce (e.g. 300–400 ms after user stops typing), then call the API with `search: query`, **no nextToken**, and replace the list with the response. Reset `nextToken` to the response’s `nextToken` so “load more” continues the search.
- **Option B:** On submit (e.g. search button or done key), same as above but without debounce.

**Important:** When the user changes the search term, **reset the list and nextToken** and fetch the first page again (do not append to previous results).

**Example (debounced search):**

```dart
String searchQuery = '';
Timer? _searchDebounce;

void onSearchChanged(String value) {
  searchQuery = value;
  _searchDebounce?.cancel();
  _searchDebounce = Timer(const Duration(milliseconds: 350), () {
    nextToken = null;
    receipts.clear();
    loadFirstPage(); // same as initial load with current searchQuery, partyId, fromDate, toDate
  });
}
```

---

### 2.4 Filter (party + date range)

**UI:**

- **Party:** Dropdown or list of parties (from your parties API). One selected party, or “All” (send no `partyId`).
- **Date range:** Two date pickers or text fields: “From date” and “To date”. Optional; if empty, send no `fromDate`/`toDate`.

**Behaviour:**

- When the user applies or changes any filter (party, from date, to date):
  - Clear the list and set `nextToken = null`.
  - Call the API with the new filter values (and current `search` if any) and no `nextToken` (first page).
- Use the same `partyId`, `fromDate`, `toDate` (and `search`) when calling “load more” so the next page is also filtered.

**Example:**

```dart
String? selectedPartyId;  // null = All
String? fromDate;         // YYYY-MM-DD or null
String? toDate;           // YYYY-MM-DD or null

void applyFilters() {
  nextToken = null;
  receipts.clear();
  loadFirstPage();
}
```

---

## 3. Full flow summary

| Action              | What to do |
|---------------------|------------|
| Initial load        | Call API with `limit`, optional `search`, `partyId`, `fromDate`, `toDate`. Set `receipts` and `nextToken`. |
| Load more           | Call API with same params + last `nextToken`. Append to `receipts`, update `nextToken`. |
| User types search   | Debounce → reset list and nextToken → fetch first page with new `search`. |
| User changes filter | Reset list and nextToken → fetch first page with new party/fromDate/toDate. |
| Empty state         | When `receipts.isEmpty` and not loading, show “No receipts” or “No receipts match your search/filters”. |

---

## 4. Query param summary (for reference)

- **Pagination:** `limit`, `nextToken`
- **Search:** `search` or `q` (receipt number or party name, substring, case-insensitive)
- **Filter:** `partyId`, `fromDate` (YYYY-MM-DD), `toDate` (YYYY-MM-DD)

All query params can be combined. The backend applies filters and search on each page and returns the filtered count and nextToken for that page.
