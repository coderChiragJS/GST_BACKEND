# Flutter: Invoice Packing Slip PDF

Instructions for implementing **packing slip PDF** generation in the Flutter app. There is **no CRUD** – the user only **generates** a packing slip PDF for an existing invoice.

---

## 1. What is the packing slip?

A **packing slip** is a shipping document that lists:
- Seller (business) details
- Invoice number and date
- Ship-to (customer/shipping address)
- **Items:** product name, HSN/SAC, quantity, unit (no prices or tax)

It is used for packing and dispatch, not for billing. One packing slip per invoice; the user generates it on demand.

---

## 2. Endpoint

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/business/:businessId/invoices/:invoiceId/packing-slip-pdf` | Generate packing slip PDF for the invoice; returns PDF URL |

- **Path parameters:** `businessId`, `invoiceId` (same as existing invoice APIs).
- **Auth:** Same as existing APIs: `Authorization: Bearer <token>`.
- **Base URL:** Same as for invoices and receipts (e.g. your API base).

---

## 3. Request

**Headers**

| Header            | Value                    |
|-------------------|--------------------------|
| Authorization     | `Bearer <token>`         |
| Content-Type      | `application/json`       |

**Body (JSON, optional)**

| Field       | Type   | Required | Notes                                      |
|------------|--------|----------|--------------------------------------------|
| templateId | string | No       | PDF template; default `"classic"` if omitted. Only `"classic"` is supported. |

Example:

```json
{
  "templateId": "classic"
}
```

Omit body or send `{}` to use the default classic template.

---

## 4. Response

**Success: 200 OK**

| Field      | Type   | Notes                                      |
|-----------|--------|--------------------------------------------|
| pdfUrl    | string | Public URL to the generated PDF (e.g. S3)  |
| invoiceId | string | Echo of the requested invoiceId            |
| templateId| string | Echo of the template used (e.g. `"classic"`) |

Example:

```json
{
  "pdfUrl": "https://your-bucket.s3.region.amazonaws.com/invoices/.../packing-slip-classic.pdf",
  "invoiceId": "abb7c269-e7d0-497e-a878-5eb9fb14171e",
  "templateId": "classic"
}
```

**Errors**

- **400 Bad Request** – Missing businessId or invoiceId in URL. Body e.g. `{ "message": "..." }`.
- **404 Not Found** – Invoice not found. Body e.g. `{ "message": "Invoice not found" }`.
- **500** – PDF generation failed. Body e.g. `{ "message": "...", "error": "..." }`.

---

## 5. PDF content (what the user sees)

The generated packing slip PDF includes:
- **Title:** “PACKING SLIP”
- **Seller:** Firm name, address, GSTIN
- **Invoice reference:** Invoice number and invoice date
- **Ship to:** Name and address (from invoice’s shipping details if present, else billing)
- **Items table:** Sr. No., Product/Description, HSN/SAC, Qty, Unit (no prices or tax)
- **Footer:** Short “for shipping reference only” line

---

## 6. Flutter implementation

### 6.1 API client

```dart
/// Generates packing slip PDF for the given invoice.
/// Returns the public URL of the generated PDF.
Future<String> generateInvoicePackingSlipPdf({
  required String businessId,
  required String invoiceId,
  String templateId = 'classic',
}) async {
  final res = await http.post(
    Uri.parse('$baseUrl/business/$businessId/invoices/$invoiceId/packing-slip-pdf'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({'templateId': templateId}),
  );
  if (res.statusCode != 200) throw ApiException(res);
  final data = jsonDecode(res.body) as Map<String, dynamic>;
  return data['pdfUrl'] as String;
}
```

### 6.2 Where to add the action in the app

- **Invoice detail screen:** Add an action (e.g. a button or menu item) such as **“Packing slip”** or **“Generate packing slip”**.
- **Optional:** Same action from the invoice list (e.g. long-press or overflow menu → “Packing slip”) if the list has quick actions.

**Flow:**
1. User opens an invoice (detail or from list with invoiceId).
2. User taps **“Packing slip”** (or “Generate packing slip”).
3. App shows a short loading state (e.g. progress or snackbar “Generating…”).
4. App calls `generateInvoicePackingSlipPdf(businessId, invoiceId)`.
5. On success, app receives `pdfUrl`. Open the URL in the in-app browser or system browser, or in a PDF viewer (same way you open invoice PDF / statement PDF).
6. On error (404, 500), show a message (e.g. “Could not generate packing slip. Try again.”).

### 6.3 Opening the PDF

Use the same approach as for the existing **invoice PDF** or **statement PDF**:
- Launch URL in `url_launcher` (e.g. `launchUrl(Uri.parse(pdfUrl))`), or
- Download and open in a local PDF viewer, or
- Display in an in-app WebView / PDF viewer if you already use one for other PDFs.

No need to store or list packing slips – generate on demand and show the URL.

### 6.4 Summary

| Item | Details |
|------|--------|
| **CRUD** | None. Only generate PDF. |
| **Endpoint** | `POST .../invoices/:invoiceId/packing-slip-pdf` |
| **Body** | Optional `{ "templateId": "classic" }` |
| **Response** | `pdfUrl`, `invoiceId`, `templateId` |
| **UI** | One action per invoice: “Packing slip” → loading → open `pdfUrl` |

This is enough for the Flutter dev to implement packing slip PDF generation.
