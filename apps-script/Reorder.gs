/**
 * HASEEB AUTOS - ERP / POS  ::  AUTO REORDER ENGINE
 * ------------------------------------------------------------------------
 * Settings-driven purchase suggestions:
 *   • Method   : MIN_MAX | REORDER_POINT | VELOCITY (coverage + lead time)
 *   • Supplier : PRIMARY | LAST | CHEAPEST
 *   • Output   : DRAFT PO | APPROVED PO (grouped by supplier)
 * Koi bhi number hardcoded nahi — sab Settings ▸ Automation ▸ Reorder rules se.
 */
var Reorder = {

  /* ============================== SETTINGS ================================ */
  rules: function () {
    var s = DB.settings();
    // dotted aur flat dono style support (Settings ▸ Automation ▸ Reorder rules)
    var pick = function (a, b, def) { return s[a] !== undefined ? s[a] : (s[b] !== undefined ? s[b] : def); };
    return {
      enabled: U.str(pick('autoReorder', 'auto.reorder')) === 'true',
      method: U.str(pick('autoReorderMethod', 'auto.reorderMethod')) || 'VELOCITY',
      lookback: U.num(pick('autoReorderLookback', 'auto.reorderLookback'), 30),
      coverageDays: U.num(pick('autoReorderCoverageDays', 'auto.reorderCoverageDays'), 30),
      leadTimeDays: U.num(pick('autoReorderLeadTimeDays', 'auto.reorderLeadTimeDays'), 7),
      safetyDays: U.num(pick('autoReorderSafetyDays', 'auto.reorderSafetyDays'), 7),
      supplierMode: U.str(pick('autoReorderSupplierMode', 'auto.reorderSupplierMode')) || 'PRIMARY',
      createAs: U.str(pick('autoReorderCreate', 'auto.reorderCreate')) || 'DRAFT',
      minOrderValue: U.num(pick('autoReorderMinValue', 'auto.reorderMinValue'), 0),
      includeZeroSales: U.str(pick('autoReorderIncludeSlow', 'auto.reorderIncludeSlow')) === 'true'
    };
  },

  /* ============================== SUGGEST ================================= */
  /**
   * opts = { locationId, supplierId, category, onlyBelow:true, limit }
   * row  = { itemId, code, name, category, brand, unit, supplierId, supplierName,
   *          onHand, onOrder, avgDailySales, daysOfCover, leadTimeDays, safetyStock,
   *          targetLevel, suggestedQty, cost, value, priority, reason }
   */
  suggest: function (opts, s) {
    Auth.require(s, 'purchase.view');
    opts = opts || {};
    var r = Reorder.rules();
    var locId = opts.locationId || s.locationId;

    /* ---------- 1. on hand ---------- */
    var onHand = {};
    DB.all('Stock').forEach(function (row) {
      if (locId && row.locationId !== locId) return;
      onHand[row.itemId] = U.num(onHand[row.itemId]) + U.num(row.qty);
    });

    /* ---------- 2. sales velocity ---------- */
    var from = U.daysAgo(r.lookback - 1);
    var sold = {};
    DB.all('SaleItems').forEach(function (li) {
      if (!li.saleId) return;
      sold[li.itemId] = U.num(sold[li.itemId]) + U.num(li.qty);
    });
    // date-window filter needs the sale header
    var saleIds = {};
    var sales = DB.all('Sales').filter(function (x) {
      var d = U.parseDate(x.date);
      return U.str(x.status) !== 'VOID' && d && d >= from;
    });
    sales.forEach(function (x) { saleIds[x.id] = 1; });
    // fallback: if no dated sales found, use all items (fresh DB / offline seed)
    var useWindowed = sales.length > 0;
    if (useWindowed) {
      sold = {};
      DB.all('SaleItems').forEach(function (li) {
        if (!saleIds[li.saleId]) return;
        sold[li.itemId] = U.num(sold[li.itemId]) + U.num(li.qty);
      });
    }
    var avgDaily = {};
    Object.keys(sold).forEach(function (k) { avgDaily[k] = U.num(sold[k]) / (r.lookback || 30); });

    /* ---------- 3. open purchase orders (on order) ---------- */
    var onOrder = {};
    DB.all('PurchaseOrders').forEach(function (po) {
      if (U.str(po.status) === 'RECEIVED' || U.str(po.status) === 'CANCELLED') return;
      if (locId && po.locationId && po.locationId !== locId) return;
      var items = [];
      try { items = JSON.parse(po.items || '[]'); } catch (e) { }
      items.forEach(function (li) { onOrder[li.itemId] = U.num(onOrder[li.itemId]) + U.num(li.qty); });
    });

    /* ---------- 4. suppliers ---------- */
    var sup = {};
    DB.all('Suppliers').forEach(function (x) { sup[x.id] = x; });
    var lastCost = {};   // cheapest / last purchase price
    DB.all('GRN').forEach(function (g) {
      var items = [];
      try { items = JSON.parse(g.items || '[]'); } catch (e) { }
      items.forEach(function (li) {
        var c = U.num(li.cost);
        if (!c) return;
        if (!lastCost[li.itemId] || c < lastCost[li.itemId].cost) lastCost[li.itemId] = { cost: c, supplierId: g.supplierId };
        lastCost[li.itemId].last = { cost: c, supplierId: g.supplierId };
      });
    });

    /* ---------- 5. build rows ---------- */
    var rows = [];
    DB.all('Items').forEach(function (it) {
      if (U.str(it.status) !== 'ACTIVE') return;
      if (opts.category && it.category !== opts.category) return;
      if (opts.q) {
        var hay = U.norm(it.code + ' ' + it.name + ' ' + it.brand + ' ' + it.category);
        if (String(U.norm(opts.q)).split(' ').filter(Boolean).every(function (tk) { return hay.indexOf(tk) === -1; })) return;
      }

      var hand = U.num(onHand[it.id]);
      var ordered = U.num(onOrder[it.id]);
      var avail = hand + ordered;
      var vel = U.num(avgDaily[it.id]);
      var reorderPoint = U.num(it.reorderLevel, U.num(it.minStock, 0));

      var target, suggested, reason, priority;

      if (r.method === 'MIN_MAX') {
        target = Math.max(reorderPoint * 2, U.num(it.maxStock, reorderPoint * 2));
        suggested = Math.max(0, target - avail);
        reason = 'Min/Max: target ' + target + ', available ' + U.round(avail, 2);
      } else if (r.method === 'REORDER_POINT') {
        target = reorderPoint;
        suggested = avail <= reorderPoint ? Math.max(1, reorderPoint - avail + U.num(it.minOrderQty, 0)) : 0;
        reason = 'Reorder point ' + reorderPoint + ', available ' + U.round(avail, 2);
      } else {                                   // VELOCITY (default)
        target = vel * (r.coverageDays + r.leadTimeDays) + vel * r.safetyDays;
        if (target < reorderPoint) target = reorderPoint;
        suggested = Math.max(0, target - avail);
        reason = 'Velocity ' + U.round(vel, 2) + '/day · cover ' + r.coverageDays +
          'd + lead ' + r.leadTimeDays + 'd + safety ' + r.safetyDays + 'd';
      }
      suggested = Math.ceil(U.round(suggested, 3));

      if (!suggested && !(opts.onlyBelow === false)) return;
      if (!r.includeZeroSales && vel === 0 && suggested && hand > 0) return;   // slow mover skip

      // pack size rounding
      var pack = U.num(it.packSize, U.num(it.minOrderQty, 0));
      if (pack > 1 && suggested) suggested = Math.ceil(suggested / pack) * pack;

      var daysOfCover = vel ? U.round(avail / vel, 1) : null;
      var sid = Reorder._supplierFor(it, sup, lastCost, r.supplierMode);
      if (opts.supplierId && sid !== opts.supplierId) return;

      var cost = U.num(it.costPrice, U.num((lastCost[it.id] || {}).cost));
      var value = U.round(suggested * cost, 2);
      if (value < U.num(r.minOrderValue)) return;

      if (avail <= 0) priority = 'OUT_OF_STOCK';
      else if (daysOfCover !== null && daysOfCover < r.leadTimeDays) priority = 'CRITICAL';
      else if (reorderPoint && avail <= reorderPoint) priority = 'BELOW_REORDER';
      else if (daysOfCover !== null && daysOfCover < r.coverageDays) priority = 'LOW_COVER';
      else priority = 'REPLENISH';

      rows.push({
        itemId: it.id, code: it.code, name: it.name, category: it.category || '',
        brand: it.brand || '', unit: it.unit || 'PCS',
        supplierId: sid, supplierName: (sup[sid] || {}).name || '',
        onHand: U.round(hand, 2), onOrder: U.round(ordered, 2),
        avgDailySales: U.round(vel, 3), daysOfCover: daysOfCover,
        reorderPoint: reorderPoint, safetyStock: U.round(vel * r.safetyDays, 2),
        targetLevel: U.round(target, 2), suggestedQty: suggested,
        cost: U.round(cost, 2), value: value,
        priority: priority, reason: reason
      });
    });

    var weight = { OUT_OF_STOCK: 0, CRITICAL: 1, BELOW_REORDER: 2, LOW_COVER: 3, REPLENISH: 4 };
    rows.sort(function (a, b) {
      var d = (weight[a.priority] || 9) - (weight[b.priority] || 9);
      return d !== 0 ? d : (b.value - a.value);
    });
    if (opts.limit) rows = rows.slice(0, U.num(opts.limit));
    return { rows: rows, rules: r, generatedAt: U.iso(),
      summary: Reorder._summary(rows) };
  },

  _supplierFor: function (it, sup, lastCost, mode) {
    var lc = lastCost[it.id] || {};
    if (mode === 'LAST' && lc.last && lc.last.supplierId) return lc.last.supplierId;
    if (mode === 'CHEAPEST' && lc.supplierId) return lc.supplierId;
    if (it.primarySupplierId && sup[it.primarySupplierId]) return it.primarySupplierId;
    if (lc.supplierId) return lc.supplierId;
    var first = Object.keys(sup)[0];
    return first || '';
  },

  _summary: function (rows) {
    var out = { items: rows.length, units: 0, value: 0, byPriority: {}, bySupplier: {} };
    rows.forEach(function (r) {
      out.units += U.num(r.suggestedQty);
      out.value += U.num(r.value);
      out.byPriority[r.priority] = (out.byPriority[r.priority] || 0) + 1;
      var k = r.supplierName || '(no supplier)';
      out.bySupplier[k] = U.round(U.num(out.bySupplier[k]) + U.num(r.value), 2);
    });
    out.value = U.round(out.value, 2);
    return out;
  },

  /* =========================== CREATE POs ================================= */
  /** Suggestion rows → ek ya zyada PO (supplier-wise). opts.items = [{itemId, qty, cost}] */
  createPOs: function (opts, s) {
    Auth.require(s, 'purchase.po.create');
    opts = opts || {};
    var r = Reorder.rules();
    var chosen = opts.items && opts.items.length ? opts.items : (Reorder.suggest(opts, s).rows || []);
    if (!chosen.length) throw new Error('Reorder ke liye koi item nahi mila.');

    var itemsById = {};
    DB.all('Items').forEach(function (i) { itemsById[i.id] = i; });
    var bySupplier = {};
    chosen.forEach(function (row) {
      var qty = U.num(row.qty, U.num(row.suggestedQty));
      if (qty <= 0) return;
      var it = itemsById[row.itemId] || {};
      var sid = row.supplierId || it.primarySupplierId || '';
      var cost = U.num(row.cost, U.num(it.costPrice));
      bySupplier[sid] = bySupplier[sid] || { supplierId: sid, lines: [] };
      bySupplier[sid].lines.push({ itemId: row.itemId, code: it.code || row.code || '',
        name: it.name || row.name || '', qty: qty, rate: cost });
    });

    var created = [];
    Object.keys(bySupplier).forEach(function (sid) {
      var grp = bySupplier[sid];
      if (opts.supplierId && sid !== opts.supplierId) return;
      var po = Purchase.savePO({
        supplierId: sid, locationId: opts.locationId || s.locationId,
        date: U.dateOnly(), expectedDate: U.iso(U.daysAgo(-U.num(r.leadTimeDays))),
        items: grp.lines, notes: 'Auto reorder (' + r.method + ') — ' + U.iso(),
        status: r.createAs === 'APPROVE' ? 'APPROVED' : 'DRAFT',
        source: 'AUTO_REORDER'
      }, s);
      created.push(po);
    });
    return { created: created.length, purchaseOrders: created, units: chosen.length };
  },

  /** Run + (optionally) notify — nightly trigger ya dashboard se */
  run: function (opts, s) {
    Auth.require(s, 'purchase.view');
    var res = Reorder.suggest(opts || {}, s);
    if (res.rows && res.rows.length) {
      Notifications.push('REORDER', 'Reorder suggestions ready',
        res.rows.length + ' items · est. ' + fmtMoney_(res.summary.value) + ' ki purchase', 'INFO',
        opts && opts.locationId, s);
    }
    return res;
  }
};

function fmtMoney_(v) { return (DB.settings().currencySymbol || 'Rs') + ' ' + U.round(v, 0).toLocaleString('en-PK'); }
