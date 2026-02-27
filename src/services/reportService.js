const { dynamoDb } = require('../config/db');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { computeInvoiceTotals } = require('./invoiceCalculationService');
const Product = require('../models/productModel');

const TABLE_NAME = process.env.INVOICES_TABLE;

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

const SK_PREFIXES = {
    INVOICE: 'INVOICE#',
    RECEIPT: 'RECEIPT#',
    TDS_VOUCHER: 'TDS_VOUCHER#',
    CREDIT_NOTE: 'CREDIT_NOTE#',
    SALES_DEBIT_NOTE: 'SALES_DEBIT_NOTE#',
    DELIVERY_CHALLAN: 'DELIVERY_CHALLAN#'
};

function getDocType(sk) {
    for (const [type, prefix] of Object.entries(SK_PREFIXES)) {
        if (sk.startsWith(prefix)) return type;
    }
    return null;
}

function getDocDate(doc, docType) {
    let raw;
    switch (docType) {
        case 'INVOICE':
        case 'CREDIT_NOTE':
        case 'SALES_DEBIT_NOTE':
            raw = doc.invoiceDate || doc.createdAt || '';
            break;
        case 'RECEIPT':
            raw = doc.receiptDate || doc.createdAt || '';
            break;
        case 'TDS_VOUCHER':
            raw = doc.voucherDate || doc.createdAt || '';
            break;
        case 'DELIVERY_CHALLAN':
            raw = doc.challanDate || doc.createdAt || '';
            break;
        default:
            raw = doc.createdAt || '';
    }
    return normalizeDate(raw);
}

async function fetchAllBusinessDocs(userId, businessId) {
    const pk = `USER#${userId}#BUSINESS#${businessId}`;
    const allItems = [];
    let exclusiveStartKey = null;

    do {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': pk }
        };
        if (exclusiveStartKey) {
            params.ExclusiveStartKey = exclusiveStartKey;
        }
        const result = await dynamoDb.send(new QueryCommand(params));
        allItems.push(...(result.Items || []));
        exclusiveStartKey = result.LastEvaluatedKey || null;
    } while (exclusiveStartKey);

    const categorized = {
        invoices: [],
        creditNotes: [],
        salesDebitNotes: [],
        deliveryChallans: [],
        receipts: [],
        tdsVouchers: []
    };

    for (const item of allItems) {
        const docType = getDocType(item.SK);
        switch (docType) {
            case 'INVOICE': categorized.invoices.push(item); break;
            case 'CREDIT_NOTE': categorized.creditNotes.push(item); break;
            case 'SALES_DEBIT_NOTE': categorized.salesDebitNotes.push(item); break;
            case 'DELIVERY_CHALLAN': categorized.deliveryChallans.push(item); break;
            case 'RECEIPT': categorized.receipts.push(item); break;
            case 'TDS_VOUCHER': categorized.tdsVouchers.push(item); break;
        }
    }

    return categorized;
}

function filterByDateRange(docs, docType, fromDate, toDate) {
    return docs.filter(doc => {
        const date = getDocDate(doc, docType);
        if (!date) return false;
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        return true;
    });
}

function filterSaved(docs) {
    return docs.filter(d => d.status === 'saved');
}

// ─── Report 1: Invoice Details ───

function buildInvoiceDetailsReport(docs, fromDate, toDate, status) {
    let invoices = filterByDateRange(docs.invoices, 'INVOICE', fromDate, toDate);
    if (status) {
        invoices = invoices.filter(inv => inv.status === status);
    }

    let totalTaxable = 0;
    let totalTax = 0;
    let totalGrand = 0;
    let totalBalance = 0;

    const data = invoices.map(inv => {
        const totals = computeInvoiceTotals(inv);
        const s = totals.summary;
        const paid = Number(inv.paidAmount) || 0;
        const tds = Number(inv.tdsAmount) || 0;
        const balance = round2(s.grandTotal - paid - tds);

        totalTaxable = round2(totalTaxable + s.taxableAmount);
        totalTax = round2(totalTax + s.taxAmount);
        totalGrand = round2(totalGrand + s.grandTotal);
        totalBalance = round2(totalBalance + balance);

        return {
            date: getDocDate(inv, 'INVOICE'),
            invoiceNumber: inv.invoiceNumber || '',
            partyName: inv.buyerName || '',
            gstin: inv.buyerGstin || '',
            taxableAmount: s.taxableAmount,
            taxAmount: s.taxAmount,
            cessAmount: s.cessAmount,
            grandTotal: s.grandTotal,
            paidAmount: paid,
            tdsAmount: tds,
            balanceDue: balance,
            status: inv.status || ''
        };
    });

    data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return {
        data,
        summary: {
            invoiceCount: data.length,
            totalTaxable,
            totalTax,
            totalGrand,
            totalBalance
        }
    };
}

