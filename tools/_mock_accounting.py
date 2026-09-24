"""demo/mock.js mein accounting engine (demo data ke sath) —
taake Accounting page live preview mein bhi poori dikhe."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
p = ROOT / 'demo' / 'mock.js'
s = p.read_text(encoding='utf-8')

if "'accounts.list'" in s:
    print('already present')
    raise SystemExit(0)

BLOCK = r"""
/* ==========================================================================
   ACCOUNTING — demo data + mini double-entry engine
   (asli backend apps-script/Accounting.gs hai; ye sirf preview ke liye)
   ========================================================================== */
const ACC_DEFS = [
  ['1000', 'Cash in hand', 'ASSET', 'CASH'],
  ['1010', 'Cash — Sadiqabad (SDQ)', 'ASSET', 'CASH'],
  ['1020', 'Cash — Machi Goth (MCH)', 'ASSET', 'CASH'],
  ['1030', 'Cash — RYK', 'ASSET', 'CASH'],
  ['1100', 'Bank — HBL (main)', 'ASSET', 'BANK', 'HBL', '0042-79012345-03'],
  ['1110', 'Bank — Meezan Bank', 'ASSET', 'BANK', 'Meezan', '0210-0109876543-01'],
  ['1120', 'Bank — JazzCash merchant', 'ASSET', 'BANK', 'JazzCash'],
  ['1130', 'Bank — EasyPaisa merchant', 'ASSET', 'BANK', 'EasyPaisa'],
  ['1140', 'Bank — Raast', 'ASSET', 'BANK', 'Raast'],
  ['1200', 'Accounts receivable (udhaar)', 'ASSET', 'AR'],
  ['1300', 'Inventory / stock', 'ASSET', 'INVENTORY'],
  ['1400', 'Advances & deposits', 'ASSET', 'GENERAL'],
  ['1500', 'Furniture & fixtures', 'ASSET', 'GENERAL'],
  ['2000', 'Accounts payable (suppliers)', 'LIABILITY', 'AP'],
  ['2100', 'Tax / GST payable', 'LIABILITY', 'GENERAL'],
  ['2200', 'Loans & borrowings', 'LIABILITY', 'GENERAL'],
  ['3000', 'Owner capital', 'EQUITY', 'CAPITAL'],
  ['3100', 'Retained earnings', 'EQUITY', 'GENERAL'],
  ['4000', 'Sales — retail', 'INCOME', 'REVENUE'],
  ['4100', 'Sales — wholesale', 'INCOME', 'REVENUE'],
  ['4200', 'Discount received / other income', 'INCOME', 'GENERAL'],
  ['5000', 'Purchases (COGS)', 'EXPENSE', 'COGS'],
  ['5100', 'Freight & cartage', 'EXPENSE', 'EXPENSE'],
  ['6000', 'Rent', 'EXPENSE', 'EXPENSE'],
  ['6100', 'Salaries & wages', 'EXPENSE', 'EXPENSE'],
  ['6200', 'Electricity', 'EXPENSE', 'EXPENSE'],
  ['6300', 'Fuel & conveyance', 'EXPENSE', 'EXPENSE'],
  ['6400', 'Repairs & maintenance', 'EXPENSE', 'EXPENSE'],
  ['6500', 'Marketing & advertising', 'EXPENSE', 'EXPENSE'],
  ['6600', 'Petty cash / tea & meals', 'EXPENSE', 'EXPENSE'],
  ['6700', 'Bank charges', 'EXPENSE', 'EXPENSE'],
  ['6900', 'Other expenses', 'EXPENSE', 'EXPENSE']
];

const ACCOUNTS = ACC_DEFS.map(function (a, i) {
  return {
    id: 'ACC' + (i + 1), code: a[0], name: a[1], group: a[2], type: a[3],
    bankName: a[4] || '', accountNo: a[5] || '', branch: '',
    isCash: a[3] === 'CASH' ? 'true' : 'false',
    isBank: a[3] === 'BANK' ? 'true' : 'false',
    normalSide: (a[2] === 'ASSET' || a[2] === 'EXPENSE') ? 'DR' : 'CR',
    openingBalance: 0, active: 'true', notes: '', createdAt: new Date().toISOString()
  };
});
const accByCode = function (c) {
  return ACCOUNTS.filter(function (a) { return a.code === c; })[0];
};
const A = function (c) { const x = accByCode(c); return x ? x.id : ''; };

