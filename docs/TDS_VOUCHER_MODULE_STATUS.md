# TDS Voucher Module – Completion & Industry Alignment

This document confirms what is **completed** in the TDS voucher module and how it aligns with common practice. It also lists **optional enhancements** often seen in stricter compliance setups (e.g. TDS section, TAN, PAN on voucher, FY/quarter).

---

## 1. What is complete (and aligned with common practice)

| Area | Status | Notes |
|------|--------|--------|
| **Voucher CRUD** | Done | Create, list, get, update, delete with validation (Zod). |
| **Voucher number** | Done | Must start with `TD`; uniqueness via voucher index (no duplicates per business). |
| **Party (deductor)** | Done | `partyId`, `partyName`; optional link to party. |
| **TDS amount & allocations** | Done | `tdsAmountCollected`; allocations to invoices with `invoiceId`, `invoiceNumber`, `tdsAllocated`. |
| **Validation** | Done | Sum of allocations ≤ TDS collected; per-invoice TDS ≤ balance due; party match when `partyId` given. |
| **Invoice balance** | Done | `balanceDue = grandTotal - paidAmount - tdsAmount`; single source of truth in `getInvoiceBalanceInfo`. |
| **Invoice `tdsAmount`** | Done | Updated on create/update/delete of voucher; reflected in list/get invoice and in balance. |
| **Invoices for party** | Done | `GET .../invoices-for-party?partyId=` returns invoices with balance info for “Settle Invoice” screen. |
| **Payment statement PDF** | Done | Per-invoice statement shows payment history + **TDS history** (date, amount, voucher no) + total TDS + balance due. |
| **Receipt PDF** | Done | When `receipt.tdsAmount > 0`, shows “TDS deducted” row. |
| **TDS voucher PDF** | Done | Separate PDF with business header, voucher no, date, party, TDS collected, allocations table, total in words. |
| **Routes & auth** | Done | All under `requireBusiness`; PDF route `POST .../tds-vouchers/:voucherId/pdf`. |

So: **users can see TDS in the payment statement (per invoice) and in a separate TDS voucher PDF.** The module is **complete for core operational use** and follows common patterns (voucher → allocations → invoice balance, statement + voucher PDF).

---

## 2. Optional industry-standard enhancements (not required for “complete”)

These are often required only for **stricter tax/compliance** or **certificate-style** reporting. They are **not** implemented today; add them if your use case needs them.

| Enhancement | Purpose | Where it would go |
|-------------|---------|-------------------|
| **TDS section** | Income Tax section (e.g. 194A, 194C) under which TDS was deducted. | Voucher: optional `tdsSection` (string). TDS voucher PDF: show section. |
| **TDS rate (%)** | Rate at which TDS was deducted (e.g. 1%, 2%, 10%). | Voucher: optional `tdsRate` (number). PDF: show rate. |
| **Deductor’s TAN** | Tax Deduction Account Number of the party who deducted TDS. | Party model: optional `tan`. Or voucher: optional `deductorTan`. PDF: show on voucher. |
| **Deductee’s PAN** | Your (seller) PAN for TDS certificate. | Business already has `pan`; could be shown on TDS voucher PDF. |
| **Financial year / quarter** | For 26AS / Form 16A matching and period-wise reports. | Voucher: optional `financialYear`, `quarter` (derived from `voucherDate` or entered). |
| **Challan / BSR details** | Govt challan number, date, BSR code when deductor deposits TDS. | Voucher: optional `challanNumber`, `challanDate`, `bsrCode` (only if you track deductor’s deposit). |

If you need any of these, they can be added as **optional** fields (schema + model + PDF template) without breaking existing flows.

---

## 3. Summary

- **Module is complete** for: recording TDS vouchers, allocating to invoices, correct balance (statement + receipt + voucher PDF), and a separate TDS voucher PDF with all core details.
- **Industry alignment:** Core flow (voucher → allocations → balance, statement + voucher PDF) matches common practice. Optional fields (section, rate, TAN, PAN on PDF, FY/quarter, challan) can be added later for stricter compliance or certificate-style needs.