// ─── Report 2: Delivery Challan Report ───

function buildDeliveryChallanReport(docs, fromDate, toDate, status) {
    let challans = filterByDateRange(docs.deliveryChallans, 'DELIVERY_CHALLAN', fromDate, toDate);
    if (status) {
        challans = challans.filter(dc => dc.status === status);
    }

    let totalAmount = 0;
    let totalQuantity = 0;

    const data = challans.map(dc => {
        const totals = computeInvoiceTotals(dc);
        const s = totals.summary;
        const itemCount = Array.isArray(dc.items) ? dc.items.length : 0;

        totalAmount = round2(totalAmount + s.grandTotal);
        totalQuantity = round2(totalQuantity + s.totalQuantity);

        return {
            date: getDocDate(dc, 'DELIVERY_CHALLAN'),
            challanNumber: dc.challanNumber || '',
            partyName: dc.buyerName || '',
            itemCount,
            totalQuantity: s.totalQuantity,
            amount: s.grandTotal,
            status: dc.status || ''
        };
    });

    data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return {
        data,
        summary: {
            challanCount: data.length,
            totalQuantity,
            totalAmount
        }
    };
}

// ─── Report 3: Current Stock Report ───

async function buildCurrentStockReport(userId, businessId) {
    const products = await Product.listByBusiness(userId, businessId);

    let totalStockValue = 0;
    const data = products
        .filter(p => p.maintainStock)
        .map(p => {
            const currentStock = Number(p.currentStock) || 0;
            const salesPrice = Number(p.salesPrice) || 0;
            const stockValue = round2(currentStock * salesPrice);
            totalStockValue = round2(totalStockValue + stockValue);

            return {
                productName: p.name || '',
                hsnSac: p.hsnSac || '',
                unit: p.unit || 'Nos',
                currentStock,
                lowStockAlertQty: Number(p.lowStockAlertQty) || 0,
                salesPrice,
                stockValue,
                isLowStock: currentStock > 0 && currentStock <= (Number(p.lowStockAlertQty) || 0)
            };
        });

    data.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));

    return {
        data,
        summary: {
            productCount: data.length,
            totalStockValue
        }
    };
}

// ─── Report 4: Party Wise Sales Report ───

function buildPartyWiseSalesReport(docs, fromDate, toDate) {
    const invoices = filterSaved(filterByDateRange(docs.invoices, 'INVOICE', fromDate, toDate));
    const partyMap = {};

    for (const inv of invoices) {
        const pid = inv.buyerId || inv.buyerName || 'Unknown';
        const totals = computeInvoiceTotals(inv);
        const s = totals.summary;

        if (!partyMap[pid]) {
            partyMap[pid] = {
                partyName: inv.buyerName || '',
                gstin: inv.buyerGstin || '',
                invoiceCount: 0,
                totalTaxable: 0,
                totalTax: 0,
                totalAmount: 0
            };
        }

        partyMap[pid].invoiceCount += 1;
        partyMap[pid].totalTaxable = round2(partyMap[pid].totalTaxable + s.taxableAmount);
        partyMap[pid].totalTax = round2(partyMap[pid].totalTax + s.taxAmount);
        partyMap[pid].totalAmount = round2(partyMap[pid].totalAmount + s.grandTotal);
    }

    const data = Object.values(partyMap);
    data.sort((a, b) => b.totalAmount - a.totalAmount);

    let totalTaxable = 0;
    let totalTax = 0;
    let totalAmount = 0;
    for (const d of data) {
        totalTaxable = round2(totalTaxable + d.totalTaxable);
        totalTax = round2(totalTax + d.totalTax);
        totalAmount = round2(totalAmount + d.totalAmount);
    }

    return {
        data,
        summary: {
            partyCount: data.length,
            totalInvoices: invoices.length,
            totalTaxable,
            totalTax,
            totalAmount
        }
    };
}

