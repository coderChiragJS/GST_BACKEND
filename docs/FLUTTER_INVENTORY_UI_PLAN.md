# Flutter: Inventory Feature — UI Plan

A screen-by-screen plan of **exactly what UI is needed** for the inventory feature. Use this as the single reference for layout, components, and copy.

---

## Features covered in this plan

This UI plan implements the following **inventory features**:

| # | Feature | What it does | Where in this doc |
|---|---------|--------------|-------------------|
| 1 | **Inventory entry** | One tap from homepage to open the inventory module | § 1 Homepage |
| 2 | **Inventory hub** | Central screen with shortcuts to low stock, add/reduce stock, and stock timeline | § 2 Inventory hub |
| 3 | **Inventory settings** | Configure when to reduce stock (invoice vs delivery challan), how to value stock (purchase vs sale), and whether to allow negative stock | § 3 Inventory settings |
| 4 | **Low stock list** | View all products that are at or below their low-stock alert level | § 4 Low stock list |
| 5 | **Add stock** | Manually increase quantity for a product (same unit as product) | § 5 Product picker, § 6 Add/Reduce stock |
| 6 | **Reduce stock** | Manually decrease quantity for a product (with optional remark) | § 5 Product picker, § 6 Add/Reduce stock |
| 7 | **Stock timeline** | View movement history for a product (adjustments, invoices, delivery challans) with pagination | § 7 Stock timeline |
| 8 | **Maintain stock on product** | Enable stock tracking per product with opening stock and low-stock alert level | § 8 Product form |
| 9 | **Stock on product list** | Show current stock, unit, stock value, and low-stock badge on the product list | § 9 Product list |
| 10 | **Stock on product detail** | Show current stock, value, alert level, and actions (Add/Reduce stock, Stock timeline) on product detail | § 10 Product detail |
| 11 | **Insufficient stock handling** | When saving an invoice (or delivery challan), show a clear error and let the user retry without losing the form | § 11 Invoice/Challan save |

**Out of scope in this plan (as per backend):** Barcode, secondary unit for stock, and other extra options are not included.

---

## Coverage checklist (backend vs UI)

Use this to verify every backend behaviour has UI (or explicit “no UI needed”).

| Backend behaviour | UI covered? | Where |
|-------------------|-------------|--------|
| GET/PUT inventory settings | Yes | § 3 Inventory settings |
| Product: maintainStock, openingStock, lowStockAlertQty (create/update) | Yes | § 8 Product form |
| Product: do not send currentStock | Yes | § 8 Rules |
| Product list: currentStock, stockValue, lowStockAlertQty, unit | Yes | § 9 Product list |
| Product list: filter lowStock=true | Yes | § 4 Low stock list, § 9 optional filter |
| Product get: currentStock, stockValue | Yes | § 10 Product detail |
| POST adjust stock (add/reduce) with remark | Yes | § 6 Add/Reduce stock |
| Adjust stock: INSUFFICIENT_STOCK, STOCK_NOT_TRACKED, VALIDATION_FAILED | Yes | § 6 Behaviour |
| Adjust stock: 404 Product not found | Yes (added below) | § 6 Behaviour |
| GET stock-movements with nextToken | Yes | § 7 Stock timeline + Load more |
| Invoice: deduct stock when status = **saved** (create or update) | Yes | § 11 (save = save with status Saved) |
| Invoice: reverse stock when update from saved to draft/cancelled or on delete | No UI needed | Backend auto-reverses |
| Delivery challan: deduct when status ≠ cancelled | Yes | § 11 (same error handling) |
| Delivery challan: reverse when update to cancelled or on delete | No UI needed | Backend auto-reverses |
| Insufficient stock on invoice/challan save → 400, don’t clear form | Yes | § 11 |
| Stock timeline: activityType adjustment / invoice / deliveryChallan | Yes | § 7 Movement row |
| Stock timeline: remark e.g. "Reversal" for reversed docs | Yes | § 7 Remark (if any) |
| Same unit as product for all stock (add/reduce/timeline) | Yes | Unit shown in § 6, § 7, § 9, § 10 |

