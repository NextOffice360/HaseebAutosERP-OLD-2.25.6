/**
 * HASEEB AUTOS - ERP / POS  ::  SUPPLIER PRICE-LIST IMPORT
 * ---------------------------------------------------------------------------
 * Supplier ki CSV / TSV / Excel-CSV (aur Gmail attachment) khud parse karta hai,
 * columns auto-pehchanta hai, mojuda items se match karta hai aur diff dikhata hai.
 * (Apps Script XLSX nahi padh sakta → xlsx ke liye Drive convert ya CSV export karein.)
 *
 * Header synonyms (EN + Roman Urdu):
 *   code     : code, item code, sku, part no, part number, article, ref
 *   name     : name, description, item, product, tafseel
 *   barcode  : barcode, ean, upc
 *   cost     : cost, cost price, trade price, purchase price, rate, buy
 *   retail   : retail, mrp, sale price, selling price, price
 *   wholesale: wholesale, bulk, dealer
 *   brand    : brand, make, company
 *   qty      : qty, quantity, stock, pcs
 *
 * Actions: UPDATE (cost/price update) · CREATE (naya item) · SKIP (match nahi)
 * Guard:   price-import.minMarginPct se kam margin wali price reject
 * ---------------------------------------------------------------------------
 */

var PriceImport = {

  HEADERS: {
    code: ['code', 'item code', 'itemcode', 'sku', 'part no', 'partno', 'part number', 'article', 'ref', 'code#'],
    name: ['name', 'item name', 'description', 'desc', 'item', 'product', 'tafseel', 'detail'],
    barcode: ['barcode', 'ean', 'upc', 'bar code'],
    cost: ['cost', 'cost price', 'costprice', 'trade price', 'tradeprice', 'purchase price', 'buy', 'buying', 'cost rs'],
    retail: ['retail', 'retail price', 'mrp', 'sale price', 'selling price', 'price', 'rate'],
    wholesale: ['wholesale', 'wholesale price', 'bulk', 'dealer', 'dealer price'],
    brand: ['brand', 'make', 'company'],
    qty: ['qty', 'quantity', 'stock', 'pcs', 'pieces']
  },

  cfg: function (k, d) {
    var st = DB.settings();
    return st[k] !== undefined && st[k] !== '' ? st[k] : (PRICE_IMPORT_DEFAULTS[k] !== undefined ? PRICE_IMPORT_DEFAULTS[k] : d);
  },

  /* ============================== PARSING ================================== */
  detectDelimiter: function (text) {
    var line = U.str(text).split(/\r?\n/)[0] || '';
    var cands = [',', '\t', ';', '|'];
    var best = ',', bestN = -1;
    cands.forEach(function (c) {
      var n = line.split(c).length - 1;
      if (n > bestN) { bestN = n; best = c; }
    });
    return best;
  },

  /** CSV text → array of row objects (quotes handle) */
  parseCsv: function (text, delim) {
    delim = delim || PriceImport.detectDelimiter(text);
    var rows = [];
    var lines = U.str(text).replace(/\r/g, '').split('\n');
    lines.forEach(function (line) {
      if (!U.str(line)) return;
      var cells = []; var cur = ''; var inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        if (ch === '"') {
          if (inQ && line.charAt(i + 1) === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === delim && !inQ) { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      rows.push(cells.map(function (c) { return U.str(c); }));
    });
    return rows;
  },

  /** Header row se column mapping banao (synonyms + fuzzy) */
  mapColumns: function (headerRow) {
    var map = {};
    (headerRow || []).forEach(function (raw, idx) {
      var h = U.norm(raw);
      if (!h) return;
      Object.keys(PriceImport.HEADERS).forEach(function (key) {
        var syn = PriceImport.HEADERS[key];
        if (map[key] !== undefined) return;
        if (syn.indexOf(h) > -1) { map[key] = idx; return; }
        for (var i = 0; i < syn.length; i++) {
          if (h.indexOf(syn[i]) > -1) { map[key] = idx; return; }
        }
      });
    });
    return map;
  },

  num: function (v) {
    var n = U.str(v).replace(/[^\d.\-]/g, '');
    return n === '' ? 0 : Number(n);
  },

  /* ============================== PREVIEW ================================== */
  /**
   * p = { text, supplierId, fileName, mapping:{code,name,cost,...} (optional) }
   * → { columns, rows:[{code,name,barcode,cost,retail,wholesale,brand,qty,
   *      matchId, matchName, oldCost, oldRetail, deltaCost, deltaPct, action, reason }], stats }
   */
  preview: function (p, s) {
    Auth.require(s, 'purchase.create');
    var grid = PriceImport.parseCsv(p.text, p.delimiter);
    if (grid.length < 2) throw new Error('CSV mein kam az kam header + 1 row hone chahiye.');
    var header = grid[0];
    var map = p.mapping && Object.keys(p.mapping).length ? p.mapping : PriceImport.mapColumns(header);
    if (map.code === undefined && map.name === undefined && map.barcode === undefined) {
      throw new Error('Code / name / barcode column nahi mila — mapping manually select karein.');
    }
    var items = DB.all('Items');
    var byCode = {}, byBarcode = {}, byName = {};
    items.forEach(function (it) {
      if (U.str(it.code)) byCode[U.norm(it.code)] = it;
      if (U.str(it.barcode)) byBarcode[U.str(it.barcode)] = it;
      byName[U.norm(it.name)] = it;
    });

    var minMargin = U.num(PriceImport.cfg('price-import.minMarginPct', 5));
    var autoCreate = U.str(PriceImport.cfg('price-import.autoCreate', 'false')) !== 'false';
    var rows = [];

    for (var i = 1; i < grid.length; i++) {
      var r = grid[i];
      if (!r.length || !U.str(r.join(''))) continue;
      var rec = {
        row: i + 1,
        code: map.code !== undefined ? U.str(r[map.code]) : '',
        name: map.name !== undefined ? U.str(r[map.name]) : '',
        barcode: map.barcode !== undefined ? U.str(r[map.barcode]) : '',
        cost: map.cost !== undefined ? PriceImport.num(r[map.cost]) : 0,
        retail: map.retail !== undefined ? PriceImport.num(r[map.retail]) : 0,
        wholesale: map.wholesale !== undefined ? PriceImport.num(r[map.wholesale]) : 0,
        brand: map.brand !== undefined ? U.str(r[map.brand]) : '',
        qty: map.qty !== undefined ? PriceImport.num(r[map.qty]) : 0
      };
      var match = (rec.code && byCode[U.norm(rec.code)]) ||
        (rec.barcode && byBarcode[U.str(rec.barcode)]) ||
        (rec.name && byName[U.norm(rec.name)]) || null;

      if (match) {
        rec.matchId = match.id; rec.matchName = match.name;
        rec.oldCost = U.num(match.costPrice); rec.oldRetail = U.num(match.retailPrice);
        rec.deltaCost = U.round(rec.cost - rec.oldCost, 2);
        rec.deltaPct = rec.oldCost ? U.round((rec.deltaCost / rec.oldCost) * 100, 2) : 0;
        if (rec.cost > 0 && rec.retail > 0 && ((rec.retail - rec.cost) / rec.retail * 100) < minMargin) {
          rec.action = 'SKIP'; rec.reason = 'Margin ' + minMargin + '% se kam';
        } else if (rec.cost <= 0 && rec.retail <= 0) {
          rec.action = 'SKIP'; rec.reason = 'Koi qeemti column nahi mila';
        } else {
          rec.action = 'UPDATE'; rec.reason = 'Matched by ' + (rec.code ? 'code' : (rec.barcode ? 'barcode' : 'name'));
        }
      } else if (autoCreate && rec.name) {
        rec.action = 'CREATE'; rec.reason = 'Naya item banega';
        rec.matchId = ''; rec.matchName = '';
      } else {
        rec.action = 'SKIP'; rec.reason = 'Match nahi mila';
      }
      rows.push(rec);
    }

    var stats = {
      total: rows.length,
      update: rows.filter(function (x) { return x.action === 'UPDATE'; }).length,
      create: rows.filter(function (x) { return x.action === 'CREATE'; }).length,
      skip: rows.filter(function (x) { return x.action === 'SKIP'; }).length,
      costIncrease: rows.filter(function (x) { return x.deltaCost > 0; }).length,
      costDecrease: rows.filter(function (x) { return x.deltaCost < 0; }).length,
      avgChangePct: rows.length ? U.round(U.sum(rows, 'deltaPct') / rows.length, 2) : 0
    };

    return { columns: header, mapping: map, rows: rows, stats: stats,
      supplierId: p.supplierId || '', fileName: p.fileName || '' };
  },

  /* =============================== APPLY =================================== */
  /**
   * p = { rows:[…], supplierId, updateCost:true, updateRetail:false,
   *       updateWholesale:false, createNew:false, priceTier:'RETAIL' }
   */
  apply: function (p, s) {
    Auth.require(s, 'purchase.create');
    var rows = p.rows || [];
    if (!rows.length) throw new Error('Koi row select nahi hui.');
    var updated = 0, created = 0, skipped = 0, errors = [];
    var logId = U.uid('PIM');
    var defCat = PriceImport.cfg('price-import.defaultCategory', 'Uncategorised');

    rows.forEach(function (r) {
      try {
        if (r.action === 'SKIP') { skipped++; return; }
        if (r.action === 'CREATE') {
          if (!p.createNew) { skipped++; return; }
          var margin = U.num(PriceImport.cfg('price-import.defaultMarginPct', 25));
          var cost = U.num(r.cost);
          var retail = U.num(r.retail) || U.round(cost * (1 + margin / 100), 2);
          DB.insert('Items', {
            id: U.uid('ITM'), code: r.code || ('IMP-' + U.uid('').slice(0, 6)),
            name: r.name, barcode: r.barcode || '', category: r.brand || defCat,
            brand: r.brand || '', costPrice: cost, retailPrice: retail,
            wholesalePrice: U.num(r.wholesale) || retail, status: 'ACTIVE',
            /* Items sheet ka column primarySupplierId hai (supplierId nahi) */
            primarySupplierId: p.supplierId || '',
            notes: 'Imported from price list ' + (p.fileName || '')
          }, s);
          created++; return;
        }
        var it = DB.byId('Items', r.matchId);
        if (!it) { skipped++; return; }
        var patch = {};
        if (p.updateCost !== false && U.num(r.cost) > 0) patch.costPrice = U.num(r.cost);
        if (p.updateRetail && U.num(r.retail) > 0) patch.retailPrice = U.num(r.retail);
        if (p.updateWholesale && U.num(r.wholesale) > 0) patch.wholesalePrice = U.num(r.wholesale);
        if (p.updateStock && U.num(r.qty) > 0) {
          try { Inventory.post(it.id, s.locationId, U.num(r.qty), U.num(r.cost) || U.num(it.costPrice), 'GRN', logId, s, 'Price import'); } catch (e) { }
        }
        if (!Object.keys(patch).length) { skipped++; return; }
        DB.update('Items', it.id, patch, s);
        updated++;
      } catch (e) { errors.push((r.code || r.name || 'row') + ': ' + e.message); }
    });

    DB.insert('PriceImports', {
      id: logId, date: U.iso(), supplierId: p.supplierId || '',
      fileName: p.fileName || '', rows: rows.length, updated: updated, created: created,
      skipped: skipped, errors: errors.length, notes: (errors.slice(0, 5).join(' | ')),
      createdBy: s.userId, createdAt: U.iso()
    }, s);

    Notifications.push('PRICE_IMPORT', 'Price list imported',
      updated + ' updated · ' + created + ' new · ' + skipped + ' skipped', 'info', '#/purchase', s.locationId, s);

    return { logId: logId, updated: updated, created: created, skipped: skipped,
      errors: errors, total: rows.length };
  },

  /* ============================== HISTORY ================================== */
  history: function (p, s) {
    Auth.require(s, 'purchase.view');
    var rows = DB.all('PriceImports').sort(function (a, b) {
      return U.str(b.date).localeCompare(U.str(a.date));
    }).slice(0, U.num(p && p.limit, 50));
    return rows.map(function (r) {
      return { id: r.id, date: r.date, supplierId: r.supplierId,
        supplierName: (DB.byId('Suppliers', r.supplierId) || {}).name || r.supplierId,
        fileName: r.fileName, rows: U.num(r.rows), updated: U.num(r.updated),
        created: U.num(r.created), skipped: U.num(r.skipped), errors: U.num(r.errors),
        notes: r.notes, createdBy: r.createdBy };
    });
  },

  /* ============================ GMAIL SOURCE =============================== */
  /**
   * Gmail se supplier price-list attachment dhoondho (CSV/TXT).
   * p = { query:'has:attachment from:supplier.com newer_than:30d', max:5 }
   */
  gmail: function (p, s) {
    Auth.require(s, 'purchase.create');
    if (typeof GmailApp === 'undefined') throw new Error('Gmail service available nahi hai.');
    var q = p.query || String(PriceImport.cfg('price-import.gmailQuery', 'has:attachment newer_than:30d'));
    var threads = GmailApp.search(q, 0, U.num(p.max, 10));
    var out = [];
    threads.forEach(function (t) {
      t.getMessages().forEach(function (m) {
        m.getAttachments().forEach(function (a) {
          var n = a.getName().toLowerCase();
          if (!/\.(csv|txt|tsv)$/.test(n)) return;
          if (out.length >= U.num(p.max, 10)) return;
          out.push({ messageId: m.getId(), from: m.getFrom(), subject: m.getSubject(),
            date: m.getDate().toISOString(), fileName: a.getName(),
            text: a.getDataAsString() });
        });
      });
    });
    return { count: out.length, attachments: out };
  }
};

var PRICE_IMPORT_DEFAULTS = {
  'price-import.minMarginPct': 5,
  'price-import.autoCreate': 'false',
  'price-import.defaultCategory': 'Uncategorised',
  'price-import.defaultMarginPct': 25,
  'price-import.gmailQuery': 'has:attachment newer_than:30d'
};
