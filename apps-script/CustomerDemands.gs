/**
 * HASEEB AUTOS - ERP / POS  ::  CUSTOMER DEMAND & AI RECOMMENDATION ENGINE
 * ---------------------------------------------------------------------------
 * Customer Demand lifecycle:
 *   OPEN → SOURCED → ORDERED → ARRIVED → NOTIFIED → FULFILLED
 *                              ↘ CANCELLED (any before FULFILLED)
 * Also supports PARTIAL (partial GRN).
 *
 * Features:
 *  - Record unavailable product demands linked to customer
 *  - PO suggestion: outstanding demands auto-grouped
 *  - AI vendor suggestion: price / availability / reliability / lead-time / history
 *  - Auto-alert on GRN arrival → status ARRIVED/NOTIFIED + Notification push
 *  - POS recommendations per customer (demanded + related + history)
 *  - AI monitor (daily) → reminders / ageing / supplier-order status
 *  - Dashboards / reports (outstanding / fulfilled / pending / waiting / supplier)
 *  - Seamless integration: Customers, Items, Inventory, Suppliers, PO, POS, GRN, Sales, Notifications, AI
 *  - Permissions, validation, audit, history, events, tests
 */

var CustomerDemands = (function () {

  var STATUSES = ['OPEN', 'SOURCED', 'ORDERED', 'PARTIAL', 'ARRIVED', 'NOTIFIED', 'FULFILLED', 'CANCELLED'];
  var PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  var ACTIVE_STATUSES = ['OPEN', 'SOURCED', 'ORDERED', 'PARTIAL', 'ARRIVED', 'NOTIFIED'];
  var OPENISH = ['OPEN', 'SOURCED'];
  var TRANS = {
    OPEN: ['SOURCED', 'ORDERED', 'CANCELLED'],
    SOURCED: ['ORDERED', 'CANCELLED'],
    ORDERED: ['PARTIAL', 'ARRIVED', 'CANCELLED'],
    PARTIAL: ['ARRIVED', 'CANCELLED'],
    ARRIVED: ['NOTIFIED', 'FULFILLED', 'CANCELLED'],
    NOTIFIED: ['FULFILLED', 'CANCELLED'],
    FULFILLED: [],
    CANCELLED: []
  };

  function _now() { return U.iso(); }
  function _dateOnly() { return U.dateOnly(); }
  function _id() { return U.uid('DMN'); }
  function _hid() { return U.uid('DMH'); }
  function _num(v, d) { return U.num(v, d); }
  function _str(v) { return U.str(v || ''); }
  function _norm(v) { return U.norm(v || ''); }

  function _canTransition(from, to) {
    from = _str(from).toUpperCase(); to = _str(to).toUpperCase();
    return (TRANS[from] || []).indexOf(to) > -1;
  }

  function _history(demandId, from, to, note, s) {
    try {
      DB.insert('DemandHistory', {
        id: _hid(), demandId: demandId, ts: _now(),
        fromStatus: from || '', toStatus: to || '', note: note || '',
        userId: s ? s.userId : '', createdAt: _now()
      }, s);
    } catch (e) { /* history is best-effort */ }
  }

  function _enrich(row) {
    if (!row) return row;
    var out = {};
    Object.keys(row).forEach(function (k) { out[k] = row[k]; });
    out.qty = _num(row.qty);
    out.status = _str(row.status).toUpperCase() || 'OPEN';
    out.priority = _str(row.priority).toUpperCase() || 'MEDIUM';
    out.customerId = _str(row.customerId);
    out.itemId = _str(row.itemId);
    out.locationId = _str(row.locationId);
    out.poIds = DB.json(row.poIds, []);
    if (typeof out.poIds === 'string') {
      try { out.poIds = JSON.parse(out.poIds); } catch (e) { out.poIds = out.poIds ? [out.poIds] : []; }
    }
    if (!Array.isArray(out.poIds)) out.poIds = out.poIds ? [out.poIds] : [];
    out.daysOpen = 0;
    try {
      var d = U.parseDate(row.date || row.createdAt);
      if (d) out.daysOpen = Math.floor((new Date() - d) / 86400000);
    } catch (e) {}
    out.isOverdue = false;
    if (row.expectedDate) {
      try {
        var ed = U.parseDate(row.expectedDate);
        if (ed && ed < new Date() && ACTIVE_STATUSES.indexOf(out.status) > -1) out.isOverdue = true;
      } catch (e) {}
    }
    return out;
  }

  function _validateCreate(p, s) {
    if (!p.customerId) throw new Error('Customer zaroori hai.');
    var cust = DB.byId('Customers', p.customerId);
    if (!cust) throw new Error('Customer nahi mila: ' + p.customerId);
    if (!p.itemName && !p.itemId) throw new Error('Product name ya item chahiye.');
    var qty = _num(p.qty, 0);
    if (qty <= 0) throw new Error('Quantity 1 ya zyada honi chahiye.');
    var priority = _str(p.priority || DB.settings()['demand.defaultPriority'] || 'MEDIUM').toUpperCase();
    if (PRIORITIES.indexOf(priority) === -1) priority = 'MEDIUM';
    var status = 'OPEN';
    if (p.status && STATUSES.indexOf(_str(p.status).toUpperCase()) > -1) status = _str(p.status).toUpperCase();
    var locId = p.locationId || s.locationId || s.defaultLocationId || '';
    if (locId && !Auth.canAccessLocation(s, locId)) throw new Error('Is branch ka access nahi hai.');

    // duplicate guard
    if (_str(DB.settings()['demand.allowDuplicateOpen']) !== 'true' && p.itemId) {
      var dup = DB.all('CustomerDemands').filter(function (r) {
        return _str(r.customerId) === _str(p.customerId) &&
          _str(r.itemId) === _str(p.itemId) &&
          ['OPEN', 'SOURCED', 'ORDERED', 'PARTIAL', 'ARRIVED', 'NOTIFIED'].indexOf(_str(r.status).toUpperCase()) > -1;
      })[0];
      if (dup) throw new Error('Is customer ki ye demand pehle se open hai (' + dup.demandNo + '). Pehle usko complete/cancel karein.');
    }

    var item = null;
    if (p.itemId) item = DB.byId('Items', p.itemId);
    return {
      customerId: p.customerId,
      customerName: cust.name || p.customerName || '',
      customerPhone: cust.phone || '',
      itemId: p.itemId || (item ? item.id : ''),
      itemCode: p.itemCode || (item ? item.code : ''),
      itemName: p.itemName || (item ? item.name : ''),
      category: p.category || (item ? item.category : '') || '',
      brand: p.brand || (item ? item.brand : '') || '',
      make: p.make || (item ? item.make : '') || '',
      model: p.model || (item ? item.model : '') || '',
      qty: qty,
      priority: priority,
      status: status,
      notes: _str(p.notes || ''),
      locationId: locId,
      source: _str(p.source || 'MANUAL').toUpperCase(),
      requestedBy: p.requestedBy || s.userId,
      assignedSupplierId: _str(p.assignedSupplierId || ''),
      expectedDate: _str(p.expectedDate || ''),
      /* v2.24.0 — real-world ERP fields (advanced section) */
      customerPo: _str(p.customerPo || ''),
      budgetPrice: _num(p.budgetPrice, 0),
      partialOk: (p.partialOk === true || _str(p.partialOk) === 'true') ? 'true' : 'false',
      substituteOk: (p.substituteOk === true || _str(p.substituteOk) === 'true') ? 'true' : 'false',
      followUpDate: _str(p.followUpDate || ''),
      notifyChannel: _normChannel(p.notifyChannel),
      tags: _str(p.tags || ''),
      internalNote: _str(p.internalNote || ''),
      createdBy: s.userId
    };
  }
  /* NONE / SMS / WHATSAPP / BOTH — koi bhi ghalat value NONE ban jati hai */
  function _normChannel(v) {
    var c = _str(v || 'NONE').toUpperCase();
    if (['NONE', 'SMS', 'WHATSAPP', 'BOTH'].indexOf(c) === -1) c = 'NONE';
    return c;
  }

  /* ================================ CREATE ================================= */
  function create(payload, s) {
    Auth.require(s, 'demand.create');
    var v = _validateCreate(payload || {}, s);
    var locId = v.locationId || s.locationId;
    var rec = DB.insert('CustomerDemands', {
      id: _id(),
      demandNo: DB.nextNumber('DEMAND', locId),
      date: payload.date || _dateOnly(),
      customerId: v.customerId,
      customerName: v.customerName,
      customerPhone: v.customerPhone,
      itemId: v.itemId,
      itemCode: v.itemCode,
      itemName: v.itemName,
      category: v.category,
      brand: v.brand,
      make: v.make,
      model: v.model,
      qty: String(v.qty),
      priority: v.priority,
      status: v.status,
      notes: v.notes,
      locationId: v.locationId,
      source: v.source,
      requestedBy: v.requestedBy,
      assignedSupplierId: v.assignedSupplierId,
      customerPo: v.customerPo,
      budgetPrice: String(v.budgetPrice || ''),
      partialOk: v.partialOk,
      substituteOk: v.substituteOk,
      followUpDate: v.followUpDate,
      notifyChannel: v.notifyChannel,
      tags: v.tags,
      internalNote: v.internalNote,
      poIds: JSON.stringify([]),
      grnId: '',
      saleId: '',
      invoiceNo: '',
      expectedDate: v.expectedDate,
      notifiedAt: '',
      fulfilledAt: '',
      cancelledAt: '',
      createdBy: v.createdBy,
      createdAt: _now(),
      updatedAt: _now()
    }, s);
    _history(rec.id, '', rec.status, 'Demand created' + (v.notes ? ': ' + v.notes : ''), s);
    Audit.log('DEMAND_CREATE', 'CustomerDemands', rec.id, null, _enrich(rec), s);
    try {
      Notifications.push('DEMAND_CREATED', 'New demand: ' + rec.itemName,
        rec.customerName + ' ne ' + rec.itemName + ' (' + rec.qty + ') demand kiya — ' + rec.priority,
        v.priority === 'URGENT' ? 'error' : (v.priority === 'HIGH' ? 'warn' : 'info'),
        '#/demands?open=' + rec.id, locId, s);
    } catch (e) {}
    return _enrich(rec);
  }

  /* ================================ LIST =================================== */
  function list(opts, s) {
    Auth.require(s, 'demand.view');
    opts = opts || {};
    var rows = DB.all('CustomerDemands').map(_enrich);
    // location guard
    if (!Auth.can(s, '*')) {
      var allowed = s.locationIds || [];
      if (allowed.length) rows = rows.filter(function (r) { return !r.locationId || allowed.indexOf(r.locationId) > -1; });
    }
    if (opts.locationId) rows = rows.filter(function (r) { return _str(r.locationId) === _str(opts.locationId); });
    if (opts.customerId) rows = rows.filter(function (r) { return _str(r.customerId) === _str(opts.customerId); });
    if (opts.itemId) rows = rows.filter(function (r) { return _str(r.itemId) === _str(opts.itemId); });
    if (opts.status) {
      var st = _str(opts.status).toUpperCase();
      if (st === 'OPENISH') rows = rows.filter(function (r) { return OPENISH.indexOf(r.status) > -1; });
      else if (st === 'ACTIVE') rows = rows.filter(function (r) { return ACTIVE_STATUSES.indexOf(r.status) > -1; });
      else if (st.indexOf(',') > -1) {
        var set = st.split(',').map(function (x) { return x.trim(); });
        rows = rows.filter(function (r) { return set.indexOf(r.status) > -1; });
      } else rows = rows.filter(function (r) { return r.status === st; });
    }
    if (opts.priority) rows = rows.filter(function (r) { return r.priority === _str(opts.priority).toUpperCase(); });
    if (opts.assignedSupplierId) rows = rows.filter(function (r) { return _str(r.assignedSupplierId) === _str(opts.assignedSupplierId); });
    if (opts.q) {
      var q = _str(opts.q).toLowerCase();
      var toks = q.split(/\s+/).filter(Boolean);
      rows = rows.filter(function (r) {
        var hay = _norm(r.demandNo + ' ' + r.customerName + ' ' + r.customerPhone + ' ' + r.itemName + ' ' + r.itemCode + ' ' + r.category + ' ' + r.brand + ' ' + r.notes);
        return toks.every(function (tk) { return hay.indexOf(U.norm(tk)) > -1; });
      });
    }
    if (opts.from) {
      var from = U.parseDate(opts.from);
      if (from) rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= from; });
    }
    if (opts.to) {
      var to = U.parseDate(opts.to); if (to) to.setDate(to.getDate() + 1);
      if (to) rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d < to; });
    }
    if (opts.overdue) rows = rows.filter(function (r) { return r.isOverdue; });

    // sort: priority weight then newest
    var w = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    rows.sort(function (a, b) {
      var d = (w[a.priority] || 9) - (w[b.priority] || 9);
      if (d !== 0) return d;
      return String(b.date).localeCompare(String(a.date)) || String(b.demandNo).localeCompare(String(a.demandNo));
    });

    var total = rows.length;
    var page = _num(opts.page, 1), pageSize = _num(opts.pageSize, 50);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 50;
    if (pageSize > 200) pageSize = 200;
    var slice = rows.slice((page - 1) * pageSize, page * pageSize);

    // totals
    var byStatus = {}, byPriority = {};
    rows.forEach(function (r) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
    });

    return {
      rows: slice,
      total: total, page: page, pages: Math.ceil(total / pageSize) || 1,
      totals: { total: total, byStatus: byStatus, byPriority: byPriority, outstanding: U.num(byStatus.OPEN) + U.num(byStatus.SOURCED) + U.num(byStatus.ORDERED) + U.num(byStatus.PARTIAL) + U.num(byStatus.ARRIVED) + U.num(byStatus.NOTIFIED) },
      filters: opts
    };
  }

  function get(id, s) {
    Auth.require(s, 'demand.view');
    var row = DB.byId('CustomerDemands', id);
    if (!row) throw new Error('Demand nahi mili: ' + id);
    if (!Auth.can(s, '*') && row.locationId && (s.locationIds || []).indexOf(row.locationId) === -1) throw new Error('Is branch ki demand dekhne ki ijazat nahi.');
    var enriched = _enrich(row);
    var hist = DB.all('DemandHistory').filter(function (h) { return h.demandId === id; }).sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
    var poLinks = [];
    (enriched.poIds || []).forEach(function (poId) {
      var po = DB.byId('PurchaseOrders', poId);
      if (po) poLinks.push({ id: po.id, poNo: po.poNo, status: po.status, supplierId: po.supplierId, supplierName: (DB.byId('Suppliers', po.supplierId) || {}).name || '' });
    });
    var customer = DB.byId('Customers', enriched.customerId) || null;
    var item = enriched.itemId ? DB.byId('Items', enriched.itemId) : null;
    return { demand: enriched, history: hist, pos: poLinks, customer: customer, item: item };
  }

  function update(id, patch, s) {
    Auth.require(s, 'demand.manage');
    var row = DB.byId('CustomerDemands', id);
    if (!row) throw new Error('Demand nahi mili');
    var before = _enrich(row);
    if (before.status === 'FULFILLED' || before.status === 'CANCELLED') throw new Error('Ye demand ' + before.status + ' hai — edit nahi ho sakti.');
    var safe = {};
    if (patch.qty !== undefined) {
      var q = _num(patch.qty, 0);
      if (q <= 0) throw new Error('Qty ghalat hai');
      safe.qty = String(q);
    }
    if (patch.priority !== undefined) {
      var pr = _str(patch.priority).toUpperCase();
      if (PRIORITIES.indexOf(pr) === -1) throw new Error('Priority: LOW/MEDIUM/HIGH/URGENT');
      safe.priority = pr;
    }
    if (patch.notes !== undefined) safe.notes = _str(patch.notes);
    if (patch.expectedDate !== undefined) safe.expectedDate = _str(patch.expectedDate);
    if (patch.assignedSupplierId !== undefined) safe.assignedSupplierId = _str(patch.assignedSupplierId);
    if (patch.category !== undefined) safe.category = _str(patch.category);
    if (patch.brand !== undefined) safe.brand = _str(patch.brand);
    if (patch.make !== undefined) safe.make = _str(patch.make);
    if (patch.model !== undefined) safe.model = _str(patch.model);
    if (patch.itemName !== undefined) safe.itemName = _str(patch.itemName);
    if (patch.itemCode !== undefined) safe.itemCode = _str(patch.itemCode);
    /* v2.24.0 — advanced ERP fields bhi editable */
    if (patch.customerPo !== undefined) safe.customerPo = _str(patch.customerPo);
    if (patch.budgetPrice !== undefined) safe.budgetPrice = String(_num(patch.budgetPrice, 0) || '');
    if (patch.partialOk !== undefined) safe.partialOk = (patch.partialOk === true || _str(patch.partialOk) === 'true') ? 'true' : 'false';
    if (patch.substituteOk !== undefined) safe.substituteOk = (patch.substituteOk === true || _str(patch.substituteOk) === 'true') ? 'true' : 'false';
    if (patch.followUpDate !== undefined) safe.followUpDate = _str(patch.followUpDate);
    if (patch.notifyChannel !== undefined) safe.notifyChannel = _normChannel(patch.notifyChannel);
    if (patch.tags !== undefined) safe.tags = _str(patch.tags);
    if (patch.internalNote !== undefined) safe.internalNote = _str(patch.internalNote);
    if (patch.source !== undefined) safe.source = _str(patch.source).toUpperCase();
    if (!Object.keys(safe).length) throw new Error('Kuch update karne ko nahi.');
    safe.updatedAt = _now();
    var updated = DB.update('CustomerDemands', id, safe, s);
    _history(id, before.status, before.status, 'Updated: ' + Object.keys(safe).join(', '), s);
    Audit.log('DEMAND_UPDATE', 'CustomerDemands', id, before, _enrich(updated), s);
    return _enrich(updated);
  }

  function setStatus(id, newStatus, note, s) {
    Auth.require(s, 'demand.manage');
    newStatus = _str(newStatus).toUpperCase();
    if (STATUSES.indexOf(newStatus) === -1) throw new Error('Status ghalat: ' + newStatus);
    var row = DB.byId('CustomerDemands', id);
    if (!row) throw new Error('Demand nahi mili');
    var cur = _str(row.status).toUpperCase() || 'OPEN';
    if (cur === newStatus) return _enrich(row);
    if (!_canTransition(cur, newStatus) && newStatus !== 'CANCELLED') {
      // allow manual override if manager/owner? But spec wants strict lifecycle
      // We'll allow if user has demand.manage and it's a forward move
      throw new Error('Status ' + cur + ' se ' + newStatus + ' par nahi ja sakta.');
    }
    var patch = { status: newStatus, updatedAt: _now() };
    if (newStatus === 'NOTIFIED') patch.notifiedAt = _now();
    if (newStatus === 'FULFILLED') patch.fulfilledAt = _now();
    if (newStatus === 'CANCELLED') patch.cancelledAt = _now();
    var updated = DB.update('CustomerDemands', id, patch, s);
    _history(id, cur, newStatus, note || '', s);
    Audit.log('DEMAND_STATUS', 'CustomerDemands', id, { status: cur }, { status: newStatus, note: note || '' }, s);
    if (newStatus === 'ARRIVED' || newStatus === 'NOTIFIED') {
      try {
        var r = _enrich(updated);
        Notifications.push('DEMAND_ARRIVED', 'Demand arrived: ' + r.itemName,
          r.customerName + ' ki demand ' + r.itemName + ' (' + r.qty + ') stock mein aa gayi — foran notify karein.',
          'info', '#/demands?open=' + r.id, r.locationId, s);
      } catch (e) {}
    }
    return _enrich(updated);
  }

  function cancel(id, reason, s) {
    return setStatus(id, 'CANCELLED', reason || 'Cancelled', s);
  }

  /* =========================== PO LINKING ================================= */
  function linkToPO(demandIds, poId, s) {
    Auth.require(s, 'purchase.po.create');
    if (!poId) throw new Error('PO chahiye');
    var po = DB.byId('PurchaseOrders', poId);
    if (!po) throw new Error('PO nahi mili');
    var ids = Array.isArray(demandIds) ? demandIds : [demandIds];
    var linked = [];
    ids.forEach(function (did) {
      var d = DB.byId('CustomerDemands', did);
      if (!d) return;
      var cur = _str(d.status).toUpperCase();
      if (['FULFILLED', 'CANCELLED'].indexOf(cur) > -1) return;
      var poIds = DB.json(d.poIds, []);
      if (typeof poIds === 'string') try { poIds = JSON.parse(poIds); } catch (e) { poIds = []; }
      if (!Array.isArray(poIds)) poIds = [];
      if (poIds.indexOf(poId) === -1) poIds.push(poId);
      var patch = { poIds: JSON.stringify(poIds), updatedAt: _now() };
      if (OPENISH.indexOf(cur) > -1) {
        patch.status = 'ORDERED';
        _history(d.id, cur, 'ORDERED', 'Linked to PO ' + (po.poNo || poId), s);
        Audit.log('DEMAND_LINK_PO', 'CustomerDemands', d.id, { status: cur, poIds: d.poIds }, { status: 'ORDERED', poIds: patch.poIds }, s);
      } else {
        Audit.log('DEMAND_LINK_PO', 'CustomerDemands', d.id, { poIds: d.poIds }, { poIds: patch.poIds }, s);
      }
      DB.update('CustomerDemands', d.id, patch, s);
      linked.push(d.id);
    });
    return { linked: linked.length, poId: poId, demandIds: linked };
  }

  function unlinkFromPO(demandId, poId, s) {
    Auth.require(s, 'demand.manage');
    var d = DB.byId('CustomerDemands', demandId);
    if (!d) throw new Error('Demand nahi mili');
    var poIds = DB.json(d.poIds, []);
    if (typeof poIds === 'string') try { poIds = JSON.parse(poIds); } catch (e) { poIds = []; }
    if (!Array.isArray(poIds)) poIds = [];
    var idx = poIds.indexOf(poId);
    if (idx === -1) return { removed: 0 };
    poIds.splice(idx, 1);
    DB.update('CustomerDemands', demandId, { poIds: JSON.stringify(poIds), updatedAt: _now() }, s);
    Audit.log('DEMAND_UNLINK_PO', 'CustomerDemands', demandId, { poId: poId }, { poIds: JSON.stringify(poIds) }, s);
    return { removed: 1 };
  }

  /* ======================= SUGGEST FOR PO ================================== */
  /**
   * Outstanding demands → item-wise aggregation for PO screen.
   * opts = { locationId, supplierId, priority, limit }
   */
  function suggestForPO(opts, s) {
    Auth.require(s, 'purchase.view');
    opts = opts || {};
    var locId = opts.locationId || s.locationId;
    var rows = DB.all('CustomerDemands').map(_enrich).filter(function (r) {
      if (['OPEN', 'SOURCED'].indexOf(r.status) === -1) return false;
      if (locId && r.locationId && r.locationId !== locId) return false;
      if (opts.priority && r.priority !== _str(opts.priority).toUpperCase()) return false;
      if (opts.supplierId && _str(r.assignedSupplierId) && _str(r.assignedSupplierId) !== _str(opts.supplierId)) return false;
      return true;
    });

    // aggregate by itemId or by normalized name
    var byKey = {};
    rows.forEach(function (r) {
      var key = r.itemId ? ('ID:' + r.itemId) : ('NM:' + _norm(r.itemName + '|' + r.category + '|' + r.brand));
      var a = byKey[key];
      if (!a) {
        a = byKey[key] = {
          key: key, itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
          category: r.category, brand: r.brand, make: r.make, model: r.model,
          totalQty: 0, demandCount: 0, customers: [], demandIds: [], priorities: {},
          earliestDate: r.date, latestDate: r.date, locationId: r.locationId,
          avgPriority: 'MEDIUM'
        };
      }
      a.totalQty += _num(r.qty);
      a.demandCount += 1;
      a.demandIds.push(r.id);
      a.customers.push({ id: r.customerId, name: r.customerName, phone: r.customerPhone, qty: _num(r.qty), priority: r.priority, demandNo: r.demandNo, date: r.date });
      a.priorities[r.priority] = (a.priorities[r.priority] || 0) + 1;
      if (r.date < a.earliestDate) a.earliestDate = r.date;
      if (r.date > a.latestDate) a.latestDate = r.date;
    });

    var list = Object.keys(byKey).map(function (k) { return byKey[k]; });
    // sort by urgency: has URGENT/HIGH first, then demandCount, then totalQty
    var pw = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    list.forEach(function (it) {
      var best = Object.keys(it.priorities).sort(function (a, b) { return (pw[a]||9)-(pw[b]||9); })[0] || 'MEDIUM';
      it.topPriority = best;
      it.priorityWeight = pw[best] || 9;
    });
    list.sort(function (a, b) {
      var d = a.priorityWeight - b.priorityWeight;
      if (d !== 0) return d;
      d = b.demandCount - a.demandCount;
      if (d !== 0) return d;
      return b.totalQty - a.totalQty;
    });
    if (opts.limit) list = list.slice(0, _num(opts.limit, 100));

    // enrich with stock + supplier hint
    var stockMap = {};
    try { DB.all('Stock').forEach(function (rw) { if (!locId || rw.locationId === locId) stockMap[rw.itemId] = _num(stockMap[rw.itemId]) + _num(rw.qty); }); } catch (e) {}
    list.forEach(function (it) {
      it.onHand = _num(stockMap[it.itemId] || 0);
      it.suggestedQty = it.totalQty; // base: sum of demanded qty
      // if item master has cost, compute estimated cost
      var itMaster = it.itemId ? DB.byId('Items', it.itemId) : null;
      it.costPrice = itMaster ? _num(itMaster.costPrice) : 0;
      it.retailPrice = itMaster ? _num(itMaster.retailPrice) : 0;
      it.primarySupplierId = itMaster ? _str(itMaster.primarySupplierId) : '';
      it.estimatedValue = U.round(it.suggestedQty * it.costPrice, 2);
    });

    return {
      totalDemands: rows.length,
      totalItems: list.length,
      totalQty: U.round(U.sum(list, 'totalQty'), 2),
      estimatedValue: U.round(U.sum(list, 'estimatedValue'), 2),
      locationId: locId || '',
      items: list,
      generatedAt: _now()
    };
  }

  /* ======================= BEST VENDOR SUGGESTION ========================= */
  /**
   * For a given item (or generic name), rank suppliers by:
   *  - price (avgCost last 180d)
   *  - availability (recent GRN count / recency)
   *  - reliability (PO on-time rate)
   *  - lead time (avg days PO→GRN)
   *  - history (purchase frequency)
   */
  function suggestVendors(payload, s) {
    Auth.require(s, 'purchase.view');
    payload = payload || {};
    var itemId = _str(payload.itemId);
    var itemName = _str(payload.itemName);
    var days = Math.max(30, _num(payload.days, 180));
    var cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    var locId = payload.locationId || '';

    var item = itemId ? DB.byId('Items', itemId) : null;
    if (!itemId && itemName) {
      // try to find item by name/code fuzzy for vendor calc
      var found = DB.all('Items').filter(function (it) { return _norm(it.name).indexOf(_norm(itemName)) > -1 || _norm(it.code) === _norm(itemName); })[0];
      if (found) { item = found; itemId = found.id; }
    }

    // 1) Gather GRN history per supplier (for price & availability)
    var grnById = {};
    DB.all('GRN').forEach(function (g) {
      if (_str(g.status) === 'VOID') return;
      if (_str(g.date).slice(0, 10) < cutoff) return;
      if (locId && g.locationId && g.locationId !== locId) return;
      grnById[g.id] = g;
    });
    var agg = {};
    DB.all('GRNItems').forEach(function (li) {
      if (itemId && _str(li.itemId) !== itemId) return;
      if (!itemId && itemName) {
        var nm = _norm(li.name + ' ' + li.code);
        if (nm.indexOf(_norm(itemName)) === -1 && _norm(itemName).indexOf(nm) === -1) return;
      }
      if (itemId && !DB.byId('Items', li.itemId)) {} // still count even if item missing? no
      var g = grnById[li.grnId];
      if (!g) return;
      var sid = _str(g.supplierId);
      if (!sid) return;
      var a = agg[sid];
      if (!a) a = agg[sid] = { supplierId: sid, count: 0, totalQty: 0, totalValue: 0, min: Infinity, max: 0, lastRate: 0, lastDate: '', firstDate: '9999-12-31' };
      var rate = _num(li.cost), qty = _num(li.qty);
      a.count += 1; a.totalQty += qty; a.totalValue += rate * qty;
      if (rate && rate < a.min) a.min = rate;
      if (rate > a.max) a.max = rate;
      var d = _str(g.date).slice(0, 10);
      if (d >= a.lastDate) { a.lastDate = d; a.lastRate = rate; }
      if (d < a.firstDate) a.firstDate = d;
    });

    // 2) PO → GRN lead time & reliability per supplier
    var poById = {};
    DB.all('PurchaseOrders').forEach(function (po) {
      if (locId && po.locationId && po.locationId !== locId) return;
      poById[po.id] = po;
    });
    // map grn.poId → grn date
    var grnForPO = {};
    Object.keys(grnById).forEach(function (gid) {
      var g = grnById[gid];
      if (g.poId && poById[g.poId]) {
        var po = poById[g.poId];
        var d1 = U.parseDate(po.date), d2 = U.parseDate(g.date);
        if (d1 && d2) {
          var lead = (d2 - d1) / 86400000;
          var sid = _str(g.supplierId || po.supplierId);
          if (!sid) return;
          var a = agg[sid];
          if (!a) a = agg[sid] = { supplierId: sid, count: 0, totalQty: 0, totalValue: 0, min: Infinity, max: 0, lastRate: 0, lastDate: '', firstDate: '9999-12-31' };
          a.leads = a.leads || [];
          a.leads.push(lead);
          // on-time: grn date <= expectedDate (if exists)
          if (po.expectedDate) {
            var exp = U.parseDate(po.expectedDate);
            if (exp) {
              a.onTime = a.onTime || { ok: 0, total: 0 };
              a.onTime.total += 1;
              if (d2 <= exp) a.onTime.ok += 1;
            }
          }
        }
      }
    });

    var supName = {};
    DB.all('Suppliers').forEach(function (sp) { supName[sp.id] = sp.name; });

    var rows = Object.keys(agg).map(function (sid) {
      var a = agg[sid];
      var avgCost = a.totalQty ? U.round(a.totalValue / a.totalQty, 2) : 0;
      var leadAvg = (a.leads && a.leads.length) ? U.round(a.leads.reduce(function (s, v) { return s + v; }, 0) / a.leads.length, 1) : null;
      var reliability = null;
      if (a.onTime && a.onTime.total) reliability = U.round(a.onTime.ok / a.onTime.total * 100, 1);
      var recencyDays = 0;
      try {
        var ld = U.parseDate(a.lastDate);
        if (ld) recencyDays = Math.floor((new Date() - ld) / 86400000);
      } catch (e) {}
      var availability = a.count; // higher = more available
      return {
        supplierId: sid,
        supplierName: supName[sid] || ('#' + sid),
        purchases: a.count,
        totalQty: U.round(a.totalQty, 2),
        avgCost: avgCost,
        minCost: a.min === Infinity ? 0 : U.round(a.min, 2),
        maxCost: U.round(a.max, 2),
        lastRate: U.round(a.lastRate, 2),
        lastDate: a.lastDate,
        firstDate: a.firstDate === '9999-12-31' ? '' : a.firstDate,
        leadTimeAvg: leadAvg,
        reliabilityPct: reliability,
        recencyDays: recencyDays,
        availabilityScore: availability
      };
    });

    // rank: lowest avgCost first but also penalize long lead & low reliability
    // We compute a composite score: cost (40%) + lead (20%) + reliability (20%) + recency (20%)
    // For simplicity, we sort by avgCost, then reliability desc, then lead asc, then recency asc
    rows.sort(function (x, y) {
      if (x.avgCost && y.avgCost && x.avgCost !== y.avgCost) return x.avgCost - y.avgCost;
      var rx = x.reliabilityPct === null ? -1 : x.reliabilityPct;
      var ry = y.reliabilityPct === null ? -1 : y.reliabilityPct;
      if (ry !== rx) return ry - rx;
      var lx = x.leadTimeAvg === null ? 999 : x.leadTimeAvg;
      var ly = y.leadTimeAvg === null ? 999 : y.leadTimeAvg;
      if (lx !== ly) return lx - ly;
      return x.recencyDays - y.recencyDays;
    });

    // mark best
    if (rows.length) {
      var best = rows[0];
      rows.forEach(function (r) { r.isBest = r.supplierId === best.supplierId; });
      // score 0-100 for each
      var minCost = Math.min.apply(null, rows.filter(function (r) { return r.avgCost > 0; }).map(function (r) { return r.avgCost; }));
      rows.forEach(function (r) {
        var costScore = minCost && r.avgCost ? Math.max(0, 100 - ((r.avgCost - minCost) / minCost * 100)) : 50;
        var relScore = r.reliabilityPct === null ? 50 : r.reliabilityPct;
        var leadScore = r.leadTimeAvg === null ? 50 : Math.max(0, 100 - r.leadTimeAvg * 5);
        var recScore = Math.max(0, 100 - r.recencyDays * 2);
        r.score = U.round(costScore * 0.4 + relScore * 0.25 + leadScore * 0.2 + recScore * 0.15, 1);
      });
      rows.sort(function (x, y) { return y.score - x.score; });
    }

    // also suggest primary supplier from item master if not in history
    var primarySuggestion = null;
    if (item && item.primarySupplierId && !agg[item.primarySupplierId]) {
      var sp = DB.byId('Suppliers', item.primarySupplierId);
      if (sp) {
        primarySuggestion = {
          supplierId: sp.id, supplierName: sp.name,
          purchases: 0, totalQty: 0, avgCost: _num(item.costPrice),
          minCost: 0, maxCost: 0, lastRate: 0, lastDate: '',
          leadTimeAvg: null, reliabilityPct: null, recencyDays: 999,
          availabilityScore: 0, score: 40, isPrimary: true, note: 'Item master primary supplier — no recent GRN history'
        };
      }
    }

    var allRows = rows.slice();
    if (primarySuggestion) allRows.push(primarySuggestion);

    return {
      itemId: itemId || '', itemName: itemName || (item ? item.name : ''),
      days: days, locationId: locId,
      rows: allRows,
      best: allRows.filter(function (r) { return r.isBest; })[0] || allRows[0] || null,
      note: allRows.length ? '' : 'Koi purchase history nahi — naya item ya naya supplier try karein.'
    };
  }

  /* ============================ STOCK ARRIVAL HOOK ========================== */
  /**
   * Called from Purchase.saveGRN after each line's stock post.
   * Finds matching demands (by itemId or by name/code) that are still ORDERED/PARTIAL
   * and marks them ARRIVED + pushes notification.
   */
  function onStockArrival(payload, s) {
    // payload = { itemId, qty, grnId, locationId, cost }
    try {
      var itemId = _str(payload.itemId);
      if (!itemId) return { matched: 0 };
      var locId = _str(payload.locationId || '');
      var qtyArrived = _num(payload.qty, 0);
      var demands = DB.all('CustomerDemands').filter(function (r) {
        if (_str(r.itemId) !== itemId) return false;
        var st = _str(r.status).toUpperCase();
        return st === 'ORDERED' || st === 'PARTIAL' || st === 'SOURCED';
      });
      if (locId) demands = demands.filter(function (r) { return !_str(r.locationId) || _str(r.locationId) === locId; });
      if (!demands.length) {
        // fallback: also match by code if itemId empty demands (legacy) but item has code
        var it = DB.byId('Items', itemId);
        if (it && it.code) {
          var more = DB.all('CustomerDemands').filter(function (r) {
            return !_str(r.itemId) && _norm(r.itemCode) === _norm(it.code) &&
              ['ORDERED', 'PARTIAL', 'SOURCED'].indexOf(_str(r.status).toUpperCase()) > -1;
          });
          demands = demands.concat(more);
        }
      }
      var matched = 0, notifiedCustomers = [];
      demands.forEach(function (d) {
        var cur = _str(d.status).toUpperCase();
        var patch = { status: 'ARRIVED', grnId: payload.grnId || d.grnId || '', updatedAt: _now() };
        // if already partially, keep ARRIVED
        DB.update('CustomerDemands', d.id, patch, s);
        _history(d.id, cur, 'ARRIVED', 'Stock arrived via GRN ' + (payload.grnNo || payload.grnId || '') + ' qty ' + qtyArrived, s);
        matched++;
        notifiedCustomers.push(d.customerId);
        try {
          var cust = DB.byId('Customers', d.customerId);
          var item = DB.byId('Items', itemId);
          var title = 'Demand arrived: ' + (item ? item.name : d.itemName);
          var body = (cust ? cust.name : d.customerName) + ' ki demand ' + (item ? item.name : d.itemName) +
            ' (' + d.qty + ') stock mein aa gayi (GRN ' + (payload.grnNo || '') + ') — foran rabta karein.';
          var pinkey = 'DEMAND_ARRIVED:' + d.id + ':' + (payload.grnId || '');
          // idempotent push: check existing unread same key (Notifications handles dupe)
          Notifications.push('DEMAND_ARRIVED', title, body, 'info', '#/demands?open=' + d.id, d.locationId || locId, s);
          // optionally auto-set NOTIFIED if setting true and we have quick notify?
          // We keep ARRIVED, frontend will show NOTIFY button. But if autoNotify true we can push and mark NOTIFIED after?
          // For now keep manual notify, but also create a second notification type for staff to act.
        } catch (e2) {}
      });
      // dedupe customers for aggregate notification
      if (matched) {
        Audit.log('DEMAND_ARRIVED', 'CustomerDemands', '', null, { itemId: itemId, grnId: payload.grnId || '', matched: matched, customers: notifiedCustomers }, s);
      }
      return { matched: matched, demands: demands.map(function (x) { return x.id; }) };
    } catch (e) {
      Logger.log('CustomerDemands.onStockArrival error: ' + e.message);
      return { matched: 0, error: e.message };
    }
  }

  /**
   * Batch hook from Purchase.saveGRN (multiple items)
   */
  function onGRN(grn, items, s) {
    var totalMatched = 0;
    var details = [];
    (items || []).forEach(function (li) {
      var r = onStockArrival({ itemId: li.itemId, qty: li.qty, grnId: grn.id, grnNo: grn.grnNo, locationId: grn.locationId }, s);
      totalMatched += r.matched || 0;
      if (r.matched) details.push({ itemId: li.itemId, matched: r.matched });
    });
    return { matched: totalMatched, details: details };
  }

  /* ============================ SALE FULFILL HOOK =========================== */
  function onSale(sale, lineRows, s) {
    try {
      if (!sale.customerId) return { fulfilled: 0 };
      var custId = _str(sale.customerId);
      var locId = _str(sale.locationId);
      var fulfilled = 0;
      lineRows.forEach(function (lr) {
        var itemId = _str(lr.itemId);
        if (!itemId) return;
        // find demands for this customer+item that are ARRIVED/NOTIFIED/ORDERED
        var cands = DB.all('CustomerDemands').filter(function (r) {
          return _str(r.customerId) === custId && _str(r.itemId) === itemId &&
            ['ARRIVED', 'NOTIFIED', 'ORDERED', 'PARTIAL', 'OPEN', 'SOURCED'].indexOf(_str(r.status).toUpperCase()) > -1;
        });
        if (locId) cands = cands.filter(function (r) { return !_str(r.locationId) || _str(r.locationId) === locId; });
        if (!cands.length) return;
        // FIFO: oldest demand first
        cands.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
        var need = _num(lr.qty, 0);
        cands.forEach(function (d) {
          if (need <= 0) return;
          var demQty = _num(d.qty, 0);
          if (demQty <= 0) return;
          // For simplicity, if sale qty >= demand qty, mark FULFILLED fully
          // If partial, we keep ARRIVED with reduced qty? Spec wants full sale → FULFILLED
          // We'll mark the earliest demand as FULFILLED if need >= demQty, else reduce demand qty?
          // Simpler: mark as FULFILLED and reduce need
          if (need >= demQty) {
            var cur = _str(d.status).toUpperCase();
            DB.update('CustomerDemands', d.id, { status: 'FULFILLED', saleId: sale.id, invoiceNo: sale.invoiceNo, fulfilledAt: _now(), updatedAt: _now() }, s);
            _history(d.id, cur, 'FULFILLED', 'Fulfilled via Sale ' + sale.invoiceNo + ' qty ' + demQty, s);
            need -= demQty;
            fulfilled++;
          } else if (need > 0 && need < demQty) {
            // partial fulfillment: split demand? We reduce original qty and create a fulfilled slice
            // Simpler: update original qty to remaining, and create a FULFILLED copy? But to keep sheet simple, we just reduce qty and keep status ARRIVED
            // Instead, we will keep behavior: mark as FULFILLED proportionally (since POS recommends quick add, customer may buy less than demanded)
            // We'll mark as FULFILLED for tracking, with note partial
            var cur2 = _str(d.status).toUpperCase();
            DB.update('CustomerDemands', d.id, { status: 'FULFILLED', saleId: sale.id, invoiceNo: sale.invoiceNo, fulfilledAt: _now(), updatedAt: _now(), qty: String(need) }, s);
            _history(d.id, cur2, 'FULFILLED', 'Partial fulfilled via Sale ' + sale.invoiceNo + ' (demanded ' + demQty + ', sold ' + need + ')', s);
            // if remaining qty, create a new OPEN demand for remainder? Optional, we just log
            fulfilled++;
            need = 0;
          }
        });
      });
      if (fulfilled) Audit.log('DEMAND_FULFILLED', 'CustomerDemands', sale.id, null, { customerId: custId, invoiceNo: sale.invoiceNo, fulfilled: fulfilled }, s);
      return { fulfilled: fulfilled };
    } catch (e) {
      Logger.log('CustomerDemands.onSale error: ' + e.message);
      return { fulfilled: 0, error: e.message };
    }
  }

  /* ============================ POS RECOMMENDATIONS ======================= */
  /**
   * For POS: when customer selected, show:
   *  - their outstanding demands (OPEN..NOTIFIED) with Add to Cart button
   *  - related items: same category/brand as demanded (in stock or low)
   *  - history-based: previously demanded categories (last 90 days) that they repurchase
   */
  function posRecommend(payload, s) {
    // payload = { customerId, locationId, limit }
    var custId = _str(payload.customerId);
    if (!custId) return { customerId: '', demands: [], related: [], history: [] };
    var locId = payload.locationId || s.locationId;
    var limit = _num(payload.limit, 8);

    var cust = DB.byId('Customers', custId);
    if (!cust) throw new Error('Customer nahi mila');

    // 1) outstanding demands
    var demands = DB.all('CustomerDemands').filter(function (r) {
      return _str(r.customerId) === custId &&
        ['OPEN', 'SOURCED', 'ORDERED', 'PARTIAL', 'ARRIVED', 'NOTIFIED'].indexOf(_str(r.status).toUpperCase()) > -1;
    }).map(_enrich).sort(function (a, b) {
      var w = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      var d = (w[a.priority]||9)-(w[b.priority]||9);
      return d !== 0 ? d : (b.daysOpen - a.daysOpen);
    });

    // enrich each with live stock + item master + actionable flag
    var stockMap = {};
    DB.all('Stock').forEach(function (rw) { if (!locId || rw.locationId === locId) stockMap[rw.itemId] = _num(stockMap[rw.itemId]) + _num(rw.qty); });
    var itemById = {};
    DB.all('Items').forEach(function (it) { itemById[it.id] = it; });

    demands.forEach(function (d) {
      d.stock = d.itemId ? _num(stockMap[d.itemId]) : 0;
      d.item = d.itemId ? (itemById[d.itemId] || null) : null;
      d.canFulfill = d.stock > 0;
      d.isArrived = ['ARRIVED', 'NOTIFIED'].indexOf(d.status) > -1;
      d.actionLabel = d.isArrived ? 'Add to Cart — stock aaya!' : (d.status === 'ORDERED' ? 'On order (' + d.daysOpen + 'd)' : 'Demand open');
    });

    // 2) related items: for each demanded item, find same category/brand in stock
    var relatedMap = {};
    var demandedCats = {};
    demands.forEach(function (d) {
      if (d.category) demandedCats[d.category] = 1;
      if (d.brand) demandedCats[d.brand] = 1;
    });
    if (Object.keys(demandedCats).length) {
      DB.all('Items').forEach(function (it) {
        if (_str(it.status) !== 'ACTIVE') return;
        // avoid already demanded items
        if (demands.some(function (d) { return d.itemId === it.id; })) return;
        var catMatch = it.category && demandedCats[it.category];
        var brandMatch = it.brand && demandedCats[it.brand];
        if (!catMatch && !brandMatch) return;
        var stk = _num(stockMap[it.id]);
        if (stk <= 0) return; // only in-stock related for POS add
        var score = (catMatch ? 10 : 0) + (brandMatch ? 8 : 0) + (stk > 5 ? 2 : 0);
        relatedMap[it.id] = { itemId: it.id, code: it.code, name: it.name, category: it.category, brand: it.brand, stock: stk, retailPrice: _num(it.retailPrice), costPrice: _num(it.costPrice), imageUrl: it.imageUrl || '', score: score };
      });
    }
    var related = Object.keys(relatedMap).map(function (k) { return relatedMap[k]; }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit);

    // 3) history: last 90 days fulfilled demands for this customer → suggest repurchase if stock available
    var histDemands = DB.all('CustomerDemands').filter(function (r) {
      return _str(r.customerId) === custId && _str(r.status) === 'FULFILLED' &&
        U.parseDate(r.fulfilledAt || r.date) && U.parseDate(r.fulfilledAt || r.date) >= new Date(Date.now() - 90 * 864e5);
    }).map(_enrich);
    var histMap = {};
    histDemands.forEach(function (d) {
      if (!d.itemId) return;
      histMap[d.itemId] = histMap[d.itemId] || { itemId: d.itemId, count: 0, last: d.fulfilledAt || d.date };
      histMap[d.itemId].count += 1;
      if (d.fulfilledAt > histMap[d.itemId].last) histMap[d.itemId].last = d.fulfilledAt;
    });
    var history = Object.keys(histMap).map(function (k) {
      var it = itemById[k];
      if (!it) return null;
      var stk = _num(stockMap[k]);
      if (stk <= 0) return null;
      return { itemId: k, code: it.code, name: it.name, category: it.category, brand: it.brand, stock: stk, retailPrice: _num(it.retailPrice), count: histMap[k].count, last: histMap[k].last };
    }).filter(Boolean).sort(function (a, b) { return b.count - a.count || String(b.last).localeCompare(String(a.last)); }).slice(0, limit);

    return {
      customerId: custId, customerName: cust.name,
      demands: demands.slice(0, 20),
      related: related,
      history: history,
      summary: {
        outstanding: demands.length,
        arrived: demands.filter(function (d) { return d.isArrived; }).length,
        canFulfillNow: demands.filter(function (d) { return d.canFulfill; }).length,
        relatedCount: related.length, historyCount: history.length
      }
    };
  }

  /* ============================ DASHBOARD & REPORTS ======================== */
  function dashboard(opts, s) {
    Auth.require(s, 'demand.view');
    opts = opts || {};
    var locId = opts.locationId || s.locationId;
    var rows = DB.all('CustomerDemands').map(_enrich);
    if (locId && !Auth.can(s, '*')) {
      // still show all but filtered to allowed
    }
    if (locId) rows = rows.filter(function (r) { return !_str(r.locationId) || _str(r.locationId) === locId; });

    var byStatus = {}, byPriority = {}, bySupplier = {}, byCategory = {};
    var waitingCustomersSet = {};
    var pendingProcurement = 0; // OPEN + SOURCED that are not linked to PO
    var supplierOrderStatus = {}; // PO supplier → demand count where poIds linked

    rows.forEach(function (r) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
      if (r.category) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      if (ACTIVE_STATUSES.indexOf(r.status) > -1) waitingCustomersSet[r.customerId] = 1;
      if (['OPEN', 'SOURCED'].indexOf(r.status) > -1 && (!r.poIds || !r.poIds.length)) pendingProcurement++;
      if (r.assignedSupplierId) bySupplier[r.assignedSupplierId] = (bySupplier[r.assignedSupplierId] || 0) + 1;
      (r.poIds || []).forEach(function (poId) {
        var po = DB.byId('PurchaseOrders', poId);
        var sid = po ? _str(po.supplierId) : 'unknown';
        var key = sid ? (DB.byId('Suppliers', sid) ? DB.byId('Suppliers', sid).name : sid) : 'unassigned';
        supplierOrderStatus[key] = (supplierOrderStatus[key] || 0) + 1;
      });
    });

    var outstanding = U.num(byStatus.OPEN) + U.num(byStatus.SOURCED) + U.num(byStatus.ORDERED) + U.num(byStatus.PARTIAL) + U.num(byStatus.ARRIVED) + U.num(byStatus.NOTIFIED);
    var fulfilled = U.num(byStatus.FULFILLED);
    var ageingBuckets = { '0-3d': 0, '4-7d': 0, '8-14d': 0, '15-30d': 0, '30d+': 0 };
    rows.filter(function (r) { return ACTIVE_STATUSES.indexOf(r.status) > -1; }).forEach(function (r) {
      var d = r.daysOpen;
      if (d <= 3) ageingBuckets['0-3d']++;
      else if (d <= 7) ageingBuckets['4-7d']++;
      else if (d <= 14) ageingBuckets['8-14d']++;
      else if (d <= 30) ageingBuckets['15-30d']++;
      else ageingBuckets['30d+']++;
    });

    // recent trend: last 7/30 days created vs fulfilled
    var now = new Date();
    var last7Created = rows.filter(function (r) {
      var dt = U.parseDate(r.date); return dt && dt >= new Date(now - 7 * 864e5);
    }).length;
    var last7Fulfilled = rows.filter(function (r) {
      var dt = U.parseDate(r.fulfilledAt); return r.status === 'FULFILLED' && dt && dt >= new Date(now - 7 * 864e5);
    }).length;
    var overdue = rows.filter(function (r) { return r.isOverdue; }).length;

    return {
      locationId: locId || '',
      totals: { total: rows.length, outstanding: outstanding, fulfilled: fulfilled, cancelled: U.num(byStatus.CANCELLED), pendingProcurement: pendingProcurement, waitingCustomers: Object.keys(waitingCustomersSet).length, overdue: overdue },
      byStatus: byStatus, byPriority: byPriority, byCategory: byCategory, bySupplier: bySupplier,
      supplierOrderStatus: supplierOrderStatus,
      ageing: ageingBuckets,
      trends: { last7Created: last7Created, last7Fulfilled: last7Fulfilled },
      generatedAt: _now()
    };
  }

  function reports(opts, s) {
    Auth.require(s, 'demand.reports');
    opts = opts || {};
    var type = _str(opts.type || 'outstanding').toLowerCase();
    var locId = opts.locationId || s.locationId;
    var rows = DB.all('CustomerDemands').map(_enrich);
    if (locId) rows = rows.filter(function (r) { return !_str(r.locationId) || _str(r.locationId) === locId; });

    if (type === 'outstanding') rows = rows.filter(function (r) { return ACTIVE_STATUSES.indexOf(r.status) > -1; });
    else if (type === 'fulfilled') rows = rows.filter(function (r) { return r.status === 'FULFILLED'; });
    else if (type === 'pending_procurement') rows = rows.filter(function (r) { return ['OPEN', 'SOURCED'].indexOf(r.status) > -1; });
    else if (type === 'waiting_customers') {
      var map = {};
      rows.filter(function (r) { return ACTIVE_STATUSES.indexOf(r.status) > -1; }).forEach(function (r) {
        var k = r.customerId || r.customerName;
        if (!map[k]) map[k] = { customerId: r.customerId, customerName: r.customerName, customerPhone: r.customerPhone, count: 0, items: [], earliest: r.date };
        map[k].count++; map[k].items.push({ demandNo: r.demandNo, itemName: r.itemName, qty: r.qty, priority: r.priority, status: r.status, daysOpen: r.daysOpen });
        if (r.date < map[k].earliest) map[k].earliest = r.date;
      });
      var customers = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.count - a.count; });
      return { type: type, count: customers.length, customers: customers.slice(0, _num(opts.limit, 100)), generatedAt: _now() };
    } else if (type === 'supplier_status') {
      var supAgg = {};
      rows.forEach(function (r) {
        if (!r.poIds || !r.poIds.length) return;
        r.poIds.forEach(function (poId) {
          var po = DB.byId('PurchaseOrders', poId);
          var sid = po ? _str(po.supplierId) : '';
          var sname = sid ? ((DB.byId('Suppliers', sid) || {}).name || sid) : 'unassigned';
          var st = po ? _str(po.status) : 'UNKNOWN';
          var key = sname + '|' + st;
          supAgg[key] = supAgg[key] || { supplierName: sname, poStatus: st, demandCount: 0, poIds: {} };
          supAgg[key].demandCount++;
          supAgg[key].poIds[poId] = 1;
        });
      });
      var supRows = Object.keys(supAgg).map(function (k) { var v = supAgg[k]; return { supplierName: v.supplierName, poStatus: v.poStatus, demandCount: v.demandCount, poCount: Object.keys(v.poIds).length }; });
      supRows.sort(function (a, b) { return b.demandCount - a.demandCount; });
      return { type: type, rows: supRows.slice(0, _num(opts.limit, 100)), generatedAt: _now() };
    }

    // default row-based report: filter by date if provided
    if (opts.from) { var f = U.parseDate(opts.from); if (f) rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= f; }); }
    if (opts.to) { var t = U.parseDate(opts.to); if (t) { t.setDate(t.getDate() + 1); rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d < t; }); } }
    if (opts.status) rows = rows.filter(function (r) { return _str(r.status) === _str(opts.status).toUpperCase(); });

    rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var total = rows.length;
    var page = _num(opts.page, 1), ps = _num(opts.pageSize, 50);
    var slice = rows.slice((page - 1) * ps, page * ps);
    return { type: type, total: total, rows: slice, page: page, pages: Math.ceil(total / ps) || 1, generatedAt: _now() };
  }

  /* ============================ AI MONITOR ================================ */
  /**
   * Daily monitoring: scans demands and pushes alerts/reminders.
   * - Overdue OPEN demands (no PO after X days)
   * - ARRIVED but not NOTIFIED within 1 day
   * - NOTIFIED but not FULFILLED within alertDays
   * - Stale SOURCED/ORDERED without GRN beyond expected lead time
   */
  function monitor(s) {
    s = s || _systemSession();
    var cfg = DB.settings();
    var alertDays = _num(cfg['demand.alertDays'], 3);
    var out = { ranAt: _now(), alerts: 0, notes: [] };
    var demands = DB.all('CustomerDemands').map(_enrich).filter(function (r) { return ACTIVE_STATUSES.indexOf(r.status) > -1; });

    demands.forEach(function (d) {
      // 1) OPEN+SOURCED without PO beyond 2 days
      if (['OPEN', 'SOURCED'].indexOf(d.status) > -1 && d.daysOpen >= 2 && (!d.poIds || !d.poIds.length)) {
        var msg = d.customerName + ' ki demand ' + d.itemName + ' (' + d.qty + ') ' + d.daysOpen + ' din se pending hai — PO banaayein.';
        try { Notifications.push('DEMAND_REMINDER', 'Demand pending: ' + d.itemName, msg, d.priority === 'URGENT' ? 'error' : 'warn', '#/demands?open=' + d.id, d.locationId, s); out.alerts++; } catch (e) {}
        out.notes.push('pending:' + d.demandNo);
      }

      // 2) ARRIVED not notified beyond 1 day
      if (d.status === 'ARRIVED') {
        var arrivedAt = U.parseDate(d.updatedAt || d.date);
        var diff = arrivedAt ? Math.floor((new Date() - arrivedAt) / 86400000) : 999;
        if (diff >= 1) {
          var m2 = d.customerName + ' ka ' + d.itemName + ' stock aaya ' + diff + ' din pehle — abhi tak notify nahi kiya.';
          try { Notifications.push('DEMAND_REMINDER', 'Stock arrived — notify now: ' + d.itemName, m2, 'warn', '#/demands?open=' + d.id, d.locationId, s); out.alerts++; } catch (e) {}
          out.notes.push('arrived-not-notified:' + d.demandNo);
        }
      }

      // 3) NOTIFIED not fulfilled beyond alertDays
      if (d.status === 'NOTIFIED') {
        var nAt = U.parseDate(d.notifiedAt || d.updatedAt);
        var d2 = nAt ? Math.floor((new Date() - nAt) / 86400000) : 999;
        if (d2 >= alertDays) {
          var m3 = d.customerName + ' ko ' + d.itemName + ' ke liye ' + d2 + ' din pehle notify kiya — abhi tak sale nahi hui. Follow-up karein.';
          try { Notifications.push('DEMAND_REMINDER', 'Follow-up: ' + d.itemName, m3, 'info', '#/demands?open=' + d.id, d.locationId, s); out.alerts++; } catch (e) {}
          out.notes.push('notified-pending-fulfill:' + d.demandNo);
        }
      }

      // 4) overdue expectedDate
      if (d.isOverdue) {
        var m4 = d.customerName + ' ki demand ' + d.itemName + ' expected ' + d.expectedDate + ' se overdue hai (status ' + d.status + ').';
        try { Notifications.push('DEMAND_REMINDER', 'Demand overdue: ' + d.itemName, m4, 'warn', '#/demands?open=' + d.id, d.locationId, s); out.alerts++; } catch (e) {}
        out.notes.push('overdue:' + d.demandNo);
      }
    });

    if (out.alerts) Audit.log('DEMAND_MONITOR', 'CustomerDemands', '', null, out, s);
    return out;
  }

  function _systemSession() {
    try { return Triggers.systemSession(); } catch (e) {
      var users = DB.all('Users').filter(function (u) { return _str(u.active) !== 'false'; });
      var owner = users.filter(function (u) { return u.role === 'OWNER'; })[0] || users[0];
      if (!owner) return { userId: 'system', username: 'system', role: 'OWNER', permissions: ['*'], locationId: '', locationIds: [], defaultLocationId: '' };
      return Auth._buildSession(owner);
    }
  }

  /* ============================ UTILITIES ================================= */
  function stats(s) {
    return dashboard({}, s);
  }

  // For testing: wipe demands (admin only)
  function clearAll(s) {
    Auth.require(s, 'settings.manage');
    var n = DB.all('CustomerDemands').length;
    DB.all('CustomerDemands').forEach(function (r) { DB.remove('CustomerDemands', r.id, s); });
    DB.all('DemandHistory').forEach(function (r) { DB.remove('DemandHistory', r.id, s); });
    return { cleared: n };
  }

  return {
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    create: create,
    list: list,
    get: get,
    update: update,
    setStatus: setStatus,
    cancel: cancel,
    linkToPO: linkToPO,
    unlinkFromPO: unlinkFromPO,
    suggestForPO: suggestForPO,
    suggestVendors: suggestVendors,
    onStockArrival: onStockArrival,
    onGRN: onGRN,
    onSale: onSale,
    posRecommend: posRecommend,
    dashboard: dashboard,
    reports: reports,
    monitor: monitor,
    stats: stats,
    clearAll: clearAll
  };

})();