---

## Overview

| # | Screen / Area | Purpose |
|---|----------------|---------|
| 1 | Homepage (add tile) | Entry to inventory |
| 2 | Inventory hub | Central screen with 4 sections |
| 3 | Inventory settings | Configure reduce-on, value-based-on, negative stock |
| 4 | Low stock list | Products at or below alert level |
| 5 | Product picker (for stock) | Choose product for add/reduce or timeline |
| 6 | Add / Reduce stock | Quantity + remark form |
| 7 | Stock timeline | Movement history for one product |
| 8 | Product form (create/edit) | Stock section: maintain stock, opening, alert |
| 9 | Product list (existing) | Show stock, value, low-stock badge |
| 10 | Product detail (existing) | Stock block + Add/Reduce + Timeline |
| 11 | Invoice / Challan save | Error handling for insufficient stock |

---

## 1. Homepage — Add inventory tile

**Where:** Same grid/row as existing tiles (Invoices, Products, Parties, etc.).

**UI needed:**

| Element | Type | Details |
|--------|------|--------|
| Tile / card | Same style as other tiles | Label: **"Inventory"** |
| Icon | Same size/style as other tiles | e.g. `Icons.inventory_2` or `Icons.warehouse` |
| Tap target | onTap | Navigate to **Inventory hub** screen |

**No new screen.** One new tile and one route to the hub.

---

## 2. Inventory hub screen

**Route:** e.g. `/inventory` or `InventoryScreen`.

**App bar:**

| Element | Type | Details |
|--------|------|---------|
| Title | Text | **"Inventory"** |
| Trailing action (optional) | IconButton | Icon: gear/settings → Navigate to **Inventory settings** |

**Body — vertical list of sections (cards or list tiles):**

| Section | Label | Subtitle (optional) | Tap action |
|---------|--------|---------------------|------------|
| 1 | **Low stock** | e.g. "3 items below alert" or count badge | Navigate to **Low stock list** |
| 2 | **Add stock** | "Increase quantity for a product" | Navigate to **Product picker** (then Add/Reduce flow) |
| 3 | **Reduce stock** | "Decrease quantity for a product" | Same as Add stock (one flow: product → then choose Add/Reduce) |
| 4 | **Stock timeline** | "View movement history" | Navigate to **Product picker** (then Stock timeline) |

**Optional:** One summary card at top: e.g. "X products low on stock" (call `GET products?lowStock=true` and show count). Keep simple.

**UI components:**

- Reusable **section card** or **ListTile**: leading icon, title, optional subtitle, trailing arrow.
- If no low-stock items, section 1 can show "No low stock items" as subtitle instead of count.

---

## 3. Inventory settings screen

**Route:** e.g. `/inventory/settings` or pushed from hub.

**App bar:**

| Element | Type | Details |
|--------|------|---------|
| Title | Text | **"Inventory settings"** |
| Leading | Back | Pop |
| Trailing (optional) | TextButton "Save" | Save and pop |

**Body — form (single scrollable column):**

| Row | Label | Control | Notes |
|-----|--------|---------|--------|
| 1 | **Reduce stock on** | Segmented control or dropdown | Options: **"Invoice"** \| **"Delivery Challan"**. Default from API: `reduceStockOn`. |
| 2 | **Stock value based on** | Segmented control or dropdown | Options: **"Purchase price"** \| **"Sale price"**. Map to `stockValueBasedOn`. |
| 3 | **Allow negative stock** | Switch | Label: e.g. "Allow negative stock (overselling)". Map to `allowNegativeStock`. |

**Behaviour:**

- On init: `GET .../settings/inventory` → bind to form. If GET fails, show error (e.g. snackbar) and allow retry.
- On save: `PUT .../settings/inventory` with current form values → success snackbar → pop. If PUT fails, show error and keep form open.
- Validation: no strict validation; all fields have valid defaults.