/* --------------------------- demo vouchers ------------------------------ */
let JOURNALS = [];
let JV_SEQ = 0;
function jv(date, type, narration, lines, refType) {
  JV_SEQ++;
  const id = 'JV' + JV_SEQ;
  let td = 0, tc = 0;
  const ls = lines.map(function (l) {
    const acc = ACCOUNTS.filter(function (a) { return a.id === l[0]; })[0] || {};
    td += l[1]; tc += l[2];
    return { id: id + '-L' + Math.random().toString(36).slice(2, 7), journalId: id, accountId: l[0],
      accountCode: acc.code || '', debit: l[1], credit: l[2], partyType: '', partyId: '',
      narration: l[3] || narration, lineOrder: 0 };
  });
  JOURNALS.push({
    id: id, voucherNo: 'JV-SDQ-' + String(10000 + JV_SEQ), date: date, type: type,
    refType: refType || '', refId: '', locationId: 'LOC-SDQ', narration: narration,
    totalDebit: Math.round(td * 100) / 100, totalCredit: Math.round(tc * 100) / 100,
    status: 'POSTED', createdBy: 'USR1', createdAt: new Date().toISOString()
  });
  JOURNALS[JOURNALS.length - 1].lines = ls;
}
function iso(daysAgo) { return new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10); }

/* opening balances */
jv(iso(78), 'OPENING', 'Opening balances — financial year start', [
  [A('1000'), 145750, 0], [A('1020'), 38200, 0], [A('1100'), 1284500, 0],
  [A('1110'), 412300, 0], [A('1120'), 86400, 0], [A('1130'), 54900, 0],
  [A('1140'), 21000, 0], [A('1200'), 486300, 0],
  [A('2000'), 0, 742800], [A('2100'), 0, 128400],
  [A('3000'), 0, 1000000], [A('3100'), 0, 658150]
]);
/* sales */
jv(iso(6), 'SALE', 'Counter sales — cash + card', [
  [A('1000'), 68400, 0], [A('1100'), 42500, 0], [A('4000'), 0, 110900]
]);
jv(iso(4), 'SALE', 'Wholesale invoice — credit', [
  [A('1200'), 268000, 0], [A('4100'), 0, 268000]
]);
jv(iso(2), 'SALE', 'Wallet + Raast receipts', [
  [A('1120'), 18900, 0], [A('1130'), 24600, 0], [A('1140'), 11250, 0], [A('4000'), 0, 54750]
]);
/* purchases */
jv(iso(9), 'PURCHASE', 'Stock purchase — credit (Flamingo)', [
  [A('5000'), 486000, 0], [A('2000'), 0, 486000]
]);
jv(iso(5), 'PURCHASE', 'Cash purchase — local market', [
  [A('5000'), 96400, 0], [A('1000'), 0, 96400]
]);
jv(iso(3), 'PURCHASE', 'Freight on purchase', [
  [A('5100'), 18500, 0], [A('1000'), 0, 18500]
]);
/* expenses */
jv(iso(20), 'PAYMENT', 'Shop rent — quarterly', [
  [A('6000'), 120000, 0], [A('1100'), 0, 120000]
]);
jv(iso(15), 'PAYMENT', 'Staff salaries', [
  [A('6100'), 185000, 0], [A('1100'), 0, 185000]
]);
jv(iso(12), 'PAYMENT', 'Electricity bill', [
  [A('6200'), 28400, 0], [A('1100'), 0, 28400]
]);
jv(iso(8), 'PAYMENT', 'Fuel & conveyance', [
  [A('6300'), 21600, 0], [A('1000'), 0, 21600]
]);
jv(iso(1), 'PAYMENT', 'Petty cash — tea, packing, misc', [
  [A('6600'), 8400, 0], [A('6900'), 3200, 0], [A('1000'), 0, 11600]
]);
/* receipts & payments */
jv(iso(3), 'RECEIPT', 'Recovery from customer (udhaar)', [
  [A('1100'), 150000, 0], [A('1200'), 0, 150000]
]);
jv(iso(2), 'PAYMENT', 'Paid to supplier', [
  [A('2000'), 220000, 0], [A('1110'), 0, 220000]
]);
jv(iso(10), 'JV', 'Bank charges deducted by bank', [
  [A('6700'), 2450, 0], [A('1100'), 0, 2450]
]);

/* ---------------------------- mini engine -------------------------------- */
const DEMO_STOCK_VALUE = 1640000;

