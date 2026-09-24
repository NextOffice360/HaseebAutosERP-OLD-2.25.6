/**
 * HASEEB AUTOS - ERP / POS  ::  PAYMENT METHODS ENGINE
 * ---------------------------------------------------------------------------
 * Har payment method (cash, card, bank transfer, JazzCash, EasyPaisa, Raast,
 * cheque, credit/udhaar) yahan register hai. Koi bhi number hardcoded nahi —
 * fee %, fixed fee, FED %, settlement days, kaunsi fields chahiye, sab
 * **Settings ▸ Trade ▸ Payment methods** se configurable hain.
 *
 * ───────────────────────── FORMULAS (industry standard) ──────────────────────
 *   fee        = round(amount × feePct/100, 2) + feeFixed
 *   fed        = round(fee × fedPct/100, 2)           ← FED on the *fee*, not amount
 *   netSettled = amount − fee − fed                    ← jo merchant ko milta hai
 *   settleDate = date + settleDays (business days, weekend skip configurable)
 *
 *   CASH / BANK / RAAST / CREDIT → 0% MDR
 *   JAZZCASH  → merchant MDR ~1.5–2.5%  (settlement T+1…T+3)
 *   EASYPAISA → merchant MDR ~1.5–3.0%  (settlement T+1…T+3)
 *   CARD      → MDR ~2.5%               (settlement T+2)
 *   CHEQUE    → 0% MDR, par clearing ke baad hi bank mein paisa hota hai
 *               (status PENDING → CLEARED / BOUNCED)
 *
 * Reference: State Bank of Pakistan (Raast = instant, currently no transaction
 * fee; Raast ID = mobile number ya IBAN), JazzCash/EasyPaisa merchant MDR
 * published ranges. Har rate Settings mein edit ho sakta hai.
 * ---------------------------------------------------------------------------
 */