**UI components:**

- Section heading (e.g. "When to reduce stock", "Valuation", "Rules").
- Radio group / segmented button for 2 options; Switch for boolean.

---

## 4. Low stock list screen

**Route:** e.g. `/inventory/low-stock`. Entry from hub "Low stock".

**App bar:**

| Element | Type | Details |
|--------|------|---------|
| Title | Text | **"Low stock"** |
| Leading | Back | Pop |

**Body:**

| State | UI |
|-------|-----|
| Loading | Centered progress indicator or shimmer list |
| Empty | Centered message: **"No low stock items"** (optional subtext: "Products at or above alert level") |
| Data | List of product rows (see below) |

**Product row (each item):**

| Element | Content |
|--------|---------|
| Title | Product name |
| Subtitle line 1 | e.g. "Current: **X** {unit}" (e.g. "Current: 3 Nos") |
| Subtitle line 2 (optional) | "Alert at: X" and/or "Value: ₹ Y" |
| Trailing | Optional: chevron or "Add stock" text button |
| Tap | Navigate to **Product detail** or open **Add stock** bottom sheet for this product |

**API:** `GET /business/:businessId/products?lowStock=true`. Use `products` array.

---

## 5. Product picker screen (for Add/Reduce and Timeline)

**Route:** e.g. `/inventory/select-product` or modal. Entry from hub "Add stock", "Reduce stock", or "Stock timeline".

**App bar:**

| Element | Type | Details |
|--------|------|---------|
| Title | Text | **"Select product"** or "Add/Reduce stock" / "Stock timeline" (context-specific) |
| Leading | Back | Pop |
| Search (optional) | TextField | Filter list by product name |

**Body:**

| State | UI |
|-------|-----|
| Loading | Progress indicator |
| Empty | "No products with stock tracking" (only show products where `maintainStock == true`) |
| Data | List of products with `maintainStock: true`: name, current stock + unit, optional stock value. Tap → next step (Add/Reduce form or Stock timeline) |

**Logic:** Use `GET /business/:businessId/products`, filter client-side `maintainStock == true`, or add a query param if backend supports it later.

---

## 6. Add / Reduce stock screen (or bottom sheet)

**Route:** e.g. `/inventory/adjust-stock?productId=...` or modal. Entry: from product picker with selected product.

**App bar (if full screen):**

| Element | Type | Details |
|--------|------|---------|
| Title | Text | **"Adjust stock"** or "Add stock" / "Reduce stock" |
| Leading | Back | Pop |

**Body — form:**

| Row | Label | Control | Required |
|-----|--------|---------|----------|
| Product (read-only) | Product name + unit | Text | — |
| Quantity | Number input | Positive integer; validate > 0 | Yes |
| Add / Reduce | Two buttons or segmented | **"Add stock"** (positive) \| **"Reduce stock"** (negative) | Yes |
| Remark | Single-line or multi-line text | Optional | No |
| Submit | FAB or elevated button | "Update stock" or "Add" / "Reduce" | — |

**Behaviour:**

- Submit: `POST .../products/:productId/stock` with `quantityChange` (+qty or -qty) and optional `remark`.
- Success: Snackbar "Stock updated" → pop to hub or product picker.
- Error **400, INSUFFICIENT_STOCK:** Snackbar or dialog: "Insufficient stock. Current: X {unit}. Reduce quantity or enable negative stock in settings." Do **not** pop; user can change quantity and retry.
- Error **400, STOCK_NOT_TRACKED:** Snackbar "Stock tracking is not enabled for this product."
- Error **400, VALIDATION_FAILED:** Snackbar with `message` (e.g. quantity must be non-zero).
- Error **404:** Snackbar "Product not found." (e.g. product was deleted) → pop back.

**Optional:** API accepts `date` in body; you can add an optional date picker for the adjustment, or omit it (backend still records `createdAt`).

**UI components:**

- Number field (ensure no decimal if you restrict to whole numbers).
- Two primary actions or one field + two buttons to set sign.

---

