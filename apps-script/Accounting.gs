/**
 * HASEEB AUTOS - ERP / POS  ::  ACCOUNTING
 * ---------------------------------------------------------------------------
 * Proper double-entry accounting layer:
 *   • Chart of accounts (Assets / Liabilities / Equity / Income / Expense)
 *   • Journal vouchers (JV, Cash/Bank receipt & payment, Contra, Expense)
 *   • Auto-posting from real business events (sale, GRN, payment, expense)
 *   • Books: Day book, Cash book, Bank book, Ledger
 *   • Reports: Trial balance, Profit & Loss, Balance sheet, Ageing
 *   • Bank reconciliation (statement import + matching)
 *
 * Design notes
 *   - Har account ka `normalSide` hai: ASSET/EXPENSE = DR, LIABILITY/EQUITY/INCOME = CR
 *   - Ledger balance hamesha "debit positive" rakhte hain (opening + dr - cr)
 *   - Reports mein `display` balance normalSide ke hisaab se sign kiya jata hai
 *   - System accounts (cash/receivable/payable/sales...) Settings se map hote hain,
 *     is liye koi account id code mein hardcode nahi — `Accounting.acct(key)` dekhein.
 */

var Accounting = {

  /* ======================= CHART OF ACCOUNTS ============================= */

  /** Settings-driven system account map (code change kiya ja sakta hai) */
  SYS_KEYS: [
    ['acc.cash', '1000', 'Cash in hand'],
    ['acc.bank', '1100', 'Bank (default)'],
    ['acc.receivable', '1200', 'Accounts receivable'],
    ['acc.payable', '2000', 'Accounts payable'],
    ['acc.inventory', '1300', 'Inventory / stock'],
    ['acc.sales', '4000', 'Sales revenue'],
    ['acc.salesWholesale', '4100', 'Wholesale sales'],
    ['acc.purchase', '5000', 'Purchases (COGS)'],
    ['acc.freight', '5100', 'Freight & cartage'],
    ['acc.cogs', '5000', 'Cost of goods sold'],
    ['acc.expense', '6900', 'General expense'],
    ['acc.tax', '2100', 'Tax / GST payable'],
    ['acc.capital', '3000', 'Owner capital'],
    ['acc.retained', '3100', 'Retained earnings'],
    ['acc.discount', '4200', 'Discount / other income']
  ],

  /** Setting se account code → account record */
  acct: function (key, s) {
    var code = '';
    SYS_KEYS_SAFE().forEach(function (k) { if (k[0] === key) code = k[1]; });
    var want = U.str(Config.get(key, code, s)) || code;
    var byCode = DB.findOne('Accounts', function (a) { return U.str(a.code) === want; });
    return byCode || null;
  },

  /** Account id (narration / journal lines ke liye) */
  acctId: function (key, s) {
    var a = Accounting.acct(key, s);
    return a ? a.id : '';
  },

  /** Default chart of accounts — Setup.seedAll() se chalti hai, baar baar nahi banti */
  seedAccounts: function (s) {
    var made = 0;
    ACCOUNTS_SEED.forEach(function (a) {
      var exists = DB.findOne('Accounts', function (x) { return U.str(x.code) === a[0]; });
      if (exists) return;
      DB.insert('Accounts', {
        id: U.uid('ACC'), code: a[0], name: a[1], group: a[2], type: a[3],
        parentId: '', bankName: a[4] || '', accountNo: a[5] || '', branch: '',
        isCash: a[3] === 'CASH' ? 'true' : 'false',
        isBank: a[3] === 'BANK' ? 'true' : 'false',
        normalSide: (a[2] === 'ASSET' || a[2] === 'EXPENSE') ? 'DR' : 'CR',
        openingBalance: Number(a[6] || 0), currentBalance: Number(a[6] || 0),
        active: 'true', notes: '', createdAt: U.iso()
      }, s);
      made++;
    });
    return made;
  },

  listAccounts: function (p, s) {
    Auth.require(s, 'reports.financial');
    var rows = DB.all('Accounts');
    rows = rows.filter(function (a) { return U.str(a.active) !== 'false' || (p && p.all); });
    return rows.map(function (a) { return Accounting._acctDecorate(a); })
      .sort(function (x, y) { return String(x.code).localeCompare(String(y.code)); });
  },

  _acctDecorate: function (a) {
    var bal = Accounting._balance(a.id);
    return {
      id: a.id, code: a.code, name: a.name, group: a.group, type: a.type,
      bankName: a.bankName, accountNo: a.accountNo, branch: a.branch,
      isCash: U.str(a.isCash) === 'true', isBank: U.str(a.isBank) === 'true',
      normalSide: a.normalSide || 'DR',
      openingBalance: U.num(a.openingBalance),
      ledgerBalance: U.round(bal, 2),
      displayBalance: U.round(a.normalSide === 'CR' ? -bal : bal, 2),
      active: U.str(a.active) !== 'false'
    };
  },

  /** opening + Σ(debit) − Σ(credit)  (debit-positive ledger balance) */
  _balance: function (accountId, uptoDate, excludeJournalId) {
    var acc = DB.byId('Accounts', accountId);
    if (!acc) return 0;
    var bal = U.num(acc.openingBalance);
    var jids = null;
    if (uptoDate) {
      jids = {};
      DB.all('Journals').forEach(function (j) {
        if (U.str(j.date) <= uptoDate && j.status !== 'VOID') jids[j.id] = 1;
      });
    }
    DB.all('JournalLines').forEach(function (l) {
      if (l.accountId !== accountId) return;
      if (excludeJournalId && l.journalId === excludeJournalId) return;
      if (jids && !jids[l.journalId]) return;
      if (!jids) {                                  // no date filter → skip void vouchers
        var j = DB.byId('Journals', l.journalId);
        if (j && j.status === 'VOID') return;
      }
      bal += U.num(l.debit) - U.num(l.credit);
    });
    return U.round(bal, 2);
  },

  saveAccount: function (payload, s) {
    Auth.require(s, 'settings.manage');
    var rec = U.pick(payload, SCHEMA.Accounts);
    if (!rec.name) throw new Error('Account name zaroori hai.');
    if (!rec.code) {
      var max = 0;
      DB.all('Accounts').forEach(function (a) { max = Math.max(max, U.num(a.code)); });
      rec.code = String(max + 10);
    }
    var dup = DB.findOne('Accounts', function (a) {
      return U.str(a.code) === U.str(rec.code) && a.id !== rec.id;
    });
    if (dup) throw new Error('Code ' + rec.code + ' pehle se maujood hai.');
    rec.group = rec.group || 'ASSET';
    rec.type = rec.type || 'GENERAL';
    rec.normalSide = (rec.group === 'ASSET' || rec.group === 'EXPENSE') ? 'DR' : 'CR';
    rec.isCash = String(rec.isCash === true || rec.isCash === 'true');
    rec.isBank = String(rec.isBank === true || rec.isBank === 'true');
    rec.active = rec.active === undefined ? 'true' : String(rec.active);
    if (rec.id) return DB.update('Accounts', rec.id, rec, s);
    rec.openingBalance = U.num(rec.openingBalance);
    return DB.insert('Accounts', Object.assign({ id: U.uid('ACC'), createdAt: U.iso() }, rec), s);
  },

  /* ============================ JOURNAL ================================== */

  /**
   * Voucher post karna. lines = [{accountId, debit, credit, partyType, partyId, narration}]
   * Validation: kam az kam 2 lines, har line mein dr ya cr (dono nahi), totals barabar.
   */
  postJournal: function (payload, s) {
    Auth.require(s, 'payments.create');
    var lines = (payload.lines || []).filter(function (l) {
      return l && (U.num(l.debit) > 0 || U.num(l.credit) > 0);
    });
    if (lines.length < 2) throw new Error('Voucher mein kam az kam do lines (debit + credit) chahiye.');
    lines.forEach(function (l) {
      if (U.num(l.debit) > 0 && U.num(l.credit) > 0) {
        throw new Error('Ek line mein debit aur credit dono nahi ho sakte.');
      }
      if (!DB.byId('Accounts', l.accountId)) throw new Error('Account ghalat hai: ' + l.accountId);
    });
    var td = 0, tc = 0;
    lines.forEach(function (l) { td += U.num(l.debit); tc += U.num(l.credit); });
    td = U.round(td, 2); tc = U.round(tc, 2);
    if (Math.abs(td - tc) > 0.01) {
      throw new Error('Voucher balanced nahi: debit ' + td + ' vs credit ' + tc +
        ' (farq ' + U.round(td - tc, 2) + ')');
    }

    var j = DB.insert('Journals', {
      id: U.uid('JV'), voucherNo: DB.nextNumber('JV', payload.locationId || s.locationId),
      date: payload.date || U.dateOnly(), type: payload.type || 'JV',
      refType: payload.refType || '', refId: payload.refId || '',
      locationId: payload.locationId || s.locationId,
      narration: payload.narration || '', totalDebit: td, totalCredit: tc,
      status: 'POSTED', createdBy: s.userId, createdAt: U.iso(), postedAt: U.iso()
    }, s);

    /* ------------------------------------------------------------------
       v2.7 §16 PERFORMANCE — N+1 write khatam
       ------------------------------------------------------------------
       Pehle har journal line ke liye alag `DB.insert()` chalta tha — har ek
       mein appendRow() = aik Sheets API call. 10-line voucher = 10 calls;
       Accounting.backfill() mein ye hazaron dafa chalta tha.

       Ab `DB.insertMany()` EK HI setValues() mein sab likh deta hai
       (1 API call). Return shape wahi (records ki array + id/timestamps),
       touch() aur audit bhi waisa hi — business logic par koi asar nahi.
       ------------------------------------------------------------------ */
    var lineRecs = lines.map(function (l, i) {
      var a = DB.byId('Accounts', l.accountId) || {};
      return {
        id: U.uid('JL'), journalId: j.id, accountId: l.accountId, accountCode: a.code || '',
        debit: U.round(U.num(l.debit), 2), credit: U.round(U.num(l.credit), 2),
        partyType: l.partyType || '', partyId: l.partyId || '',
        narration: l.narration || payload.narration || '', lineOrder: i
      };
    });
    if (lineRecs.length) DB.insertMany('JournalLines', lineRecs, s);

    Accounting._touchBalances(lines);
    /* v2.6 §15 — journal posting: before = mutasira accounts ke purane balances,
       after = naye balances + totals. Balance kabhi bin trace na badle. */
    var beforeBal = {};
    lines.forEach(function (l) {
      var a = DB.byId('Accounts', l.accountId);
      if (a && beforeBal[a.id] === undefined) beforeBal[a.id] = U.num(a.currentBalance);
    });
    Accounting._touchBalances(lines);
    var afterBal = {};
    Object.keys(beforeBal).forEach(function (id) {
      var a = DB.byId('Accounts', id);
      afterBal[id] = a ? U.num(a.currentBalance) : null;
    });
    Audit.log('JV_POST', 'Journals', j.id,
      { accountBalances: beforeBal },
      { voucherNo: j.voucherNo, type: j.type, total: td, totalCredit: tc,
        accountBalances: afterBal, lines: lines.length,
        refType: j.refType || '', refId: j.refId || '' }, s);
    return Accounting.getJournal(j.id, s);
  },

  /** Accounts sheet par currentBalance cache update (reports fast) */
  _touchBalances: function (lines) {
    var ids = {};
    lines.forEach(function (l) { ids[l.accountId] = 1; });
    /* ------------------------------------------------------------------
       v2.7 §16 PERFORMANCE — account balances EK HI write mein
       ------------------------------------------------------------------
       Pehle har account ke liye alag DB.update() chalta tha: har ek mein
       rowOf() (poori sheet padhna) + setValues() + Audit.log().
       20-line voucher = 20 reads + 20 writes + 20 audit rows.
       Ab sab balances pahle hisab kar ke DB.updateMany() se ek hi
       read + ek hi write mein likhe jate hain.
       (DB.rowOf() bhi ab memoized hai, to map ek dafa banta hai.)
       ------------------------------------------------------------------ */
    var patches = [];
    Object.keys(ids).forEach(function (id) {
      var a = DB.byId('Accounts', id);
      if (!a) return;
      try { patches.push({ id: id, patch: { currentBalance: Accounting._balance(id) } }); } catch (e) { }
    });
    if (patches.length) {
      try { DB.updateMany('Accounts', patches, null); } catch (e) {
        /* updateMany na chale to purana tareeqa (hifazati) */
        patches.forEach(function (p) {
          try { DB.update('Accounts', p.id, p.patch, null); } catch (e2) { }
        });
      }
    }
  },

  getJournal: function (id, s) {
    Auth.require(s, 'reports.financial');
    var j = DB.byId('Journals', id);
    if (!j) throw new Error('Voucher nahi mila');
    var lines = DB.all('JournalLines').filter(function (l) { return l.journalId === id; })
      .sort(function (a, b) { return U.num(a.lineOrder) - U.num(b.lineOrder); })
      .map(function (l) {
        var a = DB.byId('Accounts', l.accountId) || {};
        return {
          id: l.id, accountId: l.accountId, accountCode: l.accountCode || a.code || '',
          accountName: a.name || '', debit: U.num(l.debit), credit: U.num(l.credit),
          partyType: l.partyType, partyId: l.partyId, narration: l.narration
        };
      });
    return {
      id: j.id, voucherNo: j.voucherNo, date: j.date, type: j.type,
      refType: j.refType, refId: j.refId, locationId: j.locationId,
      narration: j.narration, totalDebit: U.num(j.totalDebit),
      totalCredit: U.num(j.totalCredit), status: j.status,
      createdBy: j.createdBy, lines: lines
    };
  },

  listJournals: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var rows = DB.all('Journals');
    if (p.from) rows = rows.filter(function (r) { return U.str(r.date) >= p.from; });
    if (p.to) rows = rows.filter(function (r) { return U.str(r.date) <= p.to; });
    if (p.type) rows = rows.filter(function (r) { return r.type === p.type; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (p.accountId) {
      var jids = {};
      DB.all('JournalLines').forEach(function (l) { if (l.accountId === p.accountId) jids[l.journalId] = 1; });
      rows = rows.filter(function (r) { return jids[r.id]; });
    }
    if (p.q) {
      var q = U.norm(p.q);
      rows = rows.filter(function (r) {
        return U.norm(r.voucherNo).indexOf(q) > -1 || U.norm(r.narration).indexOf(q) > -1;
      });
    }
    rows.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || String(b.voucherNo).localeCompare(String(a.voucherNo));
    });
    return rows.slice(0, U.num(p.limit, 200)).map(function (j) {
      var lines = DB.all('JournalLines').filter(function (l) { return l.journalId === j.id; });
      var names = {};
      lines.forEach(function (l) {
        var a = DB.byId('Accounts', l.accountId);
        if (a) names[a.name] = (names[a.name] || 0) + U.num(l.debit) - U.num(l.credit);
      });
      var dr = lines.filter(function (l) { return U.num(l.debit) > 0; })
        .map(function (l) { return (DB.byId('Accounts', l.accountId) || {}).name || ''; });
      var cr = lines.filter(function (l) { return U.num(l.credit) > 0; })
        .map(function (l) { return (DB.byId('Accounts', l.accountId) || {}).name || ''; });
      return {
        id: j.id, voucherNo: j.voucherNo, date: j.date, type: j.type,
        refType: j.refType, refId: j.refId, narration: j.narration,
        totalDebit: U.num(j.totalDebit), totalCredit: U.num(j.totalCredit),
        status: j.status, locationId: j.locationId,
        debitAccounts: dr.join(', '), creditAccounts: cr.join(', ')
      };
    });
  },

  /** Voucher radd (reverse) — asli entry VOID hoti hai, kuch delete nahi */
  voidJournal: function (id, s) {
    Auth.require(s, 'settings.manage');
    var j = DB.byId('Journals', id);
    if (!j) throw new Error('Voucher nahi mila');
    if (j.status === 'VOID') return { ok: true, alreadyVoid: true };
    DB.update('Journals', id, { status: 'VOID' }, s);
    Audit.log('JV_VOID', 'Journals', id, { status: j.status }, { status: 'VOID' }, s);
    return { ok: true };
  },

  /* ========================== AUTO POSTING =============================== */

  /**
   * Business event se voucher banana. Har jagah try/catch mein call hota hai —
   * accounting fail ho to bhi asli kaam (sale/GRN/payment) kabhi rukta nahi.
   */
  auto: function (kind, data, s) {
    try {
      if (U.str(Config.get('accounts.autoPost', 'true', s)) !== 'true') return null;
      if (kind === 'SALE') return Accounting._postSale(data, s);
      if (kind === 'GRN') return Accounting._postGRN(data, s);
      if (kind === 'PAYMENT') return Accounting._postPayment(data, s);
      if (kind === 'EXPENSE') return Accounting._postExpense(data, s);
    } catch (e) {
      /* accounting kabhi business flow ko nahi rokega */
      try { Audit.log('JV_AUTOPOST_FAIL', kind, '', { sourceEvent: kind, refId: U.str(ref && ref.sale ? ref.sale.id : (ref && ref.expense ? ref.expense.id : '')) }, { error: String(e.message || e) }, s); } catch (e2) { }
      return null;
    }
    return null;
  },

  _has: function (refType, refId) {
    return !!DB.findOne('Journals', function (j) {
      return j.refType === refType && j.refId === refId && j.status !== 'VOID';
    });
  },

  /* Sale:  Dr Cash/Bank + Dr Receivable(udhaar)   Cr Sales (+ Cr Tax) */
  _postSale: function (d, s) {
    var sale = d.sale || {};
    if (Accounting._has('SALE', sale.id)) return null;
    var total = U.num(sale.total), paid = U.num(sale.paid), due = U.round(total - paid, 2);
    var lines = [];
    var cashId = Accounting.acctId('acc.cash', s);
    var bankId = Accounting.acctId('acc.bank', s);
    var arId = Accounting.acctId('acc.receivable', s);
    var salesId = Accounting.acctId('acc.sales', s);
    if (due > 0 && arId) {
      lines.push({ accountId: arId, debit: due, credit: 0, partyType: 'CUSTOMER', partyId: sale.customerId || '', narration: 'Udhaar' });
    }
    (d.byMethod || []).forEach(function (m) {
      var target = (m.method === 'CASH') ? cashId : bankId;
      if (!target) return;
      lines.push({ accountId: target, debit: m.amount, credit: 0, narration: m.method });
    });
    if (!lines.length && cashId) lines.push({ accountId: cashId, debit: paid, credit: 0 });
    if (!salesId) return null;
    lines.push({ accountId: salesId, debit: 0, credit: U.num(sale.subtotal !== undefined ? sale.subtotal : total), narration: 'Sale ' + (sale.invoiceNo || '') });
    if (U.num(sale.tax) > 0) {
      var taxId = Accounting.acctId('acc.tax', s);
      if (taxId) lines.push({ accountId: taxId, debit: 0, credit: U.num(sale.tax), narration: 'Tax on sale' });
    }
    /* round off safety: farq ko cash me adjust karein */
    Accounting._balanceLines(lines, cashId || bankId);
    return Accounting.postJournal({
      date: sale.date, type: 'SALE', refType: 'SALE', refId: sale.id,
      locationId: sale.locationId, narration: 'Sale ' + (sale.invoiceNo || ''), lines: lines
    }, s);
  },

  /* GRN:  Dr Inventory / Purchases   Cr Payable (udhaar) ya Cash/Bank */
  _postGRN: function (d, s) {
    var grn = d.grn || {};
    if (Accounting._has('GRN', grn.id)) return null;
    var total = U.num(grn.total);
    var purchId = Accounting.acctId('acc.purchase', s);
    if (!purchId) return null;
    var onCredit = d.onCredit === true || d.onCredit === 'true';
    var crId = onCredit ? Accounting.acctId('acc.payable', s)
      : (d.method === 'BANK' ? Accounting.acctId('acc.bank', s) : Accounting.acctId('acc.cash', s));
    if (!crId) return null;
    var lines = [
      { accountId: purchId, debit: total, credit: 0, narration: 'Purchase ' + (grn.grnNo || '') },
      { accountId: crId, debit: 0, credit: total, partyType: onCredit ? 'SUPPLIER' : '',
        partyId: onCredit ? (grn.supplierId || '') : '', narration: onCredit ? 'Credit purchase' : 'Cash purchase' }
    ];
    return Accounting.postJournal({
      date: grn.date, type: 'PURCHASE', refType: 'GRN', refId: grn.id,
      locationId: grn.locationId, narration: 'GRN ' + (grn.grnNo || ''), lines: lines
    }, s);
  },

  /* Payment / Receipt */
  _postPayment: function (d, s) {
    var p = d.payment || {};
    if (Accounting._has('PAYMENT', p.id)) return null;
    var isOut = p.type === 'SUPPLIER_PAYMENT' || p.type === 'REFUND_OUT';
    var moneyId = (p.method === 'CASH') ? Accounting.acctId('acc.cash', s) : Accounting.acctId('acc.bank', s);
    var partyId = isOut ? Accounting.acctId('acc.payable', s) : Accounting.acctId('acc.receivable', s);
    if (!moneyId || !partyId) return null;
    var lines = isOut
      ? [{ accountId: partyId, debit: p.amount, credit: 0, partyType: 'SUPPLIER', partyId: p.partyId },
         { accountId: moneyId, debit: 0, credit: p.amount }]
      : [{ accountId: moneyId, debit: p.amount, credit: 0 },
         { accountId: partyId, debit: 0, credit: p.amount, partyType: 'CUSTOMER', partyId: p.partyId }];
    return Accounting.postJournal({
      date: String(p.date || '').slice(0, 10), type: isOut ? 'PAYMENT' : 'RECEIPT',
      refType: 'PAYMENT', refId: p.id, locationId: p.locationId,
      narration: (isOut ? 'Payment ' : 'Receipt ') + (p.voucherNo || '') + ' ' + (p.method || ''), lines: lines
    }, s);
  },

  /* Expense:  Dr Expense account   Cr Cash/Bank */
  _postExpense: function (d, s) {
    var e = d.expense || {};
    if (Accounting._has('EXPENSE', e.id)) return null;
    var expAcct = Accounting.expenseAccountFor(e.category, s);
    var moneyId = (e.method === 'CASH') ? Accounting.acctId('acc.cash', s) : Accounting.acctId('acc.bank', s);
    if (!expAcct || !moneyId) return null;
    return Accounting.postJournal({
      date: e.date, type: 'PAYMENT', refType: 'EXPENSE', refId: e.id, locationId: e.locationId,
      narration: (e.category || 'Expense') + ' — ' + (e.paidTo || e.notes || ''),
      lines: [
        { accountId: expAcct.id, debit: U.num(e.amount), credit: 0, narration: e.category },
        { accountId: moneyId, debit: 0, credit: U.num(e.amount) }
      ]
    }, s);
  },

  /** Expense category → account (Settings mapping, warna category naam se match) */
  expenseAccountFor: function (category, s) {
    var mapRaw = U.str(Config.get('accounts.expenseMap', '', s));
    if (mapRaw) {
      try {
        var map = JSON.parse(mapRaw);
        if (map && map[category]) {
          var a = DB.findOne('Accounts', function (x) { return x.id === map[category]; });
          if (a) return a;
        }
      } catch (e) { }
    }
    var norm = U.norm(category);
    var byName = DB.findOne('Accounts', function (a) {
      return a.group === 'EXPENSE' && U.norm(a.name).indexOf(norm) > -1;
    });
    if (byName) return byName;
    var code = U.str(Config.get('acc.expense', '6900', s));
    return DB.findOne('Accounts', function (a) { return U.str(a.code) === code; });
  },

  /** Totals sirf 0.01 farq par adjust (rounding) */
  _balanceLines: function (lines, adjustAccountId) {
    var td = 0, tc = 0;
    lines.forEach(function (l) { td += U.num(l.debit); tc += U.num(l.credit); });
    var diff = U.round(td - tc, 2);
    if (Math.abs(diff) < 0.01 || !adjustAccountId) return;
    var found = null;
    lines.forEach(function (l) {
      if (l.accountId === adjustAccountId && U.num(l.debit) > 0) found = l;
    });
    if (found) found.debit = U.round(U.num(found.debit) - diff, 2);
    return lines;
  },

  /** Purane documents ke vouchers bana deta hai (ek baar chalane wala) */
  backfill: function (p, s) {
    Auth.require(s, 'settings.manage');
    var out = { sales: 0, grn: 0, payments: 0, expenses: 0 };
    DB.all('Sales').forEach(function (sale) {
      var before = DB.all('Journals').length;
      var r = Accounting._postSale({ sale: sale, byMethod: Accounting._saleMethods(sale) }, s);
      if (r) out.sales++;
    });
    DB.all('GRN').forEach(function (g) {
      var r = Accounting._postGRN({ grn: g, onCredit: true }, s);
      if (r) out.grn++;
    });
    DB.all('Payments').forEach(function (pay) {
      var r = Accounting._postPayment({ payment: pay }, s);
      if (r) out.payments++;
    });
    DB.all('Expenses').forEach(function (e) {
      var r = Accounting._postExpense({ expense: e }, s);
      if (r) out.expenses++;
    });
    Audit.log('JV_BACKFILL', 'Journals', '', null, out, s);
    return out;
  },

  _saleMethods: function (sale) {
    var out = [];
    try {
      var pays = JSON.parse(sale.payments || '[]');
      pays.forEach(function (p) { out.push({ method: p.method, amount: U.num(p.amount) }); });
    } catch (e) { }
    if (!out.length && U.num(sale.paid) > 0) out.push({ method: 'CASH', amount: U.num(sale.paid) });
    return out;
  },

  /* ============================= BOOKS =================================== */

  /** Ledger: opening → lines (running balance) → closing */
  ledger: function (p, s) {
    Auth.require(s, 'reports.financial');
    var acc = DB.byId('Accounts', p.accountId);
    if (!acc) throw new Error('Account chahiye');
    var from = p.from || '', to = p.to || '';
    var jmap = {};
    DB.all('Journals').forEach(function (j) {
      if (j.status === 'VOID') return;
      if (from && U.str(j.date) < from) return;
      if (to && U.str(j.date) > to) return;
      jmap[j.id] = j;
    });
    var lines = DB.all('JournalLines').filter(function (l) {
      return l.accountId === p.accountId && jmap[l.journalId];
    });
    lines.sort(function (a, b) {
      var ja = jmap[a.journalId], jb = jmap[b.journalId];
      return String(ja.date).localeCompare(String(jb.date)) ||
        String(ja.voucherNo).localeCompare(String(jb.voucherNo));
    });

    /* opening = poora balance before `from` */
    var opening = from ? Accounting._balanceBefore(p.accountId, from)
      : U.num(acc.openingBalance);
    var bal = opening, rows = [];
    lines.forEach(function (l) {
      bal += U.num(l.debit) - U.num(l.credit);
      var j = jmap[l.journalId];
      rows.push({
        id: l.id, journalId: l.journalId, voucherNo: j.voucherNo, date: j.date, type: j.type,
        narration: l.narration || j.narration, debit: U.num(l.debit), credit: U.num(l.credit),
        balance: U.round(bal, 2), refType: j.refType, refId: j.refId
      });
    });
    var totalDr = U.sum(rows, 'debit'), totalCr = U.sum(rows, 'credit');
    return {
      account: Accounting._acctDecorate(acc),
      from: from, to: to, opening: U.round(opening, 2),
      closing: U.round(bal, 2), totalDebit: U.round(totalDr, 2), totalCredit: U.round(totalCr, 2),
      rows: rows
    };
  },

  _balanceBefore: function (accountId, from) {
    var acc = DB.byId('Accounts', accountId);
    if (!acc) return 0;
    var bal = U.num(acc.openingBalance);
    var ok = {};
    DB.all('Journals').forEach(function (j) {
      if (j.status !== 'VOID' && U.str(j.date) < from) ok[j.id] = 1;
    });
    DB.all('JournalLines').forEach(function (l) {
      if (l.accountId !== accountId || !ok[l.journalId]) return;
      bal += U.num(l.debit) - U.num(l.credit);
    });
    return U.round(bal, 2);
  },

  /** Cash book — opening, receipts (dr), payments (cr), closing */
  cashBook: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var accounts = DB.all('Accounts').filter(function (a) { return U.str(a.isCash) === 'true'; });
    if (p.accountId) accounts = accounts.filter(function (a) { return a.id === p.accountId; });
    var from = p.from || '', to = p.to || '';
    var rows = [], opening = 0, dr = 0, cr = 0;
    accounts.forEach(function (a) {
      opening += from ? Accounting._balanceBefore(a.id, from) : U.num(a.openingBalance);
      var led = Accounting.ledger({ accountId: a.id, from: from, to: to }, s);
      led.rows.forEach(function (r) {
        rows.push(Object.assign({}, r, { accountName: a.name, accountCode: a.code }));
        dr += r.debit; cr += r.credit;
      });
    });
    rows.sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); });
    return {
      from: from, to: to, accountName: accounts.length === 1 ? accounts[0].name : 'Cash accounts',
      opening: U.round(opening, 2), receipts: U.round(dr, 2), payments: U.round(cr, 2),
      closing: U.round(opening + dr - cr, 2), rows: rows
    };
  },

  /** Bank book — same as cash book but bank accounts */
  bankBook: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var accounts = DB.all('Accounts').filter(function (a) { return U.str(a.isBank) === 'true'; });
    if (p.accountId) accounts = accounts.filter(function (a) { return a.id === p.accountId; });
    var from = p.from || '', to = p.to || '';
    var rows = [], opening = 0, dr = 0, cr = 0;
    accounts.forEach(function (a) {
      opening += from ? Accounting._balanceBefore(a.id, from) : U.num(a.openingBalance);
      var led = Accounting.ledger({ accountId: a.id, from: from, to: to }, s);
      led.rows.forEach(function (r) {
        rows.push(Object.assign({}, r, { accountName: a.name, accountCode: a.code }));
        dr += r.debit; cr += r.credit;
      });
    });
    rows.sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); });
    return {
      from: from, to: to, accountName: accounts.length === 1 ? accounts[0].name : 'Bank accounts',
      opening: U.round(opening, 2), receipts: U.round(dr, 2), payments: U.round(cr, 2),
      closing: U.round(opening + dr - cr, 2), rows: rows
    };
  },

  /** Day book — saare vouchers ek hi jagah */
  dayBook: function (p, s) {
    Auth.require(s, 'reports.financial');
    var rows = Accounting.listJournals(Object.assign({ limit: 500 }, p || {}), s);
    var td = U.sum(rows, 'totalDebit'), tc = U.sum(rows, 'totalCredit');
    return { from: (p || {}).from || '', to: (p || {}).to || '', rows: rows,
      totalDebit: U.round(td, 2), totalCredit: U.round(tc, 2) };
  },

  /* ============================ REPORTS ================================== */

  /** Trial balance — har account ka dr/cr balance; totals barabar hone chahiye */
  trialBalance: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var asOf = p.asOf || '';
    var rows = DB.all('Accounts').filter(function (a) { return U.str(a.active) !== 'false'; })
      .map(function (a) {
        var bal = asOf ? Accounting._balanceAsOf(a.id, asOf) : Accounting._balance(a.id);
        /* ledger balance debit-positive hai → >0 = debit balance, <0 = credit balance */
        return {
          id: a.id, code: a.code, name: a.name, group: a.group,
          debit: bal > 0 ? U.round(bal, 2) : 0,
          credit: bal < 0 ? U.round(-bal, 2) : 0
        };
      })
      .filter(function (r) { return Math.abs(r.debit) > 0.004 || Math.abs(r.credit) > 0.004; });
    rows.sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); });
    var td = U.sum(rows, 'debit'), tc = U.sum(rows, 'credit');
    return { asOf: asOf, rows: rows,
      totalDebit: U.round(td, 2), totalCredit: U.round(tc, 2),
      balanced: Math.abs(td - tc) < 0.01 };
  },

  _balanceAsOf: function (accountId, asOf) {
    var acc = DB.byId('Accounts', accountId);
    if (!acc) return 0;
    var bal = U.num(acc.openingBalance);
    var ok = {};
    DB.all('Journals').forEach(function (j) {
      if (j.status !== 'VOID' && U.str(j.date) <= asOf) ok[j.id] = 1;
    });
    DB.all('JournalLines').forEach(function (l) {
      if (l.accountId !== accountId || !ok[l.journalId]) return;
      bal += U.num(l.debit) - U.num(l.credit);
    });
    return U.round(bal, 2);
  },

  /** Profit & Loss */
  profitLoss: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var from = p.from || '', to = p.to || '';
    var inRange = function (accId) {
      var acc = DB.byId('Accounts', accId);
      if (!acc) return { dr: 0, cr: 0 };
      var led = Accounting.ledger({ accountId: accId, from: from, to: to }, s);
      return { dr: led.totalDebit, cr: led.totalCredit, opening: led.opening, closing: led.closing };
    };

    var incomeRows = [], expenseRows = [], cogsRows = [];
    DB.all('Accounts').forEach(function (a) {
      if (U.str(a.active) === 'false') return;
      var m = inRange(a.id);
      var net = U.round(m.cr - m.dr, 2);            // income/credit normal
      if (a.group === 'INCOME') {
        incomeRows.push({ code: a.code, name: a.name, amount: U.round(net, 2) });
      } else if (a.group === 'EXPENSE' && (Math.abs(m.dr) > 0.004 || Math.abs(m.cr) > 0.004)) {
        var code = U.str(a.code);
        var isCogs = code === U.str(Config.get('acc.purchase', '5000', s)) ||
          code === U.str(Config.get('acc.cogs', '5000', s));
        (isCogs ? cogsRows : expenseRows).push({ code: a.code, name: a.name, amount: U.round(m.dr - m.cr, 2) });
      }
    });

    /* Stock movement adjustment — industry standard COGS */
    var openingStock = U.num(p.openingStock, 0);
    var closingStock = p.closingStock !== undefined ? U.num(p.closingStock)
      : Accounting.stockValue(s);
    var purchases = U.sum(cogsRows, 'amount');
    var cogs = U.round(openingStock + purchases - closingStock, 2);

    var income = U.round(U.sum(incomeRows, 'amount'), 2);
    var grossProfit = U.round(income - cogs, 2);
    var expenses = U.round(U.sum(expenseRows, 'amount'), 2);
    var netProfit = U.round(grossProfit - expenses, 2);

    return {
      from: from, to: to,
      income: incomeRows.filter(function (r) { return Math.abs(r.amount) > 0.004; }),
      totalIncome: income,
      openingStock: openingStock, purchases: purchases, closingStock: closingStock,
      cogs: cogs, grossProfit: grossProfit,
      expenses: expenseRows.filter(function (r) { return Math.abs(r.amount) > 0.004; }),
      totalExpenses: expenses, netProfit: netProfit,
      marginPct: income ? U.round(netProfit / income * 100, 2) : 0
    };
  },

  /** Current stock value (qty × avgCost) */
  stockValue: function (s) {
    var total = 0;
    DB.all('Stock').forEach(function (r) { total += U.num(r.qty) * U.num(r.avgCost); });
    return U.round(total, 2);
  },

  /** Balance sheet */
  balanceSheet: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var asOf = p.asOf || U.dateOnly();
    var assets = [], liabilities = [], equity = [];
    var ar = 0, ap = 0;

    DB.all('Accounts').forEach(function (a) {
      if (U.str(a.active) === 'false') return;
      var bal = Accounting._balanceAsOf(a.id, asOf);           // debit-positive
      if (Math.abs(bal) < 0.004) return;
      /* SIGNED rakhte hain: asset ka credit balance (overdraft) minus me,
         liability/equity ka debit balance minus me — warna balance sheet toott jati hai */
      var row = { code: a.code, name: a.name,
        amount: U.round(a.group === 'ASSET' ? bal : -bal, 2) };
      if (a.group === 'ASSET') assets.push(row);
      else if (a.group === 'LIABILITY') liabilities.push(row);
      else if (a.group === 'EQUITY') equity.push(row);
    });

    /* Closing stock ek asset hai (periodic inventory: purchases expense me hain) */
    var closingStock = Accounting.stockValue(s);
    var invAcc = Accounting.acct('acc.inventory', s);
    var invRow = { code: invAcc ? invAcc.code : '1300',
      name: (invAcc ? invAcc.name : 'Inventory') + ' — closing stock',
      amount: U.round(closingStock, 2) };
    var invIdx = -1;
    assets.forEach(function (r, i) { if (r.code === invRow.code) invIdx = i; });
    if (invIdx > -1) assets[invIdx] = invRow; else assets.push(invRow);

    /* Party ledger ki summary (sirf information/reconciliation ke liye) */
    DB.all('Customers').forEach(function (c) {
      var b = U.num(c.openingBalance);
      DB.all('Ledger').forEach(function (l) {
        if (l.partyType !== 'CUSTOMER' || l.partyId !== c.id) return;
        if (U.str(l.date) > asOf) return;
        b += U.num(l.debit) - U.num(l.credit);
      });
      ar += b;
    });
    DB.all('Suppliers').forEach(function (c) {
      var b = U.num(c.openingBalance);
      DB.all('Ledger').forEach(function (l) {
        if (l.partyType !== 'SUPPLIER' || l.partyId !== c.id) return;
        if (U.str(l.date) > asOf) return;
        b += U.num(l.credit) - U.num(l.debit);
      });
      ap += b;
    });

    /* Net profit (retained earnings) P&L se */
    var pl = Accounting.profitLoss({ to: asOf }, s);
    var retained = pl.netProfit;
    equity.push({ code: U.str(Config.get('acc.retained', '3100', s)), name: 'Current period profit / (loss)', amount: U.round(retained, 2) });

    var totalAssets = U.round(U.sum(assets, 'amount'), 2);
    var totalLiab = U.round(U.sum(liabilities, 'amount'), 2);
    var totalEquity = U.round(U.sum(equity, 'amount'), 2);
    return {
      asOf: asOf, assets: assets, liabilities: liabilities, equity: equity,
      totalAssets: totalAssets, totalLiabilities: totalLiab, totalEquity: totalEquity,
      closingStock: U.round(closingStock, 2),
      /* reconciliation info — party ledger vs accounts (farq nazar aana chahiye) */
      partyReceivables: U.round(ar, 2), partyPayables: U.round(ap, 2),
      totalLiabEquity: U.round(totalLiab + totalEquity, 2),
      balanced: Math.abs(totalAssets - (totalLiab + totalEquity)) < 0.01
    };
  },

  /* ===================== BANK RECONCILIATION ============================= */

  reconList: function (p, s) {
    Auth.require(s, 'reports.financial');
    var rows = DB.all('BankRecon');
    if (p && p.bankAccountId) rows = rows.filter(function (r) { return r.bankAccountId === p.bankAccountId; });
    rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return rows.slice(0, 300).map(function (r) {
      return {
        id: r.id, bankAccountId: r.bankAccountId, date: r.date, reference: r.reference,
        amount: U.num(r.amount), direction: r.direction, cleared: U.str(r.cleared) === 'true',
        clearedDate: r.clearedDate, journalId: r.journalId, statementRef: r.statementRef,
        note: r.note
      };
    });
  },

  /** Bank statement import: rows = [{date, reference, amount, direction}] */
  reconImport: function (p, s) {
    Auth.require(s, 'settings.manage');
    var rows = p.rows || [];
    if (!rows.length) throw new Error('Statement rows chahiye.');
    if (!DB.byId('Accounts', p.bankAccountId)) throw new Error('Bank account chahiye.');
    var added = 0;
    rows.forEach(function (r) {
      var amt = U.num(r.amount);
      if (!amt) return;
      DB.insert('BankRecon', {
        id: U.uid('BR'), bankAccountId: p.bankAccountId, date: r.date || U.dateOnly(),
        reference: r.reference || '', amount: U.round(amt, 2),
        direction: (r.direction || (amt < 0 ? 'OUT' : 'IN')).toUpperCase(),
        cleared: 'false', clearedDate: '', journalId: '', statementRef: r.statementRef || '',
        note: r.note || '', createdBy: s.userId, createdAt: U.iso()
      }, s);
      added++;
    });
    return { added: added };
  },

  /** Auto-match: same date + amount + direction → voucher se jor do */
  reconMatch: function (p, s) {
    Auth.require(s, 'settings.manage');
    var open = DB.all('BankRecon').filter(function (r) {
      return r.bankAccountId === p.bankAccountId && U.str(r.cleared) !== 'true';
    });
    var matched = 0;
    open.forEach(function (r) {
      var hit = DB.findOne('Journals', function (j) {
        if (j.status === 'VOID' || U.str(j.date) !== U.str(r.date)) return false;
        var lines = DB.all('JournalLines').filter(function (l) { return l.journalId === j.id; });
        var amt = r.direction === 'IN'
          ? U.sum(lines.filter(function (l) { return l.accountId === p.bankAccountId; }), 'debit')
          : U.sum(lines.filter(function (l) { return l.accountId === p.bankAccountId; }), 'credit');
        return Math.abs(amt - U.num(r.amount)) < 0.01;
      });
      if (hit) {
        DB.update('BankRecon', r.id, { journalId: hit.id, cleared: 'true', clearedDate: U.dateOnly() }, s);
        matched++;
      }
    });
    return { matched: matched, pending: open.length - matched };
  },

  reconClear: function (p, s) {
    Auth.require(s, 'settings.manage');
    var ids = p.ids || [];
    ids.forEach(function (id) {
      DB.update('BankRecon', id, {
        cleared: p.cleared === false ? 'false' : 'true',
        clearedDate: p.cleared === false ? '' : U.dateOnly()
      }, s);
    });
    return { updated: ids.length };
  },

  /* =========================== DASHBOARD ================================= */

  dashboard: function (p, s) {
    Auth.require(s, 'reports.financial');
    var today = U.dateOnly();
    var cash = 0, bank = 0;
    DB.all('Accounts').forEach(function (a) {
      if (U.str(a.active) === 'false') return;
      var bal = Accounting._balance(a.id);
      if (U.str(a.isCash) === 'true') cash += bal;
      if (U.str(a.isBank) === 'true') bank += bal;
    });
    var ar = 0, ap = 0;
    DB.all('Customers').forEach(function (c) {
      ar += U.num(c.openingBalance);
      DB.all('Ledger').forEach(function (l) {
        if (l.partyType === 'CUSTOMER' && l.partyId === c.id) ar += U.num(l.debit) - U.num(l.credit);
      });
    });
    DB.all('Suppliers').forEach(function (c) {
      ap += U.num(c.openingBalance);
      DB.all('Ledger').forEach(function (l) {
        if (l.partyType === 'SUPPLIER' && l.partyId === c.id) ap += U.num(l.credit) - U.num(l.debit);
      });
    });

    var todayJournals = DB.all('Journals').filter(function (j) {
      return U.str(j.date) === today && j.status !== 'VOID';
    });
    var tb = Accounting.trialBalance({}, s);
    var monthStart = today.slice(0, 8) + '01';
    var pl = Accounting.profitLoss({ from: monthStart, to: today }, s);

    return {
      today: today,
      cashInHand: U.round(cash, 2),
      bankBalance: U.round(bank, 2),
      receivables: U.round(ar, 2),
      payables: U.round(ap, 2),
      stockValue: Accounting.stockValue(s),
      netWorth: U.round(cash + bank + ar + Accounting.stockValue(s) - ap, 2),
      vouchersToday: todayJournals.length,
      postedToday: U.round(U.sum(todayJournals, 'totalDebit'), 2),
      trialBalanced: tb.balanced,
      trialDebit: tb.totalDebit, trialCredit: tb.totalCredit,
      mtd: { income: pl.totalIncome, expenses: pl.totalExpenses, netProfit: pl.netProfit }
    };
  }
};

