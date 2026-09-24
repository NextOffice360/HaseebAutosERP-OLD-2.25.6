/**
 * HASEEB AUTOS - ERP / POS  ::  REPORTS
 * Dashboard KPIs + sales / inventory / party / cash analytics.
 */

var Reports = {

  _range: function (p) {
    var to = p.to ? U.startOfDay(p.to) : U.startOfDay(new Date());
    to.setDate(to.getDate() + 1);
    var from = p.from ? U.startOfDay(p.from) : U.daysAgo(29);
    return { from: from, to: to };
  },

  _salesIn: function (p, s) {
    var r = Reports._range(p);
    var rows = DB.all('Sales').filter(function (x) {
      if (U.str(x.status) === 'VOID') return false;
      var d = U.parseDate(x.date);
      return d && d >= r.from && d < r.to;
    });
    if (p.locationId) rows = rows.filter(function (x) { return x.locationId === p.locationId; });
    if (!Auth.can(s, 'sales.view.all')) rows = rows.filter(function (x) { return x.cashierId === s.userId; });
    return rows;
  },

  _allItems: function (id, line) {
    var items = DB.all('SaleItems');
    return items.filter(function (i) { return id ? i.saleId === id : true; });
  },

  /* ==========================================================================
     v2.30.0 (N11) — RETURNS KA PROFIT IMPACT (ek authoritative source)
     --------------------------------------------------------------------------
     Asli masla: profit reports sirf SaleItems parhte the — SALE RETURN ke baad
     profit BARRA chal jata tha (wapsi aayi revenue/cost net nahi hote the).
     Har return line ka asar:
       revenue reversal = original line ka NET unit revenue (lineBase/qty —
                          bill-discount share ke baad; na mile to return price)
       cost reversal    = original issue cost × qty (sirf restock par; restock
                          = false ho to maal zaya — poora revenue reversal)
     impact = revenue − cost (itna profit KAM karna hai).
     ========================================================================== */
  _returnsImpact: function (p, s) {
    p = p || {};
    var locId = p.locationId;
    var rets = DB.all('SaleReturns').filter(function (r) {
      if (locId && r.locationId !== locId) return false;
      var d = U.parseDate(r.date);
      if (p.from && !(d >= U.parseDate(p.from))) return false;
      if (p.to && !(d < U.parseDate(p.to))) return false;
      return true;
    });
    if (!rets.length) return { revenue: 0, cost: 0, impact: 0 };
    var retById = {}; rets.forEach(function (r) { retById[r.id] = r; });
    var origBySale = {};
    DB.all('SaleItems').forEach(function (i) { (origBySale[i.saleId] = origBySale[i.saleId] || []).push(i); });
    var revenue = 0, cost = 0;
    DB.all('SaleReturnItems').forEach(function (i) {
      var ret = retById[i.returnId];
      if (!ret) return;
      var orig = (origBySale[ret.saleId] || []).filter(function (o) { return o.itemId === i.itemId; })[0];
      var qty = U.num(i.qty);
      var netUnit = (orig && U.num(orig.qty))
        ? (U.num(orig.lineBase) || (U.num(orig.price) * U.num(orig.qty) - U.num(orig.discount))) / U.num(orig.qty)
        : U.num(i.price);
      var rev = U.round(Math.min(U.round(netUnit * qty, 2), U.num(i.lineTotal, U.round(netUnit * qty, 2))), 2);
      revenue = U.round(revenue + rev, 2);
      if (U.str(i.restock) !== 'false') {
        var costUnit = U.num(orig ? orig.cost : 0);
        if (!costUnit) {
          var stockRow = DB.all('Stock').filter(function (r2) {
            return r2.itemId === i.itemId && r2.locationId === (ret.locationId || locId);
          })[0] || {};
          var it = DB.byId('Items', i.itemId) || {};
          costUnit = U.num(stockRow.avgCost, U.num(it.costPrice));
        }
        cost = U.round(cost + U.round(costUnit * qty, 2), 2);
      }
    });
    return { revenue: revenue, cost: cost, impact: U.round(revenue - cost, 2) };
  },

  /* =============================== DASHBOARD =============================== */
  dashboard: function (p, s) {
    p = p || {};
    var today = U.startOfDay(new Date());
    var tomorrow = new Date(today.getTime()); tomorrow.setDate(tomorrow.getDate() + 1);
    var week = U.daysAgo(6), month = U.daysAgo(29);

    /* v2.30.0 — DEMO VISIBILITY: setting `data.showDemo` false ho to demo
       items/customers/sales dashboard se ghayab (production ke liye). */
    var demoOn = (typeof Shop !== 'undefined' && Shop.demoVisible) ? Shop.demoVisible() : true;
    var sales = DB.all('Sales').filter(function (x) {
      return U.str(x.status) !== 'VOID' && (demoOn || U.str(x.isDemo) !== 'true');
    });
    var viewable = Auth.can(s, 'sales.view.all') ? sales : sales.filter(function (x) { return x.cashierId === s.userId; });
    var locId = p.locationId || s.locationId;

    var inLoc = viewable.filter(function (x) { return !locId || x.locationId === locId; });

    var todaySales = inLoc.filter(function (x) { var d = U.parseDate(x.date); return d >= today && d < tomorrow; });
    var weekSales = inLoc.filter(function (x) { var d = U.parseDate(x.date); return d >= week; });
    var monthSales = inLoc.filter(function (x) { var d = U.parseDate(x.date); return d >= month; });

    var saleIds = {};
    monthSales.forEach(function (x) { saleIds[x.id] = 1; });
    var saleItems = DB.all('SaleItems').filter(function (i) { return saleIds[i.id] !== undefined || saleIds[i.saleId]; });

    var profit = 0;
    DB.all('SaleItems').forEach(function (i) {
      if (!saleIds[i.saleId]) return;
      profit += (U.num(i.price) - U.num(i.cost)) * U.num(i.qty) - U.num(i.discount);
    });
    /* v2.30.0 (N11) — returns ka asar net (pehle return ke baad profit BARRA dikhta tha) */
    var monthRets = Reports._returnsImpact({ locationId: locId, from: U.dateOnly(month), to: U.dateOnly(tomorrow) }, s);
    profit -= monthRets.impact;

    // trend (last 14 days)
    var trend = [];
    for (var d = 13; d >= 0; d--) {
      var day = U.daysAgo(d);
      var nxt = new Date(day.getTime()); nxt.setDate(nxt.getDate() + 1);
      var tot = U.sum(inLoc.filter(function (x) {
        var dd = U.parseDate(x.date); return dd >= day && dd < nxt;
      }), 'total');
      trend.push({ date: U.dateOnly(day), total: U.round(tot, 2) });
    }

    // top items (30d)
    var itemAgg = {};
    DB.all('SaleItems').forEach(function (i) {
      if (!saleIds[i.saleId]) return;
      var k = i.itemId;
      itemAgg[k] = itemAgg[k] || { itemId: k, name: i.name, code: i.code, qty: 0, revenue: 0, profit: 0 };
      itemAgg[k].qty += U.num(i.qty);
      itemAgg[k].revenue += U.num(i.lineTotal);
      itemAgg[k].profit += (U.num(i.price) - U.num(i.cost)) * U.num(i.qty) - U.num(i.discount);
    });
    var topItems = Object.keys(itemAgg).map(function (k) { return itemAgg[k]; });
    topItems = U.sortBy(topItems, 'revenue', 'desc').slice(0, 8);

    // low stock
    var stock = Inventory.stockMap(locId);
    var lowStock = DB.all('Items').filter(function (it) {
      if (!demoOn && U.str(it.isDemo) === 'true') return false;
      return U.str(it.status) === 'ACTIVE' && U.num(stock[it.id], 0) <= U.num(it.reorderLevel, U.num(it.minStock, 0));
    }).map(function (it) { return { id: it.id, code: it.code, name: it.name, qty: U.num(stock[it.id], 0), reorderLevel: U.num(it.reorderLevel, U.num(it.minStock, 0)) }; })
      .slice(0, 10);

    var val = Inventory.valuation(locId);
    var receivables = U.sum(Parties.balances('CUSTOMER'), 'balance');
    var payables = U.sum(Parties.balances('SUPPLIER').map(function (x) { return { balance: -x.balance }; }), 'balance');

    // payment method split (30d)
    var methods = {};
    monthSales.forEach(function (x) {
      (U.str(x.paymentMethod) || 'CASH').split('+').forEach(function (m) { methods[m] = (methods[m] || 0) + U.num(x.total); });
    });

    return {
      kpis: {
        todaySales: U.round(U.sum(todaySales, 'total'), 2),
        todayTxns: todaySales.length,
        weekSales: U.round(U.sum(weekSales, 'total'), 2),
        monthSales: U.round(U.sum(monthSales, 'total'), 2),
        monthProfit: U.round(profit, 2),
        monthDiscount: U.round(U.sum(monthSales, 'discount'), 2),
        avgTicket: monthSales.length ? U.round(U.sum(monthSales, 'total') / monthSales.length, 2) : 0,
        receivables: U.round(receivables, 2),
        payables: U.round(Math.abs(payables), 2),
        inventoryValue: val.costValue,
        inventoryRetail: val.retailValue,
        lowStockCount: lowStock.length,
        itemsCount: demoOn ? DB.count('Items') : DB.all('Items').filter(function (x) { return U.str(x.isDemo) !== 'true'; }).length,
        customersCount: demoOn ? DB.count('Customers') : DB.all('Customers').filter(function (x) { return U.str(x.isDemo) !== 'true'; }).length,
        demoHidden: !demoOn,
        pendingDue: U.round(U.sum(inLoc.filter(function (x) { return U.num(x.due) > 0; }), 'due'), 2)
      },
      trend: trend,
      topItems: topItems,
      lowStock: lowStock,
      paymentMix: Object.keys(methods).map(function (k) { return { method: k, total: U.round(methods[k], 2) }; })
    };
  },

  /* ================================= SALES ================================= */
  sales: function (p, s) {
    Auth.require(s, 'reports.view');
    var rows = Reports._salesIn(p, s);
    var items = {};
    DB.all('SaleItems').forEach(function (i) {
      (items[i.saleId] = items[i.saleId] || []).push(i);
    });
    var saleIds = {}; rows.forEach(function (r) { saleIds[r.id] = 1; });
    var cogs = 0, gross = 0;
    DB.all('SaleItems').forEach(function (i) {
      if (!saleIds[i.saleId]) return;
      cogs += U.num(i.cost) * U.num(i.qty);
      gross += (U.num(i.price) * U.num(i.qty)) - U.num(i.discount) - (U.num(i.cost) * U.num(i.qty));
    });
    /* v2.30.0 (N11) — returns ka asar net (revenue/cogs dono period ke returns se) */
    var retsImp = Reports._returnsImpact({ locationId: p.locationId, from: (p.from || ''), to: (p.to || '') }, s);
    cogs = U.round(cogs + retsImp.cost, 2);
    gross = U.round(gross - retsImp.impact, 2);
    var out = rows.map(function (r) {
      return Sales._brief(r);
    });
    return {
      rows: out,
      summary: {
        count: rows.length,
        subtotal: U.round(U.sum(rows, 'subtotal'), 2),
        discount: U.round(U.sum(rows, 'discount'), 2),
        tax: U.round(U.sum(rows, 'tax'), 2),
        total: U.round(U.sum(rows, 'total'), 2),
        paid: U.round(U.sum(rows, 'paid'), 2),
        due: U.round(U.sum(rows, 'due'), 2),
        cogs: U.round(cogs, 2),
        grossProfit: U.round(gross, 2)
      }
    };
  },

  salesByItem: function (p, s) {
    Auth.require(s, 'reports.view');
    var rows = Reports._salesIn(p, s);
    var ids = {}; rows.forEach(function (r) { ids[r.id] = 1; });
    var agg = {};
    DB.all('SaleItems').forEach(function (i) {
      if (!ids[i.saleId]) return;
      var k = i.itemId;
      agg[k] = agg[k] || { itemId: k, code: i.code, name: i.name, qty: 0, revenue: 0, cost: 0, profit: 0, txns: 0 };
      agg[k].qty += U.num(i.qty);
      agg[k].revenue += U.num(i.lineTotal);
      agg[k].cost += U.num(i.cost) * U.num(i.qty);
      agg[k].profit += (U.num(i.price) - U.num(i.cost)) * U.num(i.qty) - U.num(i.discount);
      agg[k].txns++;
    });
    var out = Object.keys(agg).map(function (k) { return agg[k]; });
    out = U.sortBy(out, p.sort || 'revenue', p.dir || 'desc');
    return { rows: out.slice(0, U.num(p.limit, 200)), total: out.length };
  },

  salesByCategory: function (p, s) {
    Auth.require(s, 'reports.view');
    var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
    var rows = Reports._salesIn(p, s);
    var ids = {}; rows.forEach(function (r) { ids[r.id] = 1; });
    var agg = {};
    DB.all('SaleItems').forEach(function (i) {
      if (!ids[i.saleId]) return;
      var cat = (items[i.itemId] || {}).category || 'Uncategorized';
      agg[cat] = agg[cat] || { category: cat, qty: 0, revenue: 0, profit: 0 };
      agg[cat].qty += U.num(i.qty);
      agg[cat].revenue += U.num(i.lineTotal);
      agg[cat].profit += (U.num(i.price) - U.num(i.cost)) * U.num(i.qty) - U.num(i.discount);
    });
    var out = Object.keys(agg).map(function (k) { return agg[k]; });
    return { rows: U.sortBy(out, 'revenue', 'desc') };
  },

  /* =============================== INVENTORY =============================== */
  inventoryValuation: function (p, s) {
    Auth.require(s, 'reports.view');
    var rows = Inventory.levels({ locationId: p.locationId || s.locationId }, s);
    return {
      rows: rows,
      summary: Inventory.valuation(p.locationId || s.locationId)
    };
  },

  lowStock: function (p, s) {
    Auth.require(s, 'stock.view');
    return Items.reorderSuggestion(s);
  },

  stockMovement: function (p, s) {
    Auth.require(s, 'stock.view');
    return Inventory.moves(p, s);
  },

  profit: function (p, s) {
    Auth.require(s, 'reports.financial');
    var salesReport = Reports.sales(p, s);
    var expenses = DB.all('Expenses').filter(function (e) {
      return !p.locationId || e.locationId === p.locationId;
    });
    var expTotal = U.sum(expenses, 'amount');
    return {
      revenue: salesReport.summary.total,
      cogs: salesReport.summary.cogs,
      grossProfit: salesReport.summary.grossProfit,
      discount: salesReport.summary.discount,
      expenses: U.round(expTotal, 2),
      netProfit: U.round(salesReport.summary.grossProfit - expTotal, 2),
      margin: salesReport.summary.total ? U.round(salesReport.summary.grossProfit / salesReport.summary.total * 100, 2) : 0,
      byCategory: Reports.salesByCategory(p, s).rows
    };
  },

  /* ================================ PARTIES ================================ */
  /**
   * Party balance MOVEMENT — "pichhla baqaya + naya = kul baqaya".
   *
   *   prevBalance   = opening + ledger entries BEFORE the range
   *   newAmount     = range mein ban'ney wala udhaar / purchase
   *   settled       = range mein milney wali recovery / payment
   *   balance       = prevBalance + newAmount - settled   (closing)
   *
   * Ledger customer-style store hota hai (debit - credit), is liye SUPPLIER ke
   * liye sign ulta hai — payable POSITIVE rehta hai (Parties.supplierPayable).
   */
  partyBalances: function (p, s) {
    p = p || {};
    var type = U.str(p.partyType || p.type, 'CUSTOMER').toUpperCase();
    if (type !== 'SUPPLIER' && type !== 'CUSTOMER') type = 'CUSTOMER';
    var sup = type === 'SUPPLIER';
    var r = Reports._range(p);
    var rows = sup ? DB.all('Suppliers') : DB.all('Customers');
    var map = {};
    DB.all('Ledger').forEach(function (x) {
      if (U.str(x.partyType).toUpperCase() !== type || !x.partyId) return;
      var d = U.parseDate(x.date);
      var m = map[x.partyId] = map[x.partyId] || { before: 0, dr: 0, cr: 0 };
      if (d && d >= r.to) return;                       /* range ke baad — "as of" report mein shamil nahi */
      if (d && d >= r.from) { m.dr += U.num(x.debit); m.cr += U.num(x.credit); }
      else { m.before += U.num(x.debit) - U.num(x.credit); }   /* range se pehle (ya be-tareekh) */

    });
    var out = rows.map(function (party) {
      var op = U.num(party.openingBalance);
      var m = map[party.id] || { before: 0, dr: 0, cr: 0 };
      var prev = sup ? (op - m.before) : (op + m.before);
      var added = sup ? m.cr : m.dr;
      var settled = sup ? m.dr : m.cr;
      var closing = U.round(prev + added - settled, 2);
      return {
        id: party.id, code: party.code, name: party.name, phone: party.phone,
        email: party.email || '', address: party.address || '',
        partyType: type,
        openingBalance: U.round(op, 2),
        prevBalance: U.round(prev, 2),
        newAmount: U.round(added, 2),
        settled: U.round(settled, 2),
        balance: closing, closingBalance: closing,
        creditLimit: U.num(party.creditLimit), customerTypeId: party.customerTypeId || ''
      };
    }).filter(function (x) {
      return Math.abs(x.prevBalance) > 0.005 || Math.abs(x.newAmount) > 0.005 ||
        Math.abs(x.settled) > 0.005 || Math.abs(x.balance) > 0.005;
    });
    out = U.sortBy(out, 'balance', sup ? 'asc' : 'desc');
    var open = out.filter(function (x) { return Math.abs(x.balance) > 0.005; });
    return {
      rows: out, openRows: open, partyType: type,
      from: p.from || '', to: p.to || '',
      prevTotal: U.round(U.sum(out, 'prevBalance'), 2),
      newTotal: U.round(U.sum(out, 'newAmount'), 2),
      settledTotal: U.round(U.sum(out, 'settled'), 2),
      total: U.round(U.sum(open, sup ? 'balance' : 'balance'), 2)
    };
  },

  /** Udhaar (customers) — prev + new - received = closing */
  receivables: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = Object.assign({}, p || {}, { partyType: 'CUSTOMER' });
    var res = Reports.partyBalances(p, s);
    res.rows = res.rows.filter(function (r) { return r.balance > 0.005; });
    return Reports._partyTotals(res, 'CUSTOMER');
  },

  /** Payable (suppliers) — prev + new - paid = closing (positive = dena hai) */
  payables: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = Object.assign({}, p || {}, { partyType: 'SUPPLIER' });
    var res = Reports.partyBalances(p, s);
    res.rows = res.rows.filter(function (r) { return r.balance > 0.005; });
    return Reports._partyTotals(res, 'SUPPLIER');
  },

  /** Filtered rows ke hisaab se totals dobara compute (prev / new / settled / total) */
  _partyTotals: function (res, type) {
    var rows = res.rows;
    rows = U.sortBy(rows, 'balance', 'desc');
    return {
      rows: rows, partyType: type, from: res.from, to: res.to,
      prevTotal: U.round(U.sum(rows, 'prevBalance'), 2),
      newTotal: U.round(U.sum(rows, 'newAmount'), 2),
      settledTotal: U.round(U.sum(rows, 'settled'), 2),
      total: U.round(U.sum(rows, 'balance'), 2)
    };
  },

  /* ================================= CASH ================================== */
  cashbook: function (p, s) {
    Auth.require(s, 'reports.financial');
    p = p || {};
    var r = Reports._range(p);

    /* ---- filters (sab settings-driven) ---------------------------------- */
    var method = U.str(p.method || Config.get('cashbook.method', 'ALL', s) || 'ALL').toUpperCase();
    var locOk = function (x) { return !p.locationId || x.locationId === p.locationId; };
    var dateOf = function (x) { return U.parseDate(x.date || x.createdAt); };
    var inWin = function (d) { return d && d >= r.from && d < r.to; };
    var isOut = function (x) { return x.type === 'REFUND_OUT' || x.type === 'SUPPLIER_PAYMENT'; };
    var netPay = function (x) { return isOut(x) ? -U.num(x.amount) : U.num(x.amount); };
    var methodOf = function (x, dft) { return (U.str(x.method).toUpperCase() || dft || 'CASH'); };

    var pays = DB.all('Payments').filter(locOk);
    var withExp = U.str(Config.get('cashbook.includeExpenses', true, s)).toLowerCase() !== 'false';
    var exps = withExp ? DB.all('Expenses').filter(locOk)
      .filter(function (x) { return U.str(x.status).toUpperCase() !== 'REJECTED'; }) : [];
    if (method !== 'ALL') {
      pays = pays.filter(function (x) { return methodOf(x, 'CASH') === method; });
      exps = exps.filter(function (x) { return methodOf(x, 'CASH') === method; });
    }

    /* ---- opening balance: koi hardcoded 0 nahi ----------------------------
       opening = cashbook.openingCash (settings, jis tareekh ka balance darj
       kiya gaya = cashbook.openingAsOf) + us tareekh se period-start tak ki
       saari movements. AsOf khali ho to poori history ka net le lete hain.  */
    var baseCash = U.num(Config.get('cashbook.openingCash', 0, s));
    var asOfStr = U.str(Config.get('cashbook.openingAsOf', '', s));
    var asOf = asOfStr ? U.startOfDay(asOfStr) : null;
    var opening = baseCash, beforeRows = 0;
    function accrue(x, v) {
      var d = dateOf(x);
      if (!d || d >= r.from) return;
      if (asOf && d < asOf) return;          /* as-of se pehle ki history settings balance mein shamil */
      opening += v; beforeRows++;
    }
    pays.forEach(function (x) { accrue(x, netPay(x)); });
    exps.forEach(function (x) { accrue(x, -U.num(x.amount)); });

    /* ---- period movements ------------------------------------------------- */
    var inflow = 0, outflow = 0, expTotal = 0;
    var byMethod = {}, byDay = {}, entries = [];
    function bucket(m) {
      var b = byMethod[m] = byMethod[m] || { method: m, count: 0, inflow: 0, outflow: 0, net: 0 };
      return b;
    }
    function day(k) {
      var d = byDay[k] = byDay[k] || { date: k, inflow: 0, outflow: 0 };
      return d;
    }
    pays.forEach(function (x) {
      var d = dateOf(x); if (!inWin(d)) return;
      var amt = U.num(x.amount), m = methodOf(x, 'CASH'), out = isOut(x);
      if (out) outflow += amt; else inflow += amt;
      var b = bucket(m); b.count++; if (out) b.outflow += amt; else b.inflow += amt; b.net = b.inflow - b.outflow;
      var k = U.dateOnly(d), dd = day(k); if (out) dd.outflow += amt; else dd.inflow += amt;
      entries.push(Object.assign(Payments._brief(x), {
        _at: d.getTime(), direction: out ? 'OUT' : 'IN', kind: 'PAYMENT', accountName: x.partyName || ''
      }));
    });
    exps.forEach(function (x) {
      var d = dateOf(x); if (!inWin(d)) return;
      var amt = U.num(x.amount), m = methodOf(x, 'CASH');
      outflow += amt; expTotal += amt;
      var b = bucket(m); b.count++; b.outflow += amt; b.net = b.inflow - b.outflow;
      var k = U.dateOnly(d), dd = day(k); dd.outflow += amt;
      entries.push({
        id: x.id, voucherNo: x.voucherNo, date: x.date, type: 'EXPENSE', category: x.category,
        partyName: x.paidTo || '', amount: amt, method: m, _at: d.getTime(),
        direction: 'OUT', kind: 'EXPENSE', accountName: x.paidTo || '', notes: x.notes || ''
      });
    });

    /* ---- running balance (professional cash book) -------------------------- */
    entries.sort(function (a, b) { return (a._at - b._at) || String(a.voucherNo).localeCompare(String(b.voucherNo)); });
    var bal = opening;
    entries.forEach(function (e) {
      bal += (e.direction === 'OUT' ? -U.num(e.amount) : U.num(e.amount));
      e.balance = U.round(bal, 2); e._at = undefined; delete e._at;
    });

    /* ---- day-wise summary with opening/closing ----------------------------- */
    var run = opening;
    var days = Object.keys(byDay).sort().map(function (k) {
      var d = byDay[k], o = run; run += d.inflow - d.outflow;
      return {
        date: k, opening: U.round(o, 2), inflow: U.round(d.inflow, 2),
        outflow: U.round(d.outflow, 2), net: U.round(d.inflow - d.outflow, 2), closing: U.round(run, 2)
      };
    });

    return {
      from: U.dateOnly(r.from), to: U.dateOnly(new Date(r.to.getTime() - 864e5)),
      locationId: p.locationId || '', method: method,
      opening: U.round(opening, 2),
      openingDetail: {
        base: U.round(baseCash, 2), asOf: asOfStr, entries: beforeRows,
        movements: U.round(opening - baseCash, 2),
        basis: asOfStr ? ('settings balance as on ' + asOfStr + ' + ' + beforeRows + ' purani entries')
          : (beforeRows ? (beforeRows + ' purani entries ka net') : 'koi purani entry nahi (settings balance)')
      },
      inflow: U.round(inflow, 2), outflow: U.round(outflow, 2),
      expensesTotal: U.round(expTotal, 2),
      closing: U.round(opening + inflow - outflow, 2),
      byMethod: Object.keys(byMethod).sort().map(function (k) {
        var b = byMethod[k];
        return { method: k, count: b.count, inflow: U.round(b.inflow, 2), outflow: U.round(b.outflow, 2), net: U.round(b.net, 2) };
      }),
      days: days,
      entries: entries,
      payments: entries.filter(function (e) { return e.kind === 'PAYMENT'; }),
      expenses: entries.filter(function (e) { return e.kind === 'EXPENSE'; }),
      generatedAt: new Date().toISOString()
    };
  },

  /* ================================ EXPORT ================================= */
  /* ==========================================================================
     v2.6 §7 — AUTO DAY REPORT (shop khulte / band hote hi) + HISTORY
     --------------------------------------------------------------------------
     • Shop OPEN  → opening report (settings: dayReportAutoOpen)
     • Shop CLOSE → closing report (settings: dayReportAutoClose) — cash
       reconciliation, expenses, top items sab ke sath
     • History    → baad mein kabhi bhi print / PDF / share / CSV
     Report ki POORI HTML sheet mein nahi rakhte (Sheets cell limit) — sirf
     summary JSON; HTML/PDF zaroorat par dobara banta hai, is liye hamesha
     taaza data rehta hai.
     ========================================================================== */
  dayReport: {

    /** settings-driven: auto generation on/off */
    _cfg: function () {
      var st = DB.settings() || {};
      return {
        autoOpen: U.str(st.dayReportAutoOpen) !== 'false',
        autoClose: U.str(st.dayReportAutoClose) !== 'false',
        autoPrint: U.str(st.dayReportAutoPrint) !== 'false'
      };
    },

    /**
     * Session khulne / band hone par khud chalne wala hisaab.
     * KABHI error nahi phenkta — report na bane to bhi session open/close
     * hona chahiye (ye ek side-effect hai, rukawat nahi).
     */
    auto: function (kind, session, s) {
      try {
        if (!session || !session.id) return null;
        var cfg = Reports.dayReport._cfg();
        var on = (kind === 'OPEN') ? cfg.autoOpen : cfg.autoClose;
        if (!on) return null;
        return Reports.dayReport.generate(
          { sessionId: session.id, kind: kind, method: 'AUTO' }, s);
      } catch (e) {
        Logger.log('auto day report (' + kind + '): ' + e.message);
        return null;
      }
    },

    /** Report banao + history mein save karo */
    generate: function (p, s) {
      Auth.require(s, 'reports.view');
      p = p || {};
      var ses = null;
      if (p.sessionId) ses = DB.byId('CashSessions', p.sessionId);
      if (!ses) ses = Payments.currentSessionRaw(p.locationId || s.locationId, s.userId);
      if (!ses) throw new Error('Koi session nahi mili — report nahi ban sakti.');

      var r = Payments.dayReport({ sessionId: ses.id }, s);
      if (!r) throw new Error('Report ka data nahi ban saka.');

      var kind = U.upper(U.str(p.kind || 'CLOSE'));
      var sum = {
        sessionNo: U.str(r.sessionNo), date: U.str(r.date || U.dateOnly()).slice(0, 10),
        openingCash: U.num(r.openingCash), expectedCash: U.num(r.expectedCash),
        closingCash: U.num(r.closingCash), variance: U.num(r.variance),
        cashSales: U.num(r.cashSales), creditSales: U.num(r.creditSales),
        refunds: U.num(r.refunds), netSales: U.num(r.netSales),
        expenseTotal: U.num(r.expenseTotal),
        cashIn: U.num(r.cashIn), cashOut: U.num(r.cashOut),
        invoices: U.num(r.invoices)
      };

      var rec = DB.insert('DayReports', {
        id: U.uid('DRP'), reportNo: DB.nextNumber('DRP', ses.locationId),
        sessionId: ses.id, kind: kind, date: sum.date,
        locationId: ses.locationId, userId: s.userId,
        summary: JSON.stringify(sum),
        method: U.str(p.method || 'MANUAL'),
        status: 'GENERATED', generatedAt: U.iso(), generatedBy: s.userId,
        notes: p.notes || ''
      }, s);

      /* §15 */
      Audit.log('DAY_REPORT', 'DayReports', rec.id, null, {
        reportNo: rec.reportNo, kind: kind, sessionId: ses.id, sessionNo: sum.sessionNo,
        openingCash: sum.openingCash, expectedCash: sum.expectedCash,
        closingCash: sum.closingCash, variance: sum.variance,
        netSales: sum.netSales, expenseTotal: sum.expenseTotal,
        method: rec.method
      }, s);

      return Reports.dayReport.get({ id: rec.id }, s);
    },

    /** History — kaunsi report kab bani (purani pehle) */
    list: function (p, s) {
      Auth.require(s, 'reports.view');
      p = p || {};
      var rows = DB.all('DayReports').filter(function (r) {
        if (p.locationId && r.locationId !== p.locationId) return false;
        if (p.kind && U.upper(U.str(r.kind)) !== U.upper(U.str(p.kind))) return false;
        if (p.sessionId && r.sessionId !== p.sessionId) return false;
        return true;
      });
      rows.sort(function (a, b) { return U.str(b.generatedAt).localeCompare(U.str(a.generatedAt)); });
      return rows.slice(0, U.num(p.limit, 200)).map(function (r) {
        var sum = {};
        try { sum = JSON.parse(U.str(r.summary) || '{}') || {}; } catch (e) { sum = {}; }
        return {
          id: r.id, reportNo: r.reportNo, kind: r.kind, date: r.date,
          sessionId: r.sessionId, sessionNo: sum.sessionNo || '',
          locationId: r.locationId, method: r.method, status: r.status,
          generatedAt: r.generatedAt,
          openingCash: U.num(sum.openingCash), expectedCash: U.num(sum.expectedCash),
          closingCash: U.num(sum.closingCash), variance: U.num(sum.variance),
          netSales: U.num(sum.netSales), expenseTotal: U.num(sum.expenseTotal),
          invoices: U.num(sum.invoices)
        };
      });
    },

    /** Ek report — summary ke sath */
    get: function (p, s) {
      Auth.require(s, 'reports.view');
      var r = DB.byId('DayReports', p.id);
      if (!r) throw new Error('Report nahi mili');
      var sum = {};
      try { sum = JSON.parse(U.str(r.summary) || '{}') || {}; } catch (e) { sum = {}; }
      return {
        id: r.id, reportNo: r.reportNo, kind: r.kind, date: r.date,
        sessionId: r.sessionId, locationId: r.locationId,
        method: r.method, status: r.status, generatedAt: r.generatedAt,
        summary: sum
      };
    },

    /** Print / PDF ke liye HTML (hamesha taaza data se) */
    html: function (p, s) {
      Auth.require(s, 'reports.view');
      var r = DB.byId('DayReports', p.id);
      if (!r) throw new Error('Report nahi mili');
      var data = Payments.dayReport({ sessionId: r.sessionId }, s);
      if (!data) throw new Error('Is report ka session ab maujood nahi.');
      data.kind = U.str(r.kind);
      data.reportNo = U.str(r.reportNo);
      /* fragment ko poori print-ready document bana kar bhejein */
      return {
        id: r.id, reportNo: r.reportNo, kind: r.kind,
        html: Exports.wrapDoc(Exports.dayReportHtml(data),
          U.str(r.reportNo) + ' ' + U.str(r.kind))
      };
    },

    /** PDF (server-side, browser ke baghair — PWA mein bhi chalta hai) */
    pdf: function (p, s) {
      Auth.require(s, 'reports.view');
      var r = DB.byId('DayReports', p.id);
      if (!r) throw new Error('Report nahi mili');
      var document=Reports.dayReport.html(p,s);
      return Exports.htmlToPdf({html:document.html,name:document.reportNo+'-'+document.kind},s);
    },

    /** CSV — Excel mein kholne ke liye */
    csv: function (p, s) {
      var d = Reports.dayReport.get(p, s);
      var sum = d.summary || {};
      var lines = ['Field,Value'];
      lines.push('Report,' + d.reportNo);
      lines.push('Kind,' + d.kind);
      lines.push('Date,' + d.date);
      lines.push('Session,' + (sum.sessionNo || ''));
      ['openingCash', 'cashSales', 'creditSales', 'refunds', 'netSales',
      'expenseTotal', 'cashIn', 'cashOut', 'expectedCash', 'closingCash', 'variance']
        .forEach(function (k) { lines.push(k + ',' + U.num(sum[k])); });
      return { filename: U.str(d.reportNo || 'day-report') + '.csv', csv: lines.join('\n') };
    }
  },

  exportCsv: function (p, s) {
    Auth.require(s, 'reports.view');
    var type = p.type || 'sales';
    var data;
    if (type === 'sales') data = Reports.sales(p, s).rows;
    else if (type === 'items') data = Items.list(Object.assign({ pageSize: 0 }, p), s).rows;
    else if (type === 'stock') data = Inventory.levels(p, s);
    else if (type === 'receivables') data = Reports.receivables(p, s).rows;
    else if (type === 'payables') data = Reports.payables(p, s).rows;
    else if (type === 'purchase') data = Purchase.listPO(p, s);
    else if (type === 'audit') data = Audit.search(p, s);
    else data = [];
    if (!data.length) return { csv: '', filename: type + '.csv' };
    var headers = Object.keys(data[0]).filter(function (k) { return typeof data[0][k] !== 'object'; });
    return {
      csv: U.csv(data, headers),
      filename: type + '-' + U.dateOnly() + '.csv'
    };
  }
};
