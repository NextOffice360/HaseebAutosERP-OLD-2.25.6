/**
 * HASEEB AUTOS - ERP / POS  ::  ORDER BOOK (mobile order taking)
 * ---------------------------------------------------------------------------
 * Salesman field se customer ka order leta hai (mobile PWA), phir:
 *
 *   DRAFT → CONFIRMED → PICKING → PACKED → DELIVERED
 *                                    └→ INVOICED  (convert → asli sale)
 *
 * Convert hone par **asli** sale banti hai (Sales.create) — is liye stock,
 * ledger, loyalty aur accounting sab wahi flow use karte hain jo POS par
 * chalte hain. Koi doosra stock movement yahan nahi likha gaya.
 *
 * ───────────────────────── FORMULAS (mirror of Sales) ──────────────────────
 *   lineBase  = price × qty − lineDiscount
 *   subtotal  = Σ lineBase
 *   discount  = Σ lineDiscount + headerDiscount
 *   tax       = Σ round(net × rate / 100)        (rate item ya default GST)
 *   total     = subtotal − headerDiscount + tax
 *   balance   = total − advance
 * ---------------------------------------------------------------------------
 */

var Orders = {

  STATUS: ['DRAFT', 'CONFIRMED', 'PICKING', 'PACKED', 'DELIVERED', 'INVOICED', 'CANCELLED'],

  /* =============================== SAVE ==================================== */
  /** Order create / update (mobile pad se bhi, desktop se bhi) */
  save: function (payload, s) {
    Auth.require(s, 'pos.sell');
    payload = payload || {};
    var locId = payload.locationId || s.locationId;
    var items = payload.items || [];
    if (!items.length) throw new Error('Kam az kam ek item zaroori hai.');

    var itemsById = {}; DB.all('Items').forEach(function (i) { itemsById[i.id] = i; });
    var defaultRate = U.num(DB.settings().taxRate);
    var taxInclusive = U.str(DB.settings().taxInclusive) === 'true';

    var headerDisc = U.num(payload.discount);
    var subtotal = 0, lineDisc = 0, tax = 0;

    /* pehla pass: line bases (Sales.create wali hi formula) */
    var lines = items.map(function (l) {
      var it = itemsById[l.itemId] || {};
      var qty = U.num(l.qty);
      if (qty <= 0) throw new Error('Quantity zero nahi ho sakti (' + (l.name || l.itemId) + ')');
      var price = U.num(l.price, U.num(it.retailPrice));
      var wholesale = U.str(payload.priceTier).toUpperCase() === 'WHOLESALE' ||
        /wholesale|corporate/i.test(U.str(payload.customerType));
      if (wholesale && U.num(it.wholesalePrice)) price = U.num(it.wholesalePrice);
      var d = U.num(l.discount);
      var base = U.round(price * qty - d, 2);
      subtotal = U.round(subtotal + base, 2);
      lineDisc = U.round(lineDisc + d, 2);
      return {
        id: U.uid('ORDI'), itemId: l.itemId, code: it.code || l.code || '',
        name: it.name || l.name || '(item)', qty: qty, price: price,
        cost: U.num(it.costPrice, U.num(it.avgCost)), discount: d,
        taxRate: U.num(l.taxRate, U.num(it.taxRate, defaultRate)),
        tax: 0, lineBase: base, lineTotal: base,
        note: U.str(l.note), unit: it.unit || l.unit || 'pcs'
      };
    });

    /* doosra pass: bill discount ko lines par allocate kar ke tax (Sales jaisa) */
    var allocated = 0;
    lines.forEach(function (lr, i) {
      var share = subtotal ? U.round(headerDisc * (lr.lineBase / subtotal), 2) : 0;
      if (i === lines.length - 1) share = U.round(headerDisc - allocated, 2);  /* rounding residue */
      allocated = U.round(allocated + share, 2);
      var net = U.round(lr.lineBase - share, 2);
      var lt;
      if (taxInclusive && lr.taxRate) { lt = U.round(net - (net / (1 + lr.taxRate / 100)), 2); lr.lineBase = U.round(net - lt, 2); }
      else { lt = U.round(net * lr.taxRate / 100, 2); lr.lineBase = net; }
      lr.tax = lt;
      lr.discount = U.round(U.num(lr.discount) + share, 2);
      lr.lineTotal = U.round(U.num(lr.lineBase) + lt, 2);
      tax = U.round(tax + lt, 2);
    });

    var taxable = U.round(subtotal - headerDisc, 2);
    if (taxInclusive) tax = 0;
    var total = U.round(taxable + tax, 2);
    var advance = U.num(payload.advance);
    if (advance > total) throw new Error('Advance total se zyada nahi ho sakta.');

    var now = U.iso();
    var rec = {
      date: payload.date || U.dateOnly(), expectedDate: U.str(payload.expectedDate),
      customerId: U.str(payload.customerId), customerName: U.str(payload.customerName) ||
        ((DB.byId('Customers', payload.customerId) || {}).name || 'Walk-in Customer'),
      phone: U.str(payload.phone), address: U.str(payload.address),
      locationId: locId, salespersonId: payload.salespersonId || s.userId,
      status: U.upper(U.str(payload.status) || 'DRAFT'),
      priority: U.upper(U.str(payload.priority) || 'NORMAL'),
      channel: U.upper(U.str(payload.channel) || 'FIELD'),
      priceTier: U.str(payload.priceTier),
      subtotal: subtotal, discount: U.round(lineDisc + headerDisc, 2),
      tax: tax, total: total, advance: advance, balance: U.round(total - advance, 2),
      notes: U.str(payload.notes), source: U.str(payload.source) || 'MOBILE',
      updatedAt: now
    };
    if (Orders.STATUS.indexOf(rec.status) < 0) rec.status = 'DRAFT';

    if (payload.id) {
      var old = DB.byId('Orders', payload.id);
      if (!old) throw new Error('Order nahi mila');
      if (U.str(old.status) === 'INVOICED') throw new Error('Invoiced order edit nahi ho sakti.');
      if (U.str(old.status) === 'CANCELLED' && rec.status !== 'DRAFT') {
        throw new Error('Cancelled order dobara sirf DRAFT mein ja sakti hai.');
      }
      rec.id = payload.id;
      DB.update('Orders', payload.id, rec, s);
      DB.all('OrderItems').filter(function (r) { return r.orderId === payload.id; })
        .forEach(function (r) { DB.remove('OrderItems', r.id, s); });
      lines.forEach(function (l) { l.orderId = payload.id; DB.insert('OrderItems', l); });
      return Orders.get({ id: payload.id }, s);
    }

    rec.id = U.uid('ORD');
    rec.orderNo = DB.nextNumber('ORDER', locId);
    rec.saleId = '';
    rec.createdBy = s.userId;
    rec.createdAt = now;
    var saved = DB.insert('Orders', rec, s);
    lines.forEach(function (l) { l.orderId = saved.id; DB.insert('OrderItems', l); });
    return Orders.get({ id: saved.id }, s);
  },

  /* =============================== READ ==================================== */
  get: function (p, s) {
    Auth.require(s, 'pos.sell');
    var o = DB.byId('Orders', p.id);
    if (!o) throw new Error('Order nahi mila');
    var items = DB.all('OrderItems').filter(function (r) { return r.orderId === o.id; });
    var cust = o.customerId ? DB.byId('Customers', o.customerId) : null;
    return {
      order: o, items: items,
      customer: cust ? U.pick(cust, ['id', 'code', 'name', 'phone', 'address', 'balance', 'customerTypeId']) : null,
      summary: {
        lines: items.length, qty: U.round(U.sum(items, 'qty'), 2),
        subtotal: U.num(o.subtotal), discount: U.num(o.discount), tax: U.num(o.tax),
        total: U.num(o.total), advance: U.num(o.advance), balance: U.num(o.balance)
      },
      /* abhi kya kya kar sakte hain (UI inhi se buttons banata hai) */
      actions: {
        canEdit: ['INVOICED'].indexOf(U.str(o.status)) < 0,
        canConfirm: U.str(o.status) === 'DRAFT',
        canConvert: ['INVOICED', 'CANCELLED'].indexOf(U.str(o.status)) < 0,
        canCancel: ['INVOICED', 'CANCELLED'].indexOf(U.str(o.status)) < 0
      }
    };
  },

  list: function (p, s) {
    Auth.require(s, 'pos.sell');
    p = p || {};
    var rows = DB.all('Orders').filter(function (r) {
      if (p.status && U.str(r.status) !== U.upper(p.status)) return false;
      if (p.customerId && r.customerId !== p.customerId) return false;
      if (p.locationId && r.locationId !== p.locationId) return false;
      if (p.q && !U.matchAll(r.orderNo + ' ' + r.customerName + ' ' + r.phone, p.q)) return false;
      if (p.from && U.str(r.date) < U.str(p.from)) return false;
      if (p.to && U.str(r.date) > U.str(p.to)) return false;
      if (!Auth.can(s, 'sales.view.all') && r.salespersonId !== s.userId) return false;
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.createdAt).localeCompare(U.str(a.createdAt)); });
    return rows.slice(0, U.num(p.limit, 200)).map(function (r) {
      return Object.assign({}, r, { items: undefined });
    });
  },

  summary: function (p, s) {
    Auth.require(s, 'pos.sell');
    p = p || {};
    var rows = DB.all('Orders').filter(function (r) {
      return !p.locationId || r.locationId === p.locationId;
    });
    var byStatus = {};
    rows.forEach(function (r) { byStatus[U.str(r.status)] = (byStatus[U.str(r.status)] || 0) + 1; });
    var today = U.dateOnly();
    return {
      total: rows.length,
      byStatus: byStatus,
      openValue: U.round(U.sum(rows.filter(function (r) {
        return ['INVOICED', 'CANCELLED'].indexOf(U.str(r.status)) < 0;
      }), 'total'), 2),
      advance: U.round(U.sum(rows, 'advance'), 2),
      today: rows.filter(function (r) { return U.str(r.date).slice(0, 10) === today; }).length
    };
  },

  /* ============================== STATUS =================================== */
  /** Simple status move (CONFIRMED / PICKING / PACKED / DELIVERED / CANCELLED) */
  status: function (p, s) {
    Auth.require(s, 'pos.sell');
    var o = DB.byId('Orders', p.id);
    if (!o) throw new Error('Order nahi mila');
    var next = U.upper(U.str(p.status));
    if (Orders.STATUS.indexOf(next) < 0) throw new Error('Ghalat status');
    if (next === 'INVOICED') throw new Error('Status se invoice nahi banta — convert use karein.');
    if (U.str(o.status) === 'INVOICED') throw new Error('Invoiced order ka status nahi badalta.');
    DB.update('Orders', o.id, { status: next, updatedAt: U.iso(),
      statusBy: s.userId, statusAt: U.iso() }, s);
    /* v2.6 §15 — status change audit (before → after) */
    Audit.log('ORDER_STATUS', 'Orders', o.id,
      { status: U.str(o.status) },
      { status: next, total: U.num(o.total), orderNo: o.orderNo }, s);
    return DB.byId('Orders', o.id);
  },

  remove: function (p, s) {
    Auth.require(s, 'pos.sell');
    var o = DB.byId('Orders', p.id);
    if (!o) throw new Error('Order nahi mila');
    if (U.str(o.status) !== 'DRAFT') {
      throw new Error('Sirf DRAFT order delete ho sakti hai (pehle cancel karein).');
    }
    DB.all('OrderItems').filter(function (r) { return r.orderId === o.id; })
      .forEach(function (r) { DB.remove('OrderItems', r.id, s); });
    DB.remove('Orders', o.id, s);
    return { deleted: true, id: o.id };
  },

  /* ============================== CONVERT ================================== */
  /**
   * Order → asli invoice. Stock, ledger, loyalty, accounting sab Sales.create
   * ke through chalte hain (double posting ka koi khatra nahi).
   */
  convert: function (p, s) {
    Auth.require(s, 'pos.sell');
    var o = DB.byId('Orders', p.id);
    if (!o) throw new Error('Order nahi mila');
    if (U.str(o.status) === 'INVOICED') throw new Error('Ye order pehle hi invoice ho chuki hai.');
    if (U.str(o.status) === 'CANCELLED') throw new Error('Cancelled order invoice nahi ho sakti.');
    var lines = DB.all('OrderItems').filter(function (r) { return r.orderId === o.id; });
    if (!lines.length) throw new Error('Order mein koi item nahi hai.');

    var advance = U.num(p.advance, U.num(o.advance));
    var method = U.upper(U.str(p.method) || 'CASH');
    var payments = [];
    if (advance > 0) payments.push({ method: method, amount: advance, reference: o.orderNo });
    if (p.payments && p.payments.length) payments = p.payments;

    var sale = Sales.create({
      locationId: o.locationId,
      customerId: o.customerId,
      customerName: o.customerName,
      customerTypeId: ((DB.byId('Customers', o.customerId) || {}).customerTypeId) || '',
      salespersonId: o.salespersonId || s.userId,
      items: lines.map(function (l) {
        return { itemId: l.itemId, qty: U.num(l.qty), price: U.num(l.price),
          discount: U.num(l.discount), taxRate: U.num(l.taxRate), notes: l.note || '' };
      }),
      discount: U.num(o.discount) - U.round(U.sum(lines, 'discount'), 2),
      payments: payments,
      notes: (o.notes ? o.notes + ' · ' : '') + 'Order ' + o.orderNo,
      source: 'ORDER'
    }, s);

    DB.update('Orders', o.id, { status: 'INVOICED', saleId: sale.id,
      invoiceNo: sale.invoiceNo, advance: advance, updatedAt: U.iso(),
      convertedBy: s.userId, convertedAt: U.iso() }, s);
    /* v2.6 §15 — order → invoice conversion audit (kaun, kab, kis invoice me) */
    Audit.log('ORDER_CONVERT', 'Orders', o.id,
      { status: U.str(o.status), total: U.num(o.total), advance: U.num(o.advance) },
      { status: 'INVOICED', saleId: sale.id, invoiceNo: sale.invoiceNo,
        total: U.num(sale.total), advance: advance }, s);
    return { order: DB.byId('Orders', o.id), sale: sale };
  }
};