## 7. Stock timeline screen

**Route:** e.g. `/inventory/stock-timeline?productId=...`. Entry: from product picker with selected product.

**App bar:**

| Element | Type | Details |
|--------|------|---------|
| Title | Text | **"Stock timeline"** or product name |
| Subtitle (optional) | Text | Product name + unit (e.g. "Product name (Nos)") |
| Leading | Back | Pop |

**Body:**

| State | UI |
|-------|-----|
| Loading | Progress indicator |
| Empty | "No movements yet" |
| Data | List of movement rows (newest first). **Load more** at bottom when `nextToken` is present |

**Movement row:**

| Element | Content |
|--------|---------|
| Date/time | Format `createdAt` (e.g. "18 Feb 2025, 3:45 PM") |
| Type | "Adjustment" \| "Invoice" \| "Delivery challan" (map from `activityType`) |
| Quantity change | "+10" or "-5" (green/red or with icon) |
| Final stock | "Stock after: 25 Nos" |
| Reference (if any) | e.g. "Invoice INV-001" from `referenceNumber` |
| Remark (if any) | `remark` (may be "Reversal" when an invoice/challan was deleted or set to draft/cancelled) |

**Pagination:** When response has `nextToken`, show "Load more" button; on tap, call same API with `nextToken` and append to list.

**API:** `GET .../products/:productId/stock-movements?limit=20&nextToken=...`

---

## 8. Product create / edit — Stock section

**Where:** Existing product add and product edit screens. Add one collapsible or plain section.

**Section title:** **"Stock"** or **"Inventory"**.

**Fields:**

| Row | Label | Control | When visible |
|-----|--------|---------|----------------|
| Maintain stock | Switch | On/Off | Always |
| Opening stock | Number input (non-negative) | Integer or decimal per your product form | When **Maintain stock** is ON (and on create, or when first turning ON on edit) |
| Low stock alert at | Number input (non-negative) | Default 0 | When **Maintain stock** is ON |
| Unit (read-only or edit) | Text / dropdown | Product unit (e.g. Nos) | Already in product form; show so user knows stock is in this unit |

**Rules:**

- Do **not** send `currentStock` in create/update.
- When user first turns ON "Maintain stock" on edit and sets "Opening stock", backend will set `currentStock` from it; after save, refresh product so detail shows updated `currentStock`.

---

## 9. Product list (existing screen) — Stock display

**Where:** Existing product list. Add columns or subtitle for stock.

**Per row (for products with `maintainStock == true`):**

| Element | Content |
|---------|---------|
| Existing | Name, price, etc. |
| New | **Current stock:** "X {unit}" (e.g. "10 Nos") |
| New (optional) | **Stock value:** "₹ Y" (from `stockValue`) |
| New | **Low stock badge:** If `currentStock <= lowStockAlertQty`, show chip/badge "Low stock" (e.g. orange/red) |

**Optional:** Filter chip "Low stock only" that calls `GET .../products?lowStock=true` and shows only those.

---

## 10. Product detail (existing screen) — Stock block and actions

**Where:** Existing product detail. Add a **Stock** block when `maintainStock == true`.

**Stock block (card or section):**

| Line | Content |
|------|---------|
| 1 | **Current stock:** X {unit} |
| 2 | **Stock value:** ₹ Y |
| 3 | **Low stock alert at:** Z {unit} |

**Actions (buttons or icon buttons):**

| Button | Action |
|--------|--------|
| **Add stock** | Navigate to Add/Reduce screen with this product (prefill product; user enters quantity + Add) |
| **Reduce stock** | Same screen, user enters quantity + Reduce |
| **Stock timeline** | Navigate to Stock timeline screen for this product |

You can use one "Adjust stock" button that opens the same Add/Reduce screen.

---

## 11. Invoice / Delivery challan save — Insufficient stock handling

**Where:** Existing invoice create/update and delivery challan create/update (when the document is saved in a status that deducts stock).