// ─── Report 5: Product Wise Sales Report ───

function buildProductWiseSalesReport(docs, fromDate, toDate) {
    const invoices = filterSaved(filterByDateRange(docs.invoices, 'INVOICE', fromDate, toDate));
    const productMap = {};

    for (const inv of invoices) {
        const totals = computeInvoiceTotals(inv);
        for (const item of totals.items) {
            const key = item.itemId || item.itemName || 'Unknown';
            if (!productMap[key]) {
                productMap[key] = {
                    productName: item.itemName || '',
                    hsnSac: item.hsnSac || '',
                    unit: item.unit || 'Nos',
                    quantitySold: 0,
                    totalTaxable: 0,
                    totalTax: 0,
                    totalAmount: 0
                };
            }

            productMap[key].quantitySold = round2(productMap[key].quantitySold + (Number(item.quantity) || 0));
            productMap[key].totalTaxable = round2(productMap[key].totalTaxable + (item.totals?.taxableAmount || 0));
            productMap[key].totalTax = round2(productMap[key].totalTax + (item.totals?.gstAmount || 0));
            productMap[key].totalAmount = round2(productMap[key].totalAmount + (item.totals?.lineTotal || 0));
        }
    }

    const data = Object.values(productMap);
    data.sort((a, b) => b.totalAmount - a.totalAmount);

    let totalQuantity = 0;
    let totalTaxable = 0;
    let totalTax = 0;
    let totalAmount = 0;
    for (const d of data) {
        totalQuantity = round2(totalQuantity + d.quantitySold);
        totalTaxable = round2(totalTaxable + d.totalTaxable);
        totalTax = round2(totalTax + d.totalTax);
        totalAmount = round2(totalAmount + d.totalAmount);
    }

    return {
        data,
        summary: {
            productCount: data.length,
            totalQuantity,
            totalTaxable,
            totalTax,
            totalAmount
        }
    };
}

// ─── Report 6: TDS Summary Receivable ───

function buildTdsSummaryReport(docs, fromDate, toDate) {
    const vouchers = filterByDateRange(docs.tdsVouchers, 'TDS_VOUCHER', fromDate, toDate);
    const partyMap = {};

    for (const v of vouchers) {
        const pid = v.partyId || v.partyName || 'Unknown';
        const section = v.section || '-';
        const key = `${pid}__${section}`;
        const amount = round2(Number(v.tdsAmountCollected) || 0);

        if (!partyMap[key]) {
            partyMap[key] = {
                partyName: v.partyName || '',
                section,
                voucherCount: 0,
                totalTds: 0
            };
        }

        partyMap[key].voucherCount += 1;
        partyMap[key].totalTds = round2(partyMap[key].totalTds + amount);
    }

    const data = Object.values(partyMap);
    data.sort((a, b) => b.totalTds - a.totalTds);

    let grandTotalTds = 0;
    let totalVouchers = 0;
    for (const d of data) {
        grandTotalTds = round2(grandTotalTds + d.totalTds);
        totalVouchers += d.voucherCount;
    }

    return {
        data,
        summary: {
            partyCount: data.length,
            totalVouchers,
            grandTotalTds
        }
    };
}

// ─── Report 7: HSN Sales Report ───

