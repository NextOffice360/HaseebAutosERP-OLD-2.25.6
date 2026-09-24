/**
 * HASEEB AUTOS — v2.6 §9  ::  REPORT ENGINE
 * =============================================================================
 * ~54 reports. Har report ke liye alag function likhne ke bajaye:
 *
 *   1. Har report ek DATA record hai (CATALOG) — id, group, source sheet,
 *      groupBy, measures, columns, filters.
 *   2. Ek hi generic executor (`_aggregate`) in sab ko chalaata hai.
 *   3. Sirf wahi reports custom hain jin ka hisaab-kitab khaas hai
 *      (cash book, ageing, profit, stock valuation) — wo bhi ek jagah.
 *
 * Is tarah naya report banana = catalog mein ek line. (§19: min complexity)
 *
 * Filters (har report par ek jaise): from, to, locationId + report ke hisaab se
 * customerId / supplierId / itemId / category / status / method.
 * =============================================================================
 */

var ReportEngine = {

  /* ==========================================================================
     CATALOG — poori reporting yahin define hai
     ========================================================================== */
  CATALOG: [

    /* ------------------------------ FINANCIAL (10) ------------------------- */
    {
      id: 'fin.dailySummary', group: 'Financial', icon: '📅',
      name: 'Daily summary', nameUr: 'روزانہ خلاصہ',
      note: 'Har din ki sales, tax, expense aur net — ek nazar mein',
      source: 'custom',
      compute: function (p, s) {
        var rows = {};
        Reports._salesIn(p, s).forEach(function (x) {
          var d = U.str(x.date).slice(0, 10);
          if (!rows[d]) rows[d] = { date: d, invoices: 0, sales: 0, discount: 0, tax: 0, paid: 0, due: 0, expense: 0 };
          rows[d].invoices++;
          rows[d].sales += U.num(x.total); rows[d].discount += U.num(x.discount);
          rows[d].tax += U.num(x.tax); rows[d].paid += U.num(x.paid); rows[d].due += U.num(x.due);
        });
        var r = Reports._range(p);
        DB.all('Expenses').forEach(function (e) {
          var d = U.parseDate(e.date);
          if (!d || !(d >= r.from && d < r.to)) return;
          if (p.locationId && e.locationId !== p.locationId) return;
          var k = U.str(e.date).slice(0, 10);
          if (!rows[k]) rows[k] = { date: k, invoices: 0, sales: 0, discount: 0, tax: 0, paid: 0, due: 0, expense: 0 };
          rows[k].expense += U.num(e.amount);
        });
        var out = Object.keys(rows).sort().map(function (k) {
          var o = rows[k];
          ['sales', 'discount', 'tax', 'paid', 'due', 'expense'].forEach(function (f) { o[f] = U.round(o[f], 2); });
          o.net = U.round(o.sales - o.expense, 2);
          return o;
        });
        return {
          rows: out,
          cols: [{ key: 'date', label: 'Date' }, { key: 'invoices', label: 'Invoices', num: true },
          { key: 'sales', label: 'Sales', money: true }, { key: 'discount', label: 'Discount', money: true },
          { key: 'tax', label: 'Tax', money: true }, { key: 'expense', label: 'Expense', money: true },
          { key: 'net', label: 'Net', money: true }, { key: 'paid', label: 'Received', money: true },
          { key: 'due', label: 'Due', money: true }],
          totals: ['invoices', 'sales', 'discount', 'tax', 'expense', 'net', 'paid', 'due']
        };
      }
    },
    {
      id: 'fin.cashbook', group: 'Financial', icon: '💰',
      name: 'Cash book', nameUr: 'کیش بک',
      note: 'Har cash entry with running balance (integration ke sath)',
      source: 'custom',
      compute: function (p, s) { return Reports.cashbook(p, s); }
    },
    {
      id: 'fin.cashFlow', group: 'Financial', icon: '🔄',
      name: 'Cash in / out by head', nameUr: 'انکم / اخراج کے حساب سے',
      note: 'Paisa kahan se aaya, kahan gaya',
      source: 'Payments', dateField: 'date',
      filters: ['locationId', 'method'],
      groupBy: { key: 'type', label: null },
      measures: [{ key: 'entries', op: 'count', label: 'Entries', num: true },
      { key: 'amount', op: 'sum', field: 'amount', label: 'Amount', money: true }],
      sort: { key: 'amount', dir: 'desc' },
      totals: ['entries', 'amount']
    },
    {
      id: 'fin.expenseByCategory', group: 'Financial', icon: '🧾',
      aliases: ['Expense Report', 'Expenses'],
      name: 'Expenses by category', nameUr: 'اخراجات: کیٹیگری کے حساب سے',
      source: 'Expenses', dateField: 'date', filters: ['locationId', 'method'],
      groupBy: { key: 'category' },
      measures: [{ key: 'count', op: 'count', label: 'Vouchers', num: true },
      { key: 'amount', op: 'sum', field: 'amount', label: 'Amount', money: true }],
      sort: { key: 'amount', dir: 'desc' }, totals: ['count', 'amount']
    },
    {
      id: 'fin.paymentMethods', group: 'Financial', icon: '💳',
      name: 'Collections by method', nameUr: 'ادائیگی کے طریقے',
      note: 'Cash / card / bank / wallet — kis zariye se kitna aaya',
      source: 'Payments', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'method' },
      measures: [{ key: 'count', op: 'count', label: 'Txns', num: true },
      { key: 'amount', op: 'sum', field: 'amount', label: 'Amount', money: true }],
      sort: { key: 'amount', dir: 'desc' }, totals: ['count', 'amount']
    },
    {
      id: 'fin.profitLoss', group: 'Financial', icon: '📈',
      aliases: ['Gross Profit', 'Income Statement', 'P&L'],
      name: 'Profit & loss', nameUr: 'منافع اور نقصان',
      note: 'Sales − cost of goods − expenses',
      source: 'custom',
      compute: function (p, s) {
        var sales = Reports._salesIn(p, s);
        var ids = {};
        sales.forEach(function (x) { ids[x.id] = x; });
        var revenue = 0, cogs = 0, discount = 0, tax = 0;
        DB.all('SaleItems').forEach(function (li) {
          if (!ids[li.saleId]) return;
          revenue += U.num(li.lineTotal);
          cogs += U.num(li.qty) * U.num(li.cost);
          discount += U.num(li.discount);
        });
        sales.forEach(function (x) { tax += U.num(x.tax); });
        var r = Reports._range(p);
        var expense = 0;
        DB.all('Expenses').forEach(function (e) {
          var d = U.parseDate(e.date);
          if (d && d >= r.from && d < r.to && (!p.locationId || e.locationId === p.locationId)) expense += U.num(e.amount);
        });
        var gross = U.round(revenue - cogs, 2);
        var net = U.round(gross - expense, 2);
        var rows = [
          { head: 'Revenue (net of line discount)', amount: U.round(revenue - discount, 2) },
          { head: 'Less: cost of goods sold', amount: U.round(-cogs, 2) },
          { head: 'Gross profit', amount: gross },
          { head: 'Less: operating expenses', amount: U.round(-expense, 2) },
          { head: 'Net profit', amount: net },
          { head: 'Tax collected (payable)', amount: U.round(tax, 2) },
          { head: 'Discount given', amount: U.round(discount, 2) },
          { head: 'Invoices', amount: sales.length }
        ];
        return {
          rows: rows, cols: [{ key: 'head', label: 'Head' }, { key: 'amount', label: 'Amount', money: true }],
          totals: []
        };
      }
    },
    {
      id: 'fin.dayClosing', group: 'Financial', icon: '🔒',
      name: 'Day closing / sessions', nameUr: 'دن کی بندش',
      note: 'Opening, expected, closing cash aur variance',
      source: 'CashSessions', dateField: 'openedAt', keepVoid: true,
      filters: ['locationId'],
      detailCols: [{ key: 'sessionNo', label: 'Session' }, { key: 'locationId', label: 'Location' },
      { key: 'openingCash', label: 'Opening', money: true }, { key: 'expectedCash', label: 'Expected', money: true },
      { key: 'closingCash', label: 'Closing', money: true }, { key: 'variance', label: 'Variance', money: true },
      { key: 'openedAt', label: 'Opened' }, { key: 'closedAt', label: 'Closed' }, { key: 'status', label: 'Status' }],
      totals: ['openingCash', 'expectedCash', 'closingCash', 'variance']
    },
    {
      id: 'fin.taxSummary', group: 'Financial', icon: '🏛',
      name: 'Tax summary', nameUr: 'ٹیکس خلاصہ',
      note: 'Sales tax collected vs purchase tax paid',
      source: 'custom',
      compute: function (p, s) {
        var r = Reports._range(p);
        var outTax = 0, outBase = 0;
        Reports._salesIn(p, s).forEach(function (x) { outTax += U.num(x.tax); outBase += U.num(x.subtotal); });
        var inTax = 0, inBase = 0;
        DB.all('GRN').forEach(function (g) {
          var d = U.parseDate(g.date);
          if (!d || !(d >= r.from && d < r.to)) return;
          if (p.locationId && g.locationId !== p.locationId) return;
          inTax += U.num(g.tax); inBase += U.num(g.subtotal);
        });
        var rows = [
          { head: 'Output tax (sales)', base: U.round(outBase, 2), tax: U.round(outTax, 2) },
          { head: 'Input tax (purchases)', base: U.round(inBase, 2), tax: U.round(inTax, 2) },
          { head: 'Net payable / (refundable)', base: U.round(outBase - inBase, 2), tax: U.round(outTax - inTax, 2) }
        ];
        return {
          rows: rows,
          cols: [{ key: 'head', label: 'Head' }, { key: 'base', label: 'Taxable value', money: true },
          { key: 'tax', label: 'Tax', money: true }],
          totals: ['base', 'tax']
        };
      }
    },
    {
      id: 'fin.discountSummary', group: 'Financial', icon: '🏷',
      name: 'Discounts given', nameUr: 'دی گئی چھوٹ',
      source: 'Sales', dateField: 'date',
      filters: ['locationId', 'salespersonId'],
      groupBy: { key: 'date' },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'discount', op: 'sum', field: 'discount', label: 'Discount', money: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Sales', money: true }],
      sort: { key: 'date', dir: 'asc' }, totals: ['invoices', 'discount', 'total']
    },
    {
      id: 'fin.sessionVariance', group: 'Financial', icon: '⚖',
      name: 'Cash variance register', nameUr: 'کیش فرق رجسٹر',
      note: 'Sirf wahi din jahan cash farq aaya',
      source: 'CashSessions', dateField: 'openedAt', keepVoid: true,
      filters: ['locationId'],
      postFilter: function (r) { return U.num(r.variance) !== 0; },
      detailCols: [{ key: 'sessionNo', label: 'Session' }, { key: 'openedAt', label: 'Opened' },
      { key: 'expectedCash', label: 'Expected', money: true }, { key: 'closingCash', label: 'Closing', money: true },
      { key: 'variance', label: 'Variance', money: true }, { key: 'notes', label: 'Notes' }],
      totals: ['expectedCash', 'closingCash', 'variance']
    },

    /* -------------------------------- SALES (6) ---------------------------- */
    {
      id: 'sales.summary', group: 'Sales', icon: '📊',
      name: 'Sales summary', nameUr: 'سیلز خلاصہ',
      note: 'Total, discount, tax, due — ek hi nazar mein',
      aliases: ['Sales Report'],
      source: 'custom',
      compute: function (p, s) {
        var rows = Reports._salesIn(p, s);
        var o = {
          invoices: rows.length, subtotal: 0, discount: 0, tax: 0,
          total: 0, paid: 0, due: 0
        };
        rows.forEach(function (x) {
          o.subtotal += U.num(x.subtotal); o.discount += U.num(x.discount);
          o.tax += U.num(x.tax); o.total += U.num(x.total);
          o.paid += U.num(x.paid); o.due += U.num(x.due);
        });
        ['subtotal', 'discount', 'tax', 'total', 'paid', 'due'].forEach(function (k) { o[k] = U.round(o[k], 2); });
        return {
          rows: [o],
          cols: [{ key: 'invoices', label: 'Invoices', num: true },
          { key: 'subtotal', label: 'Subtotal', money: true },
          { key: 'discount', label: 'Discount', money: true },
          { key: 'tax', label: 'Tax', money: true },
          { key: 'total', label: 'Total sales', money: true },
          { key: 'paid', label: 'Received', money: true },
          { key: 'due', label: 'Outstanding', money: true }],
          totals: []
        };
      }
    },
    {
      id: 'sales.invoiceRegister', group: 'Sales', icon: '🧾',
      name: 'Invoice register', nameUr: 'انوائس رجسٹر',
      note: 'Har invoice ki poori line',
      aliases: ['Invoice Report'],
      source: 'Sales', dateField: 'date', filters: ['locationId', 'customerId', 'paymentMethod'],
      detailCols: [{ key: 'invoiceNo', label: 'Invoice' }, { key: 'date', label: 'Date' },
      { key: 'customerId', label: 'Customer', lookup: { sheet: 'Customers', field: 'name' } },
      { key: 'subtotal', label: 'Subtotal', money: true },
      { key: 'discount', label: 'Discount', money: true },
      { key: 'tax', label: 'Tax', money: true },
      { key: 'total', label: 'Total', money: true },
      { key: 'paid', label: 'Paid', money: true },
      { key: 'due', label: 'Due', money: true },
      { key: 'paymentMethod', label: 'Method' }, { key: 'status', label: 'Status' }],
      sort: { key: 'date', dir: 'desc' }, limit: 500,
      totals: ['subtotal', 'discount', 'tax', 'total', 'paid', 'due']
    },
    {
      id: 'sales.byCustomer', group: 'Sales', icon: '👤',
      name: 'Sales by customer', nameUr: 'کسٹمر کے حساب سے سیلز',
      source: 'Sales', dateField: 'date', filters: ['locationId', 'salespersonId'],
      groupBy: { key: 'customerId', label: { sheet: 'Customers', field: 'name' } },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Sales', money: true },
      { key: 'paid', op: 'sum', field: 'paid', label: 'Received', money: true },
      { key: 'due', op: 'sum', field: 'due', label: 'Due', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['invoices', 'total', 'paid', 'due']
    },
    {
      id: 'sales.byItem', group: 'Sales', icon: '📦',
      name: 'Sales by item', nameUr: 'آئٹم کے حساب سے سیلز',
      source: 'SaleItems', join: { sheet: 'Sales', on: 'saleId' }, dateField: 'date',
      filters: ['locationId', 'salespersonId'],
      groupBy: { key: 'itemId', label: { sheet: 'Items', field: 'name' } },
      measures: [{ key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true },
      { key: 'amount', op: 'sum', field: 'lineTotal', label: 'Amount', money: true },
      { key: 'discount', op: 'sum', field: 'discount', label: 'Discount', money: true }],
      sort: { key: 'amount', dir: 'desc' }, limit: 200, totals: ['qty', 'amount', 'discount']
    },
    {
      id: 'sales.byCategory', group: 'Sales', icon: '🗂',
      name: 'Sales by category', nameUr: 'کیٹیگری کے حساب سے',
      source: 'SaleItems', join: { sheet: 'Sales', on: 'saleId' }, dateField: 'date',
      filters: ['locationId'],
      groupBy: { key: 'category', resolve: { sheet: 'Items', by: 'itemId', field: 'category' } },
      measures: [{ key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true },
      { key: 'amount', op: 'sum', field: 'lineTotal', label: 'Amount', money: true }],
      sort: { key: 'amount', dir: 'desc' }, totals: ['qty', 'amount']
    },
    {
      id: 'sales.bySalesman', group: 'Sales', icon: '🧑',
      name: 'Sales by salesperson', nameUr: 'سیلز مین کے حساب سے',
      source: 'Sales', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'salespersonId', label: { sheet: 'Users', field: 'name' } },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Sales', money: true },
      { key: 'due', op: 'sum', field: 'due', label: 'Due', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['invoices', 'total', 'due']
    },
    {
      id: 'sales.byMethod', group: 'Sales', icon: '💳',
      name: 'Sales by payment method', nameUr: 'ادائیگی کے طریقے',
      source: 'Sales', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'paymentMethod' },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Sales', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['invoices', 'total']
    },
    {
      id: 'sales.hourly', group: 'Sales', icon: '🕐',
      name: 'Sales by hour', nameUr: 'گھنٹے کے حساب سے',
      note: 'Kaun se waqt par sab se zyada bikri (staff duty ke liye)',
      source: 'custom',
      compute: function (p, s) {
        var buckets = {};
        for (var hh = 0; hh < 24; hh++) buckets[hh] = { hour: (hh < 10 ? '0' : '') + hh + ':00', invoices: 0, amount: 0 };
        Reports._salesIn(p, s).forEach(function (x) {
          var d = U.parseDate(x.createdAt || x.date);
          if (!d) return;
          var h = d.getHours();
          buckets[h].invoices++; buckets[h].amount += U.num(x.total);
        });
        var rows = Object.keys(buckets).map(function (h) {
          var o = buckets[h]; o.amount = U.round(o.amount, 2); return o;
        });
        return {
          rows: rows, cols: [{ key: 'hour', label: 'Hour' }, { key: 'invoices', label: 'Invoices', num: true },
          { key: 'amount', label: 'Amount', money: true }],
          totals: ['invoices', 'amount']
        };
      }
    },

    /* ------------------------------ PURCHASING (6) ------------------------- */
    {
      id: 'pur.bySupplier', group: 'Purchasing', icon: '🏭',
      name: 'Purchases by supplier', nameUr: 'سپلائر کے حساب سے خریداری',
      source: 'GRN', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'supplierId', label: { sheet: 'Suppliers', field: 'name' } },
      measures: [{ key: 'grns', op: 'count', label: 'GRNs', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Purchased', money: true },
      { key: 'freight', op: 'sum', field: 'freight', label: 'Freight', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['grns', 'total', 'freight']
    },
    {
      id: 'pur.byItem', group: 'Purchasing', icon: '📦',
      name: 'Purchases by item', nameUr: 'آئٹم کے حساب سے خریداری',
      source: 'GRNItems', join: { sheet: 'GRN', on: 'grnId' }, dateField: 'date',
      filters: ['locationId', 'supplierId'],
      groupBy: { key: 'itemId', label: { sheet: 'Items', field: 'name' } },
      measures: [{ key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true },
      { key: 'amount', op: 'sum', field: 'lineTotal', label: 'Amount', money: true }],
      sort: { key: 'amount', dir: 'desc' }, limit: 200, totals: ['qty', 'amount']
    },
    {
      id: 'pur.grnRegister', group: 'Purchasing', icon: '📥',
      name: 'GRN register', nameUr: 'GRN رجسٹر',
      source: 'GRN', dateField: 'date', filters: ['locationId', 'supplierId'],
      detailCols: [{ key: 'grnNo', label: 'GRN' }, { key: 'date', label: 'Date' },
      { key: 'supplierId', label: 'Supplier', lookup: { sheet: 'Suppliers', field: 'name' } },
      { key: 'invoiceNo', label: 'Supp. invoice' }, { key: 'subtotal', label: 'Subtotal', money: true },
      { key: 'tax', label: 'Tax', money: true }, { key: 'freight', label: 'Freight', money: true },
      { key: 'total', label: 'Total', money: true }, { key: 'status', label: 'Status' }],
      sort: { key: 'date', dir: 'desc' }, totals: ['subtotal', 'tax', 'freight', 'total']
    },
    {
      id: 'pur.pendingPO', group: 'Purchasing', icon: '⏳',
      name: 'Pending purchase orders', nameUr: 'زیر التوا آرڈرز',
      note: 'Jo orders abhi poore receive nahi hue',
      source: 'PurchaseOrders', dateField: 'date', keepVoid: true,
      filters: ['locationId', 'supplierId'],
      postFilter: function (r) { return U.str(r.status) !== 'RECEIVED' && U.str(r.status) !== 'CANCELLED'; },
      detailCols: [{ key: 'poNo', label: 'PO' }, { key: 'date', label: 'Date' },
      { key: 'supplierId', label: 'Supplier', lookup: { sheet: 'Suppliers', field: 'name' } },
      { key: 'expectedDate', label: 'Expected' }, { key: 'total', label: 'Value', money: true },
      { key: 'status', label: 'Status' }],
      sort: { key: 'date', dir: 'desc' }, totals: ['total']
    },
    {
      id: 'pur.priceMovement', group: 'Purchasing', icon: '📊',
      aliases: ['Price Change Report'],
      name: 'Purchase price movement', nameUr: 'ریٹ میں تبدیلی',
      note: '§3 — kaunsi cheez mehngi hui, kitne % (prev vs current)',
      source: 'GRNItems', join: { sheet: 'GRN', on: 'grnId' }, dateField: 'date',
      filters: ['locationId', 'supplierId'],
      postFilter: function (r) { return U.num(r.prevPrice) > 0; },
      groupBy: { key: 'itemId', label: { sheet: 'Items', field: 'name' } },
      measures: [{ key: 'grns', op: 'count', label: 'Receipts', num: true },
      { key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true },
      { key: 'lastRate', op: 'max', field: 'cost', label: 'Last rate', money: true },
      { key: 'prevRate', op: 'max', field: 'prevPrice', label: 'Prev rate', money: true },
      { key: 'change', op: 'sum', field: 'priceChange', label: 'Change', money: true }],
      sort: { key: 'change', dir: 'desc' }, limit: 200, totals: ['grns', 'qty', 'change']
    },
    {
      id: 'pur.returns', group: 'Purchasing', icon: '↩',
      name: 'Purchase returns', nameUr: 'واپسی خریداری',
      source: 'PurchaseReturns', dateField: 'date', filters: ['locationId', 'supplierId'],
      detailCols: [{ key: 'returnNo', label: 'Return' }, { key: 'date', label: 'Date' },
      { key: 'supplierId', label: 'Supplier', lookup: { sheet: 'Suppliers', field: 'name' } },
      { key: 'total', label: 'Amount', money: true }, { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' }],
      sort: { key: 'date', dir: 'desc' }, totals: ['total']
    },

    /* ------------------------------- INVENTORY (12) ------------------------ */
    {
      id: 'inv.valuation', group: 'Inventory', icon: '💎',
      name: 'Stock valuation', nameUr: 'اسٹاک مالیت',
      note: 'Qty × average cost — har location ke sath',
      source: 'custom',
      compute: function (p, s) {
        var rows = [];
        DB.all('Stock').forEach(function (st) {
          if (p.locationId && st.locationId !== p.locationId) return;
          var it = DB.byId('Items', st.itemId);
          if (!it) return;
          var qty = U.num(st.qty);
          if (qty === 0 && !p.showZero) return;
          var val = U.round(qty * U.num(st.avgCost), 2);
          rows.push({
            code: it.code, name: it.name, category: it.category, locationId: st.locationId,
            qty: qty, avgCost: U.round(U.num(st.avgCost), 2), value: val,
            retailValue: U.round(qty * U.num(it.retailPrice), 2)
          });
        });
        rows.sort(function (a, b) { return b.value - a.value; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' }, { key: 'locationId', label: 'Location' },
          { key: 'qty', label: 'Qty', num: true }, { key: 'avgCost', label: 'Avg cost', money: true },
          { key: 'value', label: 'Stock value', money: true },
          { key: 'retailValue', label: 'Retail value', money: true }],
          totals: ['qty', 'value', 'retailValue']
        };
      }
    },
    {
      id: 'inv.byLocation', group: 'Inventory', icon: '🏬',
      aliases: ['Current Stock'],
      name: 'Stock by location', nameUr: 'لوکیشن کے حساب سے',
      source: 'Stock', filters: ['locationId'],
      groupBy: { key: 'locationId' },
      measures: [{ key: 'items', op: 'count', label: 'Items', num: true },
      { key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true }],
      sort: { key: 'qty', dir: 'desc' }, totals: ['items', 'qty']
    },
    {
      id: 'inv.lowStock', group: 'Inventory', icon: '⚠',
      name: 'Low stock', nameUr: 'کم اسٹاک',
      note: 'Reorder level se neeche — abhi mangwana chahiye',
      source: 'custom',
      compute: function (p, s) {
        var rows = [];
        DB.all('Stock').forEach(function (st) {
          if (p.locationId && st.locationId !== p.locationId) return;
          var it = DB.byId('Items', st.itemId);
          if (!it) return;
          var qty = U.num(st.qty), ro = U.num(it.reorderLevel, U.num(it.minStock));
          if (qty > ro) return;
          rows.push({
            code: it.code, name: it.name, category: it.category, locationId: st.locationId,
            qty: qty, reorderLevel: ro, shortfall: U.round(Math.max(0, ro - qty), 2),
            supplierId: it.primarySupplierId || ''
          });
        });
        rows.sort(function (a, b) { return b.shortfall - a.shortfall; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' }, { key: 'locationId', label: 'Location' },
          { key: 'qty', label: 'On hand', num: true }, { key: 'reorderLevel', label: 'Reorder at', num: true },
          { key: 'shortfall', label: 'Shortfall', num: true },
          { key: 'supplierId', label: 'Supplier', lookup: { sheet: 'Suppliers', field: 'name' } }],
          totals: ['qty', 'shortfall']
        };
      }
    },
    {
      id: 'inv.deadStock', group: 'Inventory', icon: '💤',
      name: 'Dead / slow stock', nameUr: 'غیر فعال اسٹاک',
      note: 'Pichhle 90 din mein bika hi nahi — paisa phansa hua',
      source: 'custom',
      compute: function (p, s) {
        var days = U.num(p.days, 90);
        var cutoff = U.daysAgo(days);
        var sold = {};
        DB.all('SaleItems').forEach(function (li) {
          var sale = DB.byId('Sales', li.saleId);
          if (!sale || U.str(sale.status) === 'VOID') return;
          var d = U.parseDate(sale.date);
          if (d && d >= cutoff) sold[li.itemId] = (sold[li.itemId] || 0) + U.num(li.qty);
        });
        var rows = [];
        DB.all('Stock').forEach(function (st) {
          if (U.num(st.qty) <= 0) return;
          if (p.locationId && st.locationId !== p.locationId) return;
          if (sold[st.itemId]) return;
          var it = DB.byId('Items', st.itemId);
          if (!it) return;
          var last = null;
          DB.all('StockMoves').forEach(function (m) {
            if (m.itemId !== st.itemId || !U.num(m.qtyOut)) return;
            var d = U.parseDate(m.date);
            if (d && (!last || d > last)) last = d;
          });
          rows.push({
            code: it.code, name: it.name, category: it.category, locationId: st.locationId,
            qty: U.num(st.qty), value: U.round(U.num(st.qty) * U.num(st.avgCost), 2),
            lastOut: last ? U.str(last).slice(0, 10) : 'kabhi nahi'
          });
        });
        rows.sort(function (a, b) { return b.value - a.value; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' }, { key: 'locationId', label: 'Location' },
          { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true },
          { key: 'lastOut', label: 'Last sale' }],
          totals: ['qty', 'value']
        };
      }
    },
    {
      id: 'inv.stockMovement', group: 'Inventory', icon: '🔀',
      aliases: ['Stock Ledger'],
      name: 'Stock movement register', nameUr: 'اسٹاک movement رجسٹر',
      source: 'StockMoves', dateField: 'date', filters: ['locationId', 'itemId'],
      detailCols: [{ key: 'date', label: 'Date' }, { key: 'itemId', label: 'Item', lookup: { sheet: 'Items', field: 'name' } },
      { key: 'locationId', label: 'Location' }, { key: 'qtyIn', label: 'In', num: true },
      { key: 'qtyOut', label: 'Out', num: true }, { key: 'balance', label: 'Balance', num: true },
      { key: 'cost', label: 'Unit cost', money: true }, { key: 'refType', label: 'Ref type' },
      { key: 'refId', label: 'Ref' }, { key: 'notes', label: 'Notes' }],
      sort: { key: 'date', dir: 'desc' }, limit: 500, totals: ['qtyIn', 'qtyOut']
    },
    {
      id: 'inv.movementByType', group: 'Inventory', icon: '📋',
      name: 'Movement by type', nameUr: 'قسم کے حساب سے movement',
      source: 'StockMoves', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'refType' },
      measures: [{ key: 'moves', op: 'count', label: 'Moves', num: true },
      { key: 'qtyIn', op: 'sum', field: 'qtyIn', label: 'In', num: true },
      { key: 'qtyOut', op: 'sum', field: 'qtyOut', label: 'Out', num: true }],
      sort: { key: 'moves', dir: 'desc' }, totals: ['moves', 'qtyIn', 'qtyOut']
    },
    {
      id: 'inv.reorder', group: 'Inventory', icon: '🛒',
      name: 'Reorder suggestions', nameUr: 'دوبارہ منگوانے کی تجویز',
      note: 'Shortfall × last cost — kitna order karna chahiye',
      source: 'custom',
      compute: function (p, s) {
        var d = (typeof Reorder !== 'undefined' && Reorder.suggest) ? Reorder.suggest(p || {}, s) : null;
        return {
          rows: (d && d.rows) || [],
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' }, { key: 'priority', label: 'Priority' },
          { key: 'onHand', label: 'On hand', num: true }, { key: 'onOrder', label: 'On order', num: true },
          { key: 'suggestedQty', label: 'Order qty', num: true },
          { key: 'cost', label: 'Unit cost', money: true }, { key: 'value', label: 'Order value', money: true },
          { key: 'supplierName', label: 'Supplier' }, { key: 'reason', label: 'Why' }],
          totals: ['onHand', 'onOrder', 'suggestedQty', 'value']
        };
      }
    },
    {
      id: 'inv.categoryValue', group: 'Inventory', icon: '🗂',
      name: 'Stock value by category', nameUr: 'کیٹیگری کے حساب سے مالیت',
      source: 'custom',
      compute: function (p, s) {
        var map = {};
        DB.all('Stock').forEach(function (st) {
          if (p.locationId && st.locationId !== p.locationId) return;
          var it = DB.byId('Items', st.itemId);
          var cat = (it && it.category) || '—';
          if (!map[cat]) map[cat] = { category: cat, items: 0, qty: 0, value: 0 };
          map[cat].items++;
          map[cat].qty += U.num(st.qty);
          map[cat].value += U.num(st.qty) * U.num(st.avgCost);
        });
        var rows = Object.keys(map).sort().map(function (k) {
          map[k].qty = U.round(map[k].qty, 2); map[k].value = U.round(map[k].value, 2); return map[k];
        });
        rows.sort(function (a, b) { return b.value - a.value; });
        return {
          rows: rows,
          cols: [{ key: 'category', label: 'Category' }, { key: 'items', label: 'Items', num: true },
          { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true }],
          totals: ['items', 'qty', 'value']
        };
      }
    },
    {
      id: 'inv.adjustments', group: 'Inventory', icon: '✏',
      name: 'Adjustment register', nameUr: 'ایڈجسٹمنٹ رجسٹر',
      source: 'StockAdjustItems', join: { sheet: 'StockAdjustments', on: 'adjId' }, dateField: 'date',
      filters: ['locationId'],
      detailCols: [{ key: 'adjId', label: 'Adj' }, { key: 'itemId', label: 'Item', lookup: { sheet: 'Items', field: 'name' } },
      { key: 'systemQty', label: 'System', num: true }, { key: 'countedQty', label: 'Counted', num: true },
      { key: 'diff', label: 'Diff', num: true }, { key: 'cost', label: 'Cost', money: true },
      { key: 'notes', label: 'Notes' }],
      sort: { key: 'adjId', dir: 'desc' }, limit: 500, totals: ['diff']
    },
    {
      id: 'inv.transfers', group: 'Inventory', icon: '🚚',
      name: 'Transfer register', nameUr: 'ٹرانسفر رجسٹر',
      source: 'Transfers', dateField: 'date', filters: ['locationId'],
      detailCols: [{ key: 'transferNo', label: 'Transfer' }, { key: 'date', label: 'Date' },
      { key: 'fromLocationId', label: 'From' }, { key: 'toLocationId', label: 'To' },
      { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' }],
      sort: { key: 'date', dir: 'desc' }, totals: []
    },
    {
      id: 'inv.stockAgeing', group: 'Inventory', icon: '⏳',
      name: 'Stock ageing', nameUr: 'اسٹاک کی عمر',
      note: 'Aakhiri movement se kitne din guzre — 0-30 / 31-60 / 61-90 / 90+',
      source: 'custom',
      compute: function (p, s) {
        var last = {};
        DB.all('StockMoves').forEach(function (m) {
          var d = U.parseDate(m.date);
          if (!d) return;
          if (!last[m.itemId] || d > last[m.itemId]) last[m.itemId] = d;
        });
        var today = new Date();
        var buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
        var rows = [];
        DB.all('Stock').forEach(function (st) {
          if (U.num(st.qty) <= 0) return;
          if (p.locationId && st.locationId !== p.locationId) return;
          var it = DB.byId('Items', st.itemId);
          if (!it) return;
          var d = last[st.itemId];
          var age = d ? Math.floor((today - d) / 86400000) : 9999;
          var b = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
          var val = U.round(U.num(st.qty) * U.num(st.avgCost), 2);
          buckets[b] += val;
          rows.push({ code: it.code, name: it.name, qty: U.num(st.qty), value: val, ageDays: age === 9999 ? null : age, bucket: b });
        });
        var summary = Object.keys(buckets).map(function (b) {
          return { bucket: b, value: U.round(buckets[b], 2) };
        });
        rows.sort(function (a, b2) { return b2.value - a.value; });
        return {
          rows: summary,
          cols: [{ key: 'bucket', label: 'Age (days)' }, { key: 'value', label: 'Stock value', money: true }],
          totals: ['value'], detail: rows
        };
      }
    },
    {
      id: 'inv.expiry', group: 'Inventory', icon: '🥫',
      name: 'Expiry / near-expiry', nameUr: 'تاریخِ ختم',
      note: 'Sirf wahi items jin ki expiry track hoti hai',
      source: 'custom',
      compute: function (p, s) {
        var warnDays = U.num(p.days, 30);
        var limit = new Date(); limit.setDate(limit.getDate() + warnDays);
        var rows = [];
        DB.all('GRNItems').forEach(function (li) {
          if (!li.expiry) return;
          var it = DB.byId('Items', li.itemId);
          if (!it || U.str(it.hasExpiry) !== 'true') return;
          var d = U.parseDate(li.expiry);
          if (!d) return;
          rows.push({
            code: it.code, name: it.name, qty: U.num(li.qty), expiry: U.str(li.expiry).slice(0, 10),
            status: d < new Date() ? 'EXPIRED' : (d <= limit ? 'NEAR' : 'OK')
          });
        });
        rows.sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'qty', label: 'Qty', num: true }, { key: 'expiry', label: 'Expiry' },
          { key: 'status', label: 'Status' }],
          totals: ['qty']
        };
      }
    },

    /* -------------------------------- CUSTOMER (6) ------------------------- */
    {
      id: 'cus.ledger', group: 'Customer', icon: '📖',
      name: 'Customer ledger', nameUr: 'کسٹمر کھاتہ',
      note: 'Ek customer ki poori kahani (p.days ke sath)',
      source: 'custom',
      compute: function (p, s) {
        if (!p.customerId) return { rows: [], cols: [], totals: [], note: 'Customer select karein' };
        var d = Parties.customerLedger ? Parties.customerLedger({ customerId: p.customerId }, s) : null;
        var rows = (d && (d.entries || d.rows)) || [];
        return {
          rows: rows,
          cols: [{ key: 'date', label: 'Date' }, { key: 'refType', label: 'Type' },
          { key: 'description', label: 'Description' }, { key: 'debit', label: 'Debit', money: true },
          { key: 'credit', label: 'Credit', money: true }, { key: 'balance', label: 'Balance', money: true }],
          totals: ['debit', 'credit']
        };
      }
    },
    {
      id: 'cus.ageing', group: 'Customer', icon: '⏳',
      aliases: ['Aging Report', 'Receivable Ageing'],
      name: 'Receivables ageing', nameUr: 'وصولی کی عمر',
      note: '0-30 / 31-60 / 61-90 / 90+ din se kaun kitna denaydar hai',
      source: 'custom',
      compute: function (p, s) {
        var rows = Reports.partyBalances({ type: 'CUSTOMER' }, s).rows || [];
        var buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
        var today = new Date();
        rows.forEach(function (r) {
          var bal = U.num(r.balance);
          if (bal <= 0) return;
          var age = 0, d = U.parseDate(r.lastDate || r.date);
          if (d) age = Math.floor((today - d) / 86400000);
          var b = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
          buckets[b] += bal; buckets.total += bal;
        });
        var out = Object.keys(buckets).filter(function (k) { return k !== 'total'; }).map(function (k) {
          return { bucket: k, amount: U.round(buckets[k], 2) };
        });
        out.push({ bucket: 'TOTAL', amount: U.round(buckets.total, 2) });
        return {
          rows: out, cols: [{ key: 'bucket', label: 'Age (days)' }, { key: 'amount', label: 'Receivable', money: true }],
          totals: ['amount']
        };
      }
    },
    {
      id: 'cus.top', group: 'Customer', icon: '🏆',
      name: 'Top customers', nameUr: 'بڑے کسٹمرز',
      source: 'Sales', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'customerId', label: { sheet: 'Customers', field: 'name' } },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Purchased', money: true }],
      sort: { key: 'total', dir: 'desc' }, limit: 25, totals: ['invoices', 'total']
    },
    {
      id: 'cus.creditUtilization', group: 'Customer', icon: '📏',
      name: 'Credit limit utilisation', nameUr: 'کریڈٹ حد کا استعمال',
      note: 'Limit ke qareeb kaun hai — pehle se rok dein',
      source: 'custom',
      compute: function (p, s) {
        var rows = Reports.partyBalances({ type: 'CUSTOMER' }, s).rows || [];
        var out = [];
        rows.forEach(function (r) {
          var c = DB.byId('Customers', r.partyId || r.id);
          var limit = U.num(c && c.creditLimit);
          if (!limit) return;
          var bal = U.num(r.balance);
          out.push({
            name: (c && c.name) || r.name || r.partyId, phone: (c && c.phone) || '',
            balance: U.round(bal, 2), limit: limit,
            available: U.round(limit - bal, 2),
            utilisation: U.round((bal / limit) * 100, 1)
          });
        });
        out.sort(function (a, b) { return b.utilisation - a.utilisation; });
        return {
          rows: out,
          cols: [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' },
          { key: 'balance', label: 'Outstanding', money: true }, { key: 'limit', label: 'Limit', money: true },
          { key: 'available', label: 'Available', money: true }, { key: 'utilisation', label: 'Used %', num: true }],
          totals: ['balance', 'limit', 'available']
        };
      }
    },
    {
      id: 'cus.profit', group: 'Customer', icon: '💹',
      name: 'Profit by customer', nameUr: 'کسٹمر کے حساب سے منافع',
      source: 'custom',
      compute: function (p, s) {
        var sales = Reports._salesIn(p, s);
        var ids = {};
        sales.forEach(function (x) { ids[x.id] = x; });
        var map = {};
        DB.all('SaleItems').forEach(function (li) {
          var sale = ids[li.saleId];
          if (!sale) return;
          var key = sale.customerId || sale.customerName || 'WALK-IN';
          if (!map[key]) map[key] = { customer: key, invoices: 0, amount: 0, cost: 0, profit: 0 };
          map[key].amount += U.num(li.lineTotal);
          map[key].cost += U.num(li.qty) * U.num(li.cost);
        });
        sales.forEach(function (x) {
          var key = x.customerId || x.customerName || 'WALK-IN';
          if (map[key]) map[key].invoices++;
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.amount = U.round(o.amount, 2); o.cost = U.round(o.cost, 2);
          o.profit = U.round(o.amount - o.cost, 2);
          o.margin = o.amount ? U.round((o.profit / o.amount) * 100, 1) : 0;
          o.customer = ReportEngine._label('Customers', String(k).indexOf('CUS') === 0 ? k : '', 'name') || o.customer;
          return o;
        });
        rows.sort(function (a, b) { return b.profit - a.profit; });
        return {
          rows: rows,
          cols: [{ key: 'customer', label: 'Customer' }, { key: 'invoices', label: 'Invoices', num: true },
          { key: 'amount', label: 'Sales', money: true }, { key: 'cost', label: 'Cost', money: true },
          { key: 'profit', label: 'Profit', money: true }, { key: 'margin', label: 'Margin %', num: true }],
          totals: ['invoices', 'amount', 'cost', 'profit']
        };
      }
    },
    {
      id: 'cus.newVsRepeat', group: 'Customer', icon: '🔁',
      name: 'New vs repeat customers', nameUr: 'نئے بمقابلہ پرانے',
      source: 'custom',
      compute: function (p, s) {
        var r = Reports._range(p);
        var before = {};
        DB.all('Sales').forEach(function (x) {
          if (U.str(x.status) === 'VOID' || !x.customerId) return;
          var d = U.parseDate(x.date);
          if (d && d < r.from) before[x.customerId] = true;
        });
        var seen = {};
        var rows = { New: { type: 'New', customers: 0, sales: 0 }, Repeat: { type: 'Repeat', customers: 0, sales: 0 } };
        Reports._salesIn(p, s).forEach(function (x) {
          if (!x.customerId) return;
          var kind = before[x.customerId] ? 'Repeat' : 'New';
          if (!seen[kind]) seen[kind] = {};
          if (!seen[kind][x.customerId]) { seen[kind][x.customerId] = true; rows[kind].customers++; }
          rows[kind].sales += U.num(x.total);
        });
        var out = [rows.New, rows.Repeat];
        out.forEach(function (o) { o.sales = U.round(o.sales, 2); });
        return {
          rows: out,
          cols: [{ key: 'type', label: 'Type' }, { key: 'customers', label: 'Customers', num: true },
          { key: 'sales', label: 'Sales', money: true }],
          totals: ['customers', 'sales']
        };
      }
    },

    /* -------------------------------- SUPPLIER (6) ------------------------- */
    {
      id: 'sup.ledger', group: 'Supplier', icon: '📖',
      name: 'Supplier ledger', nameUr: 'سپلائر کھاتہ',
      source: 'custom',
      compute: function (p, s) {
        if (!p.supplierId) return { rows: [], cols: [], totals: [], note: 'Supplier select karein' };
        var d = Purchase.supplierStatement({ supplierId: p.supplierId }, s);
        var rows = (d && (d.entries || d.rows)) || [];
        return {
          rows: rows,
          cols: [{ key: 'date', label: 'Date' }, { key: 'refType', label: 'Type' },
          { key: 'description', label: 'Description' }, { key: 'debit', label: 'Paid', money: true },
          { key: 'credit', label: 'Purchased', money: true }, { key: 'balance', label: 'Balance', money: true }],
          totals: ['debit', 'credit']
        };
      }
    },
    {
      id: 'sup.ageing', group: 'Supplier', icon: '⏳',
      name: 'Payables ageing', nameUr: 'ادائیگی کی عمر',
      source: 'custom',
      compute: function (p, s) {
        var rows = Reports.partyBalances({ type: 'SUPPLIER' }, s).rows || [];
        var buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
        var today = new Date();
        rows.forEach(function (r) {
          var bal = U.num(r.balance);
          if (bal <= 0) return;
          var age = 0, d = U.parseDate(r.lastDate || r.date);
          if (d) age = Math.floor((today - d) / 86400000);
          var b = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
          buckets[b] += bal; buckets.total += bal;
        });
        var out = Object.keys(buckets).filter(function (k) { return k !== 'total'; }).map(function (k) {
          return { bucket: k, amount: U.round(buckets[k], 2) };
        });
        out.push({ bucket: 'TOTAL', amount: U.round(buckets.total, 2) });
        return {
          rows: out, cols: [{ key: 'bucket', label: 'Age (days)' }, { key: 'amount', label: 'Payable', money: true }],
          totals: ['amount']
        };
      }
    },
    {
      id: 'sup.top', group: 'Supplier', icon: '🏆',
      name: 'Top suppliers', nameUr: 'بڑے سپلائرز',
      source: 'GRN', dateField: 'date', filters: ['locationId'],
      groupBy: { key: 'supplierId', label: { sheet: 'Suppliers', field: 'name' } },
      measures: [{ key: 'grns', op: 'count', label: 'GRNs', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Purchased', money: true }],
      sort: { key: 'total', dir: 'desc' }, limit: 25, totals: ['grns', 'total']
    },
    {
      id: 'sup.priceComparison', group: 'Supplier', icon: '⚖',
      name: 'Item price comparison', nameUr: 'ریٹ کا موازنہ',
      note: 'Ek hi item kis supplier ne kitne ko diya — sab se sasta kaun',
      source: 'custom',
      compute: function (p, s) {
        var map = {};
        DB.all('GRNItems').forEach(function (li) {
          var g = DB.byId('GRN', li.grnId);
          if (!g || U.str(g.status) === 'VOID') return;
          if (p.supplierId && g.supplierId !== p.supplierId) return;
          var it = DB.byId('Items', li.itemId);
          if (!it) return;
          if (!map[it.id]) map[it.id] = { code: it.code, name: it.name, best: null, worst: null, buys: 0, qty: 0, avg: 0, total: 0 };
          var c = U.num(li.cost);
          if (!c) return;
          var e = map[it.id];
          e.buys++; e.qty += U.num(li.qty); e.total += c;
          if (e.best === null || c < e.best) e.best = c;
          if (e.worst === null || c > e.worst) e.worst = c;
        });
        var rows = Object.keys(map).map(function (k) {
          var e = map[k];
          e.qty = U.round(e.qty, 2);
          e.avg = e.buys ? U.round(e.total / e.buys, 2) : 0;
          e.spread = U.round(e.worst - e.best, 2);
          e.spreadPct = e.best ? U.round((e.spread / e.best) * 100, 2) : 0;
          delete e.total;
          return e;
        });
        rows.sort(function (a, b) { return b.spread - a.spread; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'buys', label: 'Purchases', num: true }, { key: 'qty', label: 'Qty', num: true },
          { key: 'best', label: 'Lowest', money: true }, { key: 'worst', label: 'Highest', money: true },
          { key: 'avg', label: 'Average', money: true }, { key: 'spread', label: 'Spread', money: true },
          { key: 'spreadPct', label: 'Spread %', num: true }],
          totals: ['buys', 'qty', 'spread']
        };
      }
    },
    {
      id: 'sup.purchaseVsPayment', group: 'Supplier', icon: '🔄',
      name: 'Purchases vs payments', nameUr: 'خریداری بمقابلہ ادائیگی',
      source: 'custom',
      compute: function (p, s) {
        var r = Reports._range(p);
        var map = {};
        DB.all('GRN').forEach(function (g) {
          var d = U.parseDate(g.date);
          if (!d || !(d >= r.from && d < r.to)) return;
          if (p.locationId && g.locationId !== p.locationId) return;
          if (!map[g.supplierId]) map[g.supplierId] = { supplierId: g.supplierId, purchased: 0, paid: 0 };
          map[g.supplierId].purchased += U.num(g.total);
        });
        DB.all('Payments').forEach(function (pm) {
          var d = U.parseDate(pm.date);
          if (!d || !(d >= r.from && d < r.to)) return;
          if (pm.partyType !== 'SUPPLIER') return;
          if (p.locationId && pm.locationId !== p.locationId) return;
          if (!map[pm.partyId]) map[pm.partyId] = { supplierId: pm.partyId, purchased: 0, paid: 0 };
          map[pm.partyId].paid += U.num(pm.amount);
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.purchased = U.round(o.purchased, 2); o.paid = U.round(o.paid, 2);
          o.outstanding = U.round(o.purchased - o.paid, 2);
          o.supplier = ReportEngine._label('Suppliers', k, 'name');
          return o;
        });
        rows.sort(function (a, b) { return b.purchased - a.purchased; });
        return {
          rows: rows,
          cols: [{ key: 'supplier', label: 'Supplier' }, { key: 'purchased', label: 'Purchased', money: true },
          { key: 'paid', label: 'Paid', money: true }, { key: 'outstanding', label: 'Outstanding', money: true }],
          totals: ['purchased', 'paid', 'outstanding']
        };
      }
    },
    {
      id: 'sup.deliveryPerformance', group: 'Supplier', icon: '🚚',
      name: 'Delivery performance', nameUr: 'ڈیلیوری کارکردگی',
      note: 'Expected date ke muqable GRN kab mila — late kaun karta hai',
      source: 'custom',
      compute: function (p, s) {
        var map = {};
        DB.all('GRN').forEach(function (g) {
          if (!g.poId) return;
          var po = DB.byId('PurchaseOrders', g.poId);
          if (!po || !po.expectedDate) return;
          if (p.supplierId && g.supplierId !== p.supplierId) return;
          if (!map[g.supplierId]) map[g.supplierId] = { supplierId: g.supplierId, orders: 0, onTime: 0, late: 0, lateDays: 0 };
          var e = map[g.supplierId];
          var exp = U.parseDate(po.expectedDate), got = U.parseDate(g.date);
          if (!exp || !got) return;
          e.orders++;
          var diff = Math.floor((got - exp) / 86400000);
          if (diff > 0) { e.late++; e.lateDays += diff; } else e.onTime++;
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.onTimePct = o.orders ? U.round((o.onTime / o.orders) * 100, 1) : 0;
          o.avgLateDays = o.late ? U.round(o.lateDays / o.late, 1) : 0;
          o.supplier = ReportEngine._label('Suppliers', k, 'name');
          delete o.lateDays;
          return o;
        });
        rows.sort(function (a, b) { return a.onTimePct - b.onTimePct; });
        return {
          rows: rows,
          cols: [{ key: 'supplier', label: 'Supplier' }, { key: 'orders', label: 'Deliveries', num: true },
          { key: 'onTime', label: 'On time', num: true }, { key: 'late', label: 'Late', num: true },
          { key: 'onTimePct', label: 'On-time %', num: true }, { key: 'avgLateDays', label: 'Avg late (days)', num: true }],
          totals: ['orders', 'onTime', 'late']
        };
      }
    },

    /* ------------------------------- WHOLESALE (8) ------------------------- */
    {
      id: 'ws.sales', group: 'Wholesale', icon: '🏪',
      name: 'Wholesale sales', nameUr: 'تھوک سیلز',
      note: 'Sirf wholesale customers ki sales',
      source: 'Sales', dateField: 'date', filters: ['locationId', 'salespersonId'],
      postFilter: function (r, parent) { return U.str(r.customerType) === 'WHOLESALE'; },
      detailCols: [{ key: 'invoiceNo', label: 'Invoice' }, { key: 'date', label: 'Date' },
      { key: 'customerId', label: 'Customer', lookup: { sheet: 'Customers', field: 'name' } },
      { key: 'subtotal', label: 'Subtotal', money: true }, { key: 'discount', label: 'Discount', money: true },
      { key: 'total', label: 'Total', money: true }, { key: 'paid', label: 'Paid', money: true },
      { key: 'due', label: 'Due', money: true }],
      sort: { key: 'date', dir: 'desc' }, limit: 500,
      totals: ['subtotal', 'discount', 'total', 'paid', 'due']
    },
    {
      id: 'ws.byDealer', group: 'Wholesale', icon: '🤝',
      name: 'Sales by dealer', nameUr: 'ڈیلر کے حساب سے',
      source: 'Sales', dateField: 'date', filters: ['locationId'],
      postFilter: function (r) { return U.str(r.customerType) === 'WHOLESALE'; },
      groupBy: { key: 'customerId', label: { sheet: 'Customers', field: 'name' } },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Purchased', money: true },
      { key: 'due', op: 'sum', field: 'due', label: 'Due', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['invoices', 'total', 'due']
    },
    {
      id: 'ws.byTier', group: 'Wholesale', icon: '🎚',
      name: 'Sales by price tier', nameUr: 'ریٹ ٹیئر کے حساب سے',
      source: 'custom',
      compute: function (p, s) {
        var map = {};
        Reports._salesIn(p, s).forEach(function (x) {
          var c = DB.byId('Customers', x.customerId);
          var tier = (c && U.str(c.priceTier)) || (c && U.str(c.customerTypeId)) || 'RETAIL';
          if (c && !U.str(c.priceTier) && c.customerTypeId) {
            var ct = DB.byId('CustomerTypes', c.customerTypeId);
            if (ct) tier = ct.name;
          }
          if (!map[tier]) map[tier] = { tier: tier, invoices: 0, amount: 0, discount: 0 };
          map[tier].invoices++;
          map[tier].amount += U.num(x.total);
          map[tier].discount += U.num(x.discount);
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.amount = U.round(o.amount, 2); o.discount = U.round(o.discount, 2);
          o.discountPct = o.amount ? U.round((o.discount / o.amount) * 100, 2) : 0;
          return o;
        });
        rows.sort(function (a, b) { return b.amount - a.amount; });
        return {
          rows: rows,
          cols: [{ key: 'tier', label: 'Tier' }, { key: 'invoices', label: 'Invoices', num: true },
          { key: 'amount', label: 'Sales', money: true }, { key: 'discount', label: 'Discount', money: true },
          { key: 'discountPct', label: 'Discount %', num: true }],
          totals: ['invoices', 'amount', 'discount']
        };
      }
    },
    {
      id: 'ws.marginByTier', group: 'Wholesale', icon: '💹',
      name: 'Margin by tier', nameUr: 'ٹیئر کے حساب سے منافع',
      note: 'Kon se tier par kitna margin bachta hai',
      source: 'custom',
      compute: function (p, s) {
        var sales = Reports._salesIn(p, s);
        var ids = {};
        sales.forEach(function (x) { ids[x.id] = x; });
        var map = {};
        DB.all('SaleItems').forEach(function (li) {
          var sale = ids[li.saleId];
          if (!sale) return;
          var c = DB.byId('Customers', sale.customerId);
          var tier = (c && U.str(c.priceTier)) || (c && U.str(c.customerTypeId)) || 'RETAIL';
          if (!map[tier]) map[tier] = { tier: tier, qty: 0, revenue: 0, cost: 0 };
          map[tier].qty += U.num(li.qty);
          map[tier].revenue += U.num(li.lineTotal);
          map[tier].cost += U.num(li.qty) * U.num(li.cost);
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.qty = U.round(o.qty, 2); o.revenue = U.round(o.revenue, 2); o.cost = U.round(o.cost, 2);
          o.profit = U.round(o.revenue - o.cost, 2);
          o.margin = o.revenue ? U.round((o.profit / o.revenue) * 100, 2) : 0;
          return o;
        });
        rows.sort(function (a, b) { return b.profit - a.profit; });
        return {
          rows: rows,
          cols: [{ key: 'tier', label: 'Tier' }, { key: 'qty', label: 'Qty', num: true },
          { key: 'revenue', label: 'Revenue', money: true }, { key: 'cost', label: 'Cost', money: true },
          { key: 'profit', label: 'Profit', money: true }, { key: 'margin', label: 'Margin %', num: true }],
          totals: ['qty', 'revenue', 'cost', 'profit']
        };
      }
    },
    {
      id: 'ws.bySalesman', group: 'Wholesale', icon: '🧑',
      name: 'Wholesale by salesperson', nameUr: 'سیلز مین کے حساب سے تھوک',
      source: 'Sales', dateField: 'date', filters: ['locationId'],
      postFilter: function (r) { return U.str(r.customerType) === 'WHOLESALE'; },
      groupBy: { key: 'salespersonId', label: { sheet: 'Users', field: 'name' } },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Sales', money: true },
      { key: 'due', op: 'sum', field: 'due', label: 'Due', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['invoices', 'total', 'due']
    },
    {
      id: 'ws.returns', group: 'Wholesale', icon: '↩',
      name: 'Sales returns', nameUr: 'سیلز واپسی',
      source: 'SaleReturns', dateField: 'date', filters: ['locationId'],
      detailCols: [{ key: 'returnNo', label: 'Return' }, { key: 'date', label: 'Date' },
      { key: 'saleId', label: 'Invoice' }, { key: 'customerId', label: 'Customer', lookup: { sheet: 'Customers', field: 'name' } },
      { key: 'total', label: 'Amount', money: true }, { key: 'reason', label: 'Reason' }],
      sort: { key: 'date', dir: 'desc' }, totals: ['total']
    },
    {
      id: 'ws.recovery', group: 'Wholesale', icon: '💵',
      name: 'Recovery / collections', nameUr: 'وصولی',
      note: 'Customer se kab, kitna aur kis zariye se mila',
      source: 'Payments', dateField: 'date', filters: ['locationId', 'method', 'customerId'],
      postFilter: function (r) { return U.str(r.partyType) === 'CUSTOMER'; },
      detailCols: [{ key: 'voucherNo', label: 'Voucher' }, { key: 'date', label: 'Date' },
      { key: 'partyId', label: 'Customer', lookup: { sheet: 'Customers', field: 'name' } },
      { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', money: true },
      { key: 'reference', label: 'Reference' }],
      sort: { key: 'date', dir: 'desc' }, limit: 500, totals: ['amount']
    },
    {
      id: 'ws.tierDiscounts', group: 'Wholesale', icon: '🏷',
      name: 'Tier / contract prices', nameUr: 'ٹیئر ریٹ لسٹ',
      note: 'ItemPrices — kis tier ke liye kya rate hai',
      source: 'ItemPrices', filters: ['itemId'],
      detailCols: [{ key: 'itemId', label: 'Item', lookup: { sheet: 'Items', field: 'name' } },
      { key: 'customerTypeId', label: 'Tier', lookup: { sheet: 'CustomerTypes', field: 'name' } },
      { key: 'priceType', label: 'Type' }, { key: 'minQty', label: 'Min qty', num: true },
      { key: 'price', label: 'Price', money: true }, { key: 'discountPct', label: 'Discount %', num: true },
      { key: 'validFrom', label: 'From' }, { key: 'validTo', label: 'To' },
      { key: 'active', label: 'Active' }],
      sort: { key: 'itemId', dir: 'asc' }, limit: 500, totals: []
    },

    /* -------------------- EXTRA COVERAGE (brief ke baqi reports) ------------ */
    {
      id: 'fin.dailyOpening', group: 'Financial', icon: '🌅',
      name: 'Daily opening balance', nameUr: 'روزانہ اوپننگ',
      note: 'Har session ka opening cash — din ka aghaz kis raqam se hua',
      source: 'CashSessions', dateField: 'openedAt', keepVoid: true,
      filters: ['locationId'],
      groupBy: { key: 'sessionNo' },
      measures: [{ key: 'opening', op: 'sum', field: 'openingCash', label: 'Opening cash', money: true },
      { key: 'closed', op: 'sum', field: 'closingCash', label: 'Closing cash', money: true }],
      sort: { key: 'opening', dir: 'desc' }, totals: ['opening', 'closed']
    },
    {
      id: 'fin.incomeReport', group: 'Financial', icon: '📥',
      name: 'Income report', nameUr: 'آمدنی رپورٹ',
      note: 'Sales + doosri aamdani — kahan se paisa aaya',
      source: 'custom',
      compute: function (p, s) {
        var sales = Reports._salesIn(p, s);
        var revenue = 0;
        sales.forEach(function (x) { revenue += U.num(x.total); });
        var r = Reports._range(p);
        var other = {};
        DB.all('Payments').forEach(function (pm) {
          var d = U.parseDate(pm.date);
          if (!d || !(d >= r.from && d < r.to)) return;
          if (p.locationId && pm.locationId !== p.locationId) return;
          if (U.str(pm.partyType) === 'CUSTOMER' && U.str(pm.saleId)) return;  /* sale ki hi payment */
          var k = U.str(pm.type) || 'OTHER_INCOME';
          other[k] = (other[k] || 0) + U.num(pm.amount);
        });
        var rows = [{ head: 'Sales revenue', amount: U.round(revenue, 2) }];
        Object.keys(other).sort().forEach(function (k) {
          rows.push({ head: k, amount: U.round(other[k], 2) });
        });
        return {
          rows: rows, cols: [{ key: 'head', label: 'Income head' }, { key: 'amount', label: 'Amount', money: true }],
          totals: ['amount']
        };
      }
    },
    {
      id: 'fin.marginAnalysis', group: 'Financial', icon: '📐',
      name: 'Margin analysis', nameUr: 'مارجن تجزیہ',
      note: 'Item-dar-item: kitna margin bacha, kitna nahi',
      source: 'custom',
      compute: function (p, s) {
        var sales = Reports._salesIn(p, s);
        var ids = {};
        sales.forEach(function (x) { ids[x.id] = x; });
        var map = {};
        DB.all('SaleItems').forEach(function (li) {
          if (!ids[li.saleId]) return;
          var it = DB.byId('Items', li.itemId);
          if (!map[li.itemId]) {
            map[li.itemId] = { code: (it && it.code) || '', name: (it && it.name) || li.name || li.itemId, qty: 0, revenue: 0, cost: 0 };
          }
          map[li.itemId].qty += U.num(li.qty);
          map[li.itemId].revenue += U.num(li.lineTotal);
          map[li.itemId].cost += U.num(li.qty) * U.num(li.cost);
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.qty = U.round(o.qty, 2); o.revenue = U.round(o.revenue, 2); o.cost = U.round(o.cost, 2);
          o.profit = U.round(o.revenue - o.cost, 2);
          o.margin = o.revenue ? U.round((o.profit / o.revenue) * 100, 2) : 0;
          return o;
        });
        rows.sort(function (a, b) { return a.margin - b.margin; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'qty', label: 'Qty', num: true }, { key: 'revenue', label: 'Revenue', money: true },
          { key: 'cost', label: 'Cost', money: true }, { key: 'profit', label: 'Profit', money: true },
          { key: 'margin', label: 'Margin %', num: true }],
          totals: ['qty', 'revenue', 'cost', 'profit']
        };
      }
    },
    {
      id: 'inv.outOfStock', group: 'Inventory', icon: '🚫',
      name: 'Out of stock', nameUr: 'ختم شدہ اسٹاک',
      note: 'Zero ya negative — foran mangwana chahiye',
      source: 'Stock', filters: ['locationId'],
      postFilter: function (r) { return U.num(r.qty) <= 0; },
      groupBy: { key: 'itemId', label: { sheet: 'Items', field: 'name' } },
      measures: [{ key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true }],
      sort: { key: 'qty', dir: 'asc' }, totals: ['qty']
    },
    {
      id: 'inv.overstock', group: 'Inventory', icon: '📊',
      name: 'Overstock', nameUr: 'ضرورت سے زائد اسٹاک',
      note: 'Reorder level se kai guna zyada — paisa phansa hua',
      source: 'custom',
      compute: function (p, s) {
        var factor = U.num(p.factor, 3);
        var rows = [];
        DB.all('Stock').forEach(function (st) {
          if (p.locationId && st.locationId !== p.locationId) return;
          var it = DB.byId('Items', st.itemId);
          if (!it) return;
          var qty = U.num(st.qty);
          var base = U.num(it.reorderLevel, U.num(it.minStock));
          if (!base) return;
          if (qty <= base * factor) return;
          rows.push({
            code: it.code, name: it.name, category: it.category, locationId: st.locationId,
            qty: qty, reorderLevel: base, excess: U.round(qty - base, 2),
            value: U.round(qty * U.num(st.avgCost), 2)
          });
        });
        rows.sort(function (a, b) { return b.value - a.value; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' }, { key: 'locationId', label: 'Location' },
          { key: 'qty', label: 'On hand', num: true }, { key: 'reorderLevel', label: 'Normal level', num: true },
          { key: 'excess', label: 'Excess', num: true }, { key: 'value', label: 'Value', money: true }],
          totals: ['qty', 'excess', 'value']
        };
      }
    },
    {
      id: 'inv.fastSlow', group: 'Inventory', icon: '⚡',
      name: 'Fast / slow moving', nameUr: 'تیز / سست چلنے والا',
      note: 'Kaunsi cheez tez bikti hai, kaunsi shelf par padi hai',
      source: 'custom',
      compute: function (p, s) {
        var r = Reports._range(p);
        var days = Math.max(1, Math.round((r.to - r.from) / 86400000));
        var map = {};
        DB.all('SaleItems').forEach(function (li) {
          var sale = DB.byId('Sales', li.saleId);
          if (!sale || U.str(sale.status) === 'VOID') return;
          var d = U.parseDate(sale.date);
          if (!d || !(d >= r.from && d < r.to)) return;
          var it = DB.byId('Items', li.itemId);
          if (!map[li.itemId]) map[li.itemId] = { code: (it && it.code) || '', name: (it && it.name) || li.itemId, qty: 0, revenue: 0 };
          map[li.itemId].qty += U.num(li.qty);
          map[li.itemId].revenue += U.num(li.lineTotal);
        });
        var rows = Object.keys(map).map(function (k) {
          var o = map[k];
          o.perDay = U.round(o.qty / days, 2);
          o.qty = U.round(o.qty, 2);
          o.revenue = U.round(o.revenue, 2);
          o.speed = o.perDay >= 1 ? 'FAST' : (o.perDay >= 0.2 ? 'MEDIUM' : 'SLOW');
          return o;
        });
        rows.sort(function (a, b) { return b.perDay - a.perDay; });
        return {
          rows: rows,
          cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
          { key: 'qty', label: 'Sold', num: true }, { key: 'perDay', label: 'Per day', num: true },
          { key: 'revenue', label: 'Revenue', money: true }, { key: 'speed', label: 'Speed' }],
          totals: ['qty', 'revenue']
        };
      }
    },
    {
      id: 'inv.countAudit', group: 'Inventory', icon: '🔍',
      name: 'Stock count / audit', nameUr: 'اسٹاک گنتی / آڈٹ',
      note: 'Har count sheet: kitni lines, kitna farq, accuracy',
      source: 'CountSheets', dateField: 'createdAt',
      postFilter: function (r) { return U.str(r.status) === 'POSTED'; },
      detailCols: [{ key: 'sheetNo', label: 'Sheet' }, { key: 'warehouseId', label: 'Warehouse' },
      { key: 'lines', label: 'Lines', num: true }, { key: 'counted', label: 'Counted', num: true },
      { key: 'matched', label: 'Matched', num: true }, { key: 'over', label: 'Over', num: true },
      { key: 'short', label: 'Short', num: true }, { key: 'varianceValue', label: 'Variance value', money: true },
      { key: 'status', label: 'Status' }, { key: 'postedBy', label: 'Posted by' }],
      sort: { key: 'sheetNo', dir: 'desc' }, totals: ['lines', 'counted', 'matched', 'over', 'short', 'varianceValue']
    },
    {
      id: 'inv.catalogue', group: 'Inventory', icon: '📖',
      name: 'Item catalogue', nameUr: 'آئٹم کیٹلاگ',
      note: 'Poori item list — code, brand, rates, stock',
      source: 'Items', filters: ['category', 'brand'],
      detailCols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
      { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
      { key: 'unit', label: 'Unit' }, { key: 'costPrice', label: 'Cost', money: true },
      { key: 'wholesalePrice', label: 'Wholesale', money: true },
      { key: 'retailPrice', label: 'Retail', money: true },
      { key: 'minStock', label: 'Min stock', num: true },
      { key: 'reorderLevel', label: 'Reorder', num: true }, { key: 'rack', label: 'Rack' },
      { key: 'status', label: 'Status' }],
      sort: { key: 'code', dir: 'asc' }, limit: 1000, totals: []
    },
    {
      id: 'inv.barcode', group: 'Inventory', icon: '🏷',
      name: 'Barcode / QR report', nameUr: 'بارکوڈ / QR رپورٹ',
      note: 'Labels chhapne ke liye — jin items ka barcode maujood hai',
      source: 'Items', filters: ['category'],
      postFilter: function (r) { return !!U.str(r.barcode); },
      detailCols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
      { key: 'barcode', label: 'Barcode' }, { key: 'barcodeType', label: 'Type' },
      { key: 'retailPrice', label: 'Retail', money: true }, { key: 'unit', label: 'Unit' }],
      sort: { key: 'code', dir: 'asc' }, limit: 1000, totals: []
    },
    {
      id: 'cus.outstandingInvoices', group: 'Customer', icon: '🧾',
      name: 'Outstanding invoices', nameUr: 'بقایا انوائسز',
      note: 'Jin invoices ka paisa abhi baqi hai',
      source: 'Sales', dateField: 'date', filters: ['locationId', 'customerId'],
      postFilter: function (r) { return U.num(r.due) > 0; },
      detailCols: [{ key: 'invoiceNo', label: 'Invoice' }, { key: 'date', label: 'Date' },
      { key: 'customerId', label: 'Customer', lookup: { sheet: 'Customers', field: 'name' } },
      { key: 'total', label: 'Total', money: true }, { key: 'paid', label: 'Paid', money: true },
      { key: 'due', label: 'Due', money: true }, { key: 'paymentMethod', label: 'Method' }],
      sort: { key: 'date', dir: 'desc' }, limit: 500, totals: ['total', 'paid', 'due']
    },
    {
      id: 'cus.paymentHistory', group: 'Customer', icon: '💵',
      name: 'Customer payment history', nameUr: 'ادائیگی کی تاریخ',
      source: 'Payments', dateField: 'date', filters: ['locationId', 'customerId', 'method'],
      postFilter: function (r) { return U.str(r.partyType) === 'CUSTOMER'; },
      groupBy: { key: 'partyId', label: { sheet: 'Customers', field: 'name' } },
      measures: [{ key: 'payments', op: 'count', label: 'Payments', num: true },
      { key: 'amount', op: 'sum', field: 'amount', label: 'Received', money: true }],
      sort: { key: 'amount', dir: 'desc' }, totals: ['payments', 'amount']
    },
    {
      id: 'sup.list', group: 'Supplier', icon: '📇',
      name: 'Vendor list', nameUr: 'سپلائر لسٹ',
      note: 'Sab suppliers — terms, credit limit aur baqaya ke sath',
      source: 'Suppliers',
      detailCols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Supplier' },
      { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'company', label: 'Company' }, { key: 'paymentTerms', label: 'Terms' },
      { key: 'openingBalance', label: 'Opening', money: true }],
      sort: { key: 'name', dir: 'asc' }, limit: 500, totals: ['openingBalance']
    },
    {
      id: 'sup.outstandingBills', group: 'Supplier', icon: '🧾',
      name: 'Outstanding bills', nameUr: 'بقایا بلز',
      note: 'Kaunse GRN ke paise abhi baqi hain (purane pehle)',
      source: 'custom',
      compute: function (p, s) {
        var rows = [];
        DB.all('GRN').forEach(function (g) {
          if (U.str(g.status) === 'VOID') return;
          if (p.locationId && g.locationId !== p.locationId) return;
          if (p.supplierId && g.supplierId !== p.supplierId) return;
          var paid = 0;
          DB.all('Payments').forEach(function (pm) {
            if (pm.partyType !== 'SUPPLIER') return;
            if (pm.purchaseId === g.id || U.str(pm.reference) === U.str(g.grnNo)) paid += U.num(pm.amount);
          });
          var due = U.round(U.num(g.total) + U.num(g.freight) - paid, 2);
          if (due <= 0) return;
          var d = U.parseDate(g.date);
          var age = d ? Math.floor((new Date() - d) / 86400000) : null;
          rows.push({
            grnNo: g.grnNo, date: U.str(g.date).slice(0, 10), invoiceNo: g.invoiceNo || '',
            supplier: ReportEngine._label('Suppliers', g.supplierId, 'name'),
            total: U.num(g.total), paid: U.round(paid, 2), due: due, ageDays: age
          });
        });
        rows.sort(function (a, b) { return (b.ageDays || 0) - (a.ageDays || 0); });
        return {
          rows: rows,
          cols: [{ key: 'grnNo', label: 'GRN' }, { key: 'date', label: 'Date' },
          { key: 'invoiceNo', label: 'Supp. invoice' }, { key: 'supplier', label: 'Supplier' },
          { key: 'total', label: 'Bill', money: true }, { key: 'paid', label: 'Paid', money: true },
          { key: 'due', label: 'Due', money: true }, { key: 'ageDays', label: 'Age (days)', num: true }],
          totals: ['total', 'paid', 'due']
        };
      }
    },
    {
      id: 'sup.paymentHistory', group: 'Supplier', icon: '💸',
      name: 'Supplier payment history', nameUr: 'ادائیگی کی تاریخ',
      source: 'Payments', dateField: 'date', filters: ['locationId', 'supplierId', 'method'],
      postFilter: function (r) { return U.str(r.partyType) === 'SUPPLIER'; },
      groupBy: { key: 'partyId', label: { sheet: 'Suppliers', field: 'name' } },
      measures: [{ key: 'payments', op: 'count', label: 'Payments', num: true },
      { key: 'amount', op: 'sum', field: 'amount', label: 'Paid', money: true }],
      sort: { key: 'amount', dir: 'desc' }, totals: ['payments', 'amount']
    },

    /* --------------------- v2.6 §12 — SALESMAN (wholesale core) ------------- */
    {
      id: 'ws.stockIssued', group: 'Wholesale', icon: '📤',
      name: 'Stock issued to salesman', nameUr: 'سیلز مین کو دیا گیا اسٹاک',
      note: 'Kis salesman ko kab, kaunsa maal diya gaya',
      aliases: ['Stock Issued to Salesman'],
      source: 'SalesmanIssueItems', join: { sheet: 'SalesmanIssues', on: 'issueId' }, dateField: 'date',
      filters: ['locationId'],
      detailCols: [{ key: 'issueId', label: 'Issue' },
      { key: 'salesmanId', label: 'Salesman', lookup: { sheet: 'Users', field: 'name' } },
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
      { key: 'qty', label: 'Qty', num: true }, { key: 'cost', label: 'Cost', money: true },
      { key: 'lineTotal', label: 'Value', money: true }],
      totals: ['qty', 'lineTotal']
    },
    {
      id: 'ws.stockBalance', group: 'Wholesale', icon: '🧮',
      name: 'Salesman stock balance', nameUr: 'سیلز مین کا بقیہ اسٹاک',
      note: 'Har salesman ke zimme abhi kitna maal hai',
      aliases: ['Salesman Stock Balance'],
      source: 'SalesmanStock', filters: ['locationId'],
      postFilter: function (r) { return U.num(r.qty) !== 0; },
      groupBy: { key: 'salesmanId', label: { sheet: 'Users', field: 'name' } },
      measures: [{ key: 'items', op: 'count', label: 'Items', num: true },
      { key: 'qty', op: 'sum', field: 'qty', label: 'Qty', num: true }],
      sort: { key: 'qty', dir: 'desc' }, totals: ['items', 'qty']
    },
    {
      id: 'ws.stockBalanceDetail', group: 'Wholesale', icon: '📋',
      name: 'Salesman stock (item-wise)', nameUr: 'آئٹم کے حساب سے بقیہ',
      note: 'Salesman × item — exact balance aur uski maliet',
      source: 'custom',
      compute: function (p, s) {
        var rows = [];
        DB.all('SalesmanStock').forEach(function (r) {
          if (U.num(r.qty) === 0) return;
          if (p.locationId && r.locationId !== p.locationId) return;
          var it = DB.byId('Items', r.itemId);
          rows.push({
            salesman: Salesman._name(r.salesmanId), salesmanId: r.salesmanId,
            code: (it && it.code) || '', name: (it && it.name) || r.itemId,
            qty: U.num(r.qty), avgCost: U.round(U.num(r.avgCost), 2),
            value: U.round(U.num(r.qty) * U.num(r.avgCost), 2)
          });
        });
        rows.sort(function (a, b) { return a.salesman.localeCompare(b.salesman) || b.value - a.value; });
        return {
          rows: rows,
          cols: [{ key: 'salesman', label: 'Salesman' }, { key: 'code', label: 'Code' },
          { key: 'name', label: 'Item' }, { key: 'qty', label: 'Qty', num: true },
          { key: 'avgCost', label: 'Avg cost', money: true }, { key: 'value', label: 'Value', money: true }],
          totals: ['qty', 'value']
        };
      }
    },
    {
      id: 'ws.salesmanSales', group: 'Wholesale', icon: '💼',
      name: 'Salesman sales', nameUr: 'سیلز مین کی سیلز',
      note: 'Har salesman ne kitna becha (source = SALESMAN)',
      aliases: ['Salesman Sales'],
      source: 'Sales', dateField: 'date', filters: ['locationId', 'salespersonId'],
      postFilter: function (r) { return U.str(r.source) === 'SALESMAN'; },
      groupBy: { key: 'salespersonId', label: { sheet: 'Users', field: 'name' } },
      measures: [{ key: 'invoices', op: 'count', label: 'Invoices', num: true },
      { key: 'total', op: 'sum', field: 'total', label: 'Sold', money: true },
      { key: 'paid', op: 'sum', field: 'paid', label: 'Collected', money: true },
      { key: 'due', op: 'sum', field: 'due', label: 'Due', money: true }],
      sort: { key: 'total', dir: 'desc' }, totals: ['invoices', 'total', 'paid', 'due']
    },
    {
      id: 'ws.salesmanReturns', group: 'Wholesale', icon: '📥',
      name: 'Salesman returns', nameUr: 'سیلز مین کی واپسی',
      note: 'Bacha hua maal wapas kab aur kitna aaya',
      aliases: ['Salesman Returns'],
      source: 'SalesmanReturnItems', join: { sheet: 'SalesmanReturns', on: 'returnId' }, dateField: 'date',
      filters: ['locationId'],
      detailCols: [{ key: 'returnId', label: 'Return' },
      { key: 'salesmanId', label: 'Salesman', lookup: { sheet: 'Users', field: 'name' } },
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
      { key: 'qty', label: 'Qty', num: true }, { key: 'lineTotal', label: 'Value', money: true }],
      totals: ['qty', 'lineTotal']
    },
    {
      id: 'ws.salesmanSettlement', group: 'Wholesale', icon: '🧾',
      name: 'Salesman settlement', nameUr: 'سیلز مین کا حساب',
      note: 'Diya − bika − wapas = bachna chahiye; asli ginti se farq',
      aliases: ['Salesman Settlement', 'Settlement Report'],
      source: 'SalesmanSettlements', dateField: 'date', keepVoid: true,
      filters: ['locationId'],
      detailCols: [{ key: 'settleNo', label: 'Settlement' }, { key: 'date', label: 'Date' },
      { key: 'salesmanId', label: 'Salesman', lookup: { sheet: 'Users', field: 'name' } },
      { key: 'issuedValue', label: 'Issued', money: true },
      { key: 'soldValue', label: 'Sold', money: true },
      { key: 'returnedValue', label: 'Returned', money: true },
      { key: 'expectedValue', label: 'Expected', money: true },
      { key: 'countedValue', label: 'Counted', money: true },
      { key: 'varianceValue', label: 'Variance', money: true },
      { key: 'cashCollected', label: 'Collected', money: true },
      { key: 'dueFromSalesman', label: 'Due from salesman', money: true }],
      sort: { key: 'date', dir: 'desc' },
      totals: ['issuedValue', 'soldValue', 'returnedValue', 'expectedValue', 'countedValue',
        'varianceValue', 'cashCollected', 'dueFromSalesman']
    },
    {
      id: 'ws.salesmanOutstanding', group: 'Wholesale', icon: '⏳',
      name: 'Outstanding salesman settlement', nameUr: 'زیر التوا حساب',
      note: 'Jin salesmen ka stock abhi band nahi hua',
      aliases: ['Outstanding Salesman Settlement'],
      source: 'custom',
      compute: function (p, s) {
        var rows = [];
        var done = {};
        DB.all('SalesmanSettlements').forEach(function (r) { done[r.salesmanId] = U.str(r.date); });
        var seen = {};
        DB.all('SalesmanStock').forEach(function (r) {
          if (U.num(r.qty) === 0) return;
          if (p.locationId && r.locationId !== p.locationId) return;
          if (seen[r.salesmanId]) return;
          seen[r.salesmanId] = true;
          rows.push({
            salesman: Salesman._name(r.salesmanId), salesmanId: r.salesmanId,
            lastSettlement: done[r.salesmanId] || 'kabhi nahi',
            stockValue: Salesman.stockValue(r.salesmanId, p.locationId || '')
          });
        });
        rows.sort(function (a, b) { return b.stockValue - a.stockValue; });
        return {
          rows: rows,
          cols: [{ key: 'salesman', label: 'Salesman' },
          { key: 'lastSettlement', label: 'Last settlement' },
          { key: 'stockValue', label: 'Un-settled stock', money: true }],
          totals: ['stockValue']
        };
      }
    },
    {
      id: 'ws.tourVisits', group: 'Wholesale', icon: '🗺',
      name: 'Tour / visit summary', nameUr: 'دورہ / وزٹ خلاصہ',
      note: 'Salesman ne kis customer ko kab dekha, kya order mila',
      aliases: ['Tour/Visit Summary', 'Visit Report'],
      source: 'SalesmanVisits', dateField: 'date', filters: ['locationId', 'customerId'],
      groupBy: { key: 'salesmanId', label: { sheet: 'Users', field: 'name' } },
      measures: [{ key: 'visits', op: 'count', label: 'Visits', num: true },
      { key: 'orderValue', op: 'sum', field: 'orderValue', label: 'Orders', money: true },
      { key: 'collected', op: 'sum', field: 'collected', label: 'Collected', money: true }],
      sort: { key: 'visits', dir: 'desc' }, totals: ['visits', 'orderValue', 'collected']
    }
  ],

  /* ==========================================================================
     LOOKUP CACHE — har run ke shuru mein saaf
     ========================================================================== */
  _cache: {},
  _lbl: {},
  _begin: function () { ReportEngine._cache = {}; ReportEngine._lbl = {}; },

  _all: function (sheet) {
    if (ReportEngine._cache[sheet] === undefined) {
      ReportEngine._cache[sheet] = DB.all(sheet) || [];
    }
    return ReportEngine._cache[sheet];
  },

  _label: function (sheet, id, field) {
    if (!id) return '';
    var k = sheet + ':' + id;
    if (ReportEngine._lbl[k] === undefined) {
      var r = null;
      try { r = DB.byId(sheet, id); } catch (e) { r = null; }
      ReportEngine._lbl[k] = r ? U.str(r[field || 'name']) : '';
    }
    return ReportEngine._lbl[k];
  },

  /* ==========================================================================
     PUBLIC — catalog + groups (UI isi se banti hai)
     ========================================================================== */
  groups: function (s) {
    Auth.require(s, 'reports.view');
    var g = {}, order = [];
    ReportEngine.CATALOG.forEach(function (d) {
      if (!g[d.group]) { g[d.group] = { group: d.group, reports: [] }; order.push(d.group); }
      g[d.group].reports.push({
        id: d.id, name: d.name, nameUr: d.nameUr || d.name, icon: d.icon || '📄',
        note: d.note || '', hasDate: d.dateField !== false && d.source !== undefined
      });
    });
    return order.map(function (k) { return g[k]; });
  },

  find: function (id) {
    for (var i = 0; i < ReportEngine.CATALOG.length; i++) {
      if (ReportEngine.CATALOG[i].id === id) return ReportEngine.CATALOG[i];
    }
    return null;
  },

  /* ==========================================================================
     EXECUTOR — ek hi code path, sab reports isi se chalte hain
     ========================================================================== */
  run: function (p, s) {
    Auth.require(s, 'reports.view');
    p = p || {};
    ReportEngine._begin();

    var def = ReportEngine.find(p.id);
    if (!def) throw new Error('Report nahi mila: ' + (p.id || ''));

    var out;
    try {
      out = (def.source === 'custom' && def.compute)
        ? (def.compute(p, s) || {})
        : ReportEngine._aggregate(def, p, s);
    } catch (e) {
      throw new Error(def.name + ' chalate waqt masla: ' + (e.message || e));
    }

    var rows = out.rows || [];
    var totals = null;
    var tKeys = out.totals || def.totals || [];
    if (tKeys.length) {
      totals = {};
      tKeys.forEach(function (k) {
        var sum = 0;
        rows.forEach(function (r) { sum += U.num(r[k]); });
        totals[k] = U.round(sum, 2);
      });
    }

    return {
      meta: {
        id: def.id, group: def.group, name: def.name, nameUr: def.nameUr || def.name,
        note: def.note || '', icon: def.icon || '📄',
        from: p.from || '', to: p.to || '', locationId: p.locationId || '',
        rowCount: rows.length, generatedAt: U.iso()
      },
      cols: out.cols || def.cols || [],
      rows: rows,
      totals: totals
    };
  },

  /* ---------------------- generic aggregation engine ----------------------- */
  _aggregate: function (def, p, s) {
    var rows = ReportEngine._all(def.source);
    var joinMap = null;
    if (def.join) {
      joinMap = {};
      ReportEngine._all(def.join.sheet).forEach(function (r) { joinMap[r.id] = r; });
    }
    var dateField = def.dateField === false ? '' : (def.dateField || 'date');
    var range = dateField ? Reports._range(p) : null;
    var filters = def.filters || [];

    /* ---------- 1. filter ---------- */
    var picked = rows.filter(function (r) {
      var par = joinMap ? joinMap[r[def.join.on]] : null;
      if (joinMap && !par) return false;

      if (range) {
        var dv = (joinMap && par[dateField] !== undefined) ? par[dateField] : r[dateField];
        var d = U.parseDate(dv);
        if (!d || !(d >= range.from && d < range.to)) return false;
      }
      if (!def.keepVoid) {
        var st = joinMap ? U.str(par.status) : U.str(r.status);
        if (st === 'VOID' || st === 'CANCELLED') return false;
      }
      for (var i = 0; i < filters.length; i++) {
        var k = filters[i];
        var v = p[k];
        if (v === undefined || v === null || v === '') continue;
        if (k === 'from' || k === 'to') continue;
        var rv = (r[k] !== undefined) ? r[k] : (par ? par[k] : undefined);
        if (rv === undefined) rv = par ? par[k] : undefined;
        if (String(rv) !== String(v)) return false;
      }
      if (def.postFilter && !def.postFilter(r, par)) return false;
      return true;
    });

    /* ---------- 2. detail mode (koi groupBy nahi) ---------- */
    if (!def.groupBy) {
      var detailRows = picked.map(function (r) {
        var par = joinMap ? joinMap[r[def.join.on]] : null;
        var o = {};
        (def.detailCols || []).forEach(function (c) {
          var v = (r[c.key] !== undefined) ? r[c.key] : (par ? par[c.key] : '');
          if (c.lookup) v = ReportEngine._label(c.lookup.sheet, v, c.lookup.field) || v;
          o[c.key] = v;
        });
        return o;
      });
      return {
        rows: detailRows,
        cols: def.detailCols || [],
        totals: def.totals || []
      };
    }

    /* ---------- 3. group ---------- */
    var gb = def.groupBy;
    var gKey = gb.key || gb;
    var order = [], groups = {};
    picked.forEach(function (r) {
      var par = joinMap ? joinMap[r[def.join.on]] : null;
      var key;
      if (gb.resolve) {
        var found = null;
        var src = ReportEngine._all(gb.resolve.sheet);
        for (var i = 0; i < src.length; i++) {
          if (src[i].id === r[gb.resolve.by]) { found = src[i]; break; }
        }
        key = found ? U.str(found[gb.resolve.field]) : '—';
      } else {
        key = U.str(r[gKey]);
        if (!key && par && par[gKey] !== undefined) key = U.str(par[gKey]);
      }
      if (!key) key = '—';
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push({ r: r, p: par });
    });

    /* ---------- 4. measures ---------- */
    var outRows = order.map(function (key) {
      var list = groups[key];
      var o = { key: key, name: gb.label ? (ReportEngine._label(gb.label.sheet, key, gb.label.field) || key) : key };
      (def.measures || []).forEach(function (m) {
        var total = 0, n = 0, seen = false;
        list.forEach(function (w) {
          var row = (m.from === 'parent' && w.p) ? w.p : w.r;
          var fv = m.field ? U.num(row[m.field]) : 0;
          if (m.op === 'count') total++;
          else if (m.op === 'sum') total += fv;
          else if (m.op === 'avg') { total += fv; n++; }
          else if (m.op === 'max') { if (!seen || fv > total) total = fv; seen = true; }
          else if (m.op === 'min') { if (!seen || fv < total) total = fv; seen = true; }
        });
        if (m.op === 'avg' && n) total = total / n;
        o[m.key] = m.op === 'count' ? total : U.round(total, m.dec === undefined ? 2 : m.dec);
      });
      return o;
    });

    /* ---------- 5. sort + limit ---------- */
    if (def.sort) {
      var sk = def.sort.key, dir = def.sort.dir === 'asc' ? 1 : -1;
      outRows.sort(function (a, b) {
        var x = a[sk], y = b[sk];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x).localeCompare(String(y)) * dir;
      });
    }
    if (def.limit) outRows = outRows.slice(0, def.limit);

    var cols = [{ key: 'name', label: (def.groupBy.label ? 'Name' : (def.groupBy.key || 'Group')) }]
      .concat((def.measures || []).map(function (m) {
        return { key: m.key, label: m.label || m.key, money: !!m.money, num: !!m.num };
      }));

    return { rows: outRows, cols: cols, totals: def.totals || [] };
  },

  /* ==========================================================================
     EXPORT — CSV (PDF/Excel UI taraf banta hai, Exports.gs ke zariye)
     ========================================================================== */
  exportCsv: function (p, s) {
    var res = ReportEngine.run(p, s);
    var cols = res.cols;
    var lines = [cols.map(function (c) { return c.label; }).join(',')];
    res.rows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c.key];
        if (v === null || v === undefined) v = '';
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    return { filename: (p.id || 'report').replace(/\./g, '-') + '.csv', csv: lines.join('\n') };
  }
};
