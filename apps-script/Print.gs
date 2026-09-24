/**
 * HASEEB AUTOS - ERP / POS  ::  PRINT ENGINE (receipts, invoices, labels)
 * ---------------------------------------------------------------------------
 * 1) PAPER SIZES  — thermal (58/80mm) + sheets (A3/A4/A5/half-letter), settings-driven
 * 2) TEMPLATES    — JSON schema: sections → fields (visible / order / align / size)
 *                   + custom fields + barcode/QR + previous balance block
 * 3) ESC/POS      — direct thermal printer ke liye raw bytes (base64) —
 *                   init → align → bold → text → barcode → feed → cut
 *
 * Kuch bhi hardcoded nahi: har size, har field, har footer Settings ▸ Print templates
 * (visual designer) se badla ja sakta hai.
 *
 * ESC/POS reference (Epson standard):
 *   ESC @           1B 40   initialize printer
 *   ESC a n         1B 61 n align (0 left, 1 center, 2 right)
 *   ESC E n         1B 45 n bold on/off
 *   ESC ! n         1B 21 n character size / double height
 *   ESC d n         1B 64 n feed n lines
 *   GS k m n d...  1D 6B m n data  barcode (m=4 CODE39, m=67 QR)
 *   GS V B n       1D 56 42 n partial cut
 * ---------------------------------------------------------------------------
 */