var PayMethods = {

  /* ============================ DEFINITIONS ================================ */
  /**
   * FIELD SCHEMA — frontend aur backend dono isi se bante hain (ek hi source of truth).
   *   key        : payment record par save hone wala column
   *   label      : UI label (EN + Roman Urdu mix)
   *   type       : tel | text | date | number
   *   required   : lazmi hai ya nahi (requireRef setting se override hota hai)
   *   pattern    : validation regex (string)
   *   hint       : placeholder / help text
   *   role       : PAYER (jo paisa bhej raha) | RECEIVER (jise mil raha) | REF | META
   */
  FIELD_SCHEMA: {
    payerMobile: { label: 'Bhejne wale ka mobile (customer)', type: 'tel', required: true,
      pattern: '^(03\\d{9}|\\+?92\\d{10}|3\\d{9})$', hint: '03001234567', role: 'PAYER' },
    receiverMobile: { label: 'Payment milne wala mobile (wallet/agent)', type: 'tel', required: false,
      pattern: '^(03\\d{9}|\\+?92\\d{10}|3\\d{9})$', hint: 'Merchant wallet number', role: 'RECEIVER' },
    txnId: { label: 'Transaction ID (wallet)', type: 'text', required: true,
      pattern: '^[A-Za-z0-9\\-_]{4,40}$', hint: 'JazzCash / EasyPaisa Txn ID', role: 'REF' },
    raastId: { label: 'Raast ID (mobile ya IBAN)', type: 'text', required: true,
      pattern: '^(03\\d{9}|\\+?92\\d{10}|PK\\d{2}[A-Z]{4}[A-Z0-9]{16}|[A-Z0-9]{8,34})$',
      hint: '03001234567 ya PK36SCBL0000001123456702', role: 'REF' },
    bankName: { label: 'Bank', type: 'text', required: false, pattern: '^[A-Za-z .\\-&]{2,40}$',
      hint: 'Meezan / HBL / UBL …', role: 'META' },
    accountNo: { label: 'Account / IBAN', type: 'text', required: false,
      pattern: '^[A-Z0-9\\-]{6,34}$', hint: 'IBAN ya account number', role: 'REF' },
    reference: { label: 'Reference / IBFT number', type: 'text', required: false,
      pattern: '^[A-Za-z0-9\\-\\/]{3,40}$', hint: 'Bank reference', role: 'REF' },
    chequeNo: { label: 'Cheque number', type: 'text', required: true,
      pattern: '^[A-Za-z0-9\\-]{3,20}$', hint: 'CHQ-123456', role: 'REF' },
    chequeDate: { label: 'Cheque date', type: 'date', required: true, pattern: '', hint: '', role: 'META' },
    cardLast4: { label: 'Card last 4 digits', type: 'text', required: false,
      pattern: '^\\d{4}$', hint: '1234', role: 'META' },
    approvalCode: { label: 'Approval code', type: 'text', required: false,
      pattern: '^[A-Za-z0-9]{4,12}$', hint: 'POS slip par likha code', role: 'REF' },
    dueDate: { label: 'Wada kiya gaya date', type: 'date', required: false, pattern: '', hint: '', role: 'META' },
    points: { label: 'Points', type: 'number', required: false, pattern: '^\\d+(\\.\\d+)?$', hint: '', role: 'META' }
  },

  /**
   * group: CASH | CARD | WALLET | BANK | CHEQUE | CREDIT
   * fields: is method ke liye kaunsi fields chahiye (order matters)
   */
  DEFAULTS: [
    { id: 'CASH', label: 'Cash', group: 'CASH', icon: '\uD83D\uDCB5', feePct: 0, feeFixed: 0,
      fedPct: 0, settleDays: 0, postOnClear: false, fields: [], requireRef: false },

    { id: 'CARD', label: 'Card (POS machine)', group: 'CARD', icon: '\uD83D\uDCB3', feePct: 2.5,
      feeFixed: 0, fedPct: 0, settleDays: 2, postOnClear: false,
      fields: ['bankName', 'cardLast4', 'approvalCode'], requireRef: true },

    { id: 'BANK', label: 'Bank transfer / IBFT', group: 'BANK', icon: '\uD83C\uDFE6', feePct: 0,
      feeFixed: 0, fedPct: 0, settleDays: 1, postOnClear: false,
      fields: ['bankName', 'accountNo', 'reference'], requireRef: true },

    { id: 'JAZZCASH', label: 'JazzCash', group: 'WALLET', icon: '\uD83D\uDFE3', feePct: 2.0,
      feeFixed: 0, fedPct: 0, settleDays: 2, postOnClear: false,
      fields: ['payerMobile', 'receiverMobile', 'txnId'], requireRef: true },

    { id: 'EASYPAISA', label: 'EasyPaisa', group: 'WALLET', icon: '\uD83D\uDFE2', feePct: 2.5,
      feeFixed: 0, fedPct: 0, settleDays: 2, postOnClear: false,
      fields: ['payerMobile', 'receiverMobile', 'txnId'], requireRef: true },

    { id: 'RAAST', label: 'Raast (instant, free)', group: 'BANK', icon: '⚡', feePct: 0,
      feeFixed: 0, fedPct: 0, settleDays: 0, postOnClear: false,
      fields: ['raastId', 'bankName'], requireRef: true },

    { id: 'CHEQUE', label: 'Cheque', group: 'CHEQUE', icon: '\uD83E\uDDFE', feePct: 0,
      feeFixed: 0, fedPct: 0, settleDays: 2, postOnClear: true,
      fields: ['chequeNo', 'bankName', 'chequeDate'], requireRef: true },

    { id: 'CREDIT', label: 'Credit / Udhaar', group: 'CREDIT', icon: '\uD83D\uDCD2', feePct: 0,
      feeFixed: 0, fedPct: 0, settleDays: 0, postOnClear: false,
      fields: ['dueDate'], requireRef: false },

    { id: 'LOYALTY', label: 'Loyalty points', group: 'CREDIT', icon: '⭐', feePct: 0,
      feeFixed: 0, fedPct: 0, settleDays: 0, postOnClear: false,
      fields: ['points'], requireRef: false }
  ],

  /* ============================== READ ===================================== */
  /** Settings ▸ Trade ▸ Payment methods se values uthao (default ke sath merge) */
  all: function (s) {
    var st = DB.settings();
    var enabledList = U.str(st.paymentMethods ||
      'CASH,CARD,BANK,JAZZCASH,EASYPAISA,RAAST,CHEQUE,CREDIT').split(',')
      .map(function (x) { return U.str(x).toUpperCase(); }).filter(Boolean);

    return PayMethods.DEFAULTS.map(function (d) {
      var k = 'pay.' + d.id + '.';
      var num = function (key, def) { return st[k + key] !== undefined ? U.num(st[k + key]) : def; };
      return {
        id: d.id,
        label: U.str(st[k + 'label']) || d.label,
        group: d.group, icon: d.icon, fields: d.fields,
        enabled: st[k + 'enabled'] !== undefined
          ? U.str(st[k + 'enabled']) !== 'false'
          : enabledList.indexOf(d.id) > -1,
        feePct: num('feePct', d.feePct),
        feeFixed: num('feeFixed', d.feeFixed),
        fedPct: num('fedPct', d.fedPct),
        settleDays: num('settleDays', d.settleDays),
        postOnClear: d.postOnClear,
        requireRef: U.str(st[k + 'requireRef']) !== 'false' && d.requireRef,
        minAmount: num('minAmount', 0),
        maxAmount: num('maxAmount', 0),
        fields: d.fields,
        fieldSchema: PayMethods.FIELD_SCHEMA
      };
    });
  },

  get: function (id, s) {
    var all = PayMethods.all(s);
    var m = all.filter(function (x) { return x.id === U.str(id).toUpperCase(); })[0];
    return m || { id: U.str(id).toUpperCase(), label: U.str(id).toUpperCase(), group: 'CASH',
      icon: '💵', fields: [], enabled: true, feePct: 0, feeFixed: 0, fedPct: 0,
      settleDays: 0, postOnClear: false, requireRef: false };
  },

  /** Sirf enabled methods (POS dialog isi se banta hai) */
  enabled: function (s) {
    return PayMethods.all(s).filter(function (m) { return m.enabled; });
  },

  /* ============================ CALCULATION ================================ */
  /**
   * Fee / FED / net settlement calculate karein.
   * @return { gross, feePct, feeFixed, fee, fedPct, fed, net, settleDate,
   *           postOnClear, requiresClearing, method, label }
   */
  compute: function (amount, methodId, s, dateStr) {
    var m = PayMethods.get(methodId, s);
    var amt = U.num(amount);
    var pctFee = U.round(amt * U.num(m.feePct) / 100, 2);
    var fee = U.round(pctFee + U.num(m.feeFixed), 2);
    var fed = U.round(fee * U.num(m.fedPct) / 100, 2);
    var net = U.round(amt - fee - fed, 2);
    var base = dateStr ? U.parseDate(dateStr) : new Date();
    if (!base || isNaN(base.getTime())) base = new Date();

    return {
      method: m.id, label: m.label, group: m.group, icon: m.icon,
      gross: U.round(amt, 2),
      feePct: U.num(m.feePct), feeFixed: U.num(m.feeFixed), fee: fee,
      fedPct: U.num(m.fedPct), fed: fed,
      net: net,
      settleDays: U.num(m.settleDays),
      settleDate: U.dateOnly(PayMethods.addBusinessDays(base, U.num(m.settleDays))),
      postOnClear: !!m.postOnClear,
      requiresClearing: !!m.postOnClear,
      requireRef: !!m.requireRef
    };
  },

  /** Business days add karein — weekend skip setting ke mutabiq (Sat+Sun) */
  addBusinessDays: function (from, days) {
    days = U.num(days) || 0;
    var d = new Date(from.getTime ? from.getTime() : from);
    if (!days) return d;
    var st = DB.settings() || {};                       // dotted keys flat hote hain
    var skip = U.str(st['pay.settleSkipWeekend']) !== 'false';
    var added = 0;
    var guard = 0;
    while (added < days && guard < 400) {
      d.setDate(d.getDate() + 1);
      guard++;
      var day = d.getDay();                 // 0=Sun, 6=Sat
      if (skip && (day === 0 || day === 6)) continue;
      added++;
    }
    return d;
  },

  /* ============================ VALIDATION ================================= */
  /**
   * Ek payment row validate karein (POS + backend dono isi ko call karte hain).
   * p = { method, amount, payerMobile, txnId, … }
   * → { ok:true } ya { ok:false, errors:[{field,message}] }
   */
  validate: function (p) {
    var m = PayMethods.get(p.method);
    var errors = [];
    var amt = U.num(p.amount);

    if (amt <= 0) errors.push({ field: 'amount', message: 'Amount 0 se zyada hona chahiye.' });
    if (m.minAmount && amt < U.num(m.minAmount)) {
      errors.push({ field: 'amount', message: 'Kam az kam ' + m.minAmount + ' ki payment ho sakti hai (' + m.label + ').' });
    }
    if (m.maxAmount && amt > U.num(m.maxAmount)) {
      errors.push({ field: 'amount', message: 'Zyada se zyada ' + m.maxAmount + ' ki payment ho sakti hai (' + m.label + ').' });
    }

    (m.fields || []).forEach(function (key) {
      var f = PayMethods.FIELD_SCHEMA[key];
      if (!f) return;
      var val = U.str(p[key]);
      var needed = f.required && (m.requireRef || f.role === 'PAYER');
      if (!val) {
        if (needed) errors.push({ field: key, message: f.label + ' darj karein.' });
        return;
      }
      if (f.pattern && !(new RegExp(f.pattern).test(val))) {
        errors.push({ field: key, message: f.label + ' sahi format mein nahi (' + (f.hint || f.pattern) + ').' });
      }
    });

    /* Cheque: future/past date sanity */
    if (m.group === 'CHEQUE' && U.str(p.chequeDate)) {
      var d = U.parseDate(p.chequeDate);
      if (!d || isNaN(d.getTime())) errors.push({ field: 'chequeDate', message: 'Cheque date sahi nahi.' });
      else if (d.getTime() > Date.now() + 400 * 86400000) {
        errors.push({ field: 'chequeDate', message: 'Cheque date 1 saal se zyada future mein nahi ho sakti.' });
      }
    }
    return { ok: errors.length === 0, errors: errors, method: m.id, label: m.label };
  },

  /** Frontend ke liye: method ke fields ki poori metadata */
  fieldsFor: function (id) {
    var m = PayMethods.get(id);
    return (m.fields || []).map(function (key) {
      var f = PayMethods.FIELD_SCHEMA[key] || {};
      return { key: key, label: f.label || key, type: f.type || 'text',
        required: !!f.required && (m.requireRef || f.role === 'PAYER'),
        pattern: f.pattern || '', hint: f.hint || '', role: f.role || 'META' };
    });
  },

  /* ============================== CHEQUES ================================== */
  /** Pending / bounced cheques (receivable + payable) */
  cheques: function (p, s) {
    Auth.require(s, 'payments.view');
    p = p || {};
    var rows = DB.all('Payments').filter(function (r) {
      if (PayMethods.get(r.method, s).group !== 'CHEQUE') return false;
      if (p.status && U.str(r.status || 'PENDING') !== p.status) return false;
      if (p.type && r.type !== p.type) return false;
      if (p.partyId && r.partyId !== p.partyId) return false;
      return true;
    });
    return rows.map(function (r) {
      return { id: r.id, voucherNo: r.voucherNo, date: r.date, type: r.type,
        partyName: r.partyName, amount: U.num(r.amount), chequeNo: r.chequeNo || '',
        bankName: r.bankName || '', chequeDate: r.chequeDate || '',
        status: r.status || 'PENDING', clearingDate: r.clearingDate || '',
        settleDate: r.settleDate || '', bounceCharges: U.num(r.bounceCharges),
        daysToClear: r.chequeDate ? PayMethods._daysBetween(r.chequeDate, r.clearingDate || U.dateOnly()) : null };
    });
  },

  _daysBetween: function (a, b) {
    var d1 = U.parseDate(a), d2 = U.parseDate(b);
    if (!d1 || !d2) return null;
    return Math.round((d2.getTime() - d1.getTime()) / 86400000);
  },

  /**
   * Cheque clear ya bounce karein.
   * CLEARED → ledger post (agar deferred tha) + status update
   * BOUNCED → amount wapas customer ke udhaar mein (receivable) ya supplier
   *           payment cancel; bank charges (settings: pay.cheque.bounceCharges)
   *           customer par debit.
   */
  clear: function (p, s) {
    Auth.require(s, 'payments.create');
    var rec = DB.byId('Payments', p.id);
    if (!rec) throw new Error('Payment record nahi mila.');
    if (PayMethods.get(rec.method, s).group !== 'CHEQUE') throw new Error('Ye cheque payment nahi hai.');

    var status = U.str(p.status || 'CLEARED').toUpperCase();
    if (['CLEARED', 'BOUNCED'].indexOf(status) === -1) throw new Error('Status CLEARED ya BOUNCED hona chahiye.');

    var charges = U.num(p.bounceCharges, U.num(DB.settings()['pay.cheque.bounceCharges']));
    var patch = { status: status, clearingDate: p.clearingDate || U.dateOnly(),
      clearedBy: s.userId, clearedAt: U.iso(),
      reference: p.reference || rec.reference };

    if (status === 'BOUNCED') {
      patch.bounceCharges = charges;
      /* Sirf wahi amount reverse karein jo ledger mein post hua tha:
         PENDING cheque kabhi post hua hi nahi (deferLedger) → sirf bank charges. */
      var wasPosted = U.str(rec.status || 'PENDING') === 'CLEARED';
      if (rec.partyId && rec.partyType && wasPosted) {
        var isOut = rec.type === 'SUPPLIER_PAYMENT' || rec.type === 'REFUND_OUT';
        Parties.postLedger(rec.partyType, rec.partyId, {
          date: patch.clearingDate, refType: 'CHEQUE_BOUNCE', refId: rec.id,
          description: 'Cheque bounced ' + (rec.chequeNo || rec.voucherNo) +
            (isOut ? ' — supplier payment reverse' : ' — receipt reverse'),
          debit: isOut ? 0 : U.num(rec.amount), credit: isOut ? U.num(rec.amount) : 0,
          locationId: rec.locationId
        }, s);
      }
      // bank charges hamesha lagte hain (chahe cheque post hua ho ya nahi)
      if (charges > 0 && rec.partyId && rec.partyType) {
        Parties.postLedger(rec.partyType, rec.partyId, {
          date: patch.clearingDate, refType: 'BANK_CHARGES', refId: rec.id,
          description: 'Cheque bounce bank charges', debit: charges, credit: 0,
          locationId: rec.locationId
        }, s);
      }
      Notifications.push('CHEQUE_BOUNCE', 'Cheque bounced',
        (rec.partyName || '') + ' · ' + (rec.chequeNo || rec.voucherNo) + ' · ' + fmtMoney_(rec.amount),
        'error', '#/money', rec.locationId, s);
    } else if (U.str(rec.status) === 'PENDING' || !rec.status) {
      // CLEARED: agar ledger deferred tha to ab post karo
      if (PayMethods.get(rec.method, s).postOnClear && rec.partyId && rec.partyType) {
        var out = rec.type === 'SUPPLIER_PAYMENT' || rec.type === 'REFUND_OUT';
        Parties.postLedger(rec.partyType, rec.partyId, {
          date: patch.clearingDate, refType: rec.type, refId: rec.id,
          description: 'Cheque cleared ' + (rec.chequeNo || rec.voucherNo),
          debit: out ? U.num(rec.amount) : 0, credit: out ? 0 : U.num(rec.amount),
          locationId: rec.locationId
        }, s);
      }
    }

    DB.update('Payments', rec.id, patch, s);
    Audit.log('CHEQUE_' + status, 'Payments', rec.id, rec, patch, s);
    return { id: rec.id, status: status, bounceCharges: charges, clearingDate: patch.clearingDate };
  },

  /* =========================== RECONCILIATION ============================== */
  /** Method-wise totals: gross, fee, FED, net, pending clearing */
  reconcile: function (p, s) {
    Auth.require(s, 'payments.view');
    p = p || {};
    var from = p.from ? U.startOfDay(p.from) : null;
    var to = p.to ? U.startOfDay(p.to) : null;
    if (to) to.setDate(to.getDate() + 1);

    var rows = DB.all('Payments').filter(function (r) {
      if (p.locationId && r.locationId !== p.locationId) return false;
      var d = U.parseDate(r.date);
      if (from && (!d || d < from)) return false;
      if (to && (!d || d >= to)) return false;
      return true;
    });

    var by = {};
    rows.forEach(function (r) {
      var m = U.str(r.method || 'CASH').toUpperCase();
      by[m] = by[m] || { method: m, label: PayMethods.get(m, s).label, count: 0,
        gross: 0, fee: 0, fed: 0, net: 0, pending: 0, pendingAmount: 0 };
      var g = U.num(r.amount);
      by[m].count++;
      by[m].gross += g;
      by[m].fee += U.num(r.fee);
      by[m].fed += U.num(r.fed);
      by[m].net += U.num(r.net, g);
      if (U.str(r.status) === 'PENDING') { by[m].pending++; by[m].pendingAmount += g; }
    });

    Object.keys(by).forEach(function (k) {
      ['gross', 'fee', 'fed', 'net', 'pendingAmount'].forEach(function (f) {
        by[k][f] = U.round(by[k][f], 2);
      });
      by[k].net = U.round(by[k].gross - by[k].fee - by[k].fed, 2);
    });

    var list = Object.keys(by).map(function (k) { return by[k]; });
    list.sort(function (a, b) { return b.gross - a.gross; });
    return { rows: list, totals: {
      count: rows.length,
      gross: U.round(U.sum(list, 'gross'), 2),
      fee: U.round(U.sum(list, 'fee'), 2),
      fed: U.round(U.sum(list, 'fed'), 2),
      net: U.round(U.sum(list, 'net'), 2),
      pendingAmount: U.round(U.sum(list, 'pendingAmount'), 2)
    } };
  }
};