function buildHsnSalesReport(docs, fromDate, toDate) {
    const savedInvoices = filterSaved(filterByDateRange(docs.invoices, 'INVOICE', fromDate, toDate));
    const savedCNs = filterSaved(filterByDateRange(docs.creditNotes, 'CREDIT_NOTE', fromDate, toDate));
    const savedSDNs = filterSaved(filterByDateRange(docs.salesDebitNotes, 'SALES_DEBIT_NOTE', fromDate, toDate));

    const hsnMap = {};

    function processItems(items, supplyType, sign) {
        for (const item of items) {
            const hsn = item.hsnSac || '-';
            const t = item.totals || {};

            if (!hsnMap[hsn]) {
                hsnMap[hsn] = {
                    hsnSac: hsn,
                    description: item.itemName || '',
                    uqc: item.unit || 'Nos',
                    totalQuantity: 0,
                    taxableValue: 0,
                    igst: 0,
                    cgst: 0,
                    sgst: 0,
                    cess: 0,
                    totalTax: 0
                };
            }

            const taxable = t.taxableAmount || 0;
            const gst = t.gstAmount || 0;
            const cess = t.cessAmount || 0;

            hsnMap[hsn].totalQuantity = round2(hsnMap[hsn].totalQuantity + (Number(item.quantity) || 0) * sign);
            hsnMap[hsn].taxableValue = round2(hsnMap[hsn].taxableValue + taxable * sign);
            hsnMap[hsn].cess = round2(hsnMap[hsn].cess + cess * sign);

            if (supplyType === 'interstate') {
                hsnMap[hsn].igst = round2(hsnMap[hsn].igst + gst * sign);
            } else {
                hsnMap[hsn].cgst = round2(hsnMap[hsn].cgst + (gst / 2) * sign);
                hsnMap[hsn].sgst = round2(hsnMap[hsn].sgst + (gst / 2) * sign);
            }
            hsnMap[hsn].totalTax = round2(hsnMap[hsn].totalTax + (gst + cess) * sign);
        }
    }

    function processDocList(docList, sign) {
        for (const doc of docList) {
            const totals = computeInvoiceTotals(doc);
            const supplyType = doc.supplyType === 'interstate' ? 'interstate' : 'intrastate';
            processItems(totals.items, supplyType, sign);
        }
    }

    processDocList(savedInvoices, 1);
    processDocList(savedSDNs, 1);
    processDocList(savedCNs, -1);

    const data = Object.values(hsnMap);
    data.sort((a, b) => (a.hsnSac || '').localeCompare(b.hsnSac || ''));

    let totalTaxable = 0;
    let totalIgst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalCess = 0;
    let totalTax = 0;
    for (const d of data) {
        totalTaxable = round2(totalTaxable + d.taxableValue);
        totalIgst = round2(totalIgst + d.igst);
        totalCgst = round2(totalCgst + d.cgst);
        totalSgst = round2(totalSgst + d.sgst);
        totalCess = round2(totalCess + d.cess);
        totalTax = round2(totalTax + d.totalTax);
    }

    return {
        data,
        summary: {
            hsnCount: data.length,
            totalTaxable,
            totalIgst,
            totalCgst,
            totalSgst,
            totalCess,
            totalTax
        }
    };
}

// ─── Report 8: GST Sales Report ───

function buildGstSalesReport(docs, fromDate, toDate) {
    const savedInvoices = filterSaved(filterByDateRange(docs.invoices, 'INVOICE', fromDate, toDate));
    const savedCNs = filterSaved(filterByDateRange(docs.creditNotes, 'CREDIT_NOTE', fromDate, toDate));
    const savedSDNs = filterSaved(filterByDateRange(docs.salesDebitNotes, 'SALES_DEBIT_NOTE', fromDate, toDate));

    const rateMap = {};

    function processDocItems(doc, sign) {
        const totals = computeInvoiceTotals(doc);
        const supplyType = doc.supplyType === 'interstate' ? 'interstate' : 'intrastate';

        for (const item of totals.items) {
            const rate = Number(item.gstPercent) || 0;
            const key = String(rate);
            const t = item.totals || {};

            if (!rateMap[key]) {
                rateMap[key] = {
                    gstRate: rate,
                    taxableValue: 0,
                    cgst: 0,
                    sgst: 0,
                    igst: 0,
                    cess: 0,
                    totalTax: 0
                };
            }

            const taxable = t.taxableAmount || 0;
            const gst = t.gstAmount || 0;
            const cess = t.cessAmount || 0;

            rateMap[key].taxableValue = round2(rateMap[key].taxableValue + taxable * sign);
            rateMap[key].cess = round2(rateMap[key].cess + cess * sign);

            if (supplyType === 'interstate') {
                rateMap[key].igst = round2(rateMap[key].igst + gst * sign);
            } else {
                rateMap[key].cgst = round2(rateMap[key].cgst + (gst / 2) * sign);
                rateMap[key].sgst = round2(rateMap[key].sgst + (gst / 2) * sign);
            }
            rateMap[key].totalTax = round2(rateMap[key].totalTax + (gst + cess) * sign);
        }
    }

    savedInvoices.forEach(d => processDocItems(d, 1));
    savedSDNs.forEach(d => processDocItems(d, 1));
    savedCNs.forEach(d => processDocItems(d, -1));

    const data = Object.values(rateMap);
    data.sort((a, b) => a.gstRate - b.gstRate);

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;
    let totalTax = 0;
    for (const d of data) {
        totalTaxable = round2(totalTaxable + d.taxableValue);
        totalCgst = round2(totalCgst + d.cgst);
        totalSgst = round2(totalSgst + d.sgst);
        totalIgst = round2(totalIgst + d.igst);
        totalCess = round2(totalCess + d.cess);
        totalTax = round2(totalTax + d.totalTax);
    }

    return {
        data,
        summary: {
            totalTaxable,
            totalCgst,
            totalSgst,
            totalIgst,
            totalCess,
            totalTax,
            totalInvoiceValue: round2(totalTaxable + totalTax)
        }
    };
}

