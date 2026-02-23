# Flutter: Proforma Invoice PDF Integration

This document describes how to integrate **Proforma Invoice PDF** in the Flutter app. Proforma reuses the full quotation flow: same screens and data; only the PDF request gains an optional `outputType: 'proforma'` and one new menu item is needed.

---

## 1. Purpose

Generate a **Proforma Invoice PDF** from an existing quotation. The PDF uses the same data as the Quotation PDF but shows:

- Title: **PROFORMA INVOICE** (instead of QUOTATION)
- Disclaimer: **"This is not a tax invoice. For approval/estimate only."**

No new screens or data model. One extra download option on the quotation detail screen.

---

## 2. Endpoint

Same as quotation PDF:

| Method | Path |
|--------|------|
| POST | `/business/:businessId/quotations/:quotationId/pdf` |

**Path parameters:** `businessId`, `quotationId` (same as existing quotation PDF).

**Auth:** Same as other business APIs: `Authorization: Bearer <token>`.

---

## 3. Request

**Headers**

- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body (JSON)**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| templateId | string | Yes | Same as quotation PDF: `classic`, `compact`, or `modern`. |
| copyType | string | No | `original`, `duplicate`, or `triplicate`. Default `original`. |
| **outputType** | string | No | Send `"proforma"` when the user chooses "Download as Proforma". Omit for normal quotation PDF. |

**Example – Quotation PDF (existing behaviour):**

```json
{
  "templateId": "classic"
}
```

**Example – Proforma PDF:**

```json
{
  "templateId": "classic",
  "outputType": "proforma"
}
```

---

## 4. Response

**Success: 200 OK**

| Field | Type | Notes |
|-------|------|--------|
| pdfUrl | string | Public URL of the generated PDF. Open in-app, browser, or download (same as quotation PDF). |
| quotationId | string | Echo of the requested quotationId. |
| templateId | string | Echo of the template used. |
| copyType | string | Echo of the copy type. |
| outputType | string | Present when Proforma was requested; value `"proforma"`. Omitted for normal quotation PDF. |

**Example – Proforma response:**

```json
{
  "pdfUrl": "https://bucket.s3.region.amazonaws.com/quotations/.../proforma.pdf",
  "quotationId": "uuid",
  "templateId": "classic",
  "copyType": "original",
  "outputType": "proforma"
}
```

Use `pdfUrl` the same way as for the existing quotation PDF (e.g. `url_launcher`, in-app viewer, or download).

---

## 5. Where in the app

- **Screen:** Quotation detail (view) screen.
- **Action:** In the "More" menu (or equivalent), add one option: **"Download as Proforma"** (or "Proforma PDF").
- **Flow:** On tap, call the same PDF method with `outputType: 'proforma'` in the body; on 200, use the returned `pdfUrl` to open or download the PDF.

No new screens or navigation. Same pattern as existing "Download", "Duplicate for Transporter", "Triplicate for Supplier".

---

## 6. Errors

Same as existing quotation PDF:

| Status | Meaning |
|--------|---------|
| 400 | Invalid or missing params (e.g. invalid templateId). Body: `{ "message": "...", "allowedTemplates": [...] }`. |
| 404 | Quotation not found. Body: `{ "message": "Quotation not found" }`. |
| 503 | PDF generation failed. Body: `{ "message": "PDF generation failed", "error": "..." }`. |

No new error types for Proforma.

---

## 7. Step-by-step integration instructions

Follow these steps so the frontend correctly integrates Proforma PDF.

### Step 1: Update the quotation PDF service method

In your quotation PDF service (e.g. `lib/services/quotation_service.dart` or equivalent):

1. Add an **optional** parameter to the existing PDF method, for example:
   - `String? outputType` (or `String outputType = ''`).
2. When building the request body, if `outputType` is not null/empty, add it to the JSON:
   - `body['outputType'] = outputType;`
3. Do **not** change the URL, method (POST), or path params. Same endpoint as today.

**Example (conceptual):**

```dart
Future<String> generatePdf(
  String token,
  String businessId,
  String quotationId, {
  String templateId = 'classic',
  String? copyType,
  String? outputType,  // Add this
}) async {
  final body = <String, dynamic>{'templateId': templateId};
  if (copyType != null && copyType.isNotEmpty) body['copyType'] = copyType;
  if (outputType != null && outputType.isNotEmpty) body['outputType'] = outputType;  // Add this
  // ... same POST request, same headers, same response handling (use pdfUrl)
}
```

### Step 2: Add the "Download as Proforma" action in the UI

1. Open the **quotation detail** (view) screen.
2. Find where you show the existing PDF options (e.g. "Download", "Duplicate for Transporter", "Triplicate for Supplier")—usually in a "More" or overflow menu.
3. Add **one new menu item**, e.g. **"Download as Proforma"** or **"Proforma PDF"**.
4. On tap of this item:
   - Call the **same** `generatePdf` method with:
     - `templateId`: same as you use for normal quotation (e.g. `'classic'`).
     - `copyType`: `'original'` (or omit) for the standard Proforma; use `'duplicate'` or `'triplicate'` only if you add separate "Proforma Duplicate" / "Proforma Triplicate" options.
     - **`outputType: 'proforma'`** (required for this action).
   - Use the returned **`pdfUrl`** exactly as you do for the existing "Download" (e.g. open in browser, in-app viewer, or download). No change to how you handle the response.

### Step 3: Handle response and errors

- **Success (200):** Response contains `pdfUrl`. Open or download it the same way as for the normal quotation PDF. You may see `outputType: "proforma"` in the response; you do not need to handle it differently.
- **Errors:** Use the same error handling as for the existing quotation PDF (400, 404, 503). Show the same messages or generic "Failed to generate PDF".

### Step 4: Optional – Proforma with Duplicate / Triplicate

If you want "Proforma – Duplicate" and "Proforma – Triplicate" in the menu (same as quotation duplicate/triplicate but with Proforma heading):

- Call the same endpoint with:
  - `outputType: 'proforma'`
  - `copyType: 'duplicate'` or `copyType: 'triplicate'`
- Backend returns the same PDF format with "Duplicate" or "Triplicate" in the top-right and saves as `proforma_duplicate.pdf` / `proforma_triplicate.pdf`. No extra code on your side beyond passing both parameters.

### Checklist

- [ ] Service: optional `outputType` parameter added; when provided, included in request body.
- [ ] UI: one new menu item "Download as Proforma" on quotation detail screen.
- [ ] On tap: call existing PDF method with `outputType: 'proforma'`, then open/download `pdfUrl` from response.
- [ ] No new screens, no new routes, no change to quotation create/edit flow.
- [ ] (Optional) Proforma + duplicate/triplicate: pass `copyType` along with `outputType: 'proforma'`.

---

## 8. Summary

- **Reuse:** Same quotation flow; same endpoint as quotation PDF.
- **Change:** Add optional request body field `outputType: "proforma"` when user chooses "Download as Proforma".
- **UI:** One new menu item on quotation detail that calls the PDF API with `outputType: 'proforma'` and opens the returned `pdfUrl`.
