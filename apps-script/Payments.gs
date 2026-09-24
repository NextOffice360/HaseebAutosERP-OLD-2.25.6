/**
 * HASEEB AUTOS - ERP / POS  ::  PAYMENTS / EXPENSES / CASH SESSIONS
 */

var Payments = {

  /* ============================== PAYMENTS ================================= */
  list: function (p, s) {
    Auth.require(s, 'payments.view');
    p = p || {};
    var rows = DB.all('Payments').reverse();
    if (p.type) rows = rows.filter(function (r) { return r.type === p.type; });
    if (p.partyId) rows = rows.filter(function (r) { return r.partyId === p.partyId; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (p.method) rows = rows.filter(function (r) { return r.method === p.method; });
    if (p.from) {
      var from = U.startOfDay(p.from);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= from; });
    }
    if (p.to) {
      var to = U.startOfDay(p.to); to.setDate(to.getDate() + 1);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d < to; });
    }
    return rows.slice(0, U.num(p.limit, 200)).map(Payments._brief);
  },

  _brief: function (r) {
    return { id: r.id, voucherNo: r.voucherNo, date: r.date, type: r.type, partyType: r.partyType,
      partyId: r.partyId, partyName: r.partyName, amount: U.num(r.amount), method: r.method,
      reference: r.reference, locationId: r.locationId, sessionId: r.sessionId, notes: r.notes,
      createdBy: r.createdBy,
      /* v2.2 */
      status: r.status || 'CLEARED', fee: U.num(r.fee), fed: U.num(r.fed),
      net: U.num(r.net, U.num(r.amount)), settleDate: r.settleDate || '',
      bankName: r.bankName || '', chequeNo: r.chequeNo || '', chequeDate: r.chequeDate || '',
      clearingDate: r.clearingDate || '', walletNumber: r.walletNumber || '',
      txnId: r.txnId || '', raastId: r.raastId || '', bounceCharges: U.num(r.bounceCharges) };
  },

  /**
   * internal=true jab sale/purchase se auto call ho (permission bypass for system flows)
   */
  create: function (payload, s, internal) {
    if (!internal) Auth.require(s, 'payments.create');
    /* v2.6 §20 — ROOT-CAUSE GUARD: ledger chup-chaap skip na ho.
       Caller ne `customerId` / `supplierId` diya ho aur `partyId` bhool gaya ho,
       to partyId khud bana lo. Warna payment to save ho jati hai magar
       party ka balance hamesha ke liye ghalat reh jata hai (koi error bhi nahi). */
    if (!payload.partyId) {
      if (payload.customerId) { payload.partyId = payload.customerId; if (!payload.partyType) payload.partyType = 'CUSTOMER'; }
      else if (payload.supplierId) { payload.partyId = payload.supplierId; if (!payload.partyType) payload.partyType = 'SUPPLIER'; }
    }
    var amount = U.num(payload.amount);
    if (amount <= 0) throw new Error('Amount 0 se zyada hona chahiye.');
    var type = payload.type || 'RECEIPT';
    var method = U.str(payload.method || 'CASH').toUpperCase();
    var date = payload.date || U.iso();

    /* ---- method schema validation (fields, limits) — real-world guard rails ---- */
    if (payload.validate !== false) {
      try {
        var v = PayMethods.validate(Object.assign({ method: method, amount: amount }, payload));
        if (!v.ok) {
          throw new Error(v.errors.map(function (e) { return e.message; }).join(' '));
        }
      } catch (e) {
        if (e && e.errors) throw new Error(e.errors.map(function (x) { return x.message; }).join(' '));
        throw e;
      }
    }

    /* ---- fee / FED / net settlement (PayMethods engine, settings-driven) ---- */
    var calc = {};
    try { calc = PayMethods.compute(amount, method, s, date); } catch (e) { calc = {}; }
    var fee = U.num(calc.fee), fed = U.num(calc.fed);
    var net = U.num(calc.net, U.round(amount - fee - fed, 2));

    /* cheque (ya koi bhi postOnClear method) → PENDING, ledger clearing par */
    var defer = !!(calc.postOnClear) && payload.deferLedger !== false;
    var status = defer ? 'PENDING' : (payload.status || 'CLEARED');

    var rec = DB.insert('Payments', {
      id: U.uid('PAY'), voucherNo: DB.nextNumber('PAY', payload.locationId || s.locationId),
      date: date, type: type, partyType: payload.partyType || '',
      partyId: payload.partyId || '',
      partyName: payload.partyName || Payments._partyName(payload) || '',
      amount: amount, method: method, reference: payload.reference || '',
      locationId: payload.locationId || s.locationId,
      /* v2.30.0 — receipt shop session se auto-jure (explicit sessionId jeetta hai) */
      sessionId: U.str(payload.sessionId) || (function () {
        try {
          var cur = Payments.currentSessionRaw(payload.locationId || s.locationId, s.userId);
          return (cur && U.str(cur.status) === 'OPEN') ? U.str(cur.id) : '';
        } catch (e) { return ''; }
      })(),
      notes: payload.notes || '', createdBy: s ? s.userId : '', createdAt: U.iso(),
      /* v2.2 */
      status: status, fee: fee, fed: fed, net: net, settleDate: calc.settleDate || '',
      bankName: payload.bankName || '', accountNo: payload.accountNo || '',
      chequeNo: payload.chequeNo || '', chequeDate: payload.chequeDate || '',
      clearingDate: '', bounceCharges: 0,
      walletNumber: payload.walletNumber || payload.receiverMobile || '',
      txnId: payload.txnId || '', raastId: payload.raastId || '',
      cardLast4: payload.cardLast4 || '', approvalCode: payload.approvalCode || '',
      payerMobile: payload.payerMobile || '', receiverMobile: payload.receiverMobile || '',
      dueDate: payload.dueDate || '', clearedBy: '', clearedAt: '',
      saleId: payload.saleId || '', purchaseId: payload.purchaseId || ''
    }, s);

    // Ledger effect — cheque ke liye clearing tak deferred
    if (payload.partyId && payload.partyType && !defer) {
      var isOut = type === 'SUPPLIER_PAYMENT' || type === 'REFUND_OUT';
      Parties.postLedger(payload.partyType, payload.partyId, {
        date: rec.date, refType: type, refId: rec.id,
        description: (isOut ? 'Payment ' : 'Receipt ') + rec.voucherNo + ' ' + method,
        debit: isOut ? amount : 0, credit: isOut ? 0 : amount, locationId: rec.locationId
      }, s);
    }
    /* v2.5: accounting auto-post — cheque ke liye clearing par post hoga */
    if (!defer) Accounting.auto('PAYMENT', { payment: rec }, s);

    var out = Payments._brief(rec);
    out.status = status; out.fee = fee; out.fed = fed; out.net = net;
    out.settleDate = calc.settleDate || ''; out.requiresClearing = defer;
    return out;
  },

  _partyName: function (p) {
    if (!p.partyId) return p.partyName || '';
    if (p.partyType === 'CUSTOMER') return (DB.byId('Customers', p.partyId) || {}).name || '';
    if (p.partyType === 'SUPPLIER') return (DB.byId('Suppliers', p.partyId) || {}).name || '';
    return '';
  },

  /* ============================== EXPENSES ================================= */
  listExpenses: function (p, s) {
    Auth.require(s, 'reports.view');
    var rows = DB.all('Expenses').reverse();
    if ((p || {}).locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    return rows.slice(0, U.num((p || {}).limit, 200));
  },

  createExpense: function (payload, s) {
    Auth.require(s, 'expenses.create');
    var amount = U.num(payload.amount);
    if (amount <= 0) throw new Error('Amount zaroori hai.');
    /* v2.5: paid-from account (cash / bank) + bill reference + tax + attachment + approval */
    var needsApproval = U.str(DB.settings().expenseApproval) === 'true' &&
      amount >= U.num(DB.settings().expenseApprovalOver, 0);
    /* v2.5.3 §6: expense ko khuli cash session se joro — warna ye shop closing,
       cash flow aur auto reports mein kabhi nazar hi nahi aati thi.
       Explicit sessionId hamesha jeet-ta hai (back-compat + imports ke liye). */
    var sesId = U.str(payload.sessionId);
    if (!sesId) {
      try {
        var cur = Payments.currentSessionRaw(payload.locationId || s.locationId, s.userId);
        if (cur && U.str(cur.status) === 'OPEN') sesId = cur.id;
      } catch (e) { sesId = ''; }
    }
    var rec = DB.insert('Expenses', {
      id: U.uid('EXP'), voucherNo: DB.nextNumber('EXP', payload.locationId || s.locationId),
      date: payload.date || U.dateOnly(), category: payload.category || 'GENERAL', amount: amount,
      paidTo: payload.paidTo || '', method: payload.method || 'CASH',
      locationId: payload.locationId || s.locationId, sessionId: sesId,
      notes: payload.notes || '', createdBy: s.userId, createdAt: U.iso(),
      accountId: payload.accountId || '', reference: payload.reference || '',
      taxAmount: U.num(payload.taxAmount), attachmentUrl: payload.attachmentUrl || '',
      status: needsApproval ? 'PENDING' : 'POSTED', approvedBy: '', journalId: ''
    }, s);
    if (!needsApproval) Accounting.auto('EXPENSE', { expense: rec }, s);
    return rec;
  },

  /** Expense approve / reject (v2.5) — approve hote hi voucher post hota hai */
  approveExpense: function (id, approve, s) {
    Auth.require(s, 'expenses.create');
    var rec = DB.byId('Expenses', id);
    if (!rec) throw new Error('Expense nahi mili.');
    if (U.str(rec.status) !== 'PENDING') return rec;
    if (!approve) return DB.update('Expenses', id, { status: 'REJECTED', approvedBy: s.userId }, s);
    var upd = DB.update('Expenses', id, { status: 'POSTED', approvedBy: s.userId }, s);
    Accounting.auto('EXPENSE', { expense: upd }, s);
    return upd;
  },

  /**
   * W7 (v2.26.0) — expense approve BATCH.
   * Pehle: "Sab approve karein" N alag `expenses.approve` calls bhejta tha — slow
   * backend par 20 pending = 20 round-trips = ~1 minute (aap ki shikayat ki jarh).
   * Ab: EK request, andar DB.updateMany se EK read + EK write.
   *   p = { ids: [...], approve: true|false }
   */
  approveExpenseBatch: function (ids, approve, s) {
    Auth.require(s, 'expenses.create');
    var list = (ids || []).filter(Boolean);
    var seen = {}, dupes = 0;
    list = list.filter(function (id) { if (seen[id]) { dupes++; return false; } seen[id] = 1; return true; });
    if (!list.length) return { approved: 0, ids: [], skipped: dupes };
    var recs = DB.all('Expenses', true) || [];
    var byId = {};
    recs.forEach(function (r) { byId[r.id] = r; });
    /* DB.updateMany ka format: [{ id, patch: {…} }] — ek read + ek write */
    var patches = [], approved = [], skipped = dupes;
    list.forEach(function (id) {
      var rec = byId[id];
      if (!rec) { skipped++; return; }
      if (approve === false) { patches.push({ id: id, patch: { status: 'REJECTED', approvedBy: s.userId } }); approved.push(id); return; }
      if (U.str(rec.status) !== 'PENDING') { skipped++; return; }   /* already posted */
      patches.push({ id: id, patch: { status: 'POSTED', approvedBy: s.userId } });
      approved.push(id);
    });
    if (!patches.length) return { approved: 0, ids: [], skipped: skipped };
    DB.updateMany('Expenses', patches, s);
    /* accounting posting — batch ke baad EK fresh read (N reads nahi), phir har posted expense ka auto-voucher */
    var after = DB.all('Expenses', true) || [];
    var map = {}; after.forEach(function (r) { map[r.id] = r; });
    approved.forEach(function (id) {
      var rec = map[id];
      if (rec && U.str(rec.status) === 'POSTED') {
        try { Accounting.auto('EXPENSE', { expense: rec }, s); } catch (e) { }
      }
    });
    return { approved: approved.length, ids: approved, skipped: skipped };
  },

  /* ============================ CASH SESSIONS ============================== */
  openSession: function (p, s) {
    Auth.require(s, 'pos.cash.manage');
    var locId = p.locationId || s.locationId;
    var existing = Payments.currentSessionRaw(locId, s.userId);
    if (existing) return existing;
    var ses = DB.insert('CashSessions', {
      id: U.uid('SES'), sessionNo: DB.nextNumber('SESSION', locId), locationId: locId,
      userId: s.userId, openingCash: U.num(p.openingCash), expectedCash: U.num(p.openingCash),
      closingCash: '', variance: '', openedAt: U.iso(), closedAt: '', status: 'OPEN',
      notes: p.notes || ''
    }, s);
    /* v2.6 §7 — shop khulte hi opening report (settings-driven) */
    var autoRepO = null;
    if (typeof Reports !== 'undefined' && Reports.dayReport) {
      autoRepO = Reports.dayReport.auto('OPEN', ses, s);
    }
    if (autoRepO && ses && typeof ses === 'object') {
      ses.dayReport = autoRepO;
      ses.autoPrint = U.str((DB.settings() || {}).dayReportAutoPrint) !== 'false';
    }
    return ses;
  },

  currentSessionRaw: function (locId, userId) {
    return DB.findOne('CashSessions', function (r) {
      return r.status === 'OPEN' && r.locationId === locId && r.userId === userId;
    });
  },

  currentSession: function (locId, s) {
    locId = locId || s.locationId;
    var ses = Payments.currentSessionRaw(locId, s.userId);
    if (!ses) return null;
    var totals = Payments.sessionTotals(ses);
    return {
      id: ses.id, sessionNo: ses.sessionNo, locationId: ses.locationId, openedAt: ses.openedAt,
      openingCash: U.num(ses.openingCash), status: ses.status, totals: totals,
      expectedCash: U.round(U.num(ses.openingCash) + totals.netCash, 2)
    };
  },

  sessionTotals: function (ses) {
    var pays = DB.all('Payments').filter(function (p) { return p.sessionId === ses.id; });
    var exps = DB.all('Expenses').filter(function (e) { return e.sessionId === ses.id; });
    /* Cash drawer ki movement — sirf CASH method.
       OUT = refund, supplier payment, safe drop (CASH_OUT/DROP)
       IN  = sale receipt, customer recovery, float top-up (CASH_IN)          */
    var OUT_TYPES = ['REFUND_OUT', 'SUPPLIER_PAYMENT', 'CASH_OUT', 'DROP'];
    var isOut = function (p) { return OUT_TYPES.indexOf(U.str(p.type)) > -1; };
    var cashIn = U.sum(pays.filter(function (p) { return p.method === 'CASH' && !isOut(p); }), 'amount');
    var cashOut = U.sum(pays.filter(function (p) { return p.method === 'CASH' && isOut(p); }), 'amount');
    var expCash = U.sum(exps.filter(function (e) { return e.method === 'CASH'; }), 'amount');
    var card = U.sum(pays.filter(function (p) { return p.method !== 'CASH' && !isOut(p); }), 'amount');

    /* v2.5.3 (§5/§6): cash sales / credit sales / refunds ALAG ALAG heads.
       Pehle sirf ek mila-jhula "cashIn" tha — is se closing report mein ye
       nazar nahi aata tha ke kitni naqdi bikri hui, kitna udhaar gaya aur
       kitni wapsi hui. Ab sab alag — reconciliation asaan. */
    var saleIds = {};
    DB.all('Sales').forEach(function (x) { if (x.sessionId === ses.id) saleIds[x.id] = x; });
    var isSaleReceipt = function (p) {
      return (U.str(p.type) === 'SALE_RECEIPT') || (!!p.saleId && !!saleIds[p.saleId]);
    };
    var cashSales = U.sum(pays.filter(function (p) {
      return p.method === 'CASH' && !isOut(p) && isSaleReceipt(p);
    }), 'amount');
    var creditSales = U.round(Object.keys(saleIds).reduce(function (a, k) {
      return a + U.num(saleIds[k].due);
    }, 0), 2);
    var refunds = U.sum(pays.filter(function (p) { return U.str(p.type) === 'REFUND_OUT'; }), 'amount');

    return {
      cashIn: U.round(cashIn, 2), cashOut: U.round(cashOut, 2), expenses: U.round(expCash, 2),
      card: U.round(card, 2), netCash: U.round(cashIn - cashOut - expCash, 2),
      /* §5 alag heads */
      cashSales: U.round(cashSales, 2), creditSales: creditSales, refunds: U.round(refunds, 2),
      txns: pays.length
    };
  },

  /** Detailed day summary for a session (Shop Open/Close screen) */
  sessionSummary: function (p, s) {
    var ses = null;
    if (p && p.sessionId) ses = DB.byId('CashSessions', p.sessionId);
    if (!ses) ses = Payments.currentSessionRaw((p && p.locationId) || s.locationId, s.userId);
    if (!ses) return null;
    var totals = Payments.sessionTotals(ses);
    var expected = U.round(U.num(ses.openingCash) + totals.netCash, 2);

    /* payment method breakdown — sirf is session ke receipts */
    var pays = DB.all('Payments').filter(function (x) { return x.sessionId === ses.id; });
    var byMethod = {};
    pays.forEach(function (x) {
      var m = U.str(x.method) || 'CASH';
      if (!byMethod[m]) byMethod[m] = { method: m, count: 0, amount: 0 };
      byMethod[m].count++;
      byMethod[m].amount = U.round(byMethod[m].amount + U.num(x.amount), 2);
    });
    var methods = Object.keys(byMethod).map(function (k) { return byMethod[k]; })
      .sort(function (a, b) { return b.amount - a.amount; });

    /* cash movements (petty cash in / out) */
    var moves = pays.filter(function (x) {
      return x.type === 'CASH_IN' || x.type === 'CASH_OUT' || x.type === 'DROP';
    }).map(function (x) {
      return { id: x.id, date: x.date, type: x.type, amount: U.num(x.amount),
        reason: x.notes || x.reference || '', method: x.method, by: x.createdBy };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    /* expenses by category */
    var exps = DB.all('Expenses').filter(function (e) { return e.sessionId === ses.id; });
    var byCat = {};
    exps.forEach(function (e) {
      var c = U.str(e.category) || 'GENERAL';
      if (!byCat[c]) byCat[c] = { category: c, count: 0, amount: 0 };
      byCat[c].count++;
      byCat[c].amount = U.round(byCat[c].amount + U.num(e.amount), 2);
    });

    /* sales + returns of the session */
    var sales = DB.all('Sales').filter(function (x) { return x.sessionId === ses.id; });
    var gross = U.sum(sales.filter(function (x) { return x.type !== 'RETURN'; }), 'total');
    var returns = U.sum(sales.filter(function (x) { return x.type === 'RETURN'; }), 'total');
    var udhaar = U.sum(sales.filter(function (x) { return U.num(x.dueAmount) > 0; }), 'dueAmount');

    return {
      id: ses.id, sessionNo: ses.sessionNo, locationId: ses.locationId,
      openedAt: ses.openedAt, closedAt: ses.closedAt, status: ses.status,
      openingCash: U.num(ses.openingCash), closingCash: ses.closingCash === '' || ses.closingCash === undefined
        ? null : U.num(ses.closingCash),
      variance: ses.variance === '' || ses.variance === undefined ? null : U.num(ses.variance),
      notes: ses.notes || '',
      totals: totals, expectedCash: expected,
      methods: methods, moves: moves.slice(0, 60),
      expenses: Object.keys(byCat).map(function (k) { return byCat[k]; }),
      sales: { count: sales.length, gross: U.round(gross, 2), returns: U.round(returns, 2), udhaar: U.round(udhaar, 2) }
    };
  },

  /**
   * DAY / SHIFT CLOSING REPORT (v2.5.1)
   * Kisi bhi session (open ya closed) ka poori tafseel — PDF export aur print ke liye.
   * Is mein hai: branch/cashier, waqt, sales (gross/returns/udhaar), payment methods,
   * cash movements, expenses by head, top items, aur expected vs counted + variance.
   */
  dayReport: function (p, s) {
    Auth.require(s, 'pos.cash.manage');
    p = p || {};
    var ses = p.sessionId ? DB.byId('CashSessions', p.sessionId)
      : Payments.currentSessionRaw(p.locationId || s.locationId, s.userId);
    if (!ses) {
      var all = DB.all('CashSessions').filter(function (r) {
        return r.locationId === (p.locationId || s.locationId);
      });
      all.sort(function (a, b) { return String(b.openedAt || '').localeCompare(String(a.openedAt || '')); });
      ses = all[0];
    }
    if (!ses) throw new Error('Koi session nahi mili — pehle shop open karein.');

    var sum = Payments.sessionSummary({ sessionId: ses.id }, s) || {};

    /* top items (qty + value) — is shift ke sale lines se */
    var saleIds = {};
    var sales = DB.all('Sales').filter(function (x) { saleIds[x.id] = 1; return x.sessionId === ses.id; });
    var byItem = {};
    DB.all('SaleItems').forEach(function (l) {
      if (!saleIds[l.saleId]) return;
      var k = l.itemId || U.str(l.name);
      if (!byItem[k]) byItem[k] = { itemId: k, name: U.str(l.name), code: U.str(l.code), qty: 0, amount: 0 };
      byItem[k].qty += U.num(l.qty);
      byItem[k].amount = U.round(byItem[k].amount + U.num(l.lineTotal), 2);
    });
    var top = Object.keys(byItem).map(function (k) { return byItem[k]; })
      .sort(function (a, b) { return b.amount - a.amount; }).slice(0, 10);

    /* hour-wise sales (kab kaam zyada hua) */
    var byHour = {};
    sales.forEach(function (x) {
      var h = U.str(x.date).slice(11, 13);
      if (!h) return;
      if (!byHour[h]) byHour[h] = { hour: h, bills: 0, amount: 0 };
      byHour[h].bills++;
      byHour[h].amount = U.round(byHour[h].amount + U.num(x.total), 2);
    });
    var hours = Object.keys(byHour).sort().map(function (k) { return byHour[k]; });

    var loc = DB.byId('Locations', ses.locationId) || {};
    var user = DB.byId('Users', ses.userId) || {};
    var st = DB.settings();
    var mins = 0;
    try {
      mins = Math.round((new Date(U.str(ses.closedAt) || Date.now()).getTime() -
        new Date(U.str(ses.openedAt)).getTime()) / 60000);
    } catch (e) { mins = 0; }

    /* v2.5.3 §5/§6: closing ke alag alag heads top level par bhi.
       `expenses` pehle se by-category ARRAY hai (UI isi naam se use karta hai),
       is liye number ke liye naya naam `expenseTotal` — koi breaking change nahi. */
    var t = sum.totals || {};
    /* v2.30.0 — is session ka SAVE SHUDA report (OPEN/CLOSE) — UI title + share
       ke liye: opening report ko "closing" kehna galat tha. */
    var saved = null;
    try {
      var reps = DB.all('DayReports').filter(function (x) { return x.sessionId === ses.id; });
      reps.sort(function (a, b) { return U.str(a.generatedAt) > U.str(b.generatedAt) ? -1 : 1; });
      saved = reps[0] || null;
    } catch (e) { saved = null; }
    return Object.assign({}, sum, {
      reportId: saved ? saved.id : '',
      reportNo: saved ? saved.reportNo : '',
      reportKind: saved ? U.upper(U.str(saved.kind)) : '',
      cashSales: U.num(t.cashSales), creditSales: U.num(t.creditSales),
      refunds: U.num(t.refunds), expenseTotal: U.num(t.expenses),
      cashIn: U.num(t.cashIn), cashOut: U.num(t.cashOut),
      netSales: U.round(U.num(sum.sales && sum.sales.gross) - U.num(sum.sales && sum.sales.returns), 2),
      reportTitle: 'Day / Shift Closing Report',
      generatedAt: U.iso(),
      locationName: U.str(loc.name), locationCode: U.str(loc.code),
      cashier: U.str(user.fullName || user.username), cashierUsername: U.str(user.username),
      business: { name: U.str(st.receiptHeader || st.businessName || 'Haseeb Autos'),
        ur: U.str(st.businessNameUr || ''), phone: U.str(st.phone || ''),
        address: U.str(st.address || ''), ntn: U.str(st.ntn || '') },
      currency: U.str(st.currencySymbol || 'Rs'),
      durationMins: mins,
      top: top, hours: hours,
      bills: sales.length
    });
  },

  /** Cash IN / Cash OUT during the day (petty cash, safe drop, etc.) */
  cashMove: function (p, s) {
    Auth.require(s, 'pos.cash.manage');
    var ses = Payments.currentSessionRaw(p.locationId || s.locationId, s.userId);
    if (!ses) throw new Error('Pehle shop open karein.');
    var type = U.str(p.type).toUpperCase();
    if (['CASH_IN', 'CASH_OUT', 'DROP'].indexOf(type) === -1) {
      throw new Error('Type CASH_IN / CASH_OUT / DROP hona chahiye.');
    }
    var amt = U.num(p.amount);
    if (amt <= 0) throw new Error('Amount zaroori hai.');
    var rec = DB.insert('Payments', {
      id: U.uid('PAY'), voucherNo: DB.nextNumber('PAY', ses.locationId),
      date: p.date || U.dateOnly(), type: type, method: 'CASH', amount: amt,
      partyType: '', partyId: p.partyId || '', saleId: '', purchaseId: '',
      sessionId: ses.id, locationId: ses.locationId,
      reference: p.reference || '', notes: p.notes || p.reason || '',
      createdBy: s.userId, createdAt: U.iso()
    }, s);
    Audit.log('CASH_' + type, 'Payments', rec.id, null, { amount: amt, reason: p.reason || '' }, s);
    return Payments.sessionSummary({ sessionId: ses.id }, s);
  },

  /** Pichhli sessions (history) */
  sessionHistory: function (p, s) {
    var rows = DB.all('CashSessions').filter(function (r) {
      return !p || !p.locationId || r.locationId === p.locationId;
    });
    rows.sort(function (a, b) { return String(b.openedAt || '').localeCompare(String(a.openedAt || '')); });
    return rows.slice(0, U.num((p || {}).limit, 30)).map(function (r) {
      return {
        id: r.id, sessionNo: r.sessionNo, openedAt: r.openedAt, closedAt: r.closedAt,
        status: r.status, openingCash: U.num(r.openingCash),
        closingCash: r.closingCash === '' || r.closingCash === undefined ? null : U.num(r.closingCash),
        expectedCash: r.expectedCash === '' || r.expectedCash === undefined ? null : U.num(r.expectedCash),
        variance: r.variance === '' || r.variance === undefined ? null : U.num(r.variance),
        userId: r.userId
      };
    });
  },

  closeSession: function (p, s) {
    Auth.require(s, 'pos.cash.manage');
    var ses = Payments.currentSessionRaw(p.locationId || s.locationId, s.userId);
    if (!ses) throw new Error('Koi open session nahi mili.');
    var totals = Payments.sessionTotals(ses);
    var expected = U.round(U.num(ses.openingCash) + totals.netCash, 2);
    var closing = U.num(p.closingCash);
    var updated = DB.update('CashSessions', ses.id, {
      expectedCash: expected, closingCash: closing, variance: U.round(closing - expected, 2),
      closedAt: U.iso(), status: 'CLOSED',
      notes: p.notes || U.str(ses.notes)
    }, s);
    /* v2.6 §7 — band karte hi closing report auto-generate (settings-driven) */
    var autoRep = null;
    if (typeof Reports !== 'undefined' && Reports.dayReport) {
      autoRep = Reports.dayReport.auto('CLOSE', ses, s);
    }
    /* BUG (v2.6 QA): pehle auto() ka natija phenk diya jata tha — report to banti
       thi magar user ko kuch nazar nahi aata tha (§7 ke point 3+4 ghaib).
       Ab report ko jawab ke sath wapas bhejte hain taake UI foran
       print / PDF / share options dikha sake. */
    if (autoRep && updated && typeof updated === 'object') {
      updated.dayReport = autoRep;
      updated.autoPrint = U.str((DB.settings() || {}).dayReportAutoPrint) !== 'false';
    }
    return updated;
  }
};

/* ================================ COMMISSIONS =============================== */
var Commissions = {

  /** Har sale par commission accrue (slab: item > category > user > global) */
  accrue: function (sale, lineRows, s) {
    try {
      var slabs = DB.all('CommissionSlabs').filter(function (x) { return U.str(x.active) !== 'false'; });
      var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
      lineRows.forEach(function (lr) {
        var it = items[lr.itemId] || {};
        var amount = U.num(lr.lineTotal);
        var slab = Commissions._findSlab(slabs, lr.salespersonId, lr.itemId, it.category, amount);
        var rate = slab ? U.num(slab.rate) : U.num((s || {}).commissionRate, 0);
        var commission = slab && slab.rateType === 'FIXED' ? rate : U.round(amount * rate / 100, 2);
        if (commission > 0) {
          DB.insert('Commissions', {
            id: U.uid('COM'), date: sale.date, saleId: sale.id, salespersonId: lr.salespersonId,
            itemId: lr.itemId, saleAmount: amount, rate: rate, amount: commission,
            status: 'PENDING', paidAt: '', paymentId: ''
          });
        }
      });
    } catch (e) { Logger.log('Commission error: ' + e.message); }
  },

  _findSlab: function (slabs, userId, itemId, category, amount) {
    var candidates = slabs.filter(function (x) {
      if (x.itemId && x.itemId !== itemId) return false;
      if (x.userId && x.userId !== userId) return false;
      if (x.category && x.category !== category) return false;
      return amount >= U.num(x.fromAmount, 0) && amount <= U.num(x.toAmount, 999999999);
    });
    candidates.sort(function (a, b) {
      var sa = (b.itemId ? 4 : 0) + (b.userId ? 2 : 0) + (b.category ? 1 : 0);
      var sb = (a.itemId ? 4 : 0) + (a.userId ? 2 : 0) + (a.category ? 1 : 0);
      return sa - sb;
    });
    return candidates[0] || null;
  },

  reverseForSale: function (saleId, s) {
    DB.all('Commissions').filter(function (c) { return c.saleId === saleId; })
      .forEach(function (c) { DB.update('Commissions', c.id, { status: 'REVERSED' }, s); });
  },

  reverseForReturn: function (ret, s) {
    /*
     * v2.30.1 (N11) — partial return par poore sale ki commission REVERSE nahi
     * hoti (pehle puri commission REVERSED ho jati thi → salesman ka haq zaya).
     * Sirf returned hissa proportionally kam hota hai (line net ke hisab se);
     * poori qty wapas → share 1 → wahi purana REVERSED. Sirf PENDING kam hoti
     * hai — PAID commission ko chupaana double-count hai.
     */
    DB.all('Commissions').filter(function (c) {
      return c.saleId === ret.saleId && U.str(c.status) === 'PENDING';
    }).forEach(function (c) {
      /* is item ke POORE returns (pehle wale + ye wala) — warna do alag
         returns par har baar bacha hua hisab hi kata jata */
      var priorNet = 0, thisNet = 0;
      DB.all('SaleReturnItems').forEach(function (ri) {
        var r = DB.byId('SaleReturns', ri.returnId);
        if (!r || r.saleId !== ret.saleId || ri.itemId !== c.itemId) return;
        if (ri.returnId === ret.id) thisNet += U.num(ri.lineTotal);
        else priorNet += U.num(ri.lineTotal);
      });
      if (thisNet <= 0) return; /* is item ka return nahi — commission qayam */
      var saleLine = DB.all('SaleItems').filter(function (r) {
        return r.saleId === ret.saleId && r.itemId === c.itemId;
      })[0];
      var lineNet = saleLine
        ? U.num(saleLine.price) * U.num(saleLine.qty) - U.num(saleLine.discount)
        : U.num(c.saleAmount);
      var baseNet = Math.max(0, lineNet - priorNet);
      var share = baseNet > 0 ? Math.min(1, thisNet / baseNet) : 1;
      var remain = U.round(U.num(c.amount) * (1 - share), 2);
      if (remain <= 0.009) {
        DB.update('Commissions', c.id, { status: 'REVERSED' }, s);
      } else {
        DB.update('Commissions', c.id, { amount: remain, saleAmount: U.round(U.num(c.saleAmount) * (1 - share), 2) }, s);
      }
    });
  },

  summary: function (p, s) {
    Auth.require(s, 'reports.view');
    var rows = DB.all('Commissions');
    if ((p || {}).salespersonId) rows = rows.filter(function (r) { return r.salespersonId === p.salespersonId; });
    if ((p || {}).from) {
      var from = U.startOfDay(p.from);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= from; });
    }
    var byPerson = U.groupBy(rows, 'salespersonId');
    var out = Object.keys(byPerson).map(function (uid) {
      return {
        salespersonId: uid, name: (DB.byId('Users', uid) || {}).fullName || uid,
        pending: U.round(U.sum(byPerson[uid].filter(function (r) { return r.status === 'PENDING'; }), 'amount'), 2),
        paid: U.round(U.sum(byPerson[uid].filter(function (r) { return r.status === 'PAID'; }), 'amount'), 2),
        txns: byPerson[uid].length
      };
    });
    return out;
  },

  /** Commission payment → expense + mark paid */
  pay: function (salespersonId, amount, method, s) {
    Auth.require(s, 'payments.create');
    var pending = DB.all('Commissions').filter(function (c) {
      return c.salespersonId === salespersonId && c.status === 'PENDING';
    });
    var pay = Payments.create({
      type: 'COMMISSION', partyType: '', partyId: salespersonId,
      partyName: (DB.byId('Users', salespersonId) || {}).fullName || '',
      amount: U.num(amount), method: method || 'CASH', reference: 'Commission payout',
      notes: pending.length + ' entries cleared'
    }, s, true);
    pending.forEach(function (c) {
      DB.update('Commissions', c.id, { status: 'PAID', paidAt: U.iso(), paymentId: pay.id }, s);
    });
    return pay;
  }
};