function accBalance(id, upto) {
  let bal = 0;
  const acc = ACCOUNTS.filter(function (a) { return a.id === id; })[0];
  if (acc) bal += Number(acc.openingBalance) || 0;
  JOURNALS.forEach(function (j) {
    if (j.status === 'VOID') return;
    if (upto && j.date > upto) return;
    (j.lines || []).forEach(function (l) {
      if (l.accountId !== id) return;
      bal += Number(l.debit) || 0;
      bal -= Number(l.credit) || 0;
    });
  });
  return Math.round(bal * 100) / 100;
}
function decorate(acc) {
  const bal = accBalance(acc.id);
  return {
    id: acc.id, code: acc.code, name: acc.name, group: acc.group, type: acc.type,
    bankName: acc.bankName, accountNo: acc.accountNo,
    isCash: acc.isCash === 'true', isBank: acc.isBank === 'true',
    normalSide: acc.normalSide, openingBalance: Number(acc.openingBalance) || 0,
    ledgerBalance: bal, displayBalance: acc.normalSide === 'CR' ? -bal : bal, active: true
  };
}
function journalRow(j) {
  const dr = [], cr = [];
  (j.lines || []).forEach(function (l) {
    const a = ACCOUNTS.filter(function (x) { return x.id === l.accountId; })[0] || { name: '' };
    if (l.debit > 0) dr.push(a.name);
    if (l.credit > 0) cr.push(a.name);
  });
  return {
    id: j.id, voucherNo: j.voucherNo, date: j.date, type: j.type, refType: j.refType,
    refId: j.refId, narration: j.narration, totalDebit: j.totalDebit, totalCredit: j.totalCredit,
    status: j.status, locationId: j.locationId,
    debitAccounts: dr.join(', '), creditAccounts: cr.join(', ')
  };
}
function mockLedger(accountId, from, to) {
  let opening = 0;
  const acc = ACCOUNTS.filter(function (a) { return a.id === accountId; })[0];
  if (acc) opening += Number(acc.openingBalance) || 0;
  const rows = [];
  JOURNALS.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (j) {
    if (j.status === 'VOID') return;
    (j.lines || []).forEach(function (l) {
      if (l.accountId !== accountId) return;
      if (from && j.date < from) { opening += (Number(l.debit) || 0) - (Number(l.credit) || 0); return; }
      if (to && j.date > to) return;
      rows.push({ id: l.id, journalId: j.id, voucherNo: j.voucherNo, date: j.date, type: j.type,
        narration: l.narration || j.narration, refType: j.refType, refId: j.refId,
        debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, balance: 0 });
    });
  });
  let bal = opening;
  rows.forEach(function (r) { bal += r.debit - r.credit; r.balance = Math.round(bal * 100) / 100; });
  const td = rows.reduce(function (a, r) { return a + r.debit; }, 0);
  const tc = rows.reduce(function (a, r) { return a + r.credit; }, 0);
  return { account: decorate(acc || {}), from: from || '', to: to || '',
    opening: Math.round(opening * 100) / 100, closing: Math.round(bal * 100) / 100,
    totalDebit: Math.round(td * 100) / 100, totalCredit: Math.round(tc * 100) / 100, rows: rows };
}