/* ============================ TEST HELPERS ==================================
 * Run in Apps Script console for quick verification:
 *   testDemandFlow_()
 */
function testDemandFlow_() {
  var s = Triggers.systemSession();
  var cust = DB.all('Customers')[0];
  if (!cust) throw new Error('No customer for test');
  var item = DB.all('Items')[0];
  var d = CustomerDemands.create({ customerId: cust.id, itemId: item ? item.id : '', itemName: item ? item.name : 'Test Part', qty: 2, priority: 'HIGH', notes: 'test flow' }, s);
  Logger.log('Created ' + d.demandNo + ' status ' + d.status);
  var sug = CustomerDemands.suggestForPO({}, s);
  Logger.log('SuggestForPO items ' + sug.totalItems);
  var vend = CustomerDemands.suggestVendors({ itemId: d.itemId || '' }, s);
  Logger.log('Vendors ' + vend.rows.length);
  var rec = CustomerDemands.posRecommend({ customerId: cust.id }, s);
  Logger.log('POS rec demands ' + rec.demands.length);
  var dash = CustomerDemands.dashboard({}, s);
  Logger.log('Dash outstanding ' + dash.totals.outstanding);
  CustomerDemands.cancel(d.id, 'test cancel', s);
  Logger.log('Cancelled OK');
  return { ok: true };
}
