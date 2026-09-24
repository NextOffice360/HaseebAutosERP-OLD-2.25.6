/**
 * HASEEB AUTOS - ERP / POS  ::  LOYALTY / POINTS ENGINE
 * ---------------------------------------------------------------------------
 * Settings (Settings ▸ Trade ▸ Customers) se sab configurable:
 *   loyalty.enabled        — on/off
 *   loyalty.perAmount      — har kitne rupay par 1 point (default 1000)
 *   loyalty.points         — kitne points (default 1)
 *   loyalty.rate           — 1 point kitne rupay ka (redemption value, default 1)
 *   loyalty.minRedeem      — kam az kam itne points redeem ho sakte hain (default 50)
 *   loyalty.maxRedeemPct   — invoice ka max kitna % points se pay ho sakta hai (default 50)
 *   loyalty.rounding       — DOWN | NEAREST | UP
 *   loyalty.expiryMonths   — 0 = kabhi expire nahi
 *
 * Formulas
 *   earned  = floor( (invoiceTotal / perAmount) * points )        (rounding setting ke mutabiq)
 *   value   = points * rate                                        (rupees)
 *   allowed = min(availablePoints, floor(invoiceTotal * maxRedeemPct/100 / rate))
 * ---------------------------------------------------------------------------
 */

