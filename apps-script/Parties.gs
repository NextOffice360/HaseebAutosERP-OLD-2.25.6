/**
 * HASEEB AUTOS - ERP / POS  ::  PARTIES (Customers / Suppliers / Ledger)
 */

var Parties = {

  /* ============================== CUSTOMERS ================================ */
  /* v2.9 §11 — list ke liye lifetime totals (ek pass, N+1 nahi).
   * withTotals=true par customers: totalSales/invoiceCount/collected;
   * suppliers: totalPurchases/grnCount/paid. */
  _totalsByParty: function (sheetName, partyField, sumMap, filter) {
    var agg = {};
    var rows;
    try { rows = DB.all(sheetName); } catch (e) { return agg; }
    rows.forEach(function (r) {
      if (filter && !filter(r)) return;
      var id = U.str(r[partyField]); if (!id) return;
      var a = agg[id] || (agg[id] = { count: 0 });
      a.count++;
      Object.keys(sumMap).forEach(function (k) { a[k] = U.num(a[k]) + U.num(r[sumMap[k]]); });
    });
    return agg;
  },

  listCustomers: function (p, s) {
    Auth.require(s, 'customers.view');
    p = p || {};
    var rows = DB.all('Customers');
    if (p.q) {
      rows = rows.filter(function (r) {
        return U.matchAll(r.name + ' ' + r.phone + ' ' + r.code + ' ' + r.cnic + ' ' + (r.membershipId || ''), p.q);
      });
    }
    if (p.customerTypeId) rows = rows.filter(function (r) { return r.customerTypeId === p.customerTypeId; });
    if (p.withBalance) {
      rows = rows.map(function (r) {
        var o = U.clone(r);
        o.balance = U.round(Parties.balance('CUSTOMER', r.id), 2);
        o.openingBalance = U.num(r.openingBalance);
        return o;
      });
      if (p.onlyDue) rows = rows.filter(function (r) { return r.balance > 0.5; });
      rows = U.sortBy(rows, 'balance', 'desc');
    }
    /* v2.9 §11 — lifetime totals (sirf parties screen mangti hai; POS fast rahe) */
    if (p.withTotals) {
      var tot = Parties._totalsByParty('Sales', 'customerId', { totalSales: 'total', collected: 'paid' });
      rows = rows.map(function (r) {
        var o = U.clone(r);
        var t = tot[o.id] || { count: 0, totalSales: 0, collected: 0 };
        o.invoiceCount = t.count || 0;
        o.totalSales = U.round(U.num(t.totalSales), 2);
        o.collected = U.round(U.num(t.collected), 2);
        return o;
      });
    }
    if (U.str(p.active) === 'true') rows = rows.filter(function (r) { return U.str(r.active) !== 'false'; });
    rows = U.sortBy(rows, p.sort || 'name', p.dir || 'asc');
    return { rows: rows.slice(0, U.num(p.limit, 500)), total: rows.length };
  },

  saveCustomer: function (payload, s) {
    Auth.require(s, 'customers.edit');
    /* v2.30.0 (N1/N2) — partial update safe: naam sirf tab lazmi jab naya record
       ho ya user ne naam khud khali kiya ho; partial save par naya code bhi
       generate nahi hota (pehle hota tha → customer ka code badal jata tha). */
    var existing = payload.id ? DB.byId('Customers', payload.id) : null;
    if (payload.id && !existing) throw new Error('Customer not found');
    var effName = payload.name !== undefined ? payload.name : (existing ? existing.name : '');
    if (!U.str(effName)) throw new Error('Customer name zaroori hai.');
    if (payload.phone) {
      var dup = DB.findOne('Customers', function (r) {
        return U.str(r.phone) === U.str(payload.phone) && r.id !== payload.id;
      });
      if (dup) throw new Error('Ye number already hai: ' + dup.name);
    }
    var rec = U.pick(payload, SCHEMA.Customers);
    if (rec.id) {
      if (rec.code === undefined) delete rec.code;      /* purana code waisa hi rahe */
      return DB.update('Customers', rec.id, rec, s);
    }
    if (!rec.code) rec.code = Parties.nextCode('CUSTOMER');
    rec.active = rec.active === false ? 'false' : 'true';
    return DB.insert('Customers', rec, s);
  },

  /* ============================== SUPPLIERS ================================ */
  listSuppliers: function (p, s) {
    Auth.require(s, 'suppliers.view');
    p = p || {};
    var rows = DB.all('Suppliers');
    if (p.q) rows = rows.filter(function (r) { return U.matchAll(r.name + ' ' + r.phone + ' ' + r.code, p.q); });
    if (p.withBalance) {
      rows = rows.map(function (r) {
        var o = U.clone(r);
        o.balance = U.round(Parties.balance('SUPPLIER', r.id), 2);
        return o;
      });
      if (p.onlyDue) rows = rows.filter(function (r) { return Math.abs(r.balance) > 0.5; });
    }
    if (p.withTotals) {
      var pur = Parties._totalsByParty('GRN', 'supplierId', { totalPurchases: 'total' });
      var pay = Parties._totalsByParty('Payments', 'partyId', { paidOut: 'amount' },
        function (r) { return U.str(r.partyType) === 'SUPPLIER'; });
      rows = rows.map(function (r) {
        var o = U.clone(r);
        o.grnCount = (pur[o.id] && pur[o.id].count) || 0;
        o.totalPurchases = U.round(U.num(pur[o.id] && pur[o.id].totalPurchases), 2);
        o.paidOut = U.round(U.num(pay[o.id] && pay[o.id].paidOut), 2);
        return o;
      });
    }
    return { rows: U.sortBy(rows, 'name', 'asc'), total: rows.length };
  },

  saveSupplier: function (payload, s) {
    Auth.require(s, 'suppliers.edit');
    /* v2.30.0 (N1/N2) — partial update safe (dekhein saveCustomer ka note) */
    var existing = payload.id ? DB.byId('Suppliers', payload.id) : null;
    if (payload.id && !existing) throw new Error('Supplier not found');
    var effName = payload.name !== undefined ? payload.name : (existing ? existing.name : '');
    if (!U.str(effName)) throw new Error('Supplier name zaroori hai.');
    var rec = U.pick(payload, SCHEMA.Suppliers);
    if (rec.id) {
      if (rec.code === undefined) delete rec.code;
      return DB.update('Suppliers', rec.id, rec, s);
    }
    if (!rec.code) rec.code = Parties.nextCode('SUPPLIER');
    return DB.insert('Suppliers', rec, s);
  },

  saveCustomerType: function (payload, s) {
    Auth.require(s, 'customers.edit');
    if (payload.id) return DB.update('CustomerTypes', payload.id,
      U.pick(payload, ['name', 'discountPct', 'creditLimit', 'priceTier', 'active']), s);
    return DB.insert('CustomerTypes', U.pick(payload, ['name', 'discountPct', 'creditLimit', 'priceTier', 'active']), s);
  },

  nextCode: function (type) {
    var prefix = type === 'CUSTOMER' ? 'CUS' : 'SUP';
    var rows = type === 'CUSTOMER' ? DB.all('Customers') : DB.all('Suppliers');
    var max = 0;
    rows.forEach(function (r) {
      var m = /(\d+)$/.exec(U.str(r.code));
      if (m) max = Math.max(max, U.num(m[1]));
    });
    return prefix + '-' + U.pad(max + 1, 4);
  },

  /* =============================== LEDGER ================================== */
  /** Running balance: opening + debits - credits */
  balance: function (partyType, partyId) {
    var rows = DB.all('Ledger').filter(function (r) {
      return r.partyType === partyType && r.partyId === partyId;
    });
    var opening = 0;
    if (partyType === 'CUSTOMER') opening = U.num((DB.byId('Customers', partyId) || {}).openingBalance);
    else opening = U.num((DB.byId('Suppliers', partyId) || {}).openingBalance);
    var bal = opening;
    if (partyType === 'SUPPLIER') {
      rows.forEach(function (r) { bal += U.num(r.credit) - U.num(r.debit); });
    } else {
      rows.forEach(function (r) { bal += U.num(r.debit) - U.num(r.credit); });
    }
    return U.round(bal, 2);
  },

  /**
   * Balance **before** a given reference — invoice/receipt par "previous balance"
   * dikhane ke liye. excludeRefId ke rows (aur uske payments) chhor deta hai.
   */
  balanceBefore: function (partyType, partyId, excludeRefId) {
    var skip={}; if(Array.isArray(excludeRefId)) excludeRefId.forEach(function(x){ if(x) skip[x]=1; }); else if(excludeRefId) skip[excludeRefId]=1;
    var rows = DB.all('Ledger').filter(function (r) {
      if (r.partyType !== partyType || r.partyId !== partyId) return false;
      return !skip[r.refId];
    });
    var opening = 0;
    if (partyType === 'CUSTOMER') opening = U.num((DB.byId('Customers', partyId) || {}).openingBalance);
    else opening = U.num((DB.byId('Suppliers', partyId) || {}).openingBalance);
    var bal = opening;
    if (partyType === 'SUPPLIER') {
      rows.forEach(function (r) { bal += U.num(r.credit) - U.num(r.debit); });
    } else {
      rows.forEach(function (r) { bal += U.num(r.debit) - U.num(r.credit); });
    }
    return U.round(bal, 2);
  },

  /**
   * SUPPLIER payable — POSITIVE = humein supplier ko dena hai.
   * Ledger convention customer-style hai (debit - credit), is liye supplier ke
   * liye alag helper: payable = opening + credit(purchase) - debit(payment).
   * excludeRefId dein to wo reference (masalan GRN) balance se bahar rehta hai —
   * "previous balance" dikhane ke liye.
   */
  /**
   * PARTY SUMMARY — opening + billed − paid = current balance.
   * Customer/supplier screen, POS aur invoice par "previous balance" isi se aata hai.
   * SUPPLIER convention: payable = opening + credit(purchase) − debit(payment).
   */
  summary: function (partyType, partyId) {
    partyType = U.str(partyType || 'CUSTOMER').toUpperCase();
    var row = (partyType === 'CUSTOMER' ? DB.byId('Customers', partyId) : DB.byId('Suppliers', partyId)) || {};
    var rows = DB.all('Ledger').filter(function (r) {
      return r.partyType === partyType && r.partyId === partyId;
    });
    var opening = U.num(row.openingBalance);
    var debit = 0, credit = 0;
    rows.forEach(function (r) { debit += U.num(r.debit); credit += U.num(r.credit); });
    var balance = partyType === 'CUSTOMER'
      ? opening + debit - credit
      : opening + credit - debit;
    return {
      id: partyId, type: partyType, name: U.str(row.name),
      code: U.str(row.code), phone: U.str(row.phone),
      opening: U.round(opening, 2),
      billed: U.round(partyType === 'CUSTOMER' ? debit : credit, 2),
      paid: U.round(partyType === 'CUSTOMER' ? credit : debit, 2),
      balance: U.round(balance, 2),
      outstanding: Math.abs(U.round(balance, 2)),
      creditLimit: U.num(row.creditLimit),
      entries: rows.length
    };
  },

  supplierPayable: function (supplierId, excludeRefId) {
    /* excludeRefId: ek id ya ids ka array (GRN + uske payments dono nikal sakte hain) */
    var skip = {};
    if (Array.isArray(excludeRefId)) excludeRefId.forEach(function (x) { if (x) skip[x] = 1; });
    else if (excludeRefId) skip[excludeRefId] = 1;
    var rows = DB.all('Ledger').filter(function (r) {
      if (r.partyType !== 'SUPPLIER' || r.partyId !== supplierId) return false;
      return !skip[r.refId];
    });
    var bal = U.num((DB.byId('Suppliers', supplierId) || {}).openingBalance);
    rows.forEach(function (r) { bal += U.num(r.credit) - U.num(r.debit); });
    return U.round(bal, 2);
  },

  postLedger: function (partyType, partyId, entry, s) {
    if (!partyId) return null;
    var bal = Parties.balance(partyType, partyId) + U.num(entry.debit) - U.num(entry.credit);
    return DB.insert('Ledger', {
      id: U.uid('LED'), date: entry.date || U.dateOnly(), partyType: partyType, partyId: partyId,
      refType: entry.refType || '', refId: entry.refId || '', description: entry.description || '',
      debit: U.num(entry.debit), credit: U.num(entry.credit), balance: U.round(bal, 2),
      locationId: entry.locationId || (s && s.locationId) || '', createdAt: U.iso()
    }, s);
  },

  /** Full statement with running balance */
  ledger: function (partyType, id, s) {
    var rows = DB.all('Ledger').filter(function (r) {
      return r.partyType === partyType && r.partyId === id;
    });
    rows.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var opening = 0;
    if (partyType === 'CUSTOMER') opening = U.num((DB.byId('Customers', id) || {}).openingBalance);
    else opening = U.num((DB.byId('Suppliers', id) || {}).openingBalance);
    /*
     * BUG CAUGHT BY E2E TEST — SIGN CONVENTION:
     * CUSTOMER ke liye debit (sale) positive hota hai → receivable.
     * SUPPLIER ke liye credit (purchase) positive hota hai → payable.
     * Lekin yahan hamesha `debit - credit` ho raha tha, to supplier ka
     * ledger closing −13500 dikhata tha jabke `Parties.balance()` usi waqt
     * +13500 (payable) kehta tha — do jagah do alag jawaab.
     * Ab partyType ke mutabiq sign, aur `Parties.balance()` se milta hai.
     */
    var sign = (partyType === 'SUPPLIER') ? -1 : 1;
    var bal = opening, out = [];
    rows.forEach(function (r) {
      bal += sign * (U.num(r.debit) - U.num(r.credit));
      out.push({ id: r.id, date: r.date, refType: r.refType, refId: r.refId,
        description: r.description, debit: U.num(r.debit), credit: U.num(r.credit),
        balance: U.round(bal, 2), locationId: r.locationId });
    });
    var party = partyType === 'CUSTOMER' ? DB.byId('Customers', id) : DB.byId('Suppliers', id);
    return {
      party: party ? U.pick(party, ['id', 'code', 'name', 'phone', 'address', 'email', 'openingBalance', 'creditLimit', 'customerTypeId', 'paymentTerms']) : null,
      opening: U.round(opening, 2), rows: out.reverse(), closing: U.round(bal, 2)
    };
  },

  /** Saare parties ki balance summary (receivables/payables) */
  balances: function (partyType) {
    var rows = partyType === 'CUSTOMER' ? DB.all('Customers') : DB.all('Suppliers');
    var led = DB.all('Ledger').filter(function (r) { return r.partyType === partyType; });
    var map = {};
    led.forEach(function (r) {
      var delta = partyType === 'SUPPLIER' ? (U.num(r.credit) - U.num(r.debit)) : (U.num(r.debit) - U.num(r.credit));
      map[r.partyId] = (map[r.partyId] || 0) + delta;
    });
    return rows.map(function (p) {
      var bal = U.round(U.num(p.openingBalance) + (map[p.id] || 0), 2);
      return { id: p.id, code: p.code, name: p.name, phone: p.phone, balance: bal,
        creditLimit: U.num(p.creditLimit), customerTypeId: p.customerTypeId || '' };
    }).filter(function (p) { return Math.abs(p.balance) > 0.005; });
  },

  /* ==================== CREDIT & RATING HELPERS (v2.14 POS audit) =================== */
  /** Customer credit snapshot: limit, outstanding, available, status, rating */
  customerCreditInfo: function (customerId) {
    var c = DB.byId('Customers', customerId) || {};
    var limit = U.num(c.creditLimit || (DB.byId('CustomerTypes', c.customerTypeId) || {}).creditLimit || 0);
    var outstanding = Parties.balance('CUSTOMER', customerId);
    var available = limit ? Math.max(0, U.round(limit - outstanding, 2)) : Infinity;
    var status = outstanding <= 0 ? 'CLEAR' : (limit && outstanding > limit ? 'OVER_LIMIT' : (outstanding > limit * 0.8 ? 'NEAR_LIMIT' : 'DUE'));
    // rating based on payment history: collected vs billed
    var sales = DB.all('Sales').filter(function(s){ return s.customerId === customerId; });
    var billed = U.sum(sales, 'total'), paid = U.sum(sales, 'paid');
    var payRatio = billed ? (paid / billed) : 1;
    var overdue = sales.filter(function(s){ return U.num(s.due) > 0.5; }).length;
    var rating = 5;
    if (overdue > 5 || payRatio < 0.5) rating = 1;
    else if (overdue > 2 || payRatio < 0.8) rating = 2;
    else if (overdue > 0 || payRatio < 0.95) rating = 3;
    else if (payRatio < 1) rating = 4;
    return { customerId: customerId, name: U.str(c.name), creditLimit: U.round(limit,2), outstanding: U.round(outstanding,2), available: available===Infinity? null : U.round(available,2), used: U.round(outstanding,2), status: status, rating: rating, payRatio: U.round(payRatio,2), overdueCount: overdue, invoiceCount: sales.length };
  },
  /** Supplier credit snapshot: limit, outstanding payable, available */
  supplierCreditInfo: function (supplierId) {
    var s = DB.byId('Suppliers', supplierId) || {};
    var limit = U.num(s.creditLimit || 0);
    var outstanding = Parties.balance('SUPPLIER', supplierId);
    var available = limit ? Math.max(0, U.round(limit - outstanding, 2)) : null;
    var status = outstanding <= 0 ? 'CLEAR' : (limit && outstanding > limit ? 'OVER_LIMIT' : (outstanding > limit * 0.8 ? 'NEAR_LIMIT' : 'PAYABLE'));
    var grns = DB.all('GRN').filter(function(g){ return g.supplierId === supplierId; });
    var purchased = U.sum(grns, 'total');
    return { supplierId: supplierId, name: U.str(s.name), creditLimit: U.round(limit,2), outstanding: U.round(outstanding,2), available: available, used: U.round(outstanding,2), status: status, totalPurchases: U.round(purchased,2), grnCount: grns.length };
  },
  /** Customer purchase & return history for POS info card */
  customerHistory: function (customerId, limit) {
    limit = U.num(limit, 5);
    var sales = DB.all('Sales').filter(function(s){ return s.customerId === customerId; }).sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); }).slice(0, limit);
    var returns = DB.all('SaleReturns').filter(function(r){ return r.customerId === customerId; }).sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); }).slice(0, limit);
    var ledger = Parties.ledger('CUSTOMER', customerId);
    return {
      recentSales: sales.map(function(s){ return { id:s.id, invoiceNo:s.invoiceNo, date:s.date, total:U.num(s.total), paid:U.num(s.paid), due:U.num(s.due), status:s.status }; }),
      recentReturns: returns.map(function(r){ return { id:r.id, returnNo:r.returnNo, date:r.date, total:U.num(r.total), reason:r.reason }; }),
      ledgerSummary: { opening: ledger.opening, closing: ledger.closing, entries: ledger.rows.length },
      credit: Parties.customerCreditInfo(customerId)
    };
  },
};
