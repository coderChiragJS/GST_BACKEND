# Frontend: Voucher Numbers (Invoice, Quotation, SDN, Delivery Challan)

One place for what the frontend must do for voucher numbers. Backend is already implemented.

---

## 1. Format (required prefixes)

| Document         | Field in API        | Prefix | Valid examples        |
|------------------|--------------------|--------|------------------------|
| Invoice          | `invoiceNumber`     | **INV-** | INV-000001, INV-1     |
| Quotation        | `quotationNumber`  | **QTN-** | QTN-000001, QTN-2026-01 |
| Sales Debit Note | `invoiceNumber`    | **SDN-** | SDN-000001, SDN-001   |
| Delivery Challan | `challanNumber`    | **DC-**  | DC-000001, DC-2026-01 |

- Value **must start with** the prefix (case-sensitive: use `INV-` not `inv-`).
- After the prefix you can use digits, hyphens, etc. (e.g. `INV-000001` or `INV-2026-001`).

**Frontend:** Validate in the form before submit. If the user types a number that does not start with the correct prefix, show an error like: “Invoice number must start with INV-”.

---

## 2. Uniqueness (backend returns 409)

Within a business, the same number cannot be used twice for the same document type.

- First invoice with **INV-000001** → allowed.
- Second invoice with **INV-000001** → backend returns **409**.
- Updating another invoice to **INV-000001** when it is already used → backend returns **409**.

**Frontend:** After create or update, check the response status.

- **409** → Read the JSON body:
  - `code` will be `"VOUCHER_NUMBER_TAKEN"`.
  - `field` will be `"invoiceNumber"`, `"quotationNumber"`, or `"challanNumber"`.
  - Show a clear message, e.g.: “This number is already in use. Please choose a different one.”

Example 409 body:

```json
{
  "message": "Voucher number already in use",
  "code": "VOUCHER_NUMBER_TAKEN",
  "field": "invoiceNumber"
}
```

---

## 3. Summary checklist

1. **Format:** Validate prefix (INV-, QTN-, SDN-, DC-) before submit; show error if wrong.
2. **Create/Update:** On 409, show “This number is already in use” and ask for a different number.
3. **Field names:** Send `invoiceNumber` for Invoice and Sales Debit Note, `quotationNumber` for Quotation, `challanNumber` for Delivery Challan.

No other backend or config changes are required on the frontend for voucher numbers.

---

## 4. Backend deploy

Yes, you can deploy to the server as-is. No new environment variables or DynamoDB table changes. The same table is used with a new sort-key pattern for voucher index. After deploy, all new creates and updates enforce format (prefix) and uniqueness (409 when duplicate). Existing documents in the DB are unchanged.
