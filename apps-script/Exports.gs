/**
 * HASEEB AUTOS - ERP / POS  ::  EXPORTS ENGINE (PDF · Excel · CSV · Print)
 * ---------------------------------------------------------------------------
 * • invoicePdf()   — professional invoice HTML → Drive PDF (WhatsApp/Email me attach)
 * • report()       — koi bhi report (sales/stock/profit/…) PDF / Excel / CSV me
 * • sheet()        — Drive Spreadsheet (Excel .xlsx download link ke sath)
 * • csv()/html()   — client-side download ke liye raw payload
 *
 * Sab kuch settings-driven: `exports.folder` (Drive folder name),
 * `exports.shareLinks` (anyone-with-link), paper size print template se aata hai.
 * ---------------------------------------------------------------------------
 */

var Exports = {
  cfg: function (k, d) {
    var st = DB.settings();
    return st[k] !== undefined && st[k] !== '' ? st[k] : (EXPORTS_DEFAULTS[k] !== undefined ? EXPORTS_DEFAULTS[k] : d);
  },

  _folder: function () {
    var name = Exports.cfg('exports.folder', 'Haseeb Autos Exports');
    var it = DriveApp.getFoldersByName(name);
    return it.hasNext() ? it.next() : DriveApp.createFolder(name);
  },

  _share: function (file) {
    if (U.str(Exports.cfg('exports.shareLinks', 'true')) !== 'false') {
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
    }
    return file;
  },

  /* ============================ INVOICE → PDF ============================== */
  /** Server-side professional invoice HTML */
  invoiceHtml: function (sale, s) {
    var st = DB.settings();
    var loc = DB.byId('Locations', sale.locationId) || {};
    var cur = st.currencySymbol || 'Rs';
    var money = function (v) { return cur + ' ' + U.round(v, 2).toFixed(2); };
    var rows = (sale.items || []).map(function (it, i) {
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + escHtml_(it.name) +
        '<div class="sub">' + escHtml_(it.code || '') + '</div></td>' +
        '<td class="c">' + U.num(it.qty) + '</td><td class="r">' + money(it.price) + '</td>' +
        '<td class="r">' + money(it.lineTotal) + '</td></tr>';
    }).join('');
    var pays = (sale.paymentSummary || sale.paymentList || []).map(function (p) {
      return '<div class="row"><span>' + escHtml_(p.label || p.method) + '</span><b>' + money(p.amount) + '</b></div>';
    }).join('');
    var bal = (U.num(sale.prevBalance) || U.num(sale.closingBalance))
      ? '<div class="box"><div class="bl">Account summary</div>' +
        '<div class="row"><span>Previous balance</span><b>' + money(sale.prevBalance || 0) + '</b></div>' +
        '<div class="row"><span>This invoice</span><b>' + money(sale.total) + '</b></div>' +
        '<div class="row"><span>Paid now</span><b>-' + money(sale.paid) + '</b></div>' +
        '<div class="row grand"><span>Closing balance</span><b>' + money(sale.closingBalance || 0) + '</b></div></div>'
      : '';
    var code = '';
    try {
      if (sale.invoiceNo) code = Barcode ? '' : '';
    } catch (e) { }

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + EXPORTS_CSS + '</style></head><body>' +
      '<div class="doc sheet">' +
      '<div class="head"><div class="left">' +
        '<div class="biz">' + escHtml_(st.receiptHeader || st.businessName || 'Haseeb Autos') + '</div>' +
        '<div class="sub">' + escHtml_(loc.name || st.address || '') + '</div>' +
        '<div class="sub">' + escHtml_(st.phone || '') + (st['biz.ntn'] ? ' · NTN: ' + escHtml_(st['biz.ntn']) : '') + '</div>' +
      '</div><div class="right"><div class="dtype">' +
        escHtml_(U.str(Exports.cfg('exports.invoiceTitle', 'TAX INVOICE'))) + '</div>' +
        '<div class="kv"><span>Invoice</span><b>' + escHtml_(sale.invoiceNo || '') + '</b></div>' +
        '<div class="kv"><span>Date</span><b>' + escHtml_(U.str(sale.date).slice(0, 16)) + '</b></div></div></div>' +
      '<div class="meta"><div class="box"><div class="bl">Bill to</div><b>' +
        escHtml_(sale.customerName || 'Walk-in Customer') + '</b>' +
        (sale.customerPhone ? '<div class="sub">' + escHtml_(sale.customerPhone) + '</div>' : '') +
      '</div><div class="box right">' +
        (sale.salespersonName ? '<div class="kv"><span>Salesman</span><b>' + escHtml_(sale.salespersonName) + '</b></div>' : '') +
        '<div class="kv"><span>Payment</span><b>' + escHtml_(sale.paymentMethod || '') + '</b></div>' +
      '</div></div>' +
      '<table class="items"><thead><tr><th class="c">#</th><th>Item</th><th class="c">Qty</th>' +
        '<th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="foot"><div class="left">' + (pays ? '<div class="bl">Payments</div>' + pays : '') + '</div>' +
      '<div class="right"><div class="box">' +
        '<div class="row"><span>Subtotal</span><b>' + money(sale.subtotal) + '</b></div>' +
        (sale.discount ? '<div class="row"><span>Discount</span><b>-' + money(sale.discount) + '</b></div>' : '') +
        (sale.tax ? '<div class="row"><span>' + escHtml_(st.taxLabel || 'Tax') + '</span><b>' + money(sale.tax) + '</b></div>' : '') +
        '<div class="row grand"><span>TOTAL</span><b>' + money(sale.total) + '</b></div>' +
        (U.num(sale.change) ? '<div class="row"><span>Change</span><b>' + money(sale.change) + '</b></div>' : '') +
        '</div>' + bal + '</div></div>' +
      '<div class="terms">' + escHtml_(Exports.cfg('exports.invoiceTerms', 'Goods once sold will not be taken back without original invoice.')) + '</div>' +
      '<div class="power">' + escHtml_(sale.invoiceNo || '') + ' · Powered by Haseeb Autos ERP</div>' +
      '</div></body></html>';
  },

  /** PDF bana kar Drive me save; { url, id, name } */
  invoicePdf: function (saleId, s) {
    var sale = Sales.get(saleId, s);
    var html = Exports.invoiceHtml(sale, s);
    var name = (sale.invoiceNo || 'invoice') + '.pdf';
    var tmp = DriveApp.createFile(name.replace(/\.pdf$/, '.html'), html, MimeType.HTML);
    var pdf = tmp.getAs(MimeType.PDF);
    pdf.setName(name);
    var file = Exports._folder().createFile(pdf);
    Exports._share(file);
    try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e) { }
    return { id: file.getId(), url: file.getUrl(), name: name, size: file.getSize() };
  },

  /* ============================== REPORTS ================================== */
  /**Report engine se data nikal kar export */
  report: function (p, s) {
    Auth.require(s, 'reports.view');
    var kind = p.kind || 'sales';
    var fn = Reports[kind] || Reports.sales;
    var data = fn(p, s) || {};
    var rows = data.rows || [];
    var headers = p.headers || (rows[0] ? Object.keys(rows[0]) : []);
    var title = (p.title || (kind + ' report')) + ' · ' + U.dateOnly() +
      (p.from ? ' · ' + U.str(p.from).slice(0, 10) + ' → ' + U.str(p.to || '').slice(0, 10) : '');
    var fmt = U.str(p.format || 'CSV').toUpperCase();

    if (fmt === 'CSV' || fmt === 'XLSX' || fmt === 'EXCEL') {
      var sh = Exports.sheet(rows, headers, (p.title || kind) + ' ' + U.dateOnly());
      return { format: fmt, url: sh.url, xlsx: sh.xlsx, name: sh.name, rows: rows.length };
    }
    if (fmt === 'JSON') return { format: 'JSON', rows: rows, headers: headers, name: title };
    // PDF
    var html = Exports.html(rows, headers, title);
    var tmp = DriveApp.createFile(U.slug(title) + '.html', html, MimeType.HTML);
    var pdf = tmp.getAs(MimeType.PDF);
    pdf.setName(U.slug(title) + '.pdf');
    var file = Exports._folder().createFile(pdf);
    Exports._share(file);
    try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e) { }
    return { format: 'PDF', url: file.getUrl(), id: file.getId(), name: file.getName(), rows: rows.length };
  },

  /** Drive spreadsheet (Excel-compatible download link sath me) */
  sheet: function (rows, headers, name) {
    var ss = SpreadsheetApp.create((name || 'Export') + ' — ' + U.dateOnly());
    var sh = ss.getSheets()[0];
    if (rows.length) {
      if (!headers || !headers.length) headers = Object.keys(rows[0]);
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#0b5cff').setFontColor('#ffffff');
      var values = rows.map(function (r) {
        return headers.map(function (hd) {
          var v = r[hd];
          return (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : v);
        });
      });
      sh.getRange(2, 1, values.length, headers.length).setValues(values);
      sh.autoResizeColumns(1, headers.length);
      sh.setFrozenRows(1);
    }
    var file = DriveApp.getFileById(ss.getId());
    Exports._share(file);
    return { id: ss.getId(), url: ss.getUrl(), name: ss.getName(),
      xlsx: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx' };
  },

  csv: function (rows, headers, name) {
    var csv = U.csv(rows, headers);
    var file = Exports._folder().createFile((name || 'export') + '-' + U.dateOnly() + '.csv', csv, MimeType.CSV);
    Exports._share(file);
    return { id: file.getId(), url: file.getUrl(), name: file.getName(), csv: csv };
  },

  /** Styled HTML table (PDF conversion + client-side print dono me kaam aata hai) */
  html: function (rows, headers, title) {
    if (!headers || !headers.length) headers = rows[0] ? Object.keys(rows[0]) : [];
    var st = DB.settings();
    var head = headers.map(function (hd) { return '<th>' + escHtml_(String(hd).replace(/[_-]/g, ' ')) + '</th>'; }).join('');
    var body = rows.slice(0, 5000).map(function (r) {
      return '<tr>' + headers.map(function (hd) {
        var v = r[hd];
        var cls = (typeof v === 'number' || /^[\d.,]+$/.test(String(v || ''))) ? ' class="n"' : '';
        return '<td' + cls + '>' + escHtml_(v === null || v === undefined ? '' : String(v)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + EXPORTS_CSS + '</style></head><body>' +
      '<div class="doc sheet wide"><div class="head"><div class="left">' +
      '<div class="biz">' + escHtml_(st.businessName || 'Haseeb Autos') + '</div>' +
      '<div class="sub">' + escHtml_(title || '') + '</div></div>' +
      '<div class="right"><div class="kv"><span>Generated</span><b>' + U.dateOnly() + '</b></div></div></div>' +
      '<table class="items"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="power">' + rows.length + ' rows · Powered by Haseeb Autos ERP</div></div></body></html>';
  },

  /**
   * Generic HTML → Drive PDF (v2.5.1)
   * Client apna banaya hua professional HTML bhejta hai (invoice, day report,
   * koi bhi document) — server usay PDF bana kar share-able link deta hai.
   * Is se layout ek hi jagah (client) rehti hai aur offline preview bhi wahi hoti hai.
   */
  htmlToPdf: function (p, s) {
    Auth.require(s, 'reports.view');
    var html = U.str(p.html);
    if (!html) throw new Error('HTML khali hai.');
    /* v2.14.0 — paper (e.g. '80mm', 'A5'): appended LAST so it overrides any
       @page baked into the doc (EXPORTS_CSS defaults to A4). Drive's HTML→PDF
       converter honors CSS page size; thermal exports then come out as true
       80mm-wide pages instead of A4. */
    if (p.paper && typeof Print !== 'undefined' && Print.pageCss) {
      var pc = Print.pageCss(p.paper);
      if (pc) html = html + '<style>' + pc + '</style>';
    }
    var name = U.slug(U.str(p.name) || ('document-' + U.dateOnly())) + '.pdf';
    var tmp = DriveApp.createFile(name.replace(/\.pdf$/, '.html'), html, MimeType.HTML);
    var pdf = tmp.getAs(MimeType.PDF);
    pdf.setName(name);
    var file = Exports._folder().createFile(pdf);
    Exports._share(file);
    try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch (e) { }
    return { id: file.getId(), url: file.getUrl(), name: name, size: file.getSize(),
      format: 'PDF', folder: Exports.cfg('exports.folder', 'Haseeb Autos Exports') };
  },

  /** Client-side (offline) export helpers ke liye raw payload */
  payload: function (p, s) {
    var kind = p.kind || 'sales';
    var fn = Reports[kind] || Reports.sales;
    var data = fn(p, s) || {};
    var rows = data.rows || [];
    var headers = p.headers || (rows[0] ? Object.keys(rows[0]) : []);
    return { rows: rows, headers: headers, csv: U.csv(rows, headers),
      html: Exports.html(rows, headers, p.title || kind),
      filename: U.slug((p.title || kind)) + '-' + U.dateOnly() };
  }
};

var EXPORTS_DEFAULTS = {
  'exports.folder': 'Haseeb Autos Exports',
  'exports.shareLinks': 'true',
  'exports.invoiceTitle': 'TAX INVOICE',
  'exports.invoiceTerms': 'Goods once sold will not be taken back without original invoice.'
};

var EXPORTS_CSS = [
  '@page{size:A4 portrait;margin:10mm}',
  'body{font:12px "Segoe UI",Arial;color:#111;margin:0;padding:0;background:#fff}',
  '.doc.sheet{width:190mm;margin:0 auto;padding:0}',
  '.doc.sheet.wide{width:277mm}',
  '.head{display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:8px}',
  '.biz{font-size:20px;font-weight:800}',
  '.sub{font-size:11px;color:#555}',
  '.dtype{font-weight:800;border:2px solid #111;padding:3px 10px;letter-spacing:1px;margin-bottom:6px;text-align:right}',
  '.kv{display:flex;gap:6px;justify-content:flex-end;font-size:11px}',
  '.kv span{color:#666}',
  '.meta{display:flex;gap:12px;margin:12px 0}',
  '.box{flex:1;border:1px solid #ccc;border-radius:8px;padding:8px 10px}',
  '.box.right{text-align:right}',
  '.bl{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#666;margin-bottom:4px}',
  'table.items{width:100%;border-collapse:collapse;margin-top:6px;font-size:11.5px}',
  'table.items th{background:#0b5cff;color:#fff;text-align:left;padding:5px 6px;font-size:10.5px;text-transform:uppercase}',
  'table.items td{padding:4px 6px;border-bottom:1px solid #e3e7ef}',
  'table.items td.n{text-align:right;font-variant-numeric:tabular-nums}',
  '.c{text-align:center}.r{text-align:right}',
  '.foot{display:flex;justify-content:space-between;gap:16px;margin-top:12px}',
  '.foot .left{flex:1}.foot .right{width:52%}',
  '.row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:2px 0}',
  '.row.grand{font-weight:800;border-top:1px dashed #111;margin-top:4px;padding-top:4px;font-size:13px}',
  '.terms{margin-top:14px;font-size:10px;color:#444;border-top:1px dotted #999;padding-top:6px}',
  '.power{text-align:center;font-size:9px;color:#888;margin-top:10px}'
].join('\n');

/* ==========================================================================
   v2.5.3 — DAY / SHIFT CLOSING PDF (server-side)
   --------------------------------------------------------------------------
   'shop.dayReport.pdf' route pehle Exports.dayReportPdf() call karta tha jo
   maujood hi nahi thi → PDF button dabate hi runtime error. Ab ye function
   hai, aur backend se banta hai (browser ki zaroorat nahi) — isi liye
   §7 "shop close karte hi report auto-generate ho" ka rasta bhi yahi hai.
   ========================================================================== */

/* ==========================================================================
   v2.6 §4 — GENERIC DOCUMENT RENDERER (PO / GRN / koi bhi transaction)
   --------------------------------------------------------------------------
   Har document ke liye alag HTML likhne ke bajaye ek hi renderer:
     Exports.docHtml({ title, docNo, party, meta, columns, rows, totals, notes })
   PO aur GRN dono isi se bante hain — ek hi look, ek hi print layout.
   ========================================================================== */
Exports.docHtml = function (cfg) {
  cfg = cfg || {};
  var st = DB.settings ? DB.settings() : {};
  var cur = U.str(st.currency || 'Rs');
  var m = function (v) { return cur + ' ' + U.round(U.num(v), 2).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var esc = function (v) {
    return U.str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var cols = cfg.columns || [];
  var rows = cfg.rows || [];
  var body = rows.length ? rows.map(function (r) {
    return '<tr>' + cols.map(function (c) {
      var v = r[c.key];
      var txt = c.money ? m(v) : (c.num ? U.num(v).toLocaleString('en-US') : esc(v));
      return '<td' + (c.money || c.num ? ' class="r"' : '') + '>' + txt + '</td>';
    }).join('') + '</tr>';
  }).join('') : '<tr><td colspan="' + cols.length + '" class="c muted">Koi line nahi</td></tr>';

  var meta = (cfg.meta || []).map(function (kv) {
    return '<div class="kv"><span>' + esc(kv[0]) + '</span><b>' + esc(kv[1]) + '</b></div>';
  }).join('');

  var totals = (cfg.totals || []).map(function (kv) {
    return '<div class="tot-row' + (kv[2] ? ' grand' : '') + '"><span>' + esc(kv[0]) +
      '</span><b>' + m(kv[1]) + '</b></div>';
  }).join('');

  return [
    '<div class="doc sheet">',
      '<div class="head"><div class="left">',
        '<div class="biz">' + esc(st.businessName || 'Haseeb Autos') + '</div>',
        st.businessNameUr ? '<div class="sub">' + esc(st.businessNameUr) + '</div>' : '',
        '<div class="sub">' + esc(st.address || '') + '</div>',
        '<div class="sub">' + esc(st.phone || '') + (st.ntn ? ' · NTN: ' + esc(st.ntn) : '') + '</div>',
      '</div><div class="right">',
        '<div class="dtype">' + esc(cfg.title || 'Document') + '</div>',
        '<div class="dnum">' + esc(cfg.docNo || '') + '</div>',
        cfg.status ? '<div class="sub">' + esc(cfg.status) + '</div>' : '',
      '</div></div>',
      '<div class="party">',
        '<div><div class="lbl">' + esc(cfg.partyLabel || 'Party') + '</div>',
        '<div class="nm">' + esc((cfg.party || {}).name || '—') + '</div>',
        (cfg.party || {}).phone ? '<div class="sub">' + esc(cfg.party.phone) + '</div>' : '',
        (cfg.party || {}).address ? '<div class="sub">' + esc(cfg.party.address) + '</div>' : '',
        '</div>',
        '<div class="meta">' + meta + '</div>',
      '</div>',
      '<table class="lines"><thead><tr>',
        cols.map(function (c) {
          return '<th' + (c.money || c.num ? ' class="r"' : '') + '>' + esc(c.label) + '</th>';
        }).join(''),
      '</tr></thead><tbody>' + body + '</tbody></table>',
      totals ? '<div class="totals">' + totals + '</div>' : '',
      cfg.notes ? '<div class="notes"><b>Notes:</b> ' + esc(cfg.notes) + '</div>' : '',
      '<footer class="foot">',
        '<div class="left"><div class="sig">Prepared by: ' + esc((cfg.preparedBy || '')) + '</div></div>',
        '<div class="right"><div class="sig">Approved by (Manager)</div>',
        '<div class="sig">Signature &amp; stamp</div></div>',
      '</footer>',
    '</div>'
  ].join('');
};

/** Purchase Order — print / PDF */
Exports.poHtml = function (po) {
  po = po || {};
  return Exports.docHtml({
    title: 'PURCHASE ORDER', docNo: po.poNo || '', status: 'Status: ' + U.str(po.status || 'DRAFT'),
    partyLabel: 'Supplier', party: po.supplier || {},
    preparedBy: po.createdBy || '',
    meta: [['PO date', po.date || ''], ['Expected', po.expectedDate || ''],
      ['Location', po.locationId || ''], ['Lines', String((po.items || []).length)]],
    columns: [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
      { key: 'qty', label: 'Qty', num: true },
      { key: 'rate', label: 'Rate', money: true },
      { key: 'lineTotal', label: 'Amount', money: true }
    ],
    rows: po.items || [],
    totals: [['Subtotal', po.subtotal], ['Tax', po.tax], ['Total', po.total, true]],
    notes: po.notes || ''
  });
};

/** Goods Receipt Note — print / PDF */
Exports.grnHtml = function (grn) {
  grn = grn || {};
  return Exports.docHtml({
    title: 'GOODS RECEIPT NOTE', docNo: grn.grnNo || '', status: 'Status: ' + U.str(grn.status || ''),
    partyLabel: 'Supplier', party: grn.supplier || {},
    preparedBy: grn.createdBy || '',
    meta: [['GRN date', grn.date || ''], ['Supplier invoice', grn.invoiceNo || ''],
      ['Against PO', grn.poNo || ''], ['Lines', String((grn.items || []).length)]],
    columns: [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Item' },
      { key: 'qty', label: 'Received', num: true },
      { key: 'cost', label: 'Cost', money: true },
      { key: 'lineTotal', label: 'Amount', money: true }
    ],
    rows: grn.items || [],
    totals: [['Subtotal', grn.subtotal], ['Tax', grn.tax],
      ['Freight', grn.freight], ['Total', grn.total, true]],
    notes: grn.notes || ''
  });
};

Exports.poPdf = function (id, s) {
  var d = Purchase.getPO(id, s);
  return Exports.htmlToPdf({ html: Exports.wrapDoc(Exports.poHtml(d), 'PO ' + (d.poNo || '')),
    name: U.slug('PO-' + (d.poNo || id)) }, s);
};

Exports.grnPdf = function (id, s) {
  var d = Purchase.getGRN(id, s);
  return Exports.htmlToPdf({ html: Exports.wrapDoc(Exports.grnHtml(d), 'GRN ' + (d.grnNo || '')),
    name: U.slug('GRN-' + (d.grnNo || id)) }, s);
};

/**
 * v2.6 §7 — kisi bhi fragment ko PRINT-READY poori document bana de.
 * (dayReportHtml sirf fragment hai; print/PDF ke liye <html> zaroori hai.)
 */
Exports.wrapDoc = function (inner, title) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<title>' + (title || 'Report') + '</title>' +
    '<style>' + (typeof EXPORTS_CSS !== 'undefined' ? EXPORTS_CSS : '') + '</style></head>' +
    '<body>' + (inner || '') + '</body></html>';
};

/** Day / shift closing report ka self-contained HTML (print + PDF dono ke liye) */
Exports.dayReportHtml = function (r) {
  r = r || {};
  var reportDate=function(value){
    if(value===undefined || value===null || U.str(value)==='')return '—';
    try{return U.dateOnly(value);}catch(e){return 'Invalid date';}
  };
  var cur = U.str(r.currency || 'Rs');
  var m = function (v) { return cur + ' ' + U.round(U.num(v), 2).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var n = function (v) { return U.num(v).toLocaleString('en-US'); };
  var esc = function (v) {
    return U.str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var dur = U.num(r.durationMins) >= 60
    ? Math.floor(U.num(r.durationMins) / 60) + 'h ' + (U.num(r.durationMins) % 60) + 'm'
    : U.num(r.durationMins) + 'm';

  var rows = function (arr, cell, cols) {
    if (!arr || !arr.length) return '<tr><td colspan="' + (cols || 4) + '" class="c muted">Koi entry nahi</td></tr>';
    return arr.map(cell).join('');
  };
  var methods = rows(r.methods, function (x) {
    return '<tr><td>' + esc(x.method) + '</td><td class="c">' + n(x.count) + '</td><td class="n">' + m(x.amount) + '</td></tr>';
  }, 3);
  var exps = rows(r.expenses, function (x) {
    return '<tr><td>' + esc(x.category) + '</td><td class="c">' + n(x.count) + '</td><td class="n">' + m(x.amount) + '</td></tr>';
  }, 3);
  var moves = rows(r.moves, function (x) {
    return '<tr><td>' + reportDate(x.date) + '</td><td>' + esc(x.type) + '</td><td>' +
      esc(x.reason || '—') + '</td><td class="n">' + m(x.amount) + '</td></tr>';
  }, 4);
  var top = rows(r.top, function (x) {
    return '<tr><td>' + esc(x.code || '') + '</td><td>' + esc(x.name) + '</td><td class="c">' +
      n(x.qty) + '</td><td class="n">' + m(x.amount) + '</td></tr>';
  }, 4);
  var hours = rows(r.hours, function (x) {
    return '<tr><td class="c">' + esc(x.hour) + ':00</td><td class="c">' + n(x.bills) +
      '</td><td class="n">' + m(x.amount) + '</td></tr>';
  }, 3);

  var variance = (r.variance === null || r.variance === undefined
    || r.variance === '' || r.closingCash === null || r.closingCash === undefined) ? null : U.num(r.variance);
  var vCls = variance === null ? '' : (variance === 0 ? 'ok' : 'bad');
  var vTxt = variance === null ? 'Abhi band nahi hui' : m(variance);

  var biz = r.business || {};
  return [
    '<div class="doc dayrep">',
    '<header class="dr-head">',
      '<div class="dr-left">',
        '<div class="biz">' + esc(biz.name || 'Haseeb Autos') + '</div>',
        biz.ur ? '<div class="ur">' + esc(biz.ur) + '</div>' : '',
        '<div class="sub">' + esc(r.locationName || '') + (r.locationCode ? ' (' + esc(r.locationCode) + ')' : '') + '</div>',
        biz.phone ? '<div class="sub">' + esc(biz.phone) + '</div>' : '',
        biz.ntn ? '<div class="sub">NTN: ' + esc(biz.ntn) + '</div>' : '',
      '</div>',
      '<div class="dr-right">',
        '<div class="dtype">DAY / SHIFT CLOSING REPORT</div>',
        '<div class="kv"><span>Session</span><b>' + esc(r.sessionNo || '') + '</b></div>',
        '<div class="kv"><span>Cashier</span><b>' + esc(r.cashier || '') + '</b></div>',
        '<div class="kv"><span>Opened</span><b>' + reportDate(r.openedAt) + '</b></div>',
        '<div class="kv"><span>Closed</span><b>' + (r.closedAt ? reportDate(r.closedAt) : 'Abhi khuli hai') + '</b></div>',
        '<div class="kv"><span>Duration</span><b>' + dur + '</b></div>',
      '</div>',
    '</header>',

    '<section class="blk"><h3>Cash reconciliation <span class="h3u">— نقد حساب</span></h3>',
      '<div class="grid">',
        '<div class="row"><span>Opening cash</span><b>' + m(r.openingCash) + '</b></div>',
        '<div class="row"><span>Cash sales</span><b>' + m(r.cashSales) + '</b></div>',
        '<div class="row"><span>Credit sales (udhaar)</span><b>' + m(r.creditSales) + '</b></div>',
        '<div class="row"><span>Cash received (wasooli)</span><b>' + m(r.cashIn) + '</b></div>',
        '<div class="row"><span>Cash paid out</span><b>' + m(r.cashOut) + '</b></div>',
        '<div class="row"><span>Refunds</span><b>' + m(r.refunds) + '</b></div>',
        '<div class="row"><span>Expenses</span><b>' + m(r.expenseTotal) + '</b></div>',
        '<div class="row grand"><span>Expected cash</span><b>' + m(r.expectedCash) + '</b></div>',
        '<div class="row"><span>Actual / counted cash</span><b>' +
          (r.closingCash === null || r.closingCash === undefined ? '—' : m(r.closingCash)) + '</b></div>',
        '<div class="row grand ' + vCls + '"><span>Difference (variance)</span><b>' + vTxt + '</b></div>',
      '</div>',
    '</section>',

    '<div class="cols">',
      '<section class="blk"><h3>Sales summary</h3>',
        '<div class="grid">',
          '<div class="row"><span>Bills</span><b>' + n(r.bills) + '</b></div>',
          '<div class="row"><span>Gross sales</span><b>' + m(r.sales && r.sales.gross) + '</b></div>',
          '<div class="row"><span>Credit (udhaar)</span><b>' + m(r.sales && r.sales.udhaar) + '</b></div>',
          '<div class="row"><span>Cash received</span><b>' + m(r.cashIn) + '</b></div>',
          '<div class="row"><span>Returns</span><b>' + m(r.sales && r.sales.returns) + '</b></div>',
          '<div class="row grand"><span>Net sales</span><b>' + m(r.netSales) + '</b></div>',
        '</div>',
      '</section>',
      '<section class="blk"><h3>Payment methods <span class="h3u">— ادائیگی کا طریقہ</span></h3>',
        '<table class="items"><thead><tr><th>Method</th><th class="c">Count</th><th class="r">Amount</th></tr></thead><tbody>' + methods + '</tbody></table>',
      '</section>',
    '</div>',

    '<div class="cols">',
      '<section class="blk"><h3>Expenses by category <span class="h3u">— اخراجات</span></h3>',
        '<table class="items"><thead><tr><th>Category</th><th class="c">Count</th><th class="r">Amount</th></tr></thead><tbody>' + exps + '</tbody></table>',
      '</section>',
      '<section class="blk"><h3>Top items</h3>',
        '<table class="items"><thead><tr><th>Code</th><th>Item</th><th class="c">Qty</th><th class="r">Amount</th></tr></thead><tbody>' + top + '</tbody></table>',
      '</section>',
    '</div>',

    '<section class="blk"><h3>Cash movements <span class="h3u">— نقد آمد و رفت</span></h3>',
      '<table class="items"><thead><tr><th>Time</th><th>Type</th><th>Reason</th><th class="r">Amount</th></tr></thead><tbody>' + moves + '</tbody></table>',
    '</section>',

    '<section class="blk"><h3>Hourly sales</h3>',
      '<table class="items"><thead><tr><th class="c">Hour</th><th class="c">Bills</th><th class="r">Amount</th></tr></thead><tbody>' + hours + '</tbody></table>',
    '</section>',

    r.notes ? '<section class="blk"><h3>Notes</h3><div class="muted">' + esc(r.notes) + '</div></section>' : '',

    '<footer class="foot">',
      '<div class="left"><div class="sig">Cashier / Operator: ' + esc(r.cashier || '') + '</div>',
      '<div class="sig">Generated: ' + reportDate(r.generatedAt) + '</div></div>',
      '<div class="right"><div class="sig">Verified by (Manager)</div>',
      '<div class="sig">Signature &amp; stamp</div></div>',
    '</footer>',
    '</div>'
  ].join('');
};

/** Server-side PDF: 'shop.dayReport.pdf' route isi ko call karta hai */
Exports.dayReportPdf = function (sessionId, s) {
  var r = Payments.dayReport({ sessionId: sessionId || '' }, s);
  if (!r) throw new Error('Report nahi ban saki — session nahi mili.');
  var name = U.slug(U.str(r.sessionNo || 'day-report') + '-closing');
  var html = Exports.dayReportHtml(r);
  return Exports.htmlToPdf({ html: html, name: name }, s);
};

/** Editor: Exports.gs > authorizeReportExports > Run. Read-only; no file creation. */
function authorizeReportExports() {
  // Native DriveApp requires the drive scope, not the narrower REST drive.file scope.
  DriveApp.getFoldersByName('Haseeb Autos Exports').hasNext();
  var result={authorized:true,version:CONFIG.VERSION,
    message:'Native Drive access is available. No files or spreadsheet rows were changed. Publish a New version, then test a report PDF.'};
  Logger.log(JSON.stringify(result,null,2));return result;
}