let BANK_RECON = [
  { id: 'BR1', bankAccountId: A('1100'), date: iso(2), reference: 'Online transfer in', amount: 125000, direction: 'IN', cleared: 'true', clearedDate: iso(2), journalId: '', statementRef: 'STMT-1', note: '' },
  { id: 'BR2', bankAccountId: A('1100'), date: iso(1), reference: 'ATM withdrawal', amount: 40000, direction: 'OUT', cleared: 'false', clearedDate: '', journalId: '', statementRef: 'STMT-2', note: '' },
  { id: 'BR3', bankAccountId: A('1100'), date: iso(1), reference: 'Bank charges', amount: 2450, direction: 'OUT', cleared: 'true', clearedDate: iso(1), journalId: '', statementRef: 'STMT-3', note: 'Monthly fee' }
];
"""

s = s.replace("const USERS = [", BLOCK + "\nconst USERS = [", 1)

ROUTES = r"""
  /* ------------------------- ACCOUNTING (demo) -------------------------- */
  'accounts.list': function () { return ACCOUNTS.map(decorate); },
  'accounts.save': function (p) {
    const existing = p.id ? ACCOUNTS.filter(function (a) { return a.id === p.id; })[0] : null;
    if (existing) { Object.assign(existing, p); return decorate(existing); }
    const acc = Object.assign({ id: 'ACC' + (ACCOUNTS.length + 1) + Date.now().toString(36),
      openingBalance: 0, active: 'true', isCash: 'false', isBank: 'false',
      normalSide: (p.group === 'ASSET' || p.group === 'EXPENSE') ? 'DR' : 'CR',
      createdAt: new Date().toISOString() }, p);
    acc.isCash = String(acc.isCash); acc.isBank = String(acc.isBank);
    ACCOUNTS.push(acc);
    return decorate(acc);
  },
  'accounts.seed': function () { return { created: 0 }; },
  'journal.post': function (p) {
    const lines = (p.lines || []).filter(function (l) { return (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0; });
    if (lines.length < 2) throw new Error('Voucher mein kam az kam do lines (debit + credit) chahiye.');
    let td = 0, tc = 0;
    lines.forEach(function (l) {
      if ((Number(l.debit) || 0) > 0 && (Number(l.credit) || 0) > 0) throw new Error('Ek line mein debit aur credit dono nahi ho sakte.');
      td += Number(l.debit) || 0; tc += Number(l.credit) || 0;
    });
    if (Math.abs(td - tc) > 0.01) throw new Error('Voucher balanced nahi: debit ' + td + ' vs credit ' + tc);
    const before = JOURNALS.length;
    jv(p.date || new Date().toISOString().slice(0, 10), p.type || 'JV', p.narration || '',
      lines.map(function (l) { return [l.accountId, Number(l.debit) || 0, Number(l.credit) || 0, l.narration]; }),
      p.refType);
    const made = JOURNALS[JOURNALS.length - 1];
    const out = Object.assign({}, made);
    out.lines = made.lines.map(function (l) {
      const a = ACCOUNTS.filter(function (x) { return x.id === l.accountId; })[0] || {};
      return Object.assign({}, l, { accountName: a.name || '' });
    });
    return out;
  },
  'journal.list': function (p) {
    p = p || {};
    return JOURNALS.filter(function (j) {
      if (p.type && j.type !== p.type) return false;
      if (p.from && j.date < p.from) return false;
      if (p.to && j.date > p.to) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, Number(p.limit) || 200).map(journalRow);
  },
  'journal.get': function (p) {
    const j = JOURNALS.filter(function (x) { return x.id === p.id; })[0];
    if (!j) throw new Error('Voucher nahi mila');
    return Object.assign({}, j, { lines: (j.lines || []).map(function (l) {
      const a = ACCOUNTS.filter(function (x) { return x.id === l.accountId; })[0] || {};
      return Object.assign({}, l, { accountName: a.name || '' });
    }) });
  },
  'journal.void': function (p) {
    const j = JOURNALS.filter(function (x) { return x.id === p.id; })[0];
    if (j) j.status = 'VOID';
    return { ok: true };
  },
  'accounting.ledger': function (p) { return mockLedger(p.accountId, p.from, p.to); },
  'accounting.dayBook': function (p) {
    const rows = MockAPI['journal.list'](p);
    return { from: (p || {}).from || '', to: (p || {}).to || '', rows: rows,
      totalDebit: rows.reduce(function (a, r) { return a + r.totalDebit; }, 0),
      totalCredit: rows.reduce(function (a, r) { return a + r.totalCredit; }, 0) };
  },
  'accounting.cashBook': function (p) {
    const cash = ACCOUNTS.filter(function (a) { return a.isCash === 'true' && (!p.accountId || a.id === p.accountId); });
    return bookFor(cash, p, 'Cash accounts');
  },
  'accounting.bankBook': function (p) {
    const bank = ACCOUNTS.filter(function (a) { return a.isBank === 'true' && (!p.accountId || a.id === p.accountId); });
    return bookFor(bank, p, 'Bank accounts');
  },
  'accounting.trialBalance': function (p) {
    const rows = ACCOUNTS.map(decorate).map(function (a) {
      const bal = a.ledgerBalance;
      return { id: a.id, code: a.code, name: a.name, group: a.group,
        debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 };
    }).filter(function (r) { return r.debit > 0.004 || r.credit > 0.004; });
    const td = rows.reduce(function (a, r) { return a + r.debit; }, 0);
    const tc = rows.reduce(function (a, r) { return a + r.credit; }, 0);
    return { asOf: (p || {}).asOf || '', rows: rows,
      totalDebit: Math.round(td * 100) / 100, totalCredit: Math.round(tc * 100) / 100,
      balanced: Math.abs(td - tc) < 0.01 };
  },
  'accounting.profitLoss': function (p) {
    p = p || {};
    const income = [], expenses = [], cogsRows = [];
    ACCOUNTS.forEach(function (a) {
      const led = mockLedger(a.id, p.from, p.to);
      const net = Math.round((led.totalCredit - led.totalDebit) * 100) / 100;
      if (a.group === 'INCOME') income.push({ code: a.code, name: a.name, amount: net });
      else if (a.group === 'EXPENSE' && (led.totalDebit || led.totalCredit)) {
        (a.code === '5000' || a.code === '5100' ? cogsRows : expenses)
          .push({ code: a.code, name: a.name, amount: Math.round((led.totalDebit - led.totalCredit) * 100) / 100 });
      }
    });
    const totalIncome = income.reduce(function (a, r) { return a + r.amount; }, 0);
    const purchases = cogsRows.reduce(function (a, r) { return a + r.amount; }, 0);
    const closing = DEMO_STOCK_VALUE;
    const cogs = purchases - closing;
    const gp = totalIncome - cogs;
    const te = expenses.reduce(function (a, r) { return a + r.amount; }, 0);
    const np = gp - te;
    return { from: p.from || '', to: p.to || '',
      income: income.filter(function (r) { return Math.abs(r.amount) > 0.004; }),
      totalIncome: totalIncome, openingStock: 0, purchases: purchases, closingStock: closing,
      cogs: cogs, grossProfit: gp,
      expenses: expenses.filter(function (r) { return Math.abs(r.amount) > 0.004; }),
      totalExpenses: te, netProfit: np,
      marginPct: totalIncome ? Math.round(np / totalIncome * 10000) / 100 : 0 };
  },
  'accounting.balanceSheet': function (p) {
    const asOf = (p || {}).asOf || new Date().toISOString().slice(0, 10);
    const assets = [], liabilities = [], equity = [];
    ACCOUNTS.forEach(function (a) {
      const bal = accBalance(a.id, asOf);
      if (Math.abs(bal) < 0.004) return;
      const row = { code: a.code, name: a.name, amount: a.group === 'ASSET' ? bal : -bal };
      if (a.group === 'ASSET') assets.push(row);
      else if (a.group === 'LIABILITY') liabilities.push(row);
      else if (a.group === 'EQUITY') equity.push(row);
    });
    const inv = assets.filter(function (r) { return r.code === '1300'; })[0];
    if (inv) { inv.name = inv.name + ' — closing stock'; inv.amount = DEMO_STOCK_VALUE; }
    else assets.push({ code: '1300', name: 'Inventory — closing stock', amount: DEMO_STOCK_VALUE });
    const pl = MockAPI['accounting.profitLoss']({ to: asOf });
    equity.push({ code: '3100', name: 'Current period profit / (loss)', amount: pl.netProfit });
    const ta = assets.reduce(function (a, r) { return a + r.amount; }, 0);
    const tl = liabilities.reduce(function (a, r) { return a + r.amount; }, 0);
    const te = equity.reduce(function (a, r) { return a + r.amount; }, 0);
    return { asOf: asOf, assets: assets, liabilities: liabilities, equity: equity,
      totalAssets: Math.round(ta * 100) / 100, totalLiabilities: Math.round(tl * 100) / 100,
      totalEquity: Math.round(te * 100) / 100, closingStock: DEMO_STOCK_VALUE,
      partyReceivables: 486300, partyPayables: 742800,
      totalLiabEquity: Math.round((tl + te) * 100) / 100,
      balanced: Math.abs(ta - (tl + te)) < 0.01 };
  },
  'accounting.dashboard': function () {
    let cash = 0, bank = 0;
    ACCOUNTS.forEach(function (a) {
      const bal = accBalance(a.id);
      if (a.isCash === 'true') cash += bal;
      if (a.isBank === 'true') bank += bal;
    });
    const tb = MockAPI['accounting.trialBalance']({});
    const monthStart = new Date().toISOString().slice(0, 8) + '01';
    const pl = MockAPI['accounting.profitLoss']({ from: monthStart, to: new Date().toISOString().slice(0, 10) });
    const today = new Date().toISOString().slice(0, 10);
    const todays = JOURNALS.filter(function (j) { return j.date === today && j.status !== 'VOID'; });
    return { today: today, cashInHand: Math.round(cash * 100) / 100, bankBalance: Math.round(bank * 100) / 100,
      receivables: 486300, payables: 742800, stockValue: DEMO_STOCK_VALUE,
      netWorth: Math.round((cash + bank + 486300 + DEMO_STOCK_VALUE - 742800) * 100) / 100,
      vouchersToday: todays.length,
      postedToday: todays.reduce(function (a, j) { return a + j.totalDebit; }, 0),
      trialBalanced: tb.balanced, trialDebit: tb.totalDebit, trialCredit: tb.totalCredit,
      mtd: { income: pl.totalIncome, expenses: pl.totalExpenses, netProfit: pl.netProfit } };
  },
  'accounting.stockValue': function () { return { value: DEMO_STOCK_VALUE }; },
  'accounting.backfill': function () { return { sales: 0, grn: 0, payments: 0, expenses: 0 }; },
  'bank.recon.list': function (p) {
    return BANK_RECON.filter(function (r) { return !p.bankAccountId || r.bankAccountId === p.bankAccountId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (r) { return Object.assign({}, r, { cleared: r.cleared === 'true',
        amount: Number(r.amount) }); });
  },
  'bank.recon.import': function (p) {
    (p.rows || []).forEach(function (r, i) {
      BANK_RECON.push({ id: 'BR' + Date.now() + i, bankAccountId: p.bankAccountId,
        date: r.date || new Date().toISOString().slice(0, 10), reference: r.reference || '',
        amount: Math.abs(Number(r.amount) || 0),
        direction: (r.direction || (Number(r.amount) < 0 ? 'OUT' : 'IN')).toUpperCase(),
        cleared: 'false', clearedDate: '', journalId: '', statementRef: '', note: r.note || '' });
    });
    return { added: (p.rows || []).length };
  },
  'bank.recon.match': function (p) {
    let matched = 0, pending = 0;
    BANK_RECON.forEach(function (r) {
      if (r.bankAccountId !== p.bankAccountId || r.cleared === 'true') return;
      const hit = JOURNALS.filter(function (j) {
        if (j.date !== r.date || j.status === 'VOID') return false;
        let amt = 0;
        (j.lines || []).forEach(function (l) {
          if (l.accountId !== p.bankAccountId) return;
          amt += r.direction === 'IN' ? (Number(l.debit) || 0) : (Number(l.credit) || 0);
        });
        return Math.abs(amt - Number(r.amount)) < 0.01;
      })[0];
      if (hit) { r.cleared = 'true'; r.clearedDate = new Date().toISOString().slice(0, 10); r.journalId = hit.id; matched++; }
      else pending++;
    });
    return { matched: matched, pending: pending };
  },
  'bank.recon.clear': function (p) {
    (p.ids || []).forEach(function (id) {
      BANK_RECON.forEach(function (r) {
        if (r.id !== id) return;
        r.cleared = p.cleared === false ? 'false' : 'true';
        r.clearedDate = p.cleared === false ? '' : new Date().toISOString().slice(0, 10);
      });
    });
    return { updated: (p.ids || []).length };
  },

  /* helper used by cashBook / bankBook */
"""

s = s.replace("  'payments.list':", ROUTES + "  'payments.list':", 1)

# bookFor helper (module-level function)
s = s.replace("function mockLedger(accountId, from, to) {", """function bookFor(accounts, p, fallbackName) {
  p = p || {};
  let opening = 0;
  const rows = [];
  accounts.forEach(function (a) {
    const led = mockLedger(a.id, p.from, p.to);
    opening += led.opening;
    led.rows.forEach(function (r) { rows.push(Object.assign({}, r, { accountName: a.name, accountCode: a.code })); });
  });
  rows.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  const dr = rows.reduce(function (a, r) { return a + r.debit; }, 0);
  const cr = rows.reduce(function (a, r) { return a + r.credit; }, 0);
  return { from: p.from || '', to: p.to || '',
    accountName: accounts.length === 1 ? accounts[0].name : fallbackName,
    opening: Math.round(opening * 100) / 100,
    receipts: Math.round(dr * 100) / 100, payments: Math.round(cr * 100) / 100,
    closing: Math.round((opening + dr - cr) * 100) / 100, rows: rows };
}
function mockLedger(accountId, from, to) {""", 1)

p.write_text(s, encoding='utf-8')
print('demo/mock.js: accounting engine + demo vouchers added')