var Loyalty = {
  cfg: function (k) {
    var st = DB.settings();
    return st[k] !== undefined && st[k] !== '' ? U.num(st[k]) : (LOYALTY_DEFAULTS[k] !== undefined ? LOYALTY_DEFAULTS[k] : 0);
  },
  str: function (k, d) {
    var st = DB.settings();
    return U.str(st[k] || (LOYALTY_DEFAULTS[k] !== undefined ? LOYALTY_DEFAULTS[k] : d || ''));
  },
  enabled: function () { return U.str(Loyalty.str('loyalty.enabled', 'true')) !== 'false'; },

  /* ------------------------------ balances -------------------------------- */
  /** Ledger-based balance (authoritative) — Customers.points fallback */
  balance: function (customerId) {
    if (!customerId) return 0;
    var rows = DB.all('LoyaltyLedger').filter(function (r) { return r.customerId === customerId; });
    if (!rows.length) return U.num((DB.byId('Customers', customerId) || {}).points);
    var bal = 0;
    rows.forEach(function (r) {
      if (U.str(r.expiresAt) && U.parseDate(r.expiresAt) && U.parseDate(r.expiresAt) < new Date()) return; // expired
      bal += U.num(r.points);
    });
    return U.round(bal, 2);
  },

  /** Customer ke liye full summary (POS dialog me dikhaya jata hai) */
  summary: function (customerId, invoiceTotal) {
    var points = Loyalty.balance(customerId);
    var rate = U.num(Loyalty.cfg('loyalty.rate')) || 1;
    var maxPct = U.num(Loyalty.cfg('loyalty.maxRedeemPct'));
    var cap = invoiceTotal ? Math.floor((U.num(invoiceTotal) * (maxPct || 100) / 100) / rate) : points;
    var usable = Math.max(0, Math.min(points, cap));
    return { points: points, value: U.round(points * rate, 2), rate: rate,
      minRedeem: U.num(Loyalty.cfg('loyalty.minRedeem')),
      maxRedeemPct: maxPct, usablePoints: usable,
      usableValue: U.round(usable * rate, 2), enabled: Loyalty.enabled() };
  },

  /* ------------------------------- earning -------------------------------- */
  earn: function (sale, s) {
    if (!Loyalty.enabled() || !sale.customerId) return 0;
    var perAmount = U.num(Loyalty.cfg('loyalty.perAmount')) || 1000;
    var perPts = U.num(Loyalty.cfg('loyalty.points')) || 1;
    if (perAmount <= 0) return 0;
    var raw = (U.num(sale.total) / perAmount) * perPts;
    var mode = U.str(Loyalty.str('loyalty.rounding', 'DOWN')).toUpperCase();
    var pts = mode === 'UP' ? Math.ceil(raw) : (mode === 'NEAREST' ? Math.round(raw) : Math.floor(raw));
    if (pts <= 0) return 0;
    Loyalty.post(sale.customerId, pts, 'EARN', sale.id, 'SALE',
      'Earned on ' + sale.invoiceNo, s, sale.date);
    return pts;
  },

  /* ------------------------------ redeeming ------------------------------- */
  pointsToCash: function (points) { return U.round(U.num(points) * (U.num(Loyalty.cfg('loyalty.rate')) || 1), 2); },
  cashToPoints: function (amount) {
    var rate = U.num(Loyalty.cfg('loyalty.rate')) || 1;
    return Math.ceil(U.num(amount) / rate);
  },

  /**
   * Points redeem karein — payment ke tor par (POS) ya manual adjustment.
   * p = { customerId, points, refId, refType, note }
   */
  redeem: function (p, s) {
    Auth.require(s, 'sales.create');
    var pts = U.num(p.points);
    var cust = DB.byId('Customers', p.customerId);
    if (!cust) throw new Error('Customer nahi mila.');
    if (!Loyalty.enabled()) throw new Error('Loyalty program off hai (Settings ▸ Trade ▸ Customers).');
    if (pts <= 0) throw new Error('Points 0 se zyada hone chahiye.');
    var available = Loyalty.balance(p.customerId);
    if (pts > available) throw new Error('Itne points nahi hain (available ' + available + ').');
    var minRedeem = U.num(Loyalty.cfg('loyalty.minRedeem'));
    if (minRedeem && pts < minRedeem) throw new Error('Kam az kam ' + minRedeem + ' points redeem karein.');

    var value = Loyalty.pointsToCash(pts);
    // ledger: points ki value se customer ka udhaar kam karo
    Parties.postLedger('CUSTOMER', p.customerId, {
      date: U.iso(), refType: p.refType || 'LOYALTY_REDEEM', refId: p.refId || '',
      description: 'Loyalty points redeemed (' + pts + ' pts)', debit: 0, credit: value,
      locationId: p.locationId || s.locationId
    }, s);
    Loyalty.post(p.customerId, -pts, 'REDEEM', p.refId || '', p.refType || 'SALE',
      p.note || ('Redeemed ' + pts + ' points = ' + value), s);
    return { points: pts, value: value, balance: Loyalty.balance(p.customerId) };
  },

  /** Manual adjust (owner/manager) */
  adjust: function (p, s) {
    Auth.require(s, 'customers.update');
    var pts = U.num(p.points);
    if (!pts) throw new Error('Points daalein.');
    Loyalty.post(p.customerId, pts, U.str(p.type || 'ADJUST').toUpperCase(), p.refId || '', 'MANUAL',
      p.note || 'Manual adjustment', s);
    return { balance: Loyalty.balance(p.customerId) };
  },

  post: function (customerId, points, type, refId, refType, note, s, date) {
    var months = U.num(Loyalty.cfg('loyalty.expiryMonths'));
    var exp = '';
    if (months > 0) {
      var d = U.parseDate(date || U.iso()) || new Date();
      d.setMonth(d.getMonth() + months);
      exp = U.dateOnly(d);
    }
    DB.insert('LoyaltyLedger', {
      id: U.uid('LOY'), date: date || U.iso(), customerId: customerId, type: type,
      points: U.round(points, 2), amount: U.round(Math.abs(points) * (U.num(Loyalty.cfg('loyalty.rate')) || 1), 2),
      refType: refType || '', refId: refId || '', note: note || '',
      expiresAt: exp, createdBy: s ? s.userId : '', createdAt: U.iso()
    }, s);
    // Customers.points mirror (tezy lookup ke liye)
    try {
      var c = DB.byId('Customers', customerId);
      if (c) DB.update('Customers', customerId, { points: String(Loyalty.balance(customerId)) }, s);
    } catch (e) { }
  },

  history: function (p, s) {
    Auth.require(s, 'customers.view');
    var rows = DB.all('LoyaltyLedger').filter(function (r) { return r.customerId === p.customerId; })
      .sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    return { rows: rows.slice(0, U.num(p.limit, 100)).map(function (r) {
      return { id: r.id, date: r.date, type: r.type, points: U.num(r.points), amount: U.num(r.amount),
        note: r.note, refId: r.refId, expiresAt: r.expiresAt || '' };
    }), balance: Loyalty.balance(p.customerId),
      lifetime: U.round(U.sum(rows.filter(function (r) { return U.num(r.points) > 0; }), 'points'), 2) };
  }
};

var LOYALTY_DEFAULTS = {
  'loyalty.enabled': 'true',
  'loyalty.perAmount': 1000,
  'loyalty.points': 1,
  'loyalty.rate': 1,
  'loyalty.minRedeem': 50,
  'loyalty.maxRedeemPct': 50,
  'loyalty.rounding': 'DOWN',
  'loyalty.expiryMonths': 0
};