// ─── Report 9: GSTR-1 Report ───

function buildGstr1Report(docs, fromDate, toDate) {
    const savedInvoices = filterSaved(filterByDateRange(docs.invoices, 'INVOICE', fromDate, toDate));
    const savedCNs = filterSaved(filterByDateRange(docs.creditNotes, 'CREDIT_NOTE', fromDate, toDate));
    const savedSDNs = filterSaved(filterByDateRange(docs.salesDebitNotes, 'SALES_DEBIT_NOTE', fromDate, toDate));

    const b2b = [];
    const b2cs = { taxableValue: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0 };
    const b2cl = [];
    const cdnr = [];

    function computeDocSummary(doc) {
        const totals = computeInvoiceTotals(doc);
        const s = totals.summary;
        const supplyType = doc.supplyType === 'interstate' ? 'interstate' : 'intrastate';

        let cgst = 0, sgst = 0, igst = 0;
        if (supplyType === 'interstate') {
            igst = s.taxAmount;
        } else {
            cgst = round2(s.taxAmount / 2);
            sgst = round2(s.taxAmount / 2);
        }

        return {
            taxableValue: s.taxableAmount,
            cgst,
            sgst,
            igst,
            cess: s.cessAmount,
            invoiceValue: s.grandTotal,
            supplyType
        };
    }

    for (const inv of savedInvoices) {
        const gstin = (inv.buyerGstin || '').trim();
        const summary = computeDocSummary(inv);

        if (gstin && gstin.length >= 15) {
            b2b.push({
                gstin,
                partyName: inv.buyerName || '',
                invoiceNumber: inv.invoiceNumber || '',
                date: getDocDate(inv, 'INVOICE'),
                ...summary
            });
        } else if (summary.supplyType === 'interstate' && summary.invoiceValue > 250000) {
            b2cl.push({
                partyName: inv.buyerName || '',
                invoiceNumber: inv.invoiceNumber || '',
                date: getDocDate(inv, 'INVOICE'),
                placeOfSupply: inv.placeOfSupply || '',
                ...summary
            });
        } else {
            b2cs.taxableValue = round2(b2cs.taxableValue + summary.taxableValue);
            b2cs.cgst = round2(b2cs.cgst + summary.cgst);
            b2cs.sgst = round2(b2cs.sgst + summary.sgst);
            b2cs.cess = round2(b2cs.cess + summary.cess);
            b2cs.totalTax = round2(b2cs.totalTax + summary.cgst + summary.sgst + summary.igst + summary.cess);
        }
    }

    const cdnDocs = [
        ...savedCNs.map(d => ({ doc: d, type: 'Credit Note', docType: 'CREDIT_NOTE' })),
        ...savedSDNs.map(d => ({ doc: d, type: 'Debit Note', docType: 'SALES_DEBIT_NOTE' }))
    ];

    for (const { doc, type, docType } of cdnDocs) {
        const gstin = (doc.buyerGstin || '').trim();
        if (!gstin || gstin.length < 15) continue;

        const summary = computeDocSummary(doc);
        cdnr.push({
            gstin,
            partyName: doc.buyerName || '',
            noteNumber: doc.invoiceNumber || '',
            date: getDocDate(doc, docType),
            noteType: type,
            referenceInvoiceNumber: doc.referenceInvoiceNumber || '',
            ...summary
        });
    }

    b2b.sort((a, b) => (a.gstin || '').localeCompare(b.gstin || ''));
    b2cl.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    cdnr.sort((a, b) => (a.gstin || '').localeCompare(b.gstin || ''));

    const hsnReport = buildHsnSalesReport(docs, fromDate, toDate);

    const b2bTotal = b2b.reduce((acc, r) => ({
        taxableValue: round2(acc.taxableValue + r.taxableValue),
        igst: round2(acc.igst + r.igst),
        cgst: round2(acc.cgst + r.cgst),
        sgst: round2(acc.sgst + r.sgst),
        cess: round2(acc.cess + r.cess),
        invoiceValue: round2(acc.invoiceValue + r.invoiceValue)
    }), { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0 });

    const b2clTotal = b2cl.reduce((acc, r) => ({
        taxableValue: round2(acc.taxableValue + r.taxableValue),
        igst: round2(acc.igst + r.igst),
        invoiceValue: round2(acc.invoiceValue + r.invoiceValue)
    }), { taxableValue: 0, igst: 0, invoiceValue: 0 });

    const cdnrTotal = cdnr.reduce((acc, r) => ({
        taxableValue: round2(acc.taxableValue + r.taxableValue),
        igst: round2(acc.igst + r.igst),
        cgst: round2(acc.cgst + r.cgst),
        sgst: round2(acc.sgst + r.sgst),
        cess: round2(acc.cess + r.cess),
        invoiceValue: round2(acc.invoiceValue + r.invoiceValue)
    }), { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0 });

    return {
        b2b: { data: b2b, summary: { count: b2b.length, ...b2bTotal } },
        b2cs: { data: b2cs, summary: { count: savedInvoices.length - b2b.length - b2cl.length } },
        b2cl: { data: b2cl, summary: { count: b2cl.length, ...b2clTotal } },
        cdnr: { data: cdnr, summary: { count: cdnr.length, ...cdnrTotal } },
        hsn: hsnReport
    };
}

