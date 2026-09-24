/**
 * HASEEB AUTOS - ERP / POS  ::  SALES (POS + RETURNS)
 * Transactional: sale → stock out + ledger + payment + commission, ek hi call mein.
 */


/** Returns true if any line's effective unit price drops below its minPrice. */
function discBeforeTaxGuard(lineRows, lineBases, headerDisc, subtotal, itemCache, s) {
  if (Auth.can(s, 'items.price.edit') || Auth.can(s, '*')) return false;
  for (var i = 0; i < lineRows.length; i++) {
    var lr = lineRows[i];
    var it = itemCache[lr.itemId] || {};
    var minP = U.num(it.minPrice);
    if (!minP) continue;
    var share = subtotal ? U.num(lineBases[i]) / subtotal : 0;
    var net = U.num(lineBases[i]) - (headerDisc * share);
    var unit = lr.qty ? net / lr.qty : net;
    if (unit < minP - 0.0001) return true;
  }
  return false;
}

var Sales = {
  /* v2.9.1 §6 — item ki sales activity (sirf real Sales/SaleItems se). */
  itemActivity: function (p, s) {
    Auth.require(s, 'sales.view');
    if (!p || !p.itemId) throw new Error('itemId chahiye');
    var days = Math.max(7, U.num(p.days, 30));
    var cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    var live = {};
    DB.all('Sales').forEach(function (sv) {
      var st = U.str(sv.status, 'DUE');
      if (U.str(sv.date).slice(0, 10) >= cut && st !== 'VOID' && st !== 'CANCELLED') live[sv.id] = sv;
    });
    var qty = 0, rev = 0, last = '', custs = {};
    DB.all('SaleItems').forEach(function (li) {
      if (String(li.itemId) !== String(p.itemId)) return;
      var sv = live[li.saleId]; if (!sv) return;
      qty += U.num(li.qty);
      rev += U.num(li.lineTotal, U.num(li.qty) * U.num(li.price));
      var d = U.str(sv.date).slice(0, 10); if (d > last) last = d;
      if (sv.customerName) custs[sv.customerName] = (custs[sv.customerName] || 0) + U.num(li.qty);
    });
    var top = Object.keys(custs).map(function (k) { return { name: k, qty: U.round(custs[k], 2) }; })
      .sort(function (x, y) { return y.qty - x.qty; }).slice(0, 3);
    return { itemId: p.itemId, days: days, qty: U.round(qty, 2),
      revenue: U.round(rev, 2), lastSold: last, topCustomers: top };
  },


  /* ================================ CREATE ================================= */
  /**
   * payload = {
   *   locationId, customerId, customerName, customerTypeId, date,
   *   items: [{ itemId, qty, price, discount, salespersonId, serial }],
   *   discount, discountCode, discountPct, tax, payments:[{method, amount, reference}],
   *   notes, sessionId, source:'POS'|'OFFLINE'|'ORDER', offlineId
   * }
   */
  create: function (payload, s) {
    Auth.require(s, 'pos.sell');
    var items = payload.items || [];
    if (!items.length) throw new Error('Cart khali hai.');
    var locId = payload.locationId || s.locationId;
    if (!Auth.canAccessLocation(s, locId)) throw new Error('Is branch ka access nahi hai.');

    // --- offline duplicate guard ---
    if (payload.offlineId) {
      var dup = DB.findOne('Sales', function (r) { return r.notes && r.notes.indexOf('OFFLINE:' + payload.offlineId) > -1; });
      if (dup) return dup;
    }

    var stock = Inventory.stockMap(locId);
    var itemCache = {};
    DB.all('Items').forEach(function (i) { itemCache[i.id] = i; });


    // weighted-average cost per item for THIS branch → COGS aur profit isi se
    var costMap = {};
    DB.all('Stock').forEach(function (r) {
      if (r.locationId === locId) costMap[r.itemId] = U.num(r.avgCost);
    });

    /*
     * v2.6 §12 — CONSIGNMENT flag: source='SALESMAN' ka matlab hai ye maal
     * pehle hi salesman ke zimme ja chuka hai (issue ke waqt branch se nikal
     * gaya tha). Is liye is sale par branch stock dobara nahi ghatayenge.
     */
    var isConsignment = (U.str(payload.source) === 'SALESMAN' ||
      U.str((payload.sale || {}).source) === 'SALESMAN');
    if (isConsignment && !payload.salespersonId) {
      /* salesman ke zimme ka maal ho to salesman ka naam lazmi hai */
      throw new Error('Salesman ki sale mein salesperson lazmi hai.');
    }
    /**
     * v2.6 §12 — BUG CAUGHT BY E2E TEST (SHOWTOPPER):
     * Consignment sale mein maal BRANCH se nahi, SALESMAN ke zimme se ghat-ta
     * hai. `Inventory.post` to skip tha (neeche line ~222), magar neechay wala
     * STOCK GUARD abhi bhi branch stock check karta tha → salesman ke paas
     * maal hone ke bawajood "Stock kam hai (available 0)" aata tha aur poora
     * consignment model kaam hi nahi karta tha.
     * Ab consignment sale par salesman ka stock check hota hai.
     */
    var smStock = null;
    if (isConsignment && typeof Salesman !== 'undefined') {
      smStock = {};
      DB.all('SalesmanStock').forEach(function (r) {
        if (U.str(r.salesmanId) === U.str(payload.salespersonId)) {
          smStock[r.itemId] = U.num(r.qty);
        }
      });
    }

    // ---- line calc ----
    var subtotal = 0, lineRows = [], lineBases = [], lineRates = [];
    items.forEach(function (line) {
      var it = itemCache[line.itemId];
      if (!it) throw new Error('Item not found: ' + (line.itemId || line.name));
      var qty = U.num(line.qty, 1);
      if (qty <= 0) throw new Error('Quantity ghalat hai.');
      var price = U.num(line.price, U.num(it.retailPrice));
      var lineDisc = U.num(line.discount);
      if (U.num(line.discountPct)) lineDisc += (price * qty) * U.num(line.discountPct) / 100;

      // ---- discount limit check ----
      var pctOfLine = (price * qty) ? (lineDisc / (price * qty) * 100) : 0;
      if (pctOfLine > U.num(s.discountLimit, 0) && !Auth.can(s, 'pos.discount')) {
        throw new Error('Discount limit: aap max ' + U.num(s.discountLimit, 0) + '% tak de saktay hain.');
      }
      // ---- min price guard ----
      var effUnit = qty ? (price * qty - lineDisc) / qty : price;
      if (U.num(it.minPrice) && effUnit < U.num(it.minPrice) && !Auth.can(s, 'items.price.edit')) {
        throw new Error('Minimum price se neechay nahi ja saktay: ' + it.name);
      }
      // ---- stock guard (consignment ho to SALESMAN ka stock, warna branch) ----
      var avail = smStock ? U.num(smStock[line.itemId], 0) : U.num(stock[line.itemId], 0);
      if (avail < qty && U.str(DB.settings().allowNegativeStock) !== 'true') {
        throw new Error('Stock kam hai: ' + it.name +
          (smStock ? ' (salesman ke paas available ' + avail + ')' : ' (available ' + avail + ')'));
      }
      var taxable = U.round((price * qty) - lineDisc, 2);
      var rate = U.num(line.taxRate !== undefined ? line.taxRate : it.taxRate, U.num(DB.settings().taxRate));
      subtotal += taxable;
      lineBases.push(taxable); lineRates.push(rate);
      lineRows.push({
        id: U.uid('SI'), saleId: '', itemId: it.id, code: it.code, name: it.name,
        qty: qty, price: U.num(price), cost: U.num(costMap[it.id], U.num(it.costPrice)),
        discount: U.round(lineDisc, 2),
        tax: 0, lineTotal: 0, salespersonId: line.salespersonId || payload.salespersonId || s.userId,
        serial: line.serial || '', notes: line.notes || ''
      });
      /* in-memory consume — consignment ho to salesman ka stock ghatao */
      if (smStock) smStock[line.itemId] = U.num(smStock[line.itemId], 0) - qty;
      else stock[line.itemId] = U.num(stock[line.itemId], 0) - qty;
    });

    // ---- header (bill level) discounts ----
    var headerDisc = U.num(payload.discount);
    if (U.num(payload.discountPct)) headerDisc += subtotal * U.num(payload.discountPct) / 100;
    if (payload.discountCode) headerDisc += Sales.applyCoupon(payload.discountCode, subtotal);
    headerDisc = U.round(Math.min(headerDisc, subtotal), 2);

    // ---- bill-level discount limit (line limit ki tarah) ----
    var maxDiscPct = U.num(DB.settings().maxDiscountPct, U.num(s.discountLimit, 0));
    if (maxDiscPct && subtotal) {
      var billPct = (headerDisc / subtotal) * 100;
      if (billPct > maxDiscPct && !Auth.can(s, 'pos.discount') && !Auth.can(s, '*')) {
        throw new Error('Discount limit: bill par max ' + maxDiscPct + '% (=' +
          U.round(subtotal * maxDiscPct / 100, 2) + ') diya ja sakta hai.');
      }
    }
    // effective unit price must stay at/above min price after bill discount
    if (discBeforeTaxGuard(lineRows, lineBases, headerDisc, subtotal, itemCache, s)) {
      throw new Error('Minimum price se neechay nahi ja saktay (bill discount ke baad).');
    }

    /*
     * TAX ENGINE (industry standard)
     *  - Bill discount is applied BEFORE tax (setting: tax.discountBeforeTax, default true)
     *    so tax is charged on the NET amount, not on the gross.
     *  - Discount is allocated to lines proportionally to their taxable value,
     *    so per-line tax, per-line totals aur reports sab ek doosray se match kartay hain.
     *  - taxInclusive: price already contains tax → tax = net - net/(1+rate)
     */
    var taxInclusive = payload.taxInclusive !== undefined && payload.taxInclusive !== null
      ? String(payload.taxInclusive) === 'true'
      : U.str(DB.settings().taxInclusive) === 'true';
    var discBeforeTax = U.str(DB.settings().discountBeforeTax) !== 'false';

    var allocTotal = 0, tax = 0;
    lineRows.forEach(function (lr, i) {
      var gross = U.num(lineBases[i]);                       // after line-level discount
      var share = subtotal ? gross / subtotal : 0;
      var hdShare = discBeforeTax ? U.round(headerDisc * share, 2) : 0;
      if (i === lineRows.length - 1 && discBeforeTax) {       // rounding residue to last line
        var allocated = U.round(allocTotal, 2);
        if (U.round(headerDisc - allocated, 2) !== hdShare) hdShare = U.round(headerDisc - allocated, 2);
      }
      allocTotal = U.round(allocTotal + hdShare, 2);

      var net = U.round(gross - hdShare, 2);
      var rate = U.num(lineRates[i]);
      var lineTax;
      if (taxInclusive && rate) { lineTax = U.round(net - (net / (1 + rate / 100)), 2); lr.lineBase = U.round(net - lineTax, 2); }
      else { lineTax = U.round(net * rate / 100, 2); lr.lineBase = net; }
      lr.tax = lineTax;
      lr.discount = U.round(U.num(lr.discount) + hdShare, 2);   // line discount + share of bill discount
      lr.lineTotal = U.round(U.num(lr.lineBase) + lineTax, 2);
      tax = U.round(tax + lineTax, 2);
    });

    // explicit tax override from client (rare) wins over computed line tax
    if (payload.tax !== undefined && payload.tax !== null && payload.tax !== '') tax = U.num(payload.tax);

    var taxableNet = U.round(subtotal - headerDisc, 2);
    var total = U.round(taxInclusive ? taxableNet : (taxableNet + tax), 2);
    // guarantee line totals and header total never drift by more than a paisa
    var lineSum = U.round(U.sum(lineRows, 'lineTotal'), 2);
    if (Math.abs(lineSum - total) > 0.02 && !taxInclusive) total = lineSum;

    // ---- payments ----
    var payments = payload.payments || [];
    var paid = U.round(U.sum(payments, 'amount'), 2);
    var due = U.round(total - paid, 2);
    var change = U.round(paid - total, 2);
    if (change < 0) change = 0;

    if (due > 0 && !payload.customerId && U.str(DB.settings().allowCreditSale) !== 'true') {
      throw new Error('Credit sale allowed nahi hai. Customer select karein ya payment poori karein.');
    }
    if (due > 0 && payload.customerId) {
      var cust = DB.byId('Customers', payload.customerId);
      if (cust) {
        var bal = Parties.balance('CUSTOMER', cust.id);
        var limit = U.num((DB.byId('CustomerTypes', cust.customerTypeId) || {}).creditLimit, U.num(cust.creditLimit, 0));
        if (limit && (bal + due) > limit) {
          /* v2.9 §5 — error mein poora hisab: prev + due vs limit */
          throw new Error('Sale blocked: closing balance Rs ' + U.round(bal + due, 2) +
            ' (previous Rs ' + U.round(bal, 2) + ' + this udhaar Rs ' + U.round(due, 2) +
            ') exceeds credit limit Rs ' + U.num(limit, 0) + '. Cash Paid barhayein ya customer ka limit barhayein.');
        }
      }
    }

    var invoiceNo = DB.nextNumber('SALE', locId);
    var saleId = U.uid('SAL');
    var status = due <= 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'DUE');

    var sale = DB.insert('Sales', {
      id: saleId, invoiceNo: invoiceNo, date: payload.date || U.iso(), locationId: locId,
      customerId: payload.customerId || '', customerName: payload.customerName || 'Walk-in Customer',
      customerType: payload.customerTypeId || '',
      subtotal: U.round(subtotal, 2), discount: headerDisc, discountCode: payload.discountCode || '',
      tax: U.round(tax, 2), total: total, paid: paid, change: change, due: due,
      paymentMethod: (payments.map(function (p) { return p.method; })).join('+') || 'CASH',
      payments: JSON.stringify(payments), status: status,
      salespersonId: payload.salespersonId || s.userId, cashierId: s.userId,
      sessionId: payload.sessionId || '', notes: (payload.notes || '') + (payload.offlineId ? ' OFFLINE:' + payload.offlineId : ''),
      source: payload.source || 'POS', createdAt: U.iso()
    }, s);

    // ---- line items + stock out ----
    lineRows.forEach(function (lr) {
      lr.saleId = saleId;
      DB.insert('SaleItems', lr);
      /*
       * v2.6 §12 — CONSIGNMENT: agar ye sale salesman ke zimme ke maal ki hai
       * (source = 'SALESMAN') to wo stock ISSUE ke waqt hi branch se nikal
       * chuka hota hai. Yahan dobara Inventory.post karne se stock DOUBLE
       * ghata (branch bhi, salesman bhi) — is liye consignment sale par
       * branch stock ko chhota nahi jata; sirf Salesman.consume() neeche
       * salesman ka balance ghatata hai.
       */
      if (!isConsignment) {
        Inventory.post(lr.itemId, locId, -lr.qty, lr.cost, 'SALE', saleId, s, invoiceNo);
      } else {
        DB.insert('StockMoves', {
          id: U.uid('MOV'), ts: U.iso(), date: U.dateOnly(), itemId: lr.itemId, locationId: locId,
          qtyIn: '0', qtyOut: String(lr.qty), balance: String(U.num(stock[lr.itemId], 0)),
          cost: String(lr.cost), refType: 'SALESMAN_SALE', refId: saleId,
          userId: s.userId, notes: 'Consignment sale by salesman · ' + invoiceNo
        });
      }
    });

    // ---- customer ledger ----
    // Pura invoice debit hota hai; payment alag se credit hoti hai → closing = due.
    if (payload.customerId) {
      Parties.postLedger('CUSTOMER', payload.customerId, {
        date: sale.date, refType: 'SALE', refId: saleId,
        description: 'Invoice ' + invoiceNo, debit: total, credit: 0, locationId: locId
      }, s);
    }

    // ---- payments ----
    payments.forEach(function (pm) {
      /* Loyalty points se payment → customer ke points debit karo (redeem already posts customer ledger — skip duplicate Payments ledger) */
      if (U.str(pm.method).toUpperCase() === 'LOYALTY' && U.num(pm.amount) > 0) {
        try {
          var usedPts = U.num(pm.points) || Loyalty.cashToPoints(pm.amount);
          Loyalty.redeem({ customerId: payload.customerId, points: usedPts,
            refId: saleId, refType: 'SALE', locationId: locId,
            note: 'POS redemption on ' + invoiceNo }, s);
        } catch (e) {
          throw new Error('Loyalty redeem fail: ' + e.message);
        }
        return; // LOYALTY ledger already via Loyalty.redeem — don't create duplicate Payments receipt
      }
      if (U.num(pm.amount) > 0) {
        var payRec = Payments.create({
          date: sale.date, type: 'SALE_RECEIPT',
          partyType: payload.customerId ? 'CUSTOMER' : '', partyId: payload.customerId || '',
          partyName: payload.customerName || 'Walk-in', amount: U.num(pm.amount), method: pm.method || 'CASH',
          reference: pm.reference || invoiceNo, locationId: locId, sessionId: payload.sessionId || '',
          notes: 'Auto from ' + invoiceNo,
          /* v2.2: method-specific fields (wallet/cheque/bank/raast/card) */
          bankName: pm.bankName || '', accountNo: pm.accountNo || '',
          chequeNo: pm.chequeNo || '', chequeDate: pm.chequeDate || '',
          walletNumber: pm.walletNumber || '', txnId: pm.txnId || '',
          raastId: pm.raastId || '', cardLast4: pm.cardLast4 || '',
          approvalCode: pm.approvalCode || '',
          /* v2.5: wallet gateway — kaun se number se aaya, kis number par aaya */
          payerMobile: pm.payerMobile || '', receiverMobile: pm.receiverMobile || ''
        }, s, true);
        /* wallet request ↔ sale/payment link (gateway record poori tarah traceable) */
        if (pm.walletId && typeof Wallet !== 'undefined') {
          try {
            Wallet.link({ id: pm.walletId, saleId: saleId,
              paymentId: (payRec && payRec.id) || '', txnId: pm.txnId || '' }, s);
          } catch (e) { /* linking fail hone par sale kabhi block nahi hoti */ }
        }
      }
    });

    // ---- commissions ----
    Commissions.accrue(sale, lineRows, s);

    // ---- loyalty points (Loyalty engine: settings-driven) ----
    var earned = 0;
    try { earned = Loyalty.earn(sale, s); } catch (e) { earned = 0; }

    /* v2.6 §12 — consignment: salesman ki sale us ke zimme se ghate */
    try { Salesman.consume(sale, lineRows, s); } catch (e) { Logger.log('salesman consume: ' + e.message); }

    /* v2.5: accounting auto-post (sale → cash/bank + receivable, cr sales) */
    Accounting.auto('SALE', { sale: sale, byMethod: Payments._saleMethodsFor
      ? Payments._saleMethodsFor(sale) : Accounting._saleMethods(sale) }, s);

    /* Customer Demand → auto-fulfill if this sale satisfies a waiting demand */
    try { if (typeof CustomerDemands !== 'undefined' && CustomerDemands.onSale) CustomerDemands.onSale(sale, lineRows, s); } catch (e) { Logger.log('demand onSale error: ' + e.message); }

    /* v2.6 §15 — sale audit trail (amount + lines count, ref doc ke sath) */
    Audit.log('SALE_CREATE', 'Sales', saleId, null,
      { invoiceNo: sale.invoiceNo, total: U.num(sale.total), paid: U.num(sale.paid),
        due: U.num(sale.due), customerId: sale.customerId, lines: lineRows.length,
        method: sale.paymentMethod, locationId: sale.locationId },
      s);

    var out = Sales.get(saleId, s);
    out.pointsEarned = earned;
    return out;
  },

  applyCoupon: function (code, subtotal) {
    var c = DB.findOne('Discounts', function (r) { return U.norm(r.code) === U.norm(code) && U.str(r.active) !== 'false'; });
    if (!c) throw new Error('Coupon invalid ya expired: ' + code);
    if (U.num(c.usageLimit) && U.num(c.used) >= U.num(c.usageLimit)) throw new Error('Coupon limit khatam.');
    if (U.num(c.minAmount) && subtotal < U.num(c.minAmount)) throw new Error('Coupon ke liye min amount ' + c.minAmount + ' chahiye.');
    var val = c.type === 'PCT' ? subtotal * U.num(c.value) / 100 : U.num(c.value);
    if (U.num(c.maxDiscount)) val = Math.min(val, U.num(c.maxDiscount));
    DB.update('Discounts', c.id, { used: String(U.num(c.used) + 1) });
    return U.round(val, 2);
  },

  /* ================================= READ ================================== */
  list: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('Sales').reverse();
    if (!Auth.can(s, 'sales.view.all')) rows = rows.filter(function (r) { return r.cashierId === s.userId || r.salespersonId === s.userId; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (p.customerId) rows = rows.filter(function (r) { return r.customerId === p.customerId; });
    if (p.status) rows = rows.filter(function (r) { return r.status === p.status; });
    if (p.q) rows = rows.filter(function (r) {
      return U.matchAll(r.invoiceNo + ' ' + r.customerName + ' ' + r.paymentMethod, p.q);
    });
    if (p.from) {
      var from = U.startOfDay(p.from);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= from; });
    }
    if (p.to) {
      var to = U.startOfDay(p.to); to.setDate(to.getDate() + 1);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d < to; });
    }
    var total = rows.length;
    var page = U.num(p.page, 1), size = U.num(p.pageSize, 50);
    var slice = rows.slice((page - 1) * size, page * size);
    return {
      rows: slice.map(function (r) { return Sales._brief(r); }),
      total: total, page: page, pages: Math.ceil(total / size) || 1,
      totals: {
        total: U.round(U.sum(slice, 'total'), 2), paid: U.round(U.sum(slice, 'paid'), 2),
        due: U.round(U.sum(slice, 'due'), 2), discount: U.round(U.sum(slice, 'discount'), 2)
      }
    };
  },

  _brief: function (r) {
    return { id: r.id, invoiceNo: r.invoiceNo, date: r.date, locationId: r.locationId,
      customerId: r.customerId, customerName: r.customerName, subtotal: U.num(r.subtotal),
      discount: U.num(r.discount), tax: U.num(r.tax), total: U.num(r.total), paid: U.num(r.paid),
      due: U.num(r.due), change: U.num(r.change), paymentMethod: r.paymentMethod, status: r.status,
      salespersonId: r.salespersonId, cashierId: r.cashierId, notes: r.notes, source: r.source };
  },

  get: function (id, s) {
    Auth.require(s, 'sales.view');
    var sale = DB.byId('Sales', id);
    if (!sale) throw new Error('Sale not found');
    var items = DB.all('SaleItems').filter(function (r) { return r.saleId === id; })
      .map(function (r) {
        return { id: r.id, itemId: r.itemId, code: r.code, name: r.name, qty: U.num(r.qty),
          price: U.num(r.price), cost: U.num(r.cost), discount: U.num(r.discount),
          tax: U.num(r.tax), lineTotal: U.num(r.lineTotal), salespersonId: r.salespersonId, serial: r.serial };
      });
    var payments = [];
    try { payments = JSON.parse(sale.payments || '[]'); } catch (e) { }
    var out = Sales._brief(sale);
    out.items = items; out.paymentList = payments;
    /* v2.2: previous balance + payment breakdown (receipt ke liye) */
    try {
      out.prevBalance = sale.customerId ? Parties.balanceBefore('CUSTOMER', sale.customerId, sale.id) : 0;
      out.closingBalance = Math.max(0, U.round(U.num(out.prevBalance) + U.num(sale.total) - U.num(sale.paid), 2));
      out.creditLimit = U.num((DB.byId('CustomerTypes', sale.customerType) ||
        DB.byId('Customers', sale.customerId) || {}).creditLimit, 0);
    } catch (e) { out.prevBalance = 0; out.closingBalance = U.num(sale.due); out.creditLimit = 0; }
    out.paymentSummary = (payments || []).map(function (pm) {
      var c = {};
      try { c = PayMethods.compute(pm.amount, pm.method, s, sale.date); } catch (e) { c = {}; }
      return { method: pm.method, amount: U.num(pm.amount), reference: pm.reference || '',
        fee: U.num(c.fee), fed: U.num(c.fed), net: U.num(c.net, U.num(pm.amount)),
        settleDate: c.settleDate || '', label: c.label || pm.method };
    });
    out.cogs = U.round(U.sum(items, function (i) { return i.cost * i.qty; }), 2);
    out.taxInclusive = sale.taxInclusive === 'true';
    out.profit = U.round(U.sum(items, function (i) { return (i.price - i.cost) * i.qty - i.discount; }), 2);
    return out;
  },

  /* =============================== RETURNS ================================= */
  returnSale: function (payload, s) {
    Auth.require(s, 'pos.return');
    var sale = DB.byId('Sales', payload.saleId);
    if (!sale) throw new Error('Original sale not found.');
    var items = payload.items || [];
    if (!items.length) throw new Error('Return items select karein.');

    var limit = U.num(s.saleReturnLimit, 0);
    var retTotal = U.round(U.sum(items, function (i) { return U.num(i.qty) * U.num(i.price); }), 2);
    if (limit && retTotal > limit && !Auth.can(s, '*')) {
      throw new Error('Return limit ' + limit + ' se zyada nahi ho sakti.');
    }

    var locId = payload.locationId || sale.locationId;
    var ret = DB.insert('SaleReturns', {
      id: U.uid('RTN'), returnNo: DB.nextNumber('RETURN', locId), date: payload.date || U.iso(),
      saleId: sale.id, invoiceNo: sale.invoiceNo, locationId: locId,
      customerId: sale.customerId, total: retTotal, reason: payload.reason || '',
      refundMethod: payload.refundMethod || 'CASH', createdBy: s.userId, createdAt: U.iso()
    }, s);

    items.forEach(function (line) {
      var qty = U.num(line.qty);
      var price = U.num(line.price);
      DB.insert('SaleReturnItems', { id: U.uid('SRI'), returnId: ret.id, itemId: line.itemId,
        code: line.code || '', name: line.name || '', qty: qty, price: price,
        lineTotal: U.round(qty * price, 2), restock: payload.restock === false ? 'false' : 'true' });
      if (payload.restock !== false) {
        var it = DB.byId('Items', line.itemId) || {};
        /*
         * Return ko usi cost par wapas lena chahiye jis par becha gaya tha
         * (original issue cost), warna average cost distort ho jati hai.
         * Fallback: current avg cost → item master ka last purchase price nahi.
         */
        var origLine = DB.all('SaleItems').filter(function (r) {
          return r.saleId === sale.id && r.itemId === line.itemId;
        })[0];
        var stockRow = DB.all('Stock').filter(function (r) {
          return r.itemId === line.itemId && r.locationId === locId;
        })[0] || {};
        var restoreCost = U.num((origLine || {}).cost, U.num(stockRow.avgCost, U.num(it.costPrice)));
        Inventory.post(line.itemId, locId, qty, restoreCost, 'SALE_RETURN', ret.id, s, ret.returnNo);
      }
    });

    // customer ledger credit / refund
    if (retTotal > 0) {
      if (sale.customerId && payload.refundMethod === 'CREDIT') {
        Parties.postLedger('CUSTOMER', sale.customerId, {
          date: ret.date, refType: 'SALE_RETURN', refId: ret.id,
          description: 'Return ' + ret.returnNo + ' (inv ' + sale.invoiceNo + ')', debit: 0, credit: retTotal, locationId: locId
        }, s);
      } else {
        Payments.create({
          date: ret.date, type: 'REFUND_OUT', partyType: sale.customerId ? 'CUSTOMER' : '',
          partyId: sale.customerId || '', partyName: sale.customerName, amount: retTotal,
          method: payload.refundMethod || 'CASH', reference: ret.returnNo, locationId: locId,
          notes: 'Refund against ' + sale.invoiceNo
        }, s, true);
      }
    }

    // reverse commission
    Commissions.reverseForReturn(ret, s);
    /* v2.6 §15 — sale return audit (refund method + amount + ref invoice) */
    Audit.log('SALE_RETURN', 'SaleReturns', ret.id, null,
      { returnNo: ret.returnNo, total: U.num(ret.total), saleId: sale.id,
        invoiceNo: sale.invoiceNo, refundMethod: payload.refundMethod || 'CASH',
        lines: (payload.items || []).length, locationId: locId }, s);
    return ret;
  },

  listReturns: function (p, s) {
    Auth.require(s, 'sales.view');
    var rows = DB.all('SaleReturns').reverse();
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (p.from) {
      var from = U.startOfDay(p.from);
      rows = rows.filter(function (r) { var d = U.parseDate(r.date); return d && d >= from; });
    }
    return rows.slice(0, U.num(p.limit, 100));
  },

  /* ============================== HOLD BILLS =============================== */
  hold: function (p, s) {
    Auth.require(s, 'pos.hold');
    return DB.insert('HoldBills', {
      id: U.uid('HLD'), ref: p.ref || ('HOLD-' + Date.now().toString().slice(-6)),
      locationId: p.locationId || s.locationId, cartJson: JSON.stringify(p.cart || {}),
      customerId: p.customerId || '', note: p.note || '', createdBy: s.userId, createdAt: U.iso()
    }, s);
  },

  listHeld: function (s) {
    return DB.all('HoldBills').filter(function (r) { return r.locationId === s.locationId; })
      .map(function (r) {
        var cart = {}; try { cart = JSON.parse(r.cartJson); } catch (e) { }
        return { id: r.id, ref: r.ref, note: r.note, createdAt: r.createdAt,
          createdBy: r.createdBy, items: (cart.items || []).length,
          total: cart.total || 0, cart: cart };
      });
  },

  resumeHeld: function (id, s) {
    var h = DB.byId('HoldBills', id);
    if (!h) throw new Error('Held bill not found');
    var cart = {}; try { cart = JSON.parse(h.cartJson); } catch (e) { }
    DB.remove('HoldBills', id, s);
    return cart;
  },

  /* ================================= VOID ================================== */
  voidSale: function (id, reason, s) {
    Auth.require(s, 'sales.void');
    var sale = DB.byId('Sales', id);
    if (!sale) throw new Error('Sale not found');
    if (U.str(sale.status) === 'VOID') throw new Error('Already void.');
    var items = DB.all('SaleItems').filter(function (r) { return r.saleId === id; });
    items.forEach(function (i) {
      Inventory.post(i.itemId, sale.locationId, U.num(i.qty), U.num(i.cost), 'SALE_VOID', sale.id, s, 'Void ' + sale.invoiceNo);
    });
    if (U.num(sale.due) > 0 && sale.customerId) {
      Parties.postLedger('CUSTOMER', sale.customerId, {
        date: U.dateOnly(), refType: 'SALE_VOID', refId: sale.id,
        description: 'Void ' + sale.invoiceNo, debit: 0, credit: U.num(sale.due), locationId: sale.locationId
      }, s);
    }
    Commissions.reverseForSale(sale.id, s);
    /* v2.6 §15 — before/after dono (kaun, kab, kyun) */
    var updated = DB.update('Sales', id,
      { status: 'VOID', notes: (sale.notes || '') + ' | VOID: ' + (reason || '') }, s);
    Audit.log('SALE_VOID', 'Sales', id,
      { status: U.str(sale.status), total: U.num(sale.total), due: U.num(sale.due) },
      { status: 'VOID', total: U.num(sale.total), reason: reason || '' }, s);
    return updated;
  }
};
