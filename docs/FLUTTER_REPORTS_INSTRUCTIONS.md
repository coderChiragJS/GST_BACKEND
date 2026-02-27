# Flutter Integration Guide: Reports Module

## Overview

The Reports module provides 9 report types covering sales analysis, GST compliance, stock tracking, and TDS summaries. Each report is available as both JSON (for displaying in the app) and PDF (for download/share).

**No existing APIs, models, or functionality have been changed.** Only new routes were added.

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

### 1. Get Report (JSON)

```
GET /business/:businessId/reports/:reportType
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| fromDate | string | No | Start date in `YYYY-MM-DD` format |
| toDate | string | No | End date in `YYYY-MM-DD` format |
| status | string | No | Filter by status (only for `invoice-details` and `delivery-challan`) |

### 2. Generate Report PDF

```
POST /business/:businessId/reports/:reportType/pdf
```

**Request Body:**

```json
{
  "fromDate": "2025-04-01",
  "toDate": "2026-03-31",
  "status": null,
  "templateId": "classic"
}
```

All body fields are optional. `templateId` defaults to `"classic"`.

**Response:**

```json
{
  "pdfUrl": "https://bucket.s3.amazonaws.com/reports/...",
  "reportType": "invoice-details",
  "templateId": "classic"
}
```

---

## Available Report Types

| reportType | Report Name | Date Filter | Status Filter |
|------------|-------------|:-----------:|:-------------:|
| `invoice-details` | Invoice Details Report | Yes | Yes |
| `delivery-challan` | Delivery Challan Report | Yes | Yes |
| `current-stock` | Current Stock Report | No | No |
| `party-wise-sales` | Party Wise Sales Report | Yes | No |
| `product-wise-sales` | Product Wise Sales Report | Yes | No |
| `tds-summary` | TDS Summary - Receivable | Yes | No |
| `hsn-sales` | HSN Wise Sales Report | Yes | No |
| `gst-sales` | GST Sales Report | Yes | No |
| `gstr1` | GSTR-1 Report | Yes | No |

---

## Report Response Formats

### 1. Invoice Details Report

```
GET /business/:businessId/reports/invoice-details?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "invoice-details",
  "reportTitle": "Invoice Details Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "date": "2025-06-15",
      "invoiceNumber": "INV-000001",
      "partyName": "ABC Traders",
      "gstin": "29AABCU9603R1ZM",
      "taxableAmount": 10000.00,
      "taxAmount": 1800.00,
      "cessAmount": 0.00,
      "grandTotal": 11800.00,
      "paidAmount": 5000.00,
      "tdsAmount": 200.00,
      "balanceDue": 6600.00,
      "status": "saved"
    }
  ],
  "summary": {
    "invoiceCount": 32,
    "totalTaxable": 85000.00,
    "totalTax": 15300.00,
    "totalGrand": 100300.00,
    "totalBalance": 45000.00
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 2. Delivery Challan Report

```
GET /business/:businessId/reports/delivery-challan?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "delivery-challan",
  "reportTitle": "Delivery Challan Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "date": "2025-07-10",
      "challanNumber": "DC-000001",
      "partyName": "XYZ Ltd",
      "itemCount": 3,
      "totalQuantity": 50,
      "amount": 25000.00,
      "status": "delivered"
    }
  ],
  "summary": {
    "challanCount": 4,
    "totalQuantity": 200,
    "totalAmount": 65000.00
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 3. Current Stock Report

```
GET /business/:businessId/reports/current-stock
```

No date filter needed -- this is a real-time snapshot.

```json
{
  "reportType": "current-stock",
  "reportTitle": "Current Stock Report",
  "period": null,
  "data": [
    {
      "productName": "Widget A",
      "hsnSac": "8471",
      "unit": "Nos",
      "currentStock": 150,
      "lowStockAlertQty": 10,
      "salesPrice": 500.00,
      "stockValue": 75000.00,
      "isLowStock": false
    }
  ],
  "summary": {
    "productCount": 3,
    "totalStockValue": 125000.00
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

**Flutter tip:** Use `isLowStock: true` to highlight rows in red/orange.

### 4. Party Wise Sales Report

```
GET /business/:businessId/reports/party-wise-sales?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "party-wise-sales",
  "reportTitle": "Party Wise Sales Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "partyName": "ABC Traders",
      "gstin": "29AABCU9603R1ZM",
      "invoiceCount": 12,
      "totalTaxable": 50000.00,
      "totalTax": 9000.00,
      "totalAmount": 59000.00
    }
  ],
  "summary": {
    "partyCount": 6,
    "totalInvoices": 23,
    "totalTaxable": 77050.00,
    "totalTax": 3534.56,
    "totalAmount": 81246.05
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 5. Product Wise Sales Report

```
GET /business/:businessId/reports/product-wise-sales?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "product-wise-sales",
  "reportTitle": "Product Wise Sales Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "productName": "Waste Paper",
      "hsnSac": "4707",
      "unit": "Kgs",
      "quantitySold": 1508,
      "totalTaxable": 75450.00,
      "totalTax": 3772.50,
      "totalAmount": 79222.50
    }
  ],
  "summary": {
    "productCount": 4,
    "totalQuantity": 1621,
    "totalTaxable": 77050.00,
    "totalTax": 3534.56,
    "totalAmount": 80455.75
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 6. TDS Summary Receivable

```
GET /business/:businessId/reports/tds-summary?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "tds-summary",
  "reportTitle": "TDS Summary - Receivable",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "partyName": "ABC Traders",
      "section": "194C",
      "voucherCount": 5,
      "totalTds": 500.00
    }
  ],
  "summary": {
    "partyCount": 2,
    "totalVouchers": 9,
    "grandTotalTds": 761.00
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 7. HSN Sales Report

```
GET /business/:businessId/reports/hsn-sales?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "hsn-sales",
  "reportTitle": "HSN Wise Sales Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "hsnSac": "4707",
      "description": "Waste Paper (Recycled)",
      "uqc": "Kgs",
      "totalQuantity": 1508,
      "taxableValue": 75450.00,
      "igst": 0.00,
      "cgst": 1886.25,
      "sgst": 1886.25,
      "cess": 0.00,
      "totalTax": 3772.50
    }
  ],
  "summary": {
    "hsnCount": 3,
    "totalTaxable": 77050.00,
    "totalIgst": 0.00,
    "totalCgst": 1767.29,
    "totalSgst": 1767.29,
    "totalCess": 0.00,
    "totalTax": 3534.57
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 8. GST Sales Report

```
GET /business/:businessId/reports/gst-sales?fromDate=2025-04-01&toDate=2026-03-31
```

```json
{
  "reportType": "gst-sales",
  "reportTitle": "GST Sales Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "data": [
    {
      "gstRate": 5,
      "taxableValue": 65650.00,
      "cgst": 1641.25,
      "sgst": 1641.25,
      "igst": 0.00,
      "cess": 0.00,
      "totalTax": 3282.50
    },
    {
      "gstRate": 18,
      "taxableValue": 1400.00,
      "cgst": 126.00,
      "sgst": 126.00,
      "igst": 0.00,
      "cess": 0.00,
      "totalTax": 252.00
    }
  ],
  "summary": {
    "totalTaxable": 77050.00,
    "totalCgst": 1767.28,
    "totalSgst": 1767.28,
    "totalIgst": 0.00,
    "totalCess": 0.00,
    "totalTax": 3534.56,
    "totalInvoiceValue": 80584.56
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

### 9. GSTR-1 Report

```
GET /business/:businessId/reports/gstr1?fromDate=2025-04-01&toDate=2026-03-31
```

This report has a different structure with multiple sections:

```json
{
  "reportType": "gstr1",
  "reportTitle": "GSTR-1 Report",
  "period": { "from": "2025-04-01", "to": "2026-03-31" },
  "b2b": {
    "data": [
      {
        "gstin": "29AABCU9603R1ZM",
        "partyName": "ABC Traders",
        "invoiceNumber": "INV-000001",
        "date": "2025-06-15",
        "taxableValue": 10000.00,
        "cgst": 900.00,
        "sgst": 900.00,
        "igst": 0.00,
        "cess": 0.00,
        "invoiceValue": 11800.00,
        "supplyType": "intrastate"
      }
    ],
    "summary": {
      "count": 19,
      "taxableValue": 67000.00,
      "igst": 0.00,
      "cgst": 1500.00,
      "sgst": 1500.00,
      "cess": 0.00,
      "invoiceValue": 70000.00
    }
  },
  "b2cs": {
    "data": {
      "taxableValue": 1400.00,
      "cgst": 126.00,
      "sgst": 126.00,
      "cess": 0.00,
      "totalTax": 252.00
    },
    "summary": { "count": 4 }
  },
  "b2cl": {
    "data": [],
    "summary": { "count": 0, "taxableValue": 0, "igst": 0, "invoiceValue": 0 }
  },
  "cdnr": {
    "data": [
      {
        "gstin": "29AABCU9603R1ZM",
        "partyName": "ABC Traders",
        "noteNumber": "CN-000001",
        "date": "2025-07-20",
        "noteType": "Credit Note",
        "referenceInvoiceNumber": "INV-000001",
        "taxableValue": 5000.00,
        "cgst": 450.00,
        "sgst": 450.00,
        "igst": 0.00,
        "cess": 0.00,
        "invoiceValue": 5900.00,
        "supplyType": "intrastate"
      }
    ],
    "summary": {
      "count": 1,
      "taxableValue": 5000.00,
      "igst": 0.00,
      "cgst": 450.00,
      "sgst": 450.00,
      "cess": 0.00,
      "invoiceValue": 5900.00
    }
  },
  "hsn": {
    "data": [
      {
        "hsnSac": "4707",
        "description": "Waste Paper",
        "uqc": "Kgs",
        "totalQuantity": 1508,
        "taxableValue": 75450.00,
        "igst": 0.00,
        "cgst": 1886.25,
        "sgst": 1886.25,
        "cess": 0.00,
        "totalTax": 3772.50
      }
    ],
    "summary": {
      "hsnCount": 3,
      "totalTaxable": 77050.00,
      "totalIgst": 0.00,
      "totalCgst": 1767.29,
      "totalSgst": 1767.29,
      "totalCess": 0.00,
      "totalTax": 3534.57
    }
  },
  "generatedAt": "2026-02-27T12:00:00.000Z"
}
```

**GSTR-1 Sections Explained:**

| Section | Description |
|---------|-------------|
| **B2B** | Invoices to registered parties (have GSTIN, 15-char) |
| **B2CS** | Aggregate of invoices to unregistered parties, intrastate |
| **B2CL** | Individual invoices to unregistered parties, interstate, value > 2.5 Lakh |
| **CDNR** | Credit and Debit notes issued to registered parties |
| **HSN** | HSN-wise summary of all outward supplies |

---

## Flutter UI Suggestions

### Reports List Screen

Display a grid of report tiles (similar to the reference app). Each tile navigates to a report detail screen.

```dart
final reports = [
  {'type': 'invoice-details', 'title': 'Invoice Details', 'icon': Icons.receipt},
  {'type': 'delivery-challan', 'title': 'Delivery Challan', 'icon': Icons.local_shipping},
  {'type': 'current-stock', 'title': 'Current Stock', 'icon': Icons.inventory},
  {'type': 'party-wise-sales', 'title': 'Party Wise Sales', 'icon': Icons.people},
  {'type': 'product-wise-sales', 'title': 'Product Wise Sales', 'icon': Icons.shopping_bag},
  {'type': 'tds-summary', 'title': 'TDS Summary', 'icon': Icons.account_balance},
  {'type': 'hsn-sales', 'title': 'HSN Sales', 'icon': Icons.category},
  {'type': 'gst-sales', 'title': 'GST Sales', 'icon': Icons.calculate},
  {'type': 'gstr1', 'title': 'GSTR-1', 'icon': Icons.description},
];
```

### Date Range Picker

Most reports accept `fromDate` and `toDate`. Show a date range picker at the top of the report detail screen. Use preset ranges:
- This Month
- Last Month
- This Quarter
- This Financial Year (Apr-Mar)
- Custom Range

### PDF Download

After calling the PDF endpoint, use the returned `pdfUrl` to:
1. Open in browser: `url_launcher` package
2. Download and share: `share_plus` package
3. Preview in-app: `flutter_pdfview` package

```dart
final response = await http.post(
  Uri.parse('$baseUrl/business/$businessId/reports/$reportType/pdf'),
  headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
  body: jsonEncode({'fromDate': fromDate, 'toDate': toDate}),
);
final pdfUrl = jsonDecode(response.body)['pdfUrl'];
```

### Error Handling

Handle `400` with code `INVALID_REPORT_TYPE`:

```dart
if (response.statusCode == 400) {
  final data = jsonDecode(response.body);
  if (data['code'] == 'INVALID_REPORT_TYPE') {
    // Show: "Invalid report type"
  }
}
```

---

## No Breaking Changes

- No existing endpoints have been modified
- No existing request/response formats have changed
- All new functionality is additive (2 new route patterns only)