const REPORT_BUILDERS = {
    'invoice-details': (docs, params) => buildInvoiceDetailsReport(docs, params.fromDate, params.toDate, params.status),
    'delivery-challan': (docs, params) => buildDeliveryChallanReport(docs, params.fromDate, params.toDate, params.status),
    'party-wise-sales': (docs, params) => buildPartyWiseSalesReport(docs, params.fromDate, params.toDate),
    'product-wise-sales': (docs, params) => buildProductWiseSalesReport(docs, params.fromDate, params.toDate),
    'tds-summary': (docs, params) => buildTdsSummaryReport(docs, params.fromDate, params.toDate),
    'hsn-sales': (docs, params) => buildHsnSalesReport(docs, params.fromDate, params.toDate),
    'gst-sales': (docs, params) => buildGstSalesReport(docs, params.fromDate, params.toDate),
    'gstr1': (docs, params) => buildGstr1Report(docs, params.fromDate, params.toDate)
};

const VALID_REPORT_TYPES = ['invoice-details', 'delivery-challan', 'current-stock',
    'party-wise-sales', 'product-wise-sales', 'tds-summary', 'hsn-sales', 'gst-sales', 'gstr1'];

const REPORT_TITLES = {
    'invoice-details': 'Invoice Details Report',
    'delivery-challan': 'Delivery Challan Report',
    'current-stock': 'Current Stock Report',
    'party-wise-sales': 'Party Wise Sales Report',
    'product-wise-sales': 'Product Wise Sales Report',
    'tds-summary': 'TDS Summary - Receivable',
    'hsn-sales': 'HSN Wise Sales Report',
    'gst-sales': 'GST Sales Report',
    'gstr1': 'GSTR-1 Report'
};

async function generateReport(userId, businessId, reportType, params) {
    if (reportType === 'current-stock') {
        return buildCurrentStockReport(userId, businessId);
    }

    const builder = REPORT_BUILDERS[reportType];
    if (!builder) return null;

    const docs = await fetchAllBusinessDocs(userId, businessId);
    return builder(docs, params);
}

module.exports = {
    generateReport,
    VALID_REPORT_TYPES,
    REPORT_TITLES,
    round2
};