var Print = {

  /* ============================ PAPER SIZES ================================ */
  /**
   * kind: THERMAL (continuous roll) | SHEET (A-series / cut sheet)
   * cols: monospace columns (thermal, font A) — 58mm≈32, 80mm≈48
   */
  sizes: function () {
    var st = DB.settings() || {};
    var defs = [
      { id: '58mm', label: 'Thermal 58mm (2")', kind: 'THERMAL', widthMm: 58, cols: 32, marginMm: 2, fontPx: 11 },
      { id: '80mm', label: 'Thermal 80mm (3")', kind: 'THERMAL', widthMm: 80, cols: 48, marginMm: 3, fontPx: 12 },
      { id: '110mm', label: 'Thermal 110mm (4")', kind: 'THERMAL', widthMm: 110, cols: 64, marginMm: 3, fontPx: 12 },
      { id: 'A3', label: 'A3 sheet (297×420mm)', kind: 'SHEET', widthMm: 297, heightMm: 420, fontPx: 13 },
      { id: 'A4', label: 'A4 sheet (210×297mm)', kind: 'SHEET', widthMm: 210, heightMm: 297, fontPx: 12 },
      { id: 'A5', label: 'A5 sheet (148×210mm)', kind: 'SHEET', widthMm: 148, heightMm: 210, fontPx: 11 },
      { id: 'HALF', label: 'Half A4 / small invoice (148×105mm)', kind: 'SHEET', widthMm: 148, heightMm: 105, fontPx: 10 },
      { id: 'LETTER', label: 'US Letter (216×279mm)', kind: 'SHEET', widthMm: 216, heightMm: 279, fontPx: 12 }
    ];
    // Settings se override (print.size.<ID>.label / widthMm / fontPx)
    defs.forEach(function (d) {
      var k = 'print.size.' + d.id + '.';
      if (st[k + 'label']) d.label = U.str(st[k + 'label']);
      if (st[k + 'widthMm'] !== undefined) d.widthMm = U.num(st[k + 'widthMm']);
      if (st[k + 'fontPx'] !== undefined) d.fontPx = U.num(st[k + 'fontPx']);
    });
    return defs;
  },

  size: function (id) {
    var all = Print.sizes();
    return all.filter(function (x) { return x.id === U.str(id); })[0] || all[1];
  },

  /** v2.14.0 — CSS for Drive PDF export so thermal paper keeps its true size.
   *  THERMAL ids get `size:<w>mm auto` (continuous roll); sheets get exact mm.
   *  Unknown id falls back to the default size (80mm), like Print.size(). */
  pageCss: function (paperId) {
    var sz = Print.size(paperId);
    if (!sz || !sz.widthMm) return '';
    if (sz.kind === 'THERMAL') {
      return '@page{size:' + sz.widthMm + 'mm auto;margin:2mm}' +
        'body{width:' + sz.widthMm + 'mm;margin:0 auto}';
    }
    return '@page{size:' + sz.widthMm + 'mm ' + (sz.heightMm || 297) + 'mm;margin:8mm}';
  },

  /* ============================= TEMPLATES ================================= */
  /** Field schema — visual designer isi se banta hai (koi field hardcoded nahi) */
  fieldSchema: function (type) {
    if (type === 'LABEL') {
      return [
        { key: 'name', label: 'Item name', def: true },
        { key: 'code', label: 'Item code', def: true },
        { key: 'price', label: 'Retail price', def: true },
        { key: 'brand', label: 'Brand', def: false },
        { key: 'size', label: 'Size / variant', def: false },
        { key: 'category', label: 'Category', def: false },
        { key: 'mrp', label: 'MRP (was price)', def: false },
        { key: 'barcode', label: 'Barcode', def: true },
        { key: 'qr', label: 'QR code', def: false },
        { key: 'business', label: 'Business name', def: true },
        { key: 'logo', label: 'Logo', def: false }
      ];
    }
    return [
      { key: 'logo', label: 'Logo', def: false },
      { key: 'business', label: 'Business name', def: true },
      { key: 'businessUr', label: 'Urdu name', def: false },
      { key: 'branch', label: 'Branch / address', def: true },
      { key: 'phone', label: 'Phone', def: true },
      { key: 'ntn', label: 'NTN / STRN', def: false },
      { key: 'invoiceNo', label: 'Invoice no', def: true },
      { key: 'date', label: 'Date & time', def: true },
      { key: 'customer', label: 'Customer', def: true },
      { key: 'customerPhone', label: 'Customer phone', def: false },
      { key: 'salesman', label: 'Salesman', def: false },
      { key: 'items', label: 'Item table', def: true },
      { key: 'subtotal', label: 'Subtotal', def: true },
      { key: 'discount', label: 'Discount', def: true },
      { key: 'tax', label: 'Tax', def: true },
      { key: 'total', label: 'Total', def: true },
      { key: 'payments', label: 'Payment breakdown', def: true },
      { key: 'prevBalance', label: 'Previous balance', def: true },
      { key: 'closingBalance', label: 'Closing balance', def: true },
      { key: 'change', label: 'Change returned', def: true },
      { key: 'savings', label: 'You saved', def: false },
      { key: 'barcode', label: 'Invoice barcode', def: true },
      { key: 'qr', label: 'QR code', def: false },
      { key: 'footer', label: 'Footer note', def: true },
      { key: 'terms', label: 'Terms & conditions', def: false },
      { key: 'signature', label: 'Signature line', def: false }
    ];
  },

  /** Default template JSON (Settings ▸ Print templates se edit hota hai) */
  defaultTemplate: function (type, sizeId) {
    type = U.str(type || 'RECEIPT').toUpperCase();
    var sz = Print.size(sizeId || (type === 'LABEL' ? '50x30' : '80mm'));
    var fields = {};
    Print.fieldSchema(type).forEach(function (f) { fields[f.key] = { visible: !!f.def, order: 0 }; });
    Print.fieldSchema(type).forEach(function (f, i) { fields[f.key].order = i; });

    if (type === 'LABEL') {
      return {
        id: 'tpl_label_default', type: 'LABEL', name: 'Standard label ' + (sz.widthMm || 50) + 'x30',
        active: 'true', paper: '50x30',
        json: JSON.stringify({
          paper: '50x30', widthMm: 50, heightMm: 30, copies: 1, fontSize: 9,
          barcodeType: 'CODE39', showBarcodeText: true, fields: fields,
          customFields: []
        })
      };
    }
    return {
      id: 'tpl_receipt_default', type: 'RECEIPT', name: 'Thermal ' + (sizeId || '80mm'),
      active: 'true', paper: sizeId || '80mm',
      json: JSON.stringify({
        paper: sizeId || '80mm', copies: 1, fontSize: sz.fontPx || 12,
        title: 'SALE RECEIPT', titleUr: '', showTitle: true,
        footer: 'Shukriya! Phir aayein.', terms: '',
        showTaxInvoice: false, taxInvoiceTitle: 'TAX INVOICE',
        fields: fields, customFields: [],
        table: { showCode: true, showQty: true, showRate: true, showTax: false, showDiscount: false },
        styles: { header: 'center', totals: 'right', boldTotal: true, dashed: true }
      })
    };
  },

  /** Stored template (ya default) — hamesha parse hua object bhi sath deta hai */
  resolve: function (type, templateId, sizeId, s) {
    var rows = DB.all('PrintTemplates').filter(function (r) {
      return U.str(r.type).toUpperCase() === U.str(type).toUpperCase() &&
        (!templateId || r.id === templateId);
    });
    var tpl = rows[0] || Print.defaultTemplate(type, sizeId);
    var cfg = {};
    try { cfg = JSON.parse(tpl.json || '{}'); } catch (e) { cfg = {}; }
    if (!cfg.paper) cfg.paper = sizeId || (type === 'LABEL' ? '50x30' : '80mm');
    if (!cfg.fields) cfg.fields = {};
    if (!cfg.customFields) cfg.customFields = [];
    return { id: tpl.id, type: type, name: tpl.name || 'Template', cfg: cfg, raw: tpl };
  },

  /* ============================ ESC/POS ==================================== */
  /**
   * Thermal printer ke liye raw ESC/POS bytes (base64) banata hai.
   * ops = { sale, items, settings, template, branch }
   */
  escpos: function (ops) {
    var sale = ops.sale || {}, cfg = (ops.template && ops.template.cfg) || {};
    var st = ops.settings || DB.settings();
    var sz = Print.size(cfg.paper);
    var cols = U.num(sz.cols, 42);
    var b = [];

    function cmd() { for (var i = 0; i < arguments.length; i++) b.push(arguments[i]); }
    function text(t) {
      t = String(t === null || t === undefined ? '' : t);
      for (var i = 0; i < t.length && i < 512; i++) b.push(t.charCodeAt(i) & 0xFF);
    }
    function line(l, r) {                       // left / right aligned on one line
      l = String(l || ''); r = String(r || '');
      var pad = cols - l.length - r.length;
      if (pad < 1) { l = l.slice(0, cols - r.length - 1); pad = 1; }
      text(l + new Array(pad + 1).join(' ') + r + '\n');
    }
    function center(t) {
      t = String(t || '');
      var pad = Math.max(0, Math.floor((cols - t.length) / 2));
      text(new Array(pad + 1).join(' ') + t.slice(0, cols) + '\n');
    }
    function rule(ch) { text(new Array(cols + 1).join(ch || '-') + '\n'); }
    function visible(k, dft) {
      var f = (cfg.fields || {})[k];
      if (f && f.visible !== undefined) return !!f.visible;
      var s = Print.fieldSchema('RECEIPT').filter(function (x) { return x.key === k; })[0];
      return s ? !!s.def : !!dft;
    }

    cmd(0x1B, 0x40);                                   // init
    cmd(0x1B, 0x61, 0x01);                             // center
    cmd(0x1B, 0x21, 0x30);                             // double size
    if (visible('business', true)) text((st.receiptHeader || st.businessName || 'Haseeb Autos') + '\n');
    cmd(0x1B, 0x21, 0x00);                             // normal
    if (visible('branch', true)) center(st.address || ops.branchName || '');
    if (visible('phone', true)) center(st.phone || '');
    if (visible('ntn', false) && st['biz.ntn']) center('NTN: ' + st['biz.ntn']);
    if (cfg.showTitle !== false) center(String(cfg.title || (cfg.showTaxInvoice ? cfg.taxInvoiceTitle : 'SALE RECEIPT')));
    rule('=');
    cmd(0x1B, 0x61, 0x00);                             // left
    if (visible('invoiceNo', true)) line('Invoice:', String(sale.invoiceNo || ''));
    if (visible('date', true)) line('Date:', String(sale.date || '').slice(0, 16));
    if (visible('customer', true)) line('Customer:', String(sale.customerName || 'Walk-in'));
    if (visible('salesman', false) && sale.salespersonName) line('Salesman:', String(sale.salespersonName));
    rule('-');

    // item table
    if (visible('items', true)) {
      var items = sale.items || [];
      items.forEach(function (it) {
        line(String(it.name || '').slice(0, cols - 12), Print.money(it.lineTotal, st));
        line('  ' + (it.code || '') + ' ' + it.qty + ' x ' + Print.money(it.price, st), '');
      });
      rule('-');
    }

    // totals
    if (visible('subtotal', true)) line('Subtotal', Print.money(sale.subtotal, st));
    if (visible('discount', true) && U.num(sale.discount)) line('Discount', '-' + Print.money(sale.discount, st));
    if (visible('tax', true) && U.num(sale.tax)) line(String(st.taxLabel || 'Tax'), Print.money(sale.tax, st));
    cmd(0x1B, 0x45, 0x01);                             // bold on
    line('TOTAL', Print.money(sale.total, st));
    cmd(0x1B, 0x45, 0x00);                             // bold off

    // payments
    if (visible('payments', true) && sale.paymentSummary && sale.paymentSummary.length) {
      rule('-');
      sale.paymentSummary.forEach(function (p) {
        line(String(p.label || p.method), Print.money(p.amount, st));
      });
      if (U.num(sale.change)) line('Change', Print.money(sale.change, st));
    }

    // balances
    if (visible('prevBalance', true) && U.num(sale.prevBalance)) {
      rule('-');
      line('Previous balance', Print.money(sale.prevBalance, st));
    }
    if (visible('closingBalance', true) && U.num(sale.closingBalance)) {
      cmd(0x1B, 0x45, 0x01);
      line('Closing balance', Print.money(sale.closingBalance, st));
      cmd(0x1B, 0x45, 0x00);
    }

    // barcode
    if (visible('barcode', true) && sale.invoiceNo) {
      rule('-');
      cmd(0x1B, 0x61, 0x01);
      cmd(0x1D, 0x68, 0x50);                           // barcode height 80
      cmd(0x1D, 0x6B, 0x04);                           // CODE39
      var data = String(sale.invoiceNo).toUpperCase().replace(/[^A-Z0-9\-\.\$\/\+% ]/g, '');
      cmd(data.length + 1);                            // n = length + 1 (auto NUL terminator)
      text(data); b.push(0x00);
      cmd(0x1B, 0x61, 0x00);
    }

    if (visible('footer', true) && cfg.footer) { rule('-'); center(String(cfg.footer)); }
    if (visible('terms', false) && cfg.terms) center(String(cfg.terms).slice(0, cols * 3));

    cmd(0x1B, 0x64, 0x03);                             // feed 3 lines
    cmd(0x1D, 0x56, 0x42, 0x00);                       // partial cut
    return { bytes: b, base64: Print.toBase64(b), cols: cols, size: sz };
  },

  /** byte array → base64 (Apps Script me Utilities.base64Encode use hota hai) */
  toBase64: function (bytes) {
    var out = '';
    try {
      var chunk = [];
      bytes.forEach(function (x) { chunk.push(x & 0xFF); });
      out = Utilities.base64Encode(chunk);
    } catch (e) {
      try { out = Utilities.base64Encode(bytes); } catch (e2) { out = ''; }
    }
    return out;
  },

  money: function (v, st) {
    var sym = U.str((st && st.currencySymbol) || DB.settings().currencySymbol || 'Rs');
    var n = U.num(v);
    var s = (Math.round(n * 100) / 100).toFixed(2);
    return sym + ' ' + s;
  }
};