**When stock is deducted (backend):**
- **Invoice:** Only when status is **Saved** (on create with status Saved, or on update when changing to Saved). Draft and Cancelled do not deduct; changing from Saved to Draft/Cancelled or deleting a Saved invoice **reverses** stock (no UI needed).
- **Delivery challan:** When status is **not** Cancelled (e.g. Pending, Delivered). Cancelling or deleting a non-cancelled challan **reverses** stock (no UI needed).

**No new UI components.** Only error handling:

| When | UI |
|------|-----|
| Save returns **400** and body `code == "INSUFFICIENT_STOCK"` or `"STOCK_ERROR"` | Show dialog or snackbar: **"Insufficient stock for one or more items. [message from API]. Reduce quantities or enable negative stock in Inventory settings."** Optionally show `currentStock` if API returns it. |
| Action | Do **not** clear or close the form; user can reduce quantities and tap Save again. |

---

## 12. Screen flow (navigation)

```
Homepage
  └─ [Inventory tile] → Inventory hub
                          ├─ [Settings] → Inventory settings (Save → pop)
                          ├─ [Low stock] → Low stock list → (tap product) → Product detail or Add stock
                          ├─ [Add stock]  → Product picker → Add/Reduce stock (submit → pop)
                          ├─ [Reduce stock] → same Product picker → Add/Reduce stock
                          └─ [Stock timeline] → Product picker → Stock timeline (with Load more)

Product list → Product detail (existing)
                 └─ [Add stock / Reduce stock] → Add/Reduce stock
                 └─ [Stock timeline] → Stock timeline

Product create / edit (existing)
  └─ Stock section: Maintain stock, Opening stock, Low stock alert at
```

---

## 13. UI checklist (implement in this order)

1. **Homepage:** Add Inventory tile and route to hub.
2. **Inventory hub:** App bar + 4 section cards (Low stock, Add stock, Reduce stock, Stock timeline) + settings entry.
3. **Inventory settings:** Form (reduce on, value based on, allow negative) + load/save.
4. **Low stock list:** List from `?lowStock=true`, empty state, row layout.
5. **Product picker:** List of products with `maintainStock == true`, tap → next screen.
6. **Add/Reduce stock:** Product display, quantity, Add/Reduce, remark, submit; error handling (INSUFFICIENT_STOCK, STOCK_NOT_TRACKED, VALIDATION_FAILED).
7. **Stock timeline:** List of movements, date/type/qty/final stock/reference/remark; Load more with nextToken.
8. **Product form:** Stock section (maintain stock, opening stock, low stock alert).
9. **Product list:** Stock and value columns, low-stock badge; optional low-stock filter.
10. **Product detail:** Stock block + Add stock, Reduce stock, Stock timeline actions.
11. **Invoice/Challan:** Handle 400 INSUFFICIENT_STOCK / STOCK_ERROR and show message without closing form.

---

## 14. Edge cases and “no UI” behaviours

| Case | What happens | UI needed? |
|------|----------------|------------|
| User deletes a **saved invoice** | Backend reverses stock for all line items | No — stock updates automatically; no extra screen or message required. |
| User **cancels** an invoice or delivery challan (or deletes a non-cancelled challan) | Backend reverses stock | No — same as above. |
| User updates invoice from **Saved → Draft** | Backend reverses stock | No — same as above. |
| Product has **maintainStock false** | No stock block on detail; not shown in product picker or low-stock list | Yes — already in plan (§ 9, § 10: only show stock when maintainStock true; § 5: filter by maintainStock). |
| **Service** products | Usually maintainStock false; no stock | Same as above. |
| Adjust stock **404** (product deleted) | Show message and go back | Yes — § 6: 404 handling added. |
| Timeline **Reversal** entries | activityType still invoice/deliveryChallan; remark may be "Reversal" | Yes — § 7: Remark (if any) covers this. |
| Optional **date** in adjust stock | Backend accepts it; not required | Optional — § 6: optional date picker or omit. |

This is the complete UI needed for the inventory feature on the Flutter frontend.
