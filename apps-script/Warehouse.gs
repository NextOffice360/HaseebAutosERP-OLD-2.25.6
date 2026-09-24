/**
 * HASEEB AUTOS - ERP / POS  ::  WAREHOUSE & LOT CONTROL
 * Warehouses → Bins/Racks → Stock by bin · Put-away · Bin transfer ·
 * Count sheets · Batch/lot + expiry tracking (optional, settings driven).
 */

var Warehouse = {

  /* ============================= STRUCTURE ================================= */
  warehouses: function (locationId, s) {
    var rows = DB.all('Warehouses');
    if (locationId) rows = rows.filter(function (w) { return w.locationId === locationId; });
    return rows.filter(function (w) { return U.str(w.active) !== 'false'; });
  },

  saveWarehouse: function (rec, s) {
    Auth.require(s, 'stock.adjust');
    if (!rec.name) throw new Error('Warehouse name zaroori hai.');
    if (rec.id) return DB.update('Warehouses', rec.id, U.pick(rec, ['name', 'code', 'locationId', 'incharge', 'isDefault', 'notes', 'active']), s);
    return DB.insert('Warehouses', U.pick(rec, ['name', 'code', 'locationId', 'incharge', 'isDefault', 'notes', 'active']), s);
  },

  bins: function (opts, s) {
    var rows = DB.all('Bins');
    opts = opts || {};
    if (opts.warehouseId) rows = rows.filter(function (b) { return b.warehouseId === opts.warehouseId; });
    if (opts.q) rows = rows.filter(function (b) { return U.matchAll(b.code + ' ' + (b.name || '') + ' ' + (b.rack || ''), opts.q); });
    return rows.filter(function (b) { return U.str(b.active) !== 'false'; });
  },

  saveBin: function (rec, s) {
    Auth.require(s, 'stock.adjust');
    if (!rec.code) throw new Error('Bin code zaroori hai (e.g. A-01-3).');
    if (rec.id) return DB.update('Bins', rec.id, U.pick(rec, ['code', 'name', 'warehouseId', 'rack', 'shelf', 'capacity', 'notes', 'active']), s);
    return DB.insert('Bins', U.pick(rec, ['code', 'name', 'warehouseId', 'rack', 'shelf', 'capacity', 'notes', 'active']), s);
  },

  /* ============================ STOCK BY BIN ================================ */
  /** item.binId (Items.rack / Stock.binId) ke zariye bin-wise stock */
  stockByBin: function (opts, s) {
    Auth.require(s, 'stock.view');
    opts = opts || {};
    var stock = DB.all('Stock');
    if (opts.locationId) stock = stock.filter(function (r) { return r.locationId === opts.locationId; });
    var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
    var bins = {}; DB.all('Bins').forEach(function (b) { bins[b.id] = b; });

    var rows = stock.map(function (r) {
      var it = items[r.itemId] || {};
      var bin = bins[it.binId] || bins[r.binId];
      return {
        itemId: r.itemId, code: it.code || '', name: it.name || '', brand: it.brand || '',
        category: it.category || '', qty: U.num(r.qty), avgCost: U.num(r.avgCost),
        value: U.round(U.num(r.qty) * U.num(r.avgCost), 2),
        locationId: r.locationId, binId: bin ? bin.id : (it.binId || r.binId || ''),
        binCode: bin ? bin.code : (it.binId || r.binId || '—'),
        rack: (bin && bin.rack) || it.rack || ''
      };
    });

    if (opts.binId) rows = rows.filter(function (r) { return r.binId === opts.binId; });
    if (opts.warehouseId) {
      var allowed = {};
      DB.all('Bins').forEach(function (b) { if (b.warehouseId === opts.warehouseId) allowed[b.id] = 1; });
      rows = rows.filter(function (r) { return allowed[r.binId]; });
    }
    if (opts.q) rows = rows.filter(function (r) { return U.matchAll(r.code + r.name + r.brand + r.binCode, opts.q); });
    if (opts.zero === false) rows = rows.filter(function (r) { return r.qty !== 0; });
    return U.sortBy(rows, 'binCode', 'asc');
  },

  /** put-away: item ko bin mein assign karo (stock move nahi, sirf placement) */
  putaway: function (itemId, binId, s) {
    Auth.require(s, 'stock.adjust');
    var it = DB.byId('Items', itemId);
    if (!it) throw new Error('Item not found');
    var bin = DB.byId('Bins', binId);
    DB.update('Items', itemId, { binId: binId, rack: bin ? (bin.rack || bin.code) : '', updatedAt: U.iso() }, s);
    return { itemId: itemId, binId: binId, binCode: bin ? bin.code : '' };
  },

  /** bin → bin transfer (same location ke ander) */
  binTransfer: function (payload, s) {
    /* v2.6 §15 — bin transfer bhi stock ko chhota hai (audit lazmi) */
    Auth.require(s, 'stock.transfer');
    var it = DB.byId('Items', payload.itemId);
    if (!it) throw new Error('Item not found');
    var qty = U.num(payload.qty);
    if (qty <= 0) throw new Error('Quantity ghalat hai.');
    // bin assignment badal do (purani qty ka hissa)
    var fromBin = DB.byId('Bins', payload.fromBinId);
    var toBin = DB.byId('Bins', payload.toBinId);
    Warehouse._adjustBinQty(payload.itemId, payload.fromBinId, -qty);
    Warehouse._adjustBinQty(payload.itemId, payload.toBinId, qty);
    var move = DB.insert('StockMoves', {
      id: U.uid('MOV'), ts: U.iso(), date: U.dateOnly(), itemId: payload.itemId,
      locationId: payload.locationId || s.locationId, qtyIn: 0, qtyOut: 0, balance: 0,
      cost: 0, refType: 'BIN_TRANSFER', refId: (fromBin ? fromBin.code : '?') + '→' + (toBin ? toBin.code : '?'),
      userId: s.userId, notes: qty + ' moved between bins'
    });
    if (payload.makePrimary !== false) DB.update('Items', payload.itemId, { binId: payload.toBinId }, s);
    Audit.log('BIN_TRANSFER', 'Bins', payload.toBinId,
      { binId: payload.fromBinId, binCode: fromBin ? fromBin.code : '', itemId: payload.itemId },
      { binId: payload.toBinId, binCode: toBin ? toBin.code : '', itemId: payload.itemId,
        qty: qty, moveId: move.id }, s);
    return move;
  },

  _adjustBinQty: function (itemId, binId, delta) {
    if (!binId) return;
    var rec = DB.findOne('BinStock', function (r) { return r.itemId === itemId && r.binId === binId; });
    if (rec) DB.update('BinStock', rec.id, { qty: String(Math.max(0, U.num(rec.qty) + delta)), updatedAt: U.iso() });
    else DB.insert('BinStock', { id: U.uid('BST'), itemId: itemId, binId: binId,
      qty: String(Math.max(0, delta)), updatedAt: U.iso() });
  },

  /* ============================ COUNT SHEETS =============================== */
  /** Bin ya warehouse ke hisaab se count sheet (system qty ke sath) */
  countSheet: function (opts, s) {
    Auth.require(s, 'stock.view');
    var rows = Warehouse.stockByBin(opts, s);
    return {
      generatedAt: U.iso(),
      filters: opts || {},
      rows: rows.map(function (r) {
        return { itemId: r.itemId, code: r.code, name: r.name, binCode: r.binCode,
          systemQty: r.qty, countedQty: '', diff: 0, avgCost: r.avgCost };
      })
    };
  },

  /* ====================== COUNT SHEETS (cycle count) ======================= */
  /**
   * Nayi count sheet banayein — scope warehouse / bin / category / search se.
   * Har line par system qty freeze ho jati hai (blind count ke liye).
   */
  countCreate: function (opts, s) {
    Auth.require(s, 'stock.adjust');
    opts = opts || {};
    var lines = Warehouse.stockByBin({
      locationId: opts.locationId || s.locationId,
      warehouseId: opts.warehouseId || '',
      binId: opts.binId || '',
      category: opts.category || '',
      q: opts.q || ''
    }, s);
    if (opts.category) lines = lines.filter(function (r) { return U.str(r.category) === U.str(opts.category); });
    if (opts.zeroOnly === true) lines = lines.filter(function (r) { return U.num(r.qty) <= 0; });
    if (opts.lowStockOnly === true) {
      var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
      lines = lines.filter(function (r) {
        var it = items[r.itemId] || {};
        return U.num(r.qty) > 0 && U.num(r.qty) <= U.num(it.reorderLevel, U.num(it.minStock, 0));
      });
    }
    if (!lines.length) throw new Error('Is scope mein koi item nahi mila.');
    var sheet = DB.insert('CountSheets', {
      id: U.uid('CNT'), sheetNo: DB.nextNumber('CNT', opts.locationId || s.locationId),
      date: U.dateOnly(), locationId: opts.locationId || s.locationId,
      warehouseId: opts.warehouseId || '', binId: opts.binId || '',
      category: opts.category || '', q: opts.q || '',
      scope: Warehouse._scopeLabel(opts), assignedTo: U.str(opts.assignedTo),
      status: 'DRAFT', notes: U.str(opts.notes), lines: lines.length,
      counted: 0, diffLines: 0, varianceValue: 0, adjustmentId: '',
      createdBy: s.userId, createdAt: U.iso(), postedAt: ''
    }, s);
    lines.forEach(function (r) {
      DB.insert('CountLines', {
        id: U.uid('CNL'), sheetId: sheet.id, itemId: r.itemId, code: r.code, name: r.name,
        binId: r.binId || '', binCode: r.binCode || '', systemQty: U.num(r.qty),
        countedQty: '', diff: 0, avgCost: U.num(r.avgCost), varianceValue: 0,
        note: '', countedAt: '', countedBy: ''
      });
    });
    return Warehouse.countGet({ id: sheet.id }, s);
  },

  _scopeLabel: function (opts) {
    var parts = [];
    if (opts.warehouseId) parts.push('warehouse');
    if (opts.binId) parts.push('bin');
    if (opts.category) parts.push(opts.category);
    if (opts.q) parts.push('"' + U.str(opts.q) + '"');
    if (opts.zeroOnly) parts.push('zero stock');
    if (opts.lowStockOnly) parts.push('low stock');
    return parts.length ? parts.join(' · ') : 'all stock';
  },

  /** Sheet + uski lines (progress ke sath) */
  countGet: function (p, s) {
    Auth.require(s, 'stock.view');
    var sheet = DB.byId('CountSheets', p.id);
    if (!sheet) throw new Error('Count sheet nahi mili');
    var lines = DB.all('CountLines').filter(function (r) { return r.sheetId === sheet.id; });
    lines.sort(function (a, b) { return U.str(a.code).localeCompare(U.str(b.code)); });
    var counted = lines.filter(function (r) { return r.countedQty !== '' && r.countedQty !== undefined && r.countedQty !== null; });
    var diffLines = lines.filter(function (r) { return U.num(r.diff) !== 0; });
    return {
      sheet: sheet, lines: lines,
      progress: {
        total: lines.length, counted: counted.length,
        pending: lines.length - counted.length,
        diffLines: diffLines.length,
        over: lines.filter(function (r) { return U.num(r.diff) > 0; }).length,
        short: lines.filter(function (r) { return U.num(r.diff) < 0; }).length,
        varianceValue: U.round(U.sum(lines, 'varianceValue'), 2),
        pct: lines.length ? U.round(counted.length / lines.length * 100, 1) : 0
      }
    };
  },

  countList: function (p, s) {
    Auth.require(s, 'stock.view');
    p = p || {};
    var rows = DB.all('CountSheets').filter(function (r) {
      if (p.status && r.status !== p.status) return false;
      if (p.locationId && r.locationId !== p.locationId) return false;
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.createdAt).localeCompare(U.str(a.createdAt)); });
    return rows.slice(0, U.num(p.limit, 100));
  },

  /** Ek line par counted qty darj karein → diff + variance value auto */
  countSetQty: function (p, s) {
    Auth.require(s, 'stock.adjust');
    var line = DB.byId('CountLines', p.id);
    if (!line) throw new Error('Line nahi mili');
    var sheet = DB.byId('CountSheets', line.sheetId);
    if (sheet && U.str(sheet.status) === 'POSTED') throw new Error('Posted sheet edit nahi ho sakti.');
    var counted = (p.countedQty === '' || p.countedQty === null || p.countedQty === undefined)
      ? '' : U.num(p.countedQty);
    var diff = counted === '' ? 0 : U.round(counted - U.num(line.systemQty), 3);
    DB.update('CountLines', line.id, {
      countedQty: counted, diff: diff,
      varianceValue: U.round(diff * U.num(line.avgCost), 2),
      note: U.str(p.note), countedAt: U.iso(), countedBy: s.userId
    });
    Warehouse._refreshSheetTotals(line.sheetId);
    return DB.byId('CountLines', line.id);
  },

  /** Saari counted lines ek sath (barcode gun / bulk entry) */
  countBulk: function (p, s) {
    Auth.require(s, 'stock.adjust');
    var out = { updated: 0, notFound: [] };
    (p.rows || []).forEach(function (r) {
      var line = DB.all('CountLines').filter(function (l) {
        return l.sheetId === p.id && (l.itemId === r.itemId || U.upper(l.code) === U.upper(r.code));
      })[0];
      if (!line) { out.notFound.push(r.code || r.itemId); return; }
      Warehouse.countSetQty({ id: line.id, countedQty: r.countedQty, note: r.note || '' }, s);
      out.updated++;
    });
    if (p.id) Warehouse._refreshSheetTotals(p.id);
    return out;
  },

  _refreshSheetTotals: function (sheetId) {
    var lines = DB.all('CountLines').filter(function (r) { return r.sheetId === sheetId; });
    var counted = lines.filter(function (r) { return r.countedQty !== '' && r.countedQty !== undefined && r.countedQty !== null; });
    var diffLines = lines.filter(function (r) { return U.num(r.diff) !== 0; });
    DB.update('CountSheets', sheetId, {
      lines: lines.length, counted: counted.length, diffLines: diffLines.length,
      varianceValue: U.round(U.sum(lines, 'varianceValue'), 2),
      status: counted.length ? 'COUNTING' : 'DRAFT', updatedAt: U.iso()
    });
  },

  /**
   * Count sheet post karein: har farq ke liye stock adjustment ban kar post
   * hoti hai (Inventory engine — StockMoves + Stock update ek jagah).
   */
  countPost: function (p, s) {
    Auth.require(s, 'stock.audit.post');
    var sheet = DB.byId('CountSheets', p.id);
    if (!sheet) throw new Error('Count sheet nahi mili');
    if (U.str(sheet.status) === 'POSTED') throw new Error('Ye sheet pehle hi post ho chuki hai.');
    var lines = DB.all('CountLines').filter(function (r) { return r.sheetId === sheet.id; });
    var counted = lines.filter(function (r) { return r.countedQty !== '' && r.countedQty !== undefined && r.countedQty !== null; });
    if (!counted.length) throw new Error('Koi line count hi nahi hui.');
    var adj = Inventory.saveAdjustment({
      date: U.dateOnly(), locationId: sheet.locationId,
      reason: 'Cycle count ' + sheet.sheetNo + ' (' + (sheet.scope || '') + ')',
      notes: U.str(p.notes) || ('Count sheet ' + sheet.sheetNo),
      items: counted.map(function (l) {
        return { itemId: l.itemId, countedQty: U.num(l.countedQty), cost: U.num(l.avgCost), notes: l.note || '' };
      })
    }, s);
    Inventory.postAdjustment(adj.id, s);
    /* count ke baad item ka lastCountedAt stamp */
    var now = U.iso();
    counted.forEach(function (l) {
      var row = DB.findOne('Stock', function (r) {
        return r.itemId === l.itemId && r.locationId === sheet.locationId;
      });
      if (row) DB.update('Stock', row.id, { lastCountedAt: now, updatedAt: now });
    });
    var varianceValue = U.round(U.sum(counted, 'varianceValue'), 2);
    DB.update('CountSheets', sheet.id, {
      status: 'POSTED', adjustmentId: adj.id, postedAt: U.iso(), postedBy: s.userId
    }, s);
    /* v2.6 §15 — physical count posted: operator, device-time, variance value,
       aur kaunsi adjustment se stock badla — sab record. */
    Audit.log('COUNT_POST', 'CountSheets', sheet.id,
      { status: U.str(sheet.status), lines: U.num(sheet.lines), counted: U.num(sheet.counted) },
      { status: 'POSTED', sheetNo: sheet.sheetNo, adjustmentId: adj.id, lines: counted.length,
        varianceValue: varianceValue, warehouseId: sheet.warehouseId || '',
        binId: sheet.binId || '', locationId: sheet.locationId }, s);
    return { sheet: DB.byId('CountSheets', sheet.id), adjustment: adj,
      lines: counted.length, varianceValue: varianceValue };
  },

  countCancel: function (p, s) {
    Auth.require(s, 'stock.adjust');
    var sheet = DB.byId('CountSheets', p.id);
    if (!sheet) throw new Error('Count sheet nahi mili');
    if (U.str(sheet.status) === 'POSTED') throw new Error('Posted sheet cancel nahi ho sakti.');
    DB.update('CountSheets', sheet.id, { status: 'CANCELLED', updatedAt: U.iso() }, s);
    return DB.byId('CountSheets', sheet.id);
  },

  /* ======================= AUDIT / DISCREPANCY ============================= */
  /**
   * Stock audit report:
   *  • count sheets ka progress aur variance
   *  • posted adjustments (with diff + value)
   *  • accuracy % = matched lines / counted lines × 100
   */
  audit: function (p, s) {
    Auth.require(s, 'stock.view');
    p = p || {};
    var sheets = DB.all('CountSheets').filter(function (r) {
      if (p.locationId && r.locationId !== p.locationId) return false;
      if (p.from && U.str(r.date) < U.str(p.from)) return false;
      if (p.to && U.str(r.date) > U.str(p.to)) return false;
      return true;
    });
    var lines = DB.all('CountLines');
    var sheetIds = {}; sheets.forEach(function (r) { sheetIds[r.id] = 1; });
    var myLines = lines.filter(function (r) { return sheetIds[r.sheetId]; });
    var counted = myLines.filter(function (r) { return r.countedQty !== '' && r.countedQty !== undefined && r.countedQty !== null; });
    var diffs = counted.filter(function (r) { return U.num(r.diff) !== 0; });
    var adjustRows = Inventory.listAdjustments({ locationId: p.locationId || '', limit: 200 }, s);
    var adjItems = DB.all('StockAdjustItems');
    var adjIds = {}; adjustRows.forEach(function (a) { adjIds[a.id] = 1; });
    var adjLines = adjItems.filter(function (r) { return adjIds[r.adjId]; });
    var adjValue = adjLines.reduce(function (a, r) {
      return a + (U.num(r.diff) * U.num(r.cost));
    }, 0);
    return {
      sheets: sheets.length,
      posted: sheets.filter(function (r) { return r.status === 'POSTED'; }).length,
      open: sheets.filter(function (r) { return r.status === 'DRAFT' || r.status === 'COUNTING'; }).length,
      lines: myLines.length, counted: counted.length,
      matched: counted.length - diffs.length,
      diffLines: diffs.length,
      over: diffs.filter(function (r) { return U.num(r.diff) > 0; }).length,
      short: diffs.filter(function (r) { return U.num(r.diff) < 0; }).length,
      accuracy: counted.length ? U.round((counted.length - diffs.length) / counted.length * 100, 2) : 0,
      varianceQty: U.round(U.sum(diffs, 'diff'), 3),
      varianceValue: U.round(U.sum(diffs, 'varianceValue'), 2),
      adjustments: adjustRows,
      adjustmentsValue: U.round(adjValue, 2),
      sheetsList: sheets.slice(0, 50),
      topVariance: diffs.slice().sort(function (a, b) {
        return Math.abs(U.num(b.varianceValue)) - Math.abs(U.num(a.varianceValue));
      }).slice(0, 20)
    };
  },

  /* ========================= LOT / BATCH / EXPIRY ========================== */
  receiveLot: function (payload, s) {
    Auth.require(s, 'purchase.grn');
    if (U.str(Config.get('trackLots')) !== 'true' && U.str(Config.get('trackSerial')) !== 'true') {
      throw new Error('Lot/serial tracking Settings ▸ Inventory se on karein.');
    }
    var qty = U.num(payload.qty);
    if (qty <= 0) throw new Error('Quantity zaroori hai.');
    var rec = DB.insert('StockLots', {
      id: U.uid('LOT'), itemId: payload.itemId, lotNo: payload.lotNo || ('LOT-' + U.dateOnly()),
      serials: payload.serials || '', expiry: payload.expiry || '', mfg: payload.mfg || '',
      qty: String(qty), cost: U.num(payload.cost), locationId: payload.locationId || s.locationId,
      grnId: payload.grnId || '', status: 'ACTIVE', createdAt: U.iso()
    }, s);
    return rec;
  },

  lots: function (opts, s) {
    Auth.require(s, 'stock.view');
    var rows = DB.all('StockLots').filter(function (r) { return U.str(r.status) === 'ACTIVE'; });
    opts = opts || {};
    if (opts.itemId) rows = rows.filter(function (r) { return r.itemId === opts.itemId; });
    if (opts.locationId) rows = rows.filter(function (r) { return r.locationId === opts.locationId; });
    if (opts.expiringInDays) {
      var cutoff = U.daysAgo(-U.num(opts.expiringInDays));
      rows = rows.filter(function (r) {
        var d = U.parseDate(r.expiry); return d && d <= cutoff;
      });
    }
    var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
    return rows.map(function (r) {
      var it = items[r.itemId] || {};
      var days = null;
      if (r.expiry) {
        var d = U.parseDate(r.expiry);
        if (d) days = Math.ceil((d - new Date()) / 864e5);
      }
      return { id: r.id, itemId: r.itemId, code: it.code || '', name: it.name || '',
        lotNo: r.lotNo, expiry: r.expiry, daysToExpiry: days, qty: U.num(r.qty),
        cost: U.num(r.cost), locationId: r.locationId };
    });
  },

  /* ============================ DASHBOARD ================================== */
  overview: function (locationId, s) {
    Auth.require(s, 'stock.view');
    var locs = locationId ? [locationId] : (s.locationIds || []);
    var whs = Warehouse.warehouses(null, s).filter(function (w) { return !locationId || w.locationId === locationId; });
    var bins = DB.all('Bins').filter(function (b) { return U.str(b.active) !== 'false'; });
    var stock = DB.all('Stock').filter(function (r) { return locs.indexOf(r.locationId) > -1; });
    var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });

    var totalQty = 0, totalValue = 0, noBin = 0, lowStock = 0, outOfStock = 0;
    stock.forEach(function (r) {
      totalQty += U.num(r.qty);
      totalValue += U.num(r.qty) * U.num(r.avgCost);
      var it = items[r.itemId] || {};
      if (!it.binId && !r.binId) noBin++;
      if (U.num(r.qty) <= 0) outOfStock++;
      else if (U.num(r.qty) <= U.num(it.reorderLevel, U.num(it.minStock, 0))) lowStock++;
    });

    var byWarehouse = whs.map(function (w) {
      var wbins = bins.filter(function (b) { return b.warehouseId === w.id; });
      var ids = {}; wbins.forEach(function (b) { ids[b.id] = 1; });
      var lines = stock.filter(function (r) { return ids[(items[r.itemId] || {}).binId] || ids[r.binId]; });
      var val = lines.reduce(function (a, r) { return a + U.num(r.qty) * U.num(r.avgCost); }, 0);
      return { id: w.id, name: w.name, locationId: w.locationId, bins: wbins.length,
        skus: lines.length, qty: U.round(U.sum(lines, 'qty'), 2), value: U.round(val, 2) };
    });

    return {
      warehouses: whs.length, bins: bins.length,
      totalQty: U.round(totalQty, 2), totalValue: U.round(totalValue, 2),
      lowStock: lowStock, outOfStock: outOfStock, unassigned: noBin,
      byWarehouse: byWarehouse
    };
  }
};