function SYS_KEYS_SAFE() { return (typeof Accounting !== 'undefined' && Accounting.SYS_KEYS) ? Accounting.SYS_KEYS : []; }

/* ======================= DEFAULT CHART OF ACCOUNTS ========================
 * [code, name, group, type, bankName, accountNo, openingBalance]
 * group: ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
 * type : CASH | BANK | AR | AP | INVENTORY | REVENUE | COGS | EXPENSE | CAPITAL | GENERAL
 * Ye seed data hai (Setup.seedAll se chalta hai) — UI/Reports mein kuch hardcode nahi.
 * ========================================================================*/
var ACCOUNTS_SEED = [
  ['1000', 'Cash in hand', 'ASSET', 'CASH', '', '', 0],
  ['1010', 'Cash — Sadiqabad (SDQ)', 'ASSET', 'CASH', '', '', 0],
  ['1020', 'Cash — Machi Goth (MCH)', 'ASSET', 'CASH', '', '', 0],
  ['1030', 'Cash — RYK', 'ASSET', 'CASH', '', '', 0],
  ['1100', 'Bank — HBL (main)', 'ASSET', 'BANK', 'HBL', '0042-79012345-03', 0],
  ['1110', 'Bank — Meezan Bank', 'ASSET', 'BANK', 'Meezan', '0210-0109876543-01', 0],
  ['1120', 'Bank — JazzCash merchant', 'ASSET', 'BANK', 'JazzCash', '', 0],
  ['1130', 'Bank — EasyPaisa merchant', 'ASSET', 'BANK', 'EasyPaisa', '', 0],
  ['1140', 'Bank — Raast', 'ASSET', 'BANK', 'Raast', '', 0],
  ['1200', 'Accounts receivable (udhaar)', 'ASSET', 'AR', '', '', 0],
  ['1300', 'Inventory / stock', 'ASSET', 'INVENTORY', '', '', 0],
  ['1400', 'Advances & deposits', 'ASSET', 'GENERAL', '', '', 0],
  ['1500', 'Furniture & fixtures', 'ASSET', 'GENERAL', '', '', 0],
  ['2000', 'Accounts payable (suppliers)', 'LIABILITY', 'AP', '', '', 0],
  ['2100', 'Tax / GST payable', 'LIABILITY', 'GENERAL', '', '', 0],
  ['2200', 'Loans & borrowings', 'LIABILITY', 'GENERAL', '', '', 0],
  ['3000', 'Owner capital', 'EQUITY', 'CAPITAL', '', '', 0],
  ['3100', 'Retained earnings', 'EQUITY', 'GENERAL', '', '', 0],
  ['4000', 'Sales — retail', 'INCOME', 'REVENUE', '', '', 0],
  ['4100', 'Sales — wholesale', 'INCOME', 'REVENUE', '', '', 0],
  ['4200', 'Discount received / other income', 'INCOME', 'GENERAL', '', '', 0],
  ['5000', 'Purchases (COGS)', 'EXPENSE', 'COGS', '', '', 0],
  ['5100', 'Freight & cartage', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6000', 'Rent', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6100', 'Salaries & wages', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6200', 'Electricity', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6300', 'Fuel & conveyance', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6400', 'Repairs & maintenance', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6500', 'Marketing & advertising', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6600', 'Petty cash / tea & meals', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6700', 'Bank charges', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6800', 'Depreciation', 'EXPENSE', 'EXPENSE', '', '', 0],
  ['6900', 'Other expenses', 'EXPENSE', 'EXPENSE', '', '', 0]
];
