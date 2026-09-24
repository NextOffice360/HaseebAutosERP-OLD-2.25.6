/**
 * HASEEB AUTOS - ERP / POS  ::  PURCHASE (PO → GRN → Return)
 */

var Purchase = {

  /* ================================ PO ===================================== */
  listPO: function (p, s) {
    Auth.require(s, 'purchase.view');
    p = p || {};
    var rows = DB.all('PurchaseOrders').reverse();
    if (p.supplierId) rows = rows.filter(function (r) { return r.supplierId === p.supplierId; });
    if (p.status) rows = rows.filter(function (r) { return r.status === p.status; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    return rows.slice(0, U.num(p.limit, 100)).map(function (r) {
      return Purchase._poBrief(r);
    });
  },

  _poBrief: function (r) {
    var lines = DB.all('PurchaseOrderItems').filter(function (x) { return x.poId === r.id; });
    var ordered = U.sum(lines, 'qty'), received = U.sum(lines, 'receivedQty');
    return {
      id: r.id, poNo: r.poNo, date: r.date, supplierId: r.supplierId, locationId: r.locationId,
      expectedDate: r.expectedDate, status: r.status, subtotal: U.num(r.subtotal), tax: U.num(r.tax),
      total: U.num(r.total), budgetLimit: U.num(r.budgetLimit), notes: r.notes,
      supplierName: (DB.byId('Suppliers', r.supplierId) || {}).name || '',
      lines: lines.length, itemCount: lines.length,
      orderedQty: ordered, receivedQty: received,
      pendingQty: U.round(ordered - received, 2)
    };
  },

  /* ==========================================================================
     v2.6 §3 — LINE PRICING: retail / wholesale / discount / PREVIOUS price
     --------------------------------------------------------------------------
     Har PO aur GRN line par ye record karte hain:
       retailPrice / wholesalePrice — item master ki aaj ki selling rates
       discount                     — line discount
       prevPrice / prevDate / prevGrnNo / prevSource — is item ki PICHLI rate
       priceChange / priceChangePct — farq (Rs aur %)

     Previous price ka source (§19: min complexity, koi naya sheet nahi):
       1) isi SUPPLIER ki pichhli GRN rate   → prevSource = 'SUPPLIER'
       2) warna kisi bhi supplier ki aakhiri → prevSource = 'ANY'
     Dono existing GRN + GRNItems se nikalte hain — koi naya data nahi mangta.

     settings-driven: `purchasePriceCompare = 'false'` → comparison off.
     ========================================================================== */
  _linePricing: function (itemId, supplierId, rate, excludeGrnId) {
    var it = DB.byId('Items', itemId) || {};
    var out = {
      retailPrice: U.num(it.retailPrice),
      wholesalePrice: U.num(it.wholesalePrice),
      prevPrice: 0, prevDate: '', prevSource: '', prevGrnNo: '',
      priceChange: 0, priceChangePct: 0
    };
    if (U.str(DB.settings().purchasePriceCompare) === 'false') return out;

    var grns = {};
    DB.all('GRN').forEach(function (g) {
      if (g.id === excludeGrnId) return;
      if (U.str(g.status) === 'VOID') return;      /* cancelled GRN rate na ginein */
      grns[g.id] = g;
    });
    var bestSame = null, bestAny = null;
    DB.all('GRNItems').forEach(function (r) {
      if (r.itemId !== itemId) return;
      var g = grns[r.grnId];
      if (!g) return;
      var cost = U.num(r.cost);
      if (cost <= 0) return;
      /*
       * NOTE — ek hi din mein ek se zyada GRN ho sakte hain (bazaar mein aam baat).
       * Sirf DATE se muqabla karne to sab barabar thehreingay aur "pichhli rate"
       * ghalat (purani) GRN se aa jayegi. Is liye date ke sath createdAt bhi
       * jodte hain — taake hamesha SAB SE AAKHIRI rate milti rahe.
       */
      /*
       * NOTE — ek hi din (aur aksar ek hi second) mein kai GRN ho sakte hain.
       * Sirf DATE se to sab barabar thehreingay, aur U.iso() second tak hi hai
       * is liye createdAt bhi tie-break nahi kar sakta. Hal: DB.all() sheet order
       * (yani insertion order) deta hai — barabar tarikh par BAAD wali GRN jeetay.
       * Is liye '>=' — aakhiri (sab se nayi) rate hamesha milti hai.
       */
      var d = U.str(g.date);
      if (d >= U.str(bestAny && bestAny.date)) bestAny = { cost: cost, date: d, grnNo: U.str(g.grnNo) };
      if (supplierId && U.str(g.supplierId) === U.str(supplierId) && d >= U.str(bestSame && bestSame.date)) {
        bestSame = { cost: cost, date: d, grnNo: U.str(g.grnNo) };
      }
    });
    var prev = bestSame || bestAny;
    if (prev) {
      out.prevPrice = prev.cost;
      out.prevDate = prev.date;
      out.prevGrnNo = prev.grnNo;
      out.prevSource = bestSame ? 'SUPPLIER' : 'ANY';
    }
    rate = U.num(rate);
    if (out.prevPrice > 0 && rate > 0) {
      out.priceChange = U.round(rate - out.prevPrice, 2);
      out.priceChangePct = U.round(((rate - out.prevPrice) / out.prevPrice) * 100, 2);
    }
    return out;
  },

  /**
   * v2.6 §3 — GRN / PO lines ka price-movement khulasa.
   * Is se GRN header par seedha nazar aata hai: kitni cheezein mehngi huin,
   * kitni sasti, aur sab se bara farq kaunsa.
   */
  /**
   * v2.6 §3 — UI ke liye: ek item ki pricing context (pichhli rate, retail,
   * wholesale) PO/GRN drawer khule rehte hue — save se pehle hi nazar aaye.
   */
  priceInfo: function (p, s) {
    Auth.require(s, 'purchase.view');
    if (!p || !p.itemId) throw new Error('itemId chahiye');
    return Purchase._linePricing(p.itemId, p.supplierId || '', U.num(p.rate), p.excludeGrnId || '');
  },

  /* v2.30.2 (W7.T2) — N lines ka price-history EK hi call me (pehle har line
     ka alag round-trip hota tha: PO load / demand add-all par waterfall).
     `items` = [{ itemId, rate }] → { rows: [{ itemId, ...pricing }] }.
     Ek line ka data na mile to bhi baqi wapas (kabhi poora fail nahi). */
  priceInfoBatch: function (p, s) {
    Auth.require(s, 'purchase.view');
    var items = (p && p.items) || [];
    var sup = (p && p.supplierId) || '';
    var rows = items.map(function (it) {
      var out = { itemId: it.itemId || '' };
      try {
        var pr = Purchase._linePricing(it.itemId, sup, U.num(it.rate), p.excludeGrnId || '');
        Object.keys(pr).forEach(function (k) { out[k] = pr[k]; });
      } catch (e) { out.error = String(e.message || e).slice(0, 120); }
      return out;
    });
    return { rows: rows, count: rows.length };
  },

  /* v2.9.1 §11 — item ke liye supplier-wise purchase price muqabla.
   * Sirf REAL GRN history se (avg/min/max/last per supplier); jitna zyada
   * data utna zyada rows. Kuch nahi mila to rows: [] — kabhi fabricate nahi. */
  supplierCompare: function (p, s) {
    Auth.require(s, 'purchase.view');
    if (!p || !p.itemId) throw new Error('itemId chahiye');
    var days = Math.max(30, U.num(p.days, 180));
    var cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    var byGrn = {};
    DB.all('GRN').forEach(function (g) { if (U.str(g.date).slice(0, 10) >= cut && g.supplierId) byGrn[g.id] = g; });
    var agg = {};
    DB.all('GRNItems').forEach(function (li) {
      if (String(li.itemId) !== String(p.itemId)) return;
      var g = byGrn[li.grnId]; if (!g) return;
      var a = agg[g.supplierId] || (agg[g.supplierId] = {
        supplierId: g.supplierId, count: 0, units: 0, value: 0,
        min: Infinity, max: 0, lastRate: 0, lastDate: ''
      });
      var rate = U.num(li.cost), qty = U.num(li.qty);
      a.count++; a.units += qty; a.value += rate * qty;
      if (rate && rate < a.min) a.min = rate;
      if (rate > a.max) a.max = rate;
      var d = U.str(g.date).slice(0, 10);
      if (d >= a.lastDate) { a.lastDate = d; a.lastRate = rate; }
    });
    var supN = {};
    DB.all('Suppliers').forEach(function (sp) { supN[sp.id] = sp.name; });
    var out = Object.keys(agg).map(function (k) {
      var a = agg[k];
      return {
        supplierId: k, supplierName: supN[k] || ('#' + k),
        count: a.count, units: U.round(a.units, 2),
        avgCost: a.units ? U.round(a.value / a.units, 2) : 0,
        minCost: a.min === Infinity ? 0 : U.round(a.min, 2),
        maxCost: U.round(a.max, 2), lastRate: U.round(a.lastRate, 2), lastDate: a.lastDate
      };
    });
    out.sort(function (x, y) { return y.count - x.count || y.units - x.units; });
    var withAvg = out.filter(function (o) { return o.avgCost > 0; });
    if (withAvg.length > 1) {
      var best = withAvg.slice().sort(function (x, y) { return x.avgCost - y.avgCost; })[0];
      out.forEach(function (o) { o.best = o.supplierId === best.supplierId; });
    }
    return { itemId: p.itemId, days: days, rows: out };
  },

  _priceSummary: function (lines) {
    var up = 0, down = 0, same = 0, noHistory = 0;
    var netValue = 0, worst = null;
    (lines || []).forEach(function (r) {
      var prev = U.num(r.prevPrice), change = U.num(r.priceChange);
      if (!prev) { noHistory++; return; }
      if (change > 0) up++;
      else if (change < 0) down++;
      else { same++; return; }
      netValue += change * U.num(r.qty);
      if (!worst || Math.abs(U.num(r.priceChangePct)) > Math.abs(U.num(worst.priceChangePct))) worst = r;
    });
    return {
      up: up, down: down, same: same, noHistory: noHistory,
      netValue: U.round(netValue, 2),
      biggestChange: worst ? {
        name: U.str(worst.name || worst.code), prevPrice: U.num(worst.prevPrice),
        cost: U.num(worst.cost), priceChange: U.num(worst.priceChange),
        priceChangePct: U.num(worst.priceChangePct)
      } : null
    };
  },

  savePO: function (payload, s) {
    Auth.require(s, 'purchase.po.create');
    var items = payload.items || [];
    if (!items.length) throw new Error('PO mein kam az kam ek item chahiye.');
    var subtotal = U.sum(items, function (i) { return U.num(i.qty) * U.num(i.rate) - U.num(i.discount); });
    var tax = U.num(payload.tax, U.round(subtotal * U.num(DB.settings().taxRate) / 100, 2));
    var total = U.round(subtotal + tax + U.num(payload.freight), 2);

    if (U.num(payload.budgetLimit) && total > U.num(payload.budgetLimit)) {
      throw new Error('Budget limit (' + payload.budgetLimit + ') se upar ja raha hai. Approval lein.');
    }

    var isNew = !payload.id;
    var prevStatus = '', prevTotal = 0;   /* v2.6 §15 — audit ke liye "before" */
    var po;
    if (isNew) {
      po = DB.insert('PurchaseOrders', {
        id: U.uid('PO'), poNo: DB.nextNumber('PO', payload.locationId || s.locationId),
        date: payload.date || U.dateOnly(), supplierId: payload.supplierId || '',
        locationId: payload.locationId || s.locationId, expectedDate: payload.expectedDate || '',
        status: payload.status || 'DRAFT', subtotal: U.round(subtotal, 2), tax: tax, total: total,
        budgetLimit: payload.budgetLimit || 0, notes: payload.notes || '',
        createdBy: s.userId, createdAt: U.iso()
      }, s);
    } else {
      var prevPO = DB.byId('PurchaseOrders', payload.id) || {};
      prevStatus = U.str(prevPO.status);
      prevTotal = U.num(prevPO.total);
      po = DB.update('PurchaseOrders', payload.id, {
        date: payload.date, supplierId: payload.supplierId, locationId: payload.locationId,
        expectedDate: payload.expectedDate, subtotal: U.round(subtotal, 2), tax: tax, total: total,
        budgetLimit: payload.budgetLimit, notes: payload.notes
      }, s);
      DB.all('PurchaseOrderItems').filter(function (r) { return r.poId === payload.id; })
        .forEach(function (r) { DB.remove('PurchaseOrderItems', r.id, s); });
      po = DB.byId('PurchaseOrders', payload.id);
    }

    items.forEach(function (line) {
      var it = DB.byId('Items', line.itemId) || {};
      var rate = U.num(line.rate, U.num(it.costPrice));
      /* v2.6 §3 — PO banate waqt bhi pichhli rate nazar aaye (order se pehle) */
      var pr = Purchase._linePricing(line.itemId, po.supplierId, rate, '');
      DB.insert('PurchaseOrderItems', {
        id: U.uid('POI'), poId: po.id, itemId: line.itemId, code: it.code || line.code || '',
        name: it.name || line.name || '', qty: U.num(line.qty), rate: rate,
        tax: U.num(line.tax), lineTotal: U.round(U.num(line.qty) * rate, 2), receivedQty: 0,
        discount: U.num(line.discount),
        retailPrice: pr.retailPrice, wholesalePrice: pr.wholesalePrice,
        prevPrice: pr.prevPrice, prevDate: pr.prevDate, prevSource: pr.prevSource,
        prevGrnNo: pr.prevGrnNo, priceChange: pr.priceChange, priceChangePct: pr.priceChangePct
      });
    });
    /* v2.6 §15 — PO audit trail (status + total + lines) */
    var fresh = DB.byId('PurchaseOrders', po.id);
    Audit.log(payload.id ? 'PO_UPDATE' : 'PO_CREATE', 'PurchaseOrders', po.id,
      payload.id ? { status: prevStatus, total: prevTotal } : null,
      { poNo: fresh.poNo, status: U.str(fresh.status), total: U.num(fresh.total),
        supplierId: fresh.supplierId, lines: items.length, locationId: fresh.locationId }, s);
    /* Customer Demand → PO link (outstanding demands auto-sourced) */
    if (payload.demandIds && payload.demandIds.length) {
      try { CustomerDemands.linkToPO(payload.demandIds, fresh.id, s); } catch (e) { Logger.log('demand link PO error: ' + e.message); }
    }
    return Purchase._poBrief(fresh);
  },

  /**
   * v2.6 §4 — PO duplicate: purane PO ki copy → NAYA DRAFT.
   * Har baar wahi 30 line dobara type karna padta tha; ab ek click.
   * Naya number, aaj ki date, status DRAFT, received qty zero.
   */
  duplicatePO: function (id, s) {
    var po = DB.byId('PurchaseOrders', id);
    if (!po) throw new Error('PO nahi mili');
    var lines = DB.all('PurchaseOrderItems').filter(function (r) { return r.poId === id; });
    if (!lines.length) throw new Error('Is PO mein koi item nahi — copy kuch nahi milega.');

    var copy = DB.insert('PurchaseOrders', {
      id: U.uid('PO'), poNo: DB.nextNumber('PO', po.locationId),
      date: U.dateOnly(), supplierId: po.supplierId, locationId: po.locationId,
      expectedDate: '', status: 'DRAFT',
      subtotal: U.num(po.subtotal), tax: U.num(po.tax), total: U.num(po.total),
      budgetLimit: U.num(po.budgetLimit),
      notes: U.str(po.notes) + (po.notes ? ' · ' : '') + 'Copied from ' + U.str(po.poNo),
      createdBy: s.userId, createdAt: U.iso()
    }, s);

    lines.forEach(function (r) {
      DB.insert('PurchaseOrderItems', {
        id: U.uid('POI'), poId: copy.id, itemId: r.itemId, code: r.code, name: r.name,
        qty: U.num(r.qty), rate: U.num(r.rate), tax: U.num(r.tax),
        lineTotal: U.round(U.num(r.qty) * U.num(r.rate), 2), receivedQty: 0,
        discount: U.num(r.discount), retailPrice: U.num(r.retailPrice),
        wholesalePrice: U.num(r.wholesalePrice),
        prevPrice: 0, prevDate: '', prevSource: '', prevGrnNo: '',
        priceChange: 0, priceChangePct: 0
      });
    });

    /* §15 — kaun se PO se copy kiya */
    Audit.log('PO_DUPLICATE', 'PurchaseOrders', copy.id,
      { sourcePoId: id, sourcePoNo: U.str(po.poNo), lines: lines.length },
      { poNo: copy.poNo, lines: lines.length, total: U.num(copy.total) }, s);

    return Purchase._poBrief(copy);
  },

  approvePO: function (id, s) {
    Auth.require(s, 'purchase.po.approve');
    var po = DB.byId('PurchaseOrders', id);
    var out = DB.update('PurchaseOrders', id, { status: 'APPROVED' }, s);
    /* v2.6 §15 — approval: kaun, kab, pehle kya tha */
    Audit.log('PO_APPROVE', 'PurchaseOrders', id,
      { status: po ? U.str(po.status) : '', total: po ? U.num(po.total) : 0 },
      { status: 'APPROVED', total: po ? U.num(po.total) : 0 }, s);
    return out;
  },

  /* =============================== GRN ===================================== */
  listGRN: function (p, s) {
    Auth.require(s, 'purchase.view');
    p = p || {};
    var rows = DB.all('GRN').reverse();
    if (p.supplierId) rows = rows.filter(function (r) { return r.supplierId === p.supplierId; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    return rows.slice(0, U.num(p.limit, 100)).map(function (r) {
      return U.pick(r, ['id', 'grnNo', 'date', 'poId', 'supplierId', 'locationId', 'invoiceNo',
        'invoiceDate', 'subtotal', 'tax', 'freight', 'total', 'status', 'notes', 'createdBy']);
    });
  },

  /**
   * GRN post → stock IN + PO received update + supplier ledger + optional cost update
   */
  saveGRN: function (payload, s) {
    Auth.require(s, 'purchase.grn');
    var items = payload.items || [];
    if (!items.length) throw new Error('GRN mein items zaroori hain.');
    var locId = payload.locationId || s.locationId;
    var subtotal = U.sum(items, function (i) { return U.num(i.qty) * U.num(i.cost); });
    var tax = U.num(payload.tax, 0);
    var total = U.round(subtotal + tax + U.num(payload.freight), 2);

    var grn = DB.insert('GRN', {
      id: U.uid('GRN'), grnNo: DB.nextNumber('GRN', locId), date: payload.date || U.dateOnly(),
      poId: payload.poId || '', supplierId: payload.supplierId || '', locationId: locId,
      invoiceNo: payload.invoiceNo || '', invoiceDate: payload.invoiceDate || '',
      subtotal: U.round(subtotal, 2), tax: tax, freight: U.num(payload.freight), total: total,
      status: 'POSTED', notes: payload.notes || '', createdBy: s.userId, createdAt: U.iso()
    }, s);

    items.forEach(function (line) {
      var it = DB.byId('Items', line.itemId) || {};
      var qty = U.num(line.qty), cost = U.num(line.cost, U.num(it.costPrice));
      /* v2.6 §3 — previous rate isi waqt freeze karo (baad mein item ka cost
         badal jayega, to purana muqabla ghalat ho jata) */
      var pr = Purchase._linePricing(line.itemId, grn.supplierId, cost, grn.id);
      DB.insert('GRNItems', { id: U.uid('GRI'), grnId: grn.id, itemId: line.itemId,
        code: it.code || line.code || '', name: it.name || line.name || '', qty: qty, cost: cost,
        tax: U.num(line.tax), lineTotal: U.round(qty * cost, 2), expiry: line.expiry || '',
        discount: U.num(line.discount),
        retailPrice: pr.retailPrice, wholesalePrice: pr.wholesalePrice,
        prevPrice: pr.prevPrice, prevDate: pr.prevDate, prevSource: pr.prevSource,
        prevGrnNo: pr.prevGrnNo, priceChange: pr.priceChange, priceChangePct: pr.priceChangePct });

      Inventory.post(line.itemId, locId, qty, cost, 'GRN', grn.id, s, grn.grnNo);

      // cost update (GRN based)
      if (payload.updateCost !== false) {
        DB.update('Items', line.itemId, { costPrice: cost, updatedAt: U.iso() }, s);
      }
      // retail price auto (margin) if provided
      if (line.retailPrice) DB.update('Items', line.itemId, { retailPrice: U.num(line.retailPrice) }, s);

      // PO received qty
      if (payload.poId) {
        var poLine = DB.findOne('PurchaseOrderItems', function (r) {
          return r.poId === payload.poId && r.itemId === line.itemId;
        });
        if (poLine) {
          DB.update('PurchaseOrderItems', poLine.id, {
            receivedQty: U.num(poLine.receivedQty) + qty
          }, s);
        }
      }
    });

    // PO status
    if (payload.poId) {
      var po = DB.byId('PurchaseOrders', payload.poId);
      var lines = DB.all('PurchaseOrderItems').filter(function (r) { return r.poId === payload.poId; });
      var allReceived = lines.every(function (l) { return U.num(l.receivedQty) >= U.num(l.qty); });
      if (po) DB.update('PurchaseOrders', po.id, { status: allReceived ? 'RECEIVED' : 'PARTIAL' }, s);
    }

    /* v2.6 §15 — GRN audit: stock + payable dono badalte hain, is liye
       dono ka record (qty, cost, total, supplier, PO reference) */
    Audit.log('GRN_POST', 'GRN', grn.id, null,
      { grnNo: grn.grnNo, supplierId: grn.supplierId, poId: payload.poId || '',
        invoiceNo: grn.invoiceNo || '', subtotal: U.num(grn.subtotal), total: U.num(grn.total),
        lines: items.length, receivedQty: U.sum(items, function (i) { return U.num(i.qty); }),
        locationId: locId }, s);

    /* Customer Demand → stock arrival auto-detect + notification */
    try { if (typeof CustomerDemands !== 'undefined' && CustomerDemands.onGRN) CustomerDemands.onGRN(grn, items, s); } catch (e) { Logger.log('demand onGRN error: ' + e.message); }

    // supplier ledger (credit = hum supplier ke paise denay hain)
    if (payload.supplierId && (payload.onCredit === true || payload.onCredit === 'true')) {
      Parties.postLedger('SUPPLIER', payload.supplierId, {
        date: grn.date, refType: 'GRN', refId: grn.id,
        description: 'Purchase ' + grn.grnNo + (grn.invoiceNo ? ' / ' + grn.invoiceNo : ''),
          debit: 0, credit: total, locationId: locId
      }, s);
    }
    /* v2.5: accounting auto-post (Dr purchase / Cr payable ya cash) */
    Accounting.auto('GRN', { grn: grn, onCredit: payload.onCredit, method: payload.method || 'CASH' }, s);
    return grn;
  },

  /* ======================= DETAIL VIEWS + SUPPLIER BALANCE ================ */

  /**
   * Supplier ka snapshot: naam, contact, aur abhi kitna PAYABLE hai.
   * NOTE — ledger convention: supplier balance negative hoti hai jab humein
   * dena hota hai (credit = purchase). UI/reports mein hamesha POSITIVE
   * "payable" chahiye, is liye sign yahin flip karte hain (ek hi jagah).
   */
  _supplierBlock: function (supplierId, excludeRefId, s) {
    var sup = DB.byId('Suppliers', supplierId) || {};
    var payable = 0;
    try { payable = Parties.supplierPayable(supplierId, excludeRefId || ''); } catch (e) { payable = 0; }
    payable = U.round(payable, 2);              // POSITIVE = humein dena hai
    return {
      id: supplierId, name: sup.name || '', phone: sup.phone || '', email: sup.email || '',
      company: sup.company || '', openingBalance: U.num(sup.openingBalance),
      paymentTerms: sup.paymentTerms || '', creditLimit: U.num(sup.creditLimit),
      payable: payable, previousBalance: payable
    };
  },

  /** PO detail — GRN mein load karne ke liye bhi yahi use hota hai */
  getPO: function (id, s) {
    Auth.require(s, 'purchase.view');
    var po = DB.byId('PurchaseOrders', id);
    if (!po) throw new Error('PO nahi mili');
    var lines = DB.all('PurchaseOrderItems').filter(function (r) { return r.poId === id; });
    var out = Purchase._poBrief(po);
    out.items = lines.map(function (r) {
      return {
        id: r.id, itemId: r.itemId, code: r.code, name: r.name,
        qty: U.num(r.qty), rate: U.num(r.rate), tax: U.num(r.tax),
        lineTotal: U.num(r.lineTotal), receivedQty: U.num(r.receivedQty),
        pendingQty: U.round(U.num(r.qty) - U.num(r.receivedQty), 2),
        /* v2.6 §3 */
        discount: U.num(r.discount), retailPrice: U.num(r.retailPrice),
        wholesalePrice: U.num(r.wholesalePrice),
        prevPrice: U.num(r.prevPrice), prevDate: U.str(r.prevDate),
        prevSource: U.str(r.prevSource), prevGrnNo: U.str(r.prevGrnNo),
        priceChange: U.num(r.priceChange), priceChangePct: U.num(r.priceChangePct)
      };
    });
    out.supplier = Purchase._supplierBlock(po.supplierId, '', s);
    out.createdBy = po.createdBy;
    return out;
  },

  /** GRN detail — supplier ka previous balance + is GRN ke baad total payable */
  getGRN: function (id, s) {
    Auth.require(s, 'purchase.view');
    var g = DB.byId('GRN', id);
    if (!g) throw new Error('GRN nahi mili');
    var lines = DB.all('GRNItems').filter(function (r) { return r.grnId === id; });
    /* is GRN ke khilaf abhi tak ki payments */
    var grnPays = DB.all('Payments').filter(function (p) {
      return p.type === 'SUPPLIER_PAYMENT' &&
        (p.purchaseId === id || U.str(p.reference) === U.str(g.grnNo));
    });
    var paid = U.sum(grnPays, 'amount');
    /* pichhla baqaya — is GRN aur is GRN ki payments dono ke baghair */
    var skip = [id].concat(grnPays.map(function (p) { return p.id; }));
    var prev = 0;
    try { prev = Parties.supplierPayable(g.supplierId, skip); } catch (e) { prev = 0; }
    prev = U.round(prev, 2);
    var total = U.num(g.total);
    return {
      id: g.id, grnNo: g.grnNo, date: g.date, poId: g.poId, supplierId: g.supplierId,
      locationId: g.locationId, invoiceNo: g.invoiceNo, invoiceDate: g.invoiceDate,
      subtotal: U.num(g.subtotal), tax: U.num(g.tax), freight: U.num(g.freight),
      total: total, status: g.status, notes: g.notes || '',
      items: lines.map(function (r) {
        return { id: r.id, itemId: r.itemId, code: r.code, name: r.name, qty: U.num(r.qty),
          cost: U.num(r.cost), tax: U.num(r.tax), lineTotal: U.num(r.lineTotal), expiry: r.expiry || '',
          /* v2.6 §3 — purchase rate vs previous rate, exactly as recorded */
          discount: U.num(r.discount), retailPrice: U.num(r.retailPrice),
          wholesalePrice: U.num(r.wholesalePrice),
          prevPrice: U.num(r.prevPrice), prevDate: U.str(r.prevDate),
          prevSource: U.str(r.prevSource), prevGrnNo: U.str(r.prevGrnNo),
          priceChange: U.num(r.priceChange), priceChangePct: U.num(r.priceChangePct) };
      }),
      /* v2.6 §3 — GRN level par jhalak: kitni rates badhin / ghatein */
      priceSummary: Purchase._priceSummary(lines),
      poNo: (DB.byId('PurchaseOrders', g.poId) || {}).poNo || '',
      supplier: Purchase._supplierBlock(g.supplierId, id, s),
      /* balance block — customer invoice ki tarah (positive = dena hai) */
      prevBalance: prev,
      paid: U.round(paid, 2),
      closingBalance: U.round(prev + total - paid, 2)
    };
  },

  /** Supplier statement — ledger with running balance (reports ke liye) */
  /* v2.30.4 (W13/T13.2 · B§11) — supplier ke PRICE SIGNALS (real GRN data only):
     har item ki aakhri 2 GRN rates (is supplier ki) — change % + direction.
     "Mock" nahi: GRN/GRNItems sheets se hi nikalta hai, jaise GRN line
     prevPrice strip (SUPPLIER prevSource). Sab se baray variation pehle. */
  supplierPriceSignals: function (p, s) {
    Auth.require(s, 'suppliers.view');
    var id = (p || {}).supplierId;
    if (!id) throw new Error('Supplier chahiye');
    var items = {};
    DB.all('Items').forEach(function (i) { items[i.id] = i; });
    /* supplier ki GRN lines (posted only, purani → nayi) */
    var grnOk = {};
    DB.all('GRN').forEach(function (g) {
      if (g.supplierId === id && U.str(g.status) !== 'VOID') grnOk[g.id] = g;
    });
    var per = {};   /* itemId → [{rate, date, grnNo}] */
    DB.all('GRNItems').forEach(function (r) {
      var g = grnOk[r.grnId];
      if (!g) return;
      var rate = U.num(r.cost, 0);
      if (rate <= 0) return;
      (per[r.itemId] = per[r.itemId] || []).push({
        rate: rate, date: g.date || '', grnNo: g.grnNo || ''
      });
    });
    var rows = [];
    Object.keys(per).forEach(function (itemId) {
      var arr = per[itemId];
      arr.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      if (arr.length < 2) return;                     /* signal ke liye 2 rates chahiye */
      var last = arr[arr.length - 1], prev = arr[arr.length - 2];
      if (U.num(last.rate) === U.num(prev.rate)) return;  /* flat = signal nahi */
      var chg = U.round(U.num(last.rate) - U.num(prev.rate), 2);
      var pct = prev.rate ? U.round((chg / U.num(prev.rate)) * 100, 1) : 0;
      var it = items[itemId] || {};
      rows.push({
        itemId: itemId, code: it.code || '', name: it.name || itemId,
        lastRate: U.num(last.rate), lastDate: last.date, lastGrnNo: last.grnNo,
        prevRate: U.num(prev.rate), prevDate: prev.date, prevGrnNo: prev.grnNo,
        change: chg, changePct: pct,
        direction: chg > 0 ? 'up' : 'down'
      });
    });
    rows.sort(function (a, b) {
      return Math.abs(b.changePct) - Math.abs(a.changePct) || String(a.name).localeCompare(String(b.name));
    });
    return { rows: rows.slice(0, 20), total: rows.length, asOf: U.iso() };
  },

  supplierStatement: function (p, s) {
    Auth.require(s, 'suppliers.view');
    var id = (p || {}).supplierId;
    if (!id) throw new Error('Supplier chahiye');
    var sup = DB.byId('Suppliers', id) || {};
    var rows = DB.all('Ledger').filter(function (r) {
      return r.partyType === 'SUPPLIER' && r.partyId === id;
    });
    rows.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var bal = U.num(sup.openingBalance);
    var out = [];
    rows.forEach(function (r) {
      bal += U.num(r.debit) - U.num(r.credit);
      out.push({
        id: r.id, date: r.date, refType: r.refType, refId: r.refId,
        description: r.description, debit: U.num(r.debit), credit: U.num(r.credit),
        balance: U.round(bal, 2)
      });
    });
    return {
      /* v2.30.0 (N10) — GRN/PO par supplier select karne par uski POORI configured
         maloomat (contact · email · address · tax/NTN · credit limit · terms)
         frontend ko chahiye hoti hai. Pehle yahan sirf name/phone/terms aate thay,
         is liye GRN ka card adhoora reh jata tha. Additive change — purane
         consumers (reports) waise hi kaam karte hain. */
      supplier: { id: id, code: sup.code || '', name: sup.name || '', phone: sup.phone || '',
        email: sup.email || '', address: sup.address || '', ntn: sup.ntn || '',
        creditLimit: U.num(sup.creditLimit), active: U.str(sup.active),
        openingBalance: U.num(sup.openingBalance), paymentTerms: sup.paymentTerms || '' },
      openingBalance: U.num(sup.openingBalance),
      rows: out,
      /* ledger convention (negative = payable) — reports ke liye */
      closingBalance: U.round(bal, 2),
      /* positive, UI ke liye: opening + kharidari - adaigi */
      closingPayable: U.round(U.num(sup.openingBalance) + U.sum(out, 'credit') - U.sum(out, 'debit'), 2),
      totalPurchased: U.round(U.sum(out, 'credit'), 2),
      totalPaid: U.round(U.sum(out, 'debit'), 2)
    };
  },

  /* =========================== PURCHASE RETURN ============================= */
  listReturns: function (p, s) {
    Auth.require(s, 'purchase.view');
    return DB.all('PurchaseReturns').reverse().slice(0, U.num((p || {}).limit, 100));
  },

  saveReturn: function (payload, s) {
    Auth.require(s, 'purchase.return');
    var items = payload.items || [];
    if (!items.length) throw new Error('Return items chahiye.');
    var locId = payload.locationId || s.locationId;
    var total = U.round(U.sum(items, function (i) { return U.num(i.qty) * U.num(i.cost); }), 2);

    var rec = DB.insert('PurchaseReturns', {
      id: U.uid('PRT'), returnNo: DB.nextNumber('PRET', locId), date: payload.date || U.dateOnly(),
      grnId: payload.grnId || '', supplierId: payload.supplierId || '', locationId: locId,
      total: total, reason: payload.reason || '', status: 'POSTED', createdBy: s.userId, createdAt: U.iso()
    }, s);

    items.forEach(function (line) {
      DB.insert('PurchaseReturnItems', { id: U.uid('PRI'), returnId: rec.id, itemId: line.itemId,
        qty: U.num(line.qty), cost: U.num(line.cost), lineTotal: U.round(U.num(line.qty) * U.num(line.cost), 2) });
      Inventory.post(line.itemId, locId, -U.num(line.qty), U.num(line.cost), 'PURCHASE_RETURN', rec.id, s, rec.returnNo);
    });

    if (payload.supplierId && total > 0) {
      Parties.postLedger('SUPPLIER', payload.supplierId, {
        date: rec.date, refType: 'PURCHASE_RETURN', refId: rec.id,
        description: 'Purchase return ' + rec.returnNo, debit: total, credit: 0, locationId: locId
      }, s);
    }
    /* v2.6 §15 — purchase return audit (stock wapas gaya + ledger debit) */
    Audit.log('PURCHASE_RETURN', 'PurchaseReturns', rec.id, null,
      { returnNo: rec.returnNo, total: U.round(total, 2), supplierId: payload.supplierId || '',
        grnId: payload.grnId || '', lines: (payload.items || []).length, locationId: locId }, s);
    return rec;
  }
};
