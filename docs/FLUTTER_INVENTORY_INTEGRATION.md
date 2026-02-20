# Flutter: Inventory Integration (Complete Instructions)

This document describes how to integrate the backend **inventory** APIs into a Flutter app. The recommended UX is: **one "Inventory" tile on the homepage** (like Invoices, Products, Parties) that opens an **Inventory hub screen** with settings, low stock, add/reduce stock, and stock timeline.

---

## 1. API Summary

All endpoints use the same base URL and auth as your existing APIs: `Authorization: Bearer <token>`. Paths are relative to your API base (e.g. `/api`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/business/:businessId/settings/inventory` | Get inventory settings |
| PUT | `/business/:businessId/settings/inventory` | Update inventory settings |
| GET | `/business/:businessId/products` | List products (optional `?lowStock=true`, `?categoryId=...`) |
| GET | `/business/:businessId/products/:productId` | Get product (includes currentStock, stockValue) |
| POST | `/business/:businessId/products/:productId/stock` | Adjust stock (add/reduce) |
| GET | `/business/:businessId/products/:productId/stock-movements` | Stock timeline (paginated) |

Product create/update (existing) accept: `maintainStock`, `openingStock`, `lowStockAlertQty`. Do **not** send `currentStock` from the app.

---

## 2. API Details

### 2.1 Get inventory settings

- **GET** `/business/:businessId/settings/inventory`
- **Response (200):** `{ "inventorySettings": { "reduceStockOn": "invoice" | "deliveryChallan", "stockValueBasedOn": "purchase" | "sale", "allowNegativeStock": boolean } }`

### 2.2 Update inventory settings

- **PUT** `/business/:businessId/settings/inventory`
- **Body (JSON):** `{ "reduceStockOn"?: "invoice" | "deliveryChallan", "stockValueBasedOn"?: "purchase" | "sale", "allowNegativeStock"?: boolean }`
- **Response (200):** `{ "inventorySettings": { ... } }`

### 2.3 List products (with optional filters)

- **GET** `/business/:businessId/products`
- **Query:**
  - `lowStock=true` (optional) — returns only products where `maintainStock` is true and `currentStock <= lowStockAlertQty`
  - `categoryId=...` (optional) — returns only products in that category (same value set on create/update; default is `"default"`)
- **Response (200):** `{ "count": number, "products": [ { ...product, "currentStock": number, "stockValue": number, "maintainStock", "lowStockAlertQty", "unit", "categoryId", ... } ] }`
- **Note:** Product create/update accept `categoryId` (string, default `"default"`). There is no separate categories API; the app can maintain a list of category names/ids or let the user type freely. You can combine filters: e.g. `?categoryId=electronics&lowStock=true`.

### 2.4 Get product

- **GET** `/business/:businessId/products/:productId`
- **Response (200):** Product object including `currentStock`, `stockValue`, `maintainStock`, `lowStockAlertQty`, `unit`.

### 2.5 Adjust stock

- **POST** `/business/:businessId/products/:productId/stock`
- **Body (JSON):** `{ "quantityChange": number, "remark"?: string, "date"?: string }` — positive = add, negative = reduce. `quantityChange` must be non-zero.
- **Response (200):** `{ "message": "...", "product": { ... }, "movement": { "productId", "quantityChange", "finalStock", "activityType", "remark", "unit", "createdAt" } }`
- **Errors:**
  - **400** `code: "VALIDATION_FAILED"` — e.g. missing or zero `quantityChange`; body includes `message`, `details`
  - **400** `code: "INSUFFICIENT_STOCK"` — body includes `message`, `currentStock`, `requestedChange`
  - **400** `code: "STOCK_NOT_TRACKED"` — product does not have maintain stock enabled
  - **404** — Product not found

### 2.6 Stock movements (timeline)

- **GET** `/business/:businessId/products/:productId/stock-movements?limit=50&nextToken=...`
- **Response (200):** `{ "stockMovements": [ { "productId", "quantityChange", "finalStock", "activityType", "referenceId", "referenceNumber", "remark", "unit", "createdAt" } ], "count": number, "nextToken"?: string }`
- Each movement object may also include internal keys (e.g. `PK`, `SK`); the client can ignore them.
- **Pagination:** Send the `nextToken` value returned by the server back as the `nextToken` query parameter in the next request (opaque string; no need to decode).

---

## 3. Dart models (minimal)

```dart
class InventorySettings {
  final String reduceStockOn;      // 'invoice' | 'deliveryChallan'
  final String stockValueBasedOn; // 'purchase' | 'sale'
  final bool allowNegativeStock;

  InventorySettings({
    required this.reduceStockOn,
    required this.stockValueBasedOn,
    required this.allowNegativeStock,
  });

  factory InventorySettings.fromJson(Map<String, dynamic> j) => InventorySettings(
    reduceStockOn: j['reduceStockOn'] ?? 'invoice',
    stockValueBasedOn: j['stockValueBasedOn'] ?? 'purchase',
    allowNegativeStock: j['allowNegativeStock'] ?? false,
  );

  Map<String, dynamic> toJson() => {
    'reduceStockOn': reduceStockOn,
    'stockValueBasedOn': stockValueBasedOn,
    'allowNegativeStock': allowNegativeStock,
  };
}

// Extend your Product model with:
// maintainStock (bool), openingStock (num), currentStock (num), lowStockAlertQty (num), stockValue (num), unit (String)

class StockMovement {
  final String productId;
  final num quantityChange;
  final num finalStock;
  final String activityType;  // 'invoice' | 'deliveryChallan' | 'adjustment'
  final String? referenceId;
  final String? referenceNumber;
  final String? remark;
  final String? unit;
  final String createdAt;

  StockMovement({...});

  factory StockMovement.fromJson(Map<String, dynamic> j) => StockMovement(
    productId: j['productId'] ?? '',
    quantityChange: (j['quantityChange'] ?? 0).toDouble(),
    finalStock: (j['finalStock'] ?? 0).toDouble(),
    activityType: j['activityType'] ?? 'adjustment',
    referenceId: j['referenceId'],
    referenceNumber: j['referenceNumber'],
    remark: j['remark'],
    unit: j['unit'],
    createdAt: j['createdAt'] ?? '',
  );
}
```

---

## 4. Homepage: Add "Inventory" tile

- **Where:** Same row or grid as existing tiles (e.g. Invoices, Products, Parties, …).
- **What:** One tile/card labeled **"Inventory"** with an icon (e.g. box, warehouse).
- **Tap:** Navigate to **Inventory screen** (hub).

```text
[ Invoices ] [ Products ] [ Parties ] [ Inventory ] [ ... ]
```

---

## 5. Inventory screen (hub)

This is the main screen opened when the user taps **Inventory** on the homepage.

**Layout (recommended):**

1. **App bar:** Title "Inventory", optional trailing icon for **Inventory settings** (e.g. gear) that opens the settings screen.
2. **Sections (cards or list tiles):**
   - **Low stock** — Tap opens a list of products that are low stock (call list products with `lowStock=true`). Show count badge if desired (e.g. "3 items").
   - **Add / Reduce stock** — Tap opens a flow: select product (from list of products with `maintainStock: true`), then quantity (+ add / − reduce) and optional remark; submit calls adjust-stock API.
   - **Stock timeline** — Tap opens product selector, then show stock movements for selected product (paginated with nextToken).

**Optional:** Show a short summary at top (e.g. total stock value or low-stock count) by calling list products and aggregating; keep it simple to avoid extra load.

**Logic:**

- Use current `businessId` from app state/route.
- All API calls use `GET/PUT/POST` as in section 2.

---

## 6. Inventory settings screen

- **Entry:** From Inventory hub (e.g. app bar icon or "Settings" row).
- **Fields:**
  - **Reduce stock on:** Dropdown or segmented control — "Invoice" | "Delivery Challan". Map to `reduceStockOn`.
  - **Stock value based on:** "Purchase price" | "Sale price". Map to `stockValueBasedOn`.
  - **Allow negative stock:** Switch. Map to `allowNegativeStock`.
- **Load:** On init, call `GET .../settings/inventory` and bind to form.
- **Save:** On save, call `PUT .../settings/inventory` with the three fields (only changed or all). On success, show snackbar and pop.

---

## 7. Low stock list

- **Entry:** From Inventory hub → "Low stock".
- **API:** `GET /business/:businessId/products?lowStock=true`
- **UI:** List of products. Each row: name, current stock, unit, low stock alert level, optional stock value. Tapping a row can go to product detail or to "Add stock" for that product.
- **Empty state:** Message like "No low stock items" when list is empty.

---

## 8. Add / Reduce stock flow

- **Entry:** From Inventory hub → "Add / Reduce stock".
- **Step 1:** List products that have `maintainStock: true` (use list products and filter, or backend could add a filter later). User selects one product.
- **Step 2:** Form:
  - Quantity (number, required). Two actions: **Add** (positive) or **Reduce** (negative). Either two buttons that set sign, or one field and "Add" / "Reduce" buttons.
  - Optional remark (text).
- **Submit:** `POST /business/:businessId/products/:productId/stock` with `{ "quantityChange": ±qty, "remark": "..." }`.
- **Success:** Show "Stock updated", then pop or go back to hub; optionally refresh product or low-stock list.
- **Error handling:**
  - **400, code INSUFFICIENT_STOCK:** Show dialog/snackbar: "Insufficient stock. Current: X" (use `currentStock` from response). Do not close form so user can reduce quantity and retry.
  - **400, code STOCK_NOT_TRACKED:** Show "Stock tracking is not enabled for this product."
  - **404:** Show "Product not found."

---

## 9. Stock timeline screen

- **Entry:** From Inventory hub → "Stock timeline" → select product (from products with `maintainStock: true`).
- **API:** `GET /business/:businessId/products/:productId/stock-movements?limit=20&nextToken=...`
- **UI:** List of movements (newest first). Each row: date (`createdAt`), type (invoice / deliveryChallan / adjustment), quantity change (+/-), final stock, reference number if any, remark. Show product unit in header or per row.
- **Pagination:** "Load more" button that sends the returned `nextToken` in the next request.

---

## 10. Product create / edit (inventory fields)

- **Where:** Existing product add and product edit screens.
- **Section:** "Stock" or "Inventory".
- **Fields:**
  - **Maintain stock:** Switch. When ON:
    - **Opening stock:** Number (non-negative). Used on create and when first turning ON maintain stock on edit (backend sets `currentStock` from this).
    - **Low stock alert at:** Number (optional, default 0).
  - **Unit:** Already on product; show it so user knows stock is in that unit.
- **Rules:** Do not send `currentStock` in create/update. After turning ON maintain stock on edit, refresh product so `currentStock` is visible.

---

## 11. Product list and detail (stock display)

- **Product list:** For each product with `maintainStock: true`, show current stock and unit (e.g. "10 Nos"). Optionally show stock value. If `currentStock <= lowStockAlertQty`, show a "Low stock" badge or highlight.
- **Product detail:** If `maintainStock`, show current stock, unit, stock value, low stock alert level. Provide actions: "Add stock" / "Reduce stock" (same API as section 8) and "Stock timeline" (same as section 9).

---

## 12. Invoices and delivery challans (insufficient stock)

- When user saves an **invoice** (or **delivery challan** if settings say reduce stock on delivery challan), the backend may return **400** with `code: "INSUFFICIENT_STOCK"` or `code: "STOCK_ERROR"`, and `message`; optionally `currentStock`.
- **App:** Catch 400, parse body. If `code == "INSUFFICIENT_STOCK"` or `code == "STOCK_ERROR"`, show a dialog or snackbar: e.g. "Insufficient stock for one or more items. …" (use `message` or `currentStock`). Do not clear the form so the user can reduce quantities and retry.

---

## 13. Flow summary

| Location | Action |
|----------|--------|
| **Homepage** | Add "Inventory" tile → opens Inventory hub |
| **Inventory hub** | Settings (gear) → Inventory settings screen |
| **Inventory hub** | Low stock → Low stock list (`?lowStock=true`) |
| **Inventory hub** | Add/Reduce stock → Select product → Quantity + remark → POST stock |
| **Inventory hub** | Stock timeline → Select product → Movements list (paginated) |
| **Product create/edit** | Maintain stock switch, opening stock, low stock alert |
| **Product list/detail** | Show current stock, unit, value; low stock badge; Add/Reduce stock, Stock timeline |
| **Invoice/Challan save** | On 400 INSUFFICIENT_STOCK, show message and let user retry |

---

## 14. Checklist

- [ ] API client methods: get/update inventory settings, list products (with lowStock), get product, adjust stock, get stock movements.
- [ ] Models: InventorySettings, Product (with stock fields), StockMovement.
- [ ] Homepage: Inventory tile → Inventory screen.
- [ ] Inventory screen: app bar + Settings entry; Low stock; Add/Reduce stock; Stock timeline.
- [ ] Inventory settings screen: reduceStockOn, stockValueBasedOn, allowNegativeStock.
- [ ] Low stock list: products with `lowStock=true`.
- [ ] Add/Reduce stock: product picker → quantity + remark → handle INSUFFICIENT_STOCK.
- [ ] Stock timeline: product picker → paginated movements.
- [ ] Product create/edit: maintainStock, openingStock, lowStockAlertQty; do not send currentStock.
- [ ] Product list/detail: show stock, value, low-stock badge; actions for Add/Reduce and Timeline.
- [ ] Invoice (and challan) save: handle 400 INSUFFICIENT_STOCK and show message.

This completes the recommended integration with inventory on the homepage as a first-class option like other features.
