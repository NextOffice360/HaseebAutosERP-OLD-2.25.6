/**
 * HASEEB AUTOS - ERP / POS  ::  INVENTORY
 * Per-location stock, weighted-average cost, stock moves ledger,
 * adjustments (draft → posted → reversed), inter-branch transfers, quick count.
 */

var Inventory = {

  /* =============================== STOCK MAP =============================== */
  /** { itemId: qty } for one location (cache-friendly) */
  stockMap: function (locationId) {
    var rows = DB.all('Stock');
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].locationId === locationId) map[rows[i].itemId] = U.num(rows[i].qty);
    }
    return map;
  },

  getStockRow: function (itemId, locationId) {
    var rows = DB.all('Stock', true);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].itemId === itemId && rows[i].locationId === locationId) return rows[i];
    }
    // lazily create
    return DB.insert('Stock', { id: U.uid('STK'), itemId: itemId, locationId: locationId,
      qty: '0', avgCost: '0', rack: '', lastCountedAt: '', updatedAt: U.iso() });
  },

  /**
   * Core stock posting. qtyDelta (+) in, (-) out.
   * Weighted average cost update hota hai jab qty badhti hai (>0 delta).
   */
  post: function (itemId, locationId, qtyDelta, cost, refType, refId, s, notes) {
    qtyDelta = U.num(qtyDelta);
    if (!qtyDelta) return null;
    var row = Inventory.getStockRow(itemId, locationId);
    var oldQty = U.num(row.qty);
    var oldAvg = U.num(row.avgCost);
    var newQty = U.round(oldQty + qtyDelta, 3);

    if (newQty < 0 && U.str(DB.settings().allowNegativeStock) !== 'true') {
      var item = DB.byId('Items', itemId);
      throw new Error('Stock available nahi: ' + (item ? item.name : itemId) + ' (available: ' + oldQty + ')');
    }

    var newAvg = oldAvg;
    if (qtyDelta > 0) {
      var inCost = U.num(cost, oldAvg);
      if (newQty <= 0) newAvg = inCost;
      else newAvg = ((oldQty * oldAvg) + (qtyDelta * inCost)) / newQty;
    } else {
      /*
       * AVG (weighted-average) costing: stock nikalte waqt cost hamesha
       * current average cost hoti hai — item master ka "last purchase price"
       * nahi. Is se COGS, profit aur stock value teeno consistent rehtay hain.
       * (FIFO/LIFO mode me yeh branch ignore hoti hai — future costing modes.)
       */
      if (U.str(DB.settings().costingMethod) !== 'FIFO') cost = oldAvg;
    }

    DB.update('Stock', row.id, {
      qty: String(newQty), avgCost: String(U.round(newAvg, 2)), updatedAt: U.iso()
    });

    var move = DB.insert('StockMoves', {
      id: U.uid('MOV'), ts: U.iso(), date: U.dateOnly(), itemId: itemId, locationId: locationId,
      qtyIn: qtyDelta > 0 ? String(qtyDelta) : '0',
      qtyOut: qtyDelta < 0 ? String(Math.abs(qtyDelta)) : '0',
      balance: String(newQty), cost: String(U.num(cost, newAvg)),
      refType: refType || 'MANUAL', refId: refId || '', userId: s ? s.userId : '', notes: notes || ''
    });

    /* ====================================================================
       v2.6 §15 — HAR STOCK MOVEMENT AUDITED (before/after + ref + source).
       Yeh poori app ka EK HI stock-write choke point hai, is liye yahan
       ek call se sale / purchase / GRN / return / transfer / adjustment /
       warehouse count — sab traceable ho jate hain. Stock kabhi bhi bin
       trace nahi badalta.
       ==================================================================== */
    try {
      var item = DB.byId('Items', itemId);
      Audit.log('STOCK_MOVE', 'Stock', row.id,
        { qty: oldQty, avgCost: U.round(oldAvg, 2), item: item ? item.code : itemId },
        { qty: newQty, avgCost: U.round(newAvg, 2), delta: qtyDelta, cost: U.num(cost, newAvg),
          refType: refType || 'MANUAL', refId: refId || '', moveId: move.id, notes: notes || '' },
        s);
    } catch (e) { Logger.log('audit stock: ' + e.message); }

    return move;
  },

  /* =============================== LEVELS ================================== */
  levels: function (p, s) {
    Auth.require(s, 'stock.view');
    p = p || {};
    var locId = p.locationId || s.locationId;
    var stock = DB.all('Stock').filter(function (r) { return !locId || r.locationId === locId; });
    var items = {};
    DB.all('Items').forEach(function (i) { items[i.id] = i; });

    var rows = stock.map(function (r) {
      var it = items[r.itemId] || {};
      return {
        itemId: r.itemId, code: it.code || '', name: it.name || '(unknown)', brand: it.brand || '',
        category: it.category || '', unit: it.unit || '', rack: r.rack || it.rack || '',
        locationId: r.locationId, qty: U.num(r.qty), avgCost: U.num(r.avgCost),
        value: U.round(U.num(r.qty) * U.num(r.avgCost), 2),
        retailPrice: U.num(it.retailPrice), minStock: U.num(it.minStock),
        reorderLevel: U.num(it.reorderLevel), status: it.status || '',
        low: U.num(r.qty) <= U.num(it.reorderLevel, U.num(it.minStock, 0))
      };
    });

    if (p.q) rows = rows.filter(function (r) { return U.matchAll(r.code + ' ' + r.name + ' ' + r.brand + ' ' + r.category, p.q); });
    if (p.category) rows = rows.filter(function (r) { return r.category === p.category; });
    if (p.lowOnly) rows = rows.filter(function (r) { return r.low; });
    if (p.zeroOnly) rows = rows.filter(function (r) { return r.qty === 0; });

    rows = U.sortBy(rows, p.sort || 'name', p.dir || 'asc');
    return rows;
  },

  moves: function (p, s) {
    Auth.require(s, 'stock.view');
    p = p || {};
    var rows = DB.all('StockMoves').reverse();
    if (p.itemId) rows = rows.filter(function (r) { return r.itemId === p.itemId; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (p.refType) rows = rows.filter(function (r) { return r.refType === p.refType; });
    if (p.from) {
      var from = U.startOfDay(p.from);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= from; });
    }
    if (p.to) {
      var to = U.startOfDay(p.to); to.setDate(to.getDate() + 1);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d < to; });
    }
    var limit = U.num(p.limit, 200);
    var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
    return rows.slice(0, limit).map(function (r) {
      var it = items[r.itemId] || {};
      return { id: r.id, date: r.date, ts: r.ts, itemId: r.itemId, code: it.code || '', name: it.name || '',
        qtyIn: U.num(r.qtyIn), qtyOut: U.num(r.qtyOut), balance: U.num(r.balance),
        cost: U.num(r.cost), refType: r.refType, refId: r.refId, notes: r.notes };
    });
  },

  /* ============================ ADJUSTMENTS ================================ */
  listAdjustments: function (p, s) {
    Auth.require(s, 'stock.view');
    p = p || {};
    var rows = DB.all('StockAdjustments').reverse();
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (p.status) rows = rows.filter(function (r) { return r.status === p.status; });
    return rows.slice(0, U.num(p.limit, 100));
  },

  saveAdjustment: function (payload, s) {
    Auth.require(s, 'stock.adjust');
    var items = payload.items || [];
    if (payload.id) {
      // update draft only
      var existing = DB.byId('StockAdjustments', payload.id);
      if (existing && U.str(existing.status) === 'POSTED') throw new Error('Posted adjustment edit nahi ho sakti.');
      DB.update('StockAdjustments', payload.id, {
        date: payload.date || existing.date, locationId: payload.locationId || existing.locationId,
        reason: payload.reason || '', notes: payload.notes || ''
      }, s);
      // replace lines
      DB.all('StockAdjustItems').filter(function (r) { return r.adjId === payload.id; })
        .forEach(function (r) { DB.remove('StockAdjustItems', r.id, s); });
      var stock = Inventory.stockMap(payload.locationId || existing.locationId);
      items.forEach(function (line) {
        DB.insert('StockAdjustItems', {
          id: U.uid('SAI'), adjId: payload.id, itemId: line.itemId,
          systemQty: U.num(stock[line.itemId], 0), countedQty: U.num(line.countedQty),
          diff: U.num(line.countedQty) - U.num(stock[line.itemId], 0),
          cost: line.cost || 0, notes: line.notes || ''
        });
      });
      return DB.byId('StockAdjustments', payload.id);
    }

    var adj = DB.insert('StockAdjustments', {
      id: U.uid('ADJ'), adjNo: DB.nextNumber('ADJ', payload.locationId || s.locationId),
      date: payload.date || U.dateOnly(), locationId: payload.locationId || s.locationId,
      reason: payload.reason || 'PHYSICAL_COUNT', status: 'DRAFT', notes: payload.notes || '',
      createdBy: s.userId, createdAt: U.iso()
    }, s);
    var stockMap = Inventory.stockMap(adj.locationId);
    items.forEach(function (line) {
      DB.insert('StockAdjustItems', {
        id: U.uid('SAI'), adjId: adj.id, itemId: line.itemId,
        systemQty: U.num(stockMap[line.itemId], 0), countedQty: U.num(line.countedQty),
        diff: U.num(line.countedQty) - U.num(stockMap[line.itemId], 0),
        cost: line.cost || 0, notes: line.notes || ''
      });
    });
    if (payload.post) return Inventory.postAdjustment(adj.id, s);
    return adj;
  },

  postAdjustment: function (id, s) {
    Auth.require(s, 'stock.audit.post');
    var adj = DB.byId('StockAdjustments', id);
    if (!adj) throw new Error('Adjustment not found');
    if (U.str(adj.status) === 'POSTED') throw new Error('Already posted.');
    var lines = DB.all('StockAdjustItems').filter(function (r) { return r.adjId === id; });
    lines.forEach(function (l) {
      var diff = U.num(l.countedQty) - U.num(l.systemQty);
      if (diff) Inventory.post(l.itemId, adj.locationId, diff, l.cost, 'ADJUST', adj.id, s, adj.adjNo + ' ' + adj.reason);
    });
    DB.update('StockAdjustments', id, { status: 'POSTED' }, s);
    return DB.byId('StockAdjustments', id);
  },

  reverseAdjustment: function (id, s) {
    Auth.require(s, 'stock.audit.post');
    var adj = DB.byId('StockAdjustments', id);
    if (!adj || U.str(adj.status) !== 'POSTED') throw new Error('Sirf posted adjustment reverse ho sakti hai.');
    var lines = DB.all('StockAdjustItems').filter(function (r) { return r.adjId === id; });
    lines.forEach(function (l) {
      var diff = U.num(l.countedQty) - U.num(l.systemQty);
      if (diff) Inventory.post(l.itemId, adj.locationId, -diff, l.cost, 'ADJUST_REV', adj.id, s, 'Reversal of ' + adj.adjNo);
    });
    DB.update('StockAdjustments', id, { status: 'REVERSED', reversedBy: s.userId, reversedAt: U.iso() }, s);
    return DB.byId('StockAdjustments', id);
  },

  quickCount: function (p, s) {
    Auth.require(s, 'stock.adjust');
    // single item quick set
    var stock = Inventory.getStockRow(p.itemId, p.locationId || s.locationId);
    var diff = U.num(p.countedQty) - U.num(stock.qty);
    if (diff) Inventory.post(p.itemId, p.locationId || s.locationId, diff, p.cost, 'QUICK_COUNT', '', s, p.notes || '');
    return { itemId: p.itemId, qty: U.num(p.countedQty), diff: diff };
  },

  /* ============================== TRANSFERS ================================ */
  listTransfers: function (p, s) {
    Auth.require(s, 'stock.view');
    p = p || {};
    var rows = DB.all('Transfers').reverse();
    if (p.status) rows = rows.filter(function (r) { return r.status === p.status; });
    if (p.locationId) rows = rows.filter(function (r) {
      return r.fromLocationId === p.locationId || r.toLocationId === p.locationId;
    });
    var out = rows.slice(0, U.num(p.limit, 100)).map(function (t) {
      var lines = DB.all('TransferItems').filter(function (r) { return r.transferId === t.id; });
      return U.pick(t, ['id', 'transferNo', 'date', 'fromLocationId', 'toLocationId', 'status', 'notes', 'createdBy', 'postedAt'])
        ;
    });
    return out;
  },

  saveTransfer: function (payload, s) {
    Auth.require(s, 'stock.transfer');
    var items = payload.items || [];
    if (!items.length) throw new Error('Kam az kam ek item chahiye.');
    if (payload.fromLocationId === payload.toLocationId) throw new Error('Source aur destination alag honay chahiye.');

    var tr = DB.insert('Transfers', {
      id: U.uid('TRF'), transferNo: DB.nextNumber('TRANSFER', payload.fromLocationId),
      date: payload.date || U.dateOnly(), fromLocationId: payload.fromLocationId,
      toLocationId: payload.toLocationId, status: 'IN_TRANSIT', notes: payload.notes || '',
      createdBy: s.userId, createdAt: U.iso()
    }, s);

    items.forEach(function (line) {
      var row = Inventory.getStockRow(line.itemId, payload.fromLocationId);
      var cost = U.num(line.cost, U.num(row.avgCost));
      DB.insert('TransferItems', { id: U.uid('TRI'), transferId: tr.id, itemId: line.itemId,
        qty: U.num(line.qty), cost: cost, notes: line.notes || '' });
      // stock source se nikal jata hai (in transit)
      Inventory.post(line.itemId, payload.fromLocationId, -U.num(line.qty), cost, 'TRANSFER_OUT', tr.id, s, tr.transferNo);
    });
    return tr;
  },

  receiveTransfer: function (id, s) {
    Auth.require(s, 'stock.transfer');
    var tr = DB.byId('Transfers', id);
    if (!tr) throw new Error('Transfer not found');
    if (U.str(tr.status) === 'RECEIVED') throw new Error('Already received.');
    var lines = DB.all('TransferItems').filter(function (r) { return r.transferId === id; });
    var received = {};
    (s.__receiveLines || null);
    lines.forEach(function (l) {
      var qty = U.num(l.qty);
      Inventory.post(l.itemId, tr.toLocationId, qty, l.cost, 'TRANSFER_IN', tr.id, s, tr.transferNo);
      received[l.itemId] = qty;
    });
    DB.update('Transfers', id, { status: 'RECEIVED', postedAt: U.iso() }, s);
    return DB.byId('Transfers', id);
  },

  /* ============================ VALUATION ================================== */
  valuation: function (locationId) {
    var stock = DB.all('Stock');
    var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
    var total = 0, retail = 0, units = 0, lines = 0;
    stock.forEach(function (r) {
      if (locationId && r.locationId !== locationId) return;
      var q = U.num(r.qty);
      total += q * U.num(r.avgCost);
      retail += q * U.num((items[r.itemId] || {}).retailPrice);
      units += q; lines++;
    });
    return { costValue: U.round(total, 2), retailValue: U.round(retail, 2), units: U.round(units, 2), skus: lines };
  }
};
