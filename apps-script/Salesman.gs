/**
 * HASEEB AUTOS — v2.9.2 :: SALESMAN STOCK & SETTLEMENT — EXTENDED
 * =============================================================================
 * WHOLESALE MODEL — CONSIGNMENT:
 *
 *   issue     → branch stock se nikla, salesman ke zimme aaya   (SalesmanStock +)
 *   sale      → bik gaya, ab customer ka                        (SalesmanStock −)
 *   return    → bacha hua wapas branch mein                     (SalesmanStock −, Stock+)
 *   settlement→ hisaab: kya diya, kya bika, kya bacha, kitne paise
 *
 * v2.9.2 EXTENSIONS (9-point overhaul):
 *  1) Issue captures: purpose/reason, tour/route, area, customer allocation,
 *     reference & supply purpose — tour/area/customer/salesman-wise filter.
 *  2) Return links to original issue with remaining guard + auto traceability.
 *  3) Performance metrics: issued/sold/returned/remaining, customer/tour/area
 *     activity, sales, returns, collection + rating.
 *  4) Udhar Wasooli: detailed payment (prev/balanceAfter/method/bank/account/
 *     txn/date/collector/notes/related invoices) + ledger history.
 *  5) Ledger/History unified view: issues→sales→returns→payments traceable.
 * =============================================================================
 */

var Salesman = {

  _d: function (v) { return U.str(v).slice(0, 10); },

  PURPOSES: ['TOUR_SUPPLY','AREA_SUPPLY','CUSTOMER_ORDER','SAMPLE','REPLENISHMENT','OTHER'],

  /* ==========================================================================
     STOCK BALANCE
     ========================================================================== */

  stock: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('SalesmanStock');
    if (p.salesmanId) rows = rows.filter(function (r) { return r.salesmanId === p.salesmanId; });
    if (p.locationId) rows = rows.filter(function (r) { return r.locationId === p.locationId; });
    if (!p.all) rows = rows.filter(function (r) { return U.num(r.qty) !== 0; });
    if (p.q) {
      var q = U.norm(p.q);
      rows = rows.filter(function (r) {
        var it = DB.byId('Items', r.itemId);
        return U.norm(it ? (it.name + ' ' + it.code) : r.itemId).indexOf(q) >= 0;
      });
    }
    var out = rows.map(function (r) {
      var it = DB.byId('Items', r.itemId) || {};
      var qty = U.num(r.qty), cost = U.num(r.avgCost);
      return {
        id: r.id, salesmanId: r.salesmanId, itemId: r.itemId, locationId: r.locationId,
        code: it.code || '', name: it.name || '', unit: it.unit || '',
        qty: qty, avgCost: cost, value: U.round(qty * cost, 2),
        retailValue: U.round(qty * U.num(it.retailPrice), 2),
        updatedAt: r.updatedAt
      };
    });
    out.sort(function (a, b) { return b.value - a.value; });
    return {
      rows: out,
      summary: {
        items: out.length,
        qty: U.round(U.sum(out, 'qty'), 2),
        value: U.round(U.sum(out, 'value'), 2),
        retailValue: U.round(U.sum(out, 'retailValue'), 2)
      }
    };
  },

  stockValue: function (salesmanId, locationId) {
    var rows = DB.all('SalesmanStock').filter(function (r) {
      return r.salesmanId === salesmanId && (!locationId || r.locationId === locationId);
    });
    return U.round(U.sum(rows, function (r) { return U.num(r.qty) * U.num(r.avgCost); }), 2);
  },

  _stockRow: function (salesmanId, itemId, locationId, cost) {
    var row = DB.findOne('SalesmanStock', function (r) {
      return r.salesmanId === salesmanId && r.itemId === itemId &&
        (!locationId || r.locationId === locationId);
    });
    if (row) return row;
    return DB.insert('SalesmanStock', {
      id: U.uid('SST'), salesmanId: salesmanId, itemId: itemId, locationId: locationId || '',
      qty: '0', avgCost: String(U.num(cost)), updatedAt: U.iso()
    });
  },

  /* ==========================================================================
     ISSUE — company → salesman (extended fields)
     ========================================================================== */

  issue: function (payload, s) {
    Auth.require(s, 'stock.transfer');
    var items = payload.items || [];
    if (!items.length) throw new Error('Kam az kam ek item chahiye.');
    if (!payload.salesmanId) throw new Error('Salesman select karein.');
    var locId = payload.locationId || s.locationId;
    var purpose = U.str(payload.purpose || payload.supplyPurpose || 'TOUR_SUPPLY').toUpperCase();
    if (Salesman.PURPOSES.indexOf(purpose) === -1) purpose = 'OTHER';
    var reason = U.str(payload.reason || '').slice(0, 500);
    var routeId = U.str(payload.routeId || payload.tourId || '');
    var area = U.str(payload.area || payload.territory || '').slice(0, 80);
    var customerId = U.str(payload.customerId || '');
    var customerName = U.str(payload.customerName || '');
    if (customerId && !customerName) {
      try { var cc = DB.byId('Customers', customerId); if (cc) customerName = cc.name || ''; } catch(e){}
    }
    var reference = U.str(payload.reference || payload.refNo || '').slice(0, 60);
    var routeName = '';
    if (routeId) { try { var rr = DB.byId('SalesmanRoutes', routeId); if (rr) routeName = rr.name || ''; } catch(e){} }

    var rec = DB.insert('SalesmanIssues', {
      id: U.uid('SIS'), issueNo: DB.nextNumber('SIS', locId),
      date: payload.date || U.dateOnly(), salesmanId: payload.salesmanId, locationId: locId,
      status: 'POSTED', total: 0, notes: payload.notes || '',
      createdBy: s.userId, createdAt: U.iso(),
      purpose: purpose, reason: reason, routeId: routeId, area: area,
      customerId: customerId, customerName: customerName, reference: reference
    }, s);

    var total = 0;
    var lines = [];
    items.forEach(function (line) {
      var it = DB.byId('Items', line.itemId) || {};
      var qty = U.num(line.qty);
      if (qty <= 0) return;
      var cost = U.num(line.cost, U.num(it.costPrice));
      /* branch stock se nikalo */
      Inventory.post(line.itemId, locId, -qty, cost, 'SALESMAN_ISSUE', rec.id, s,
        'Issued to salesman ' + rec.issueNo + (reference ? ' ref:'+reference : ''));
      /* salesman stock */
      var row = Salesman._stockRow(payload.salesmanId, line.itemId, locId, cost);
      var oldQty = U.num(row.qty), oldAvg = U.num(row.avgCost);
      var newQty = oldQty + qty;
      var newAvg = newQty <= 0 ? cost : ((oldQty * oldAvg) + (qty * cost)) / newQty;
      DB.update('SalesmanStock', row.id, {
        qty: String(U.round(newQty, 3)), avgCost: String(U.round(newAvg, 2)), updatedAt: U.iso()
      });
      var lt = U.round(qty * cost, 2);
      total += lt;
      var lcCustomerId = U.str(line.customerId || customerId);
      var lcCustomerName = U.str(line.customerName || customerName);
      var lcRouteId = U.str(line.routeId || routeId);
      var lcArea = U.str(line.area || area);
      var lcPurpose = U.str(line.purpose || purpose);
      var lcRef = U.str(line.reference || reference);
      var li = DB.insert('SalesmanIssueItems', {
        id: U.uid('SII'), issueId: rec.id, itemId: line.itemId,
        code: it.code || line.code || '', name: it.name || line.name || '',
        qty: String(qty), cost: String(cost), lineTotal: String(lt),
        customerId: lcCustomerId, customerName: lcCustomerName,
        routeId: lcRouteId, area: lcArea, purpose: lcPurpose, reference: lcRef
      });
      lines.push(li);
    });

    DB.update('SalesmanIssues', rec.id, { total: String(U.round(total, 2)) }, s);

    Audit.log('SALESMAN_ISSUE', 'SalesmanIssues', rec.id, null,
      { issueNo: rec.issueNo, salesmanId: payload.salesmanId, locationId: locId,
        purpose: purpose, routeId: routeId, area: area, customerId: customerId, reference: reference,
        lines: lines.length, total: U.round(total, 2) }, s);
    Salesman._autoDoc('SALESMAN_ISSUE', rec, s);

    return Salesman.getIssue(rec.id, s);
  },

  getIssue: function (id, s) {
    Auth.require(s, 'sales.view');
    var r = DB.byId('SalesmanIssues', id);
    if (!r) throw new Error('Issue nahi mila');
    var routeName = '';
    if (r.routeId) { try { var rr=DB.byId('SalesmanRoutes', r.routeId); if(rr) routeName=rr.name||''; } catch(e){} }
    return {
      id: r.id, issueNo: r.issueNo, date: r.date, salesmanId: r.salesmanId,
      salesman: Salesman._name(r.salesmanId), locationId: r.locationId,
      status: r.status, total: U.num(r.total), notes: r.notes || '',
      purpose: r.purpose||'', reason: r.reason||'', routeId: r.routeId||'', routeName: routeName,
      area: r.area||'', customerId: r.customerId||'', customerName: r.customerName||'', reference: r.reference||'',
      items: DB.all('SalesmanIssueItems').filter(function (x) { return x.issueId === id; })
        .map(function (x) {
          return { itemId: x.itemId, code: x.code, name: x.name, qty: U.num(x.qty),
            cost: U.num(x.cost), lineTotal: U.num(x.lineTotal),
            customerId: x.customerId||'', customerName: x.customerName||'',
            routeId: x.routeId||'', area: x.area||'', purpose: x.purpose||'', reference: x.reference||'' };
        })
    };
  },

  listIssues: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('SalesmanIssues').filter(function (r) {
      if (p.salesmanId && r.salesmanId !== p.salesmanId) return false;
      if (p.locationId && r.locationId !== p.locationId) return false;
      if (p.routeId && U.str(r.routeId) !== U.str(p.routeId)) return false;
      if (p.area && U.str(r.area).toLowerCase().indexOf(U.str(p.area).toLowerCase())<0) return false;
      if (p.customerId && U.str(r.customerId) !== U.str(p.customerId)) return false;
      if (p.purpose && U.str(r.purpose) !== U.str(p.purpose)) return false;
      if (p.from && Salesman._d(r.date) < Salesman._d(p.from)) return false;
      if (p.to && Salesman._d(r.date) > Salesman._d(p.to)) return false;
      if (p.q) {
        var q = U.norm(p.q);
        var hay = U.norm((r.issueNo||'')+' '+(r.reference||'')+' '+(r.customerName||'')+' '+(r.area||'')+' '+(r.notes||''));
        if (hay.indexOf(q)<0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)) || U.str(b.issueNo).localeCompare(U.str(a.issueNo)); });
    return rows.slice(0, U.num(p.limit, 200)).map(function (r) {
      var routeName=''; if(r.routeId){ try{var rr=DB.byId('SalesmanRoutes',r.routeId); if(rr) routeName=rr.name||'';}catch(e){}}
      return {
        id: r.id, issueNo: r.issueNo, date: r.date, salesmanId: r.salesmanId,
        salesman: Salesman._name(r.salesmanId), locationId: r.locationId,
        status: r.status, total: U.num(r.total),
        purpose: r.purpose||'', reason: r.reason||'', routeId: r.routeId||'', routeName: routeName, area: r.area||'',
        customerId: r.customerId||'', customerName: r.customerName||'', reference: r.reference||'',
        lines: DB.all('SalesmanIssueItems').filter(function (x) { return x.issueId === r.id; }).length
      };
    });
  },

  /* ==========================================================================
     ISSUE TRACE — issued → sold → returned → remaining per issue
     ========================================================================== */
  issueTrace: function (p, s) {
    Auth.require(s, 'sales.view');
    var issueId = p.issueId || p.id;
    if (!issueId) throw new Error('issueId chahiye');
    var issue = DB.byId('SalesmanIssues', issueId);
    if (!issue) throw new Error('Issue nahi mila');
    var locId = issue.locationId;
    var salesmanId = issue.salesmanId;
    var items = DB.all('SalesmanIssueItems').filter(function (x){return x.issueId===issueId;});
    // pre-aggregate returns for this issue
    var returnsForIssue = DB.all('SalesmanReturnItems').filter(function (x){return U.str(x.issueId)===U.str(issueId);});
    var returnByItem = {}; returnsForIssue.forEach(function(r){ var k=r.itemId; returnByItem[k]=(returnByItem[k]||0)+U.num(r.qty); });
    // global sold distribution: approximate proportional to issue qty; better: use salesman stock held vs issued-returned
    // For exact remaining per issue item: issued - returnedForIssue - (soldAllocated). Since sold not linked to issue, we allocate sold proportionally or show held as proxy.
    // Compute held per item for salesman
    var heldByItem = {};
    DB.all('SalesmanStock').forEach(function(ss){ if(ss.salesmanId===salesmanId && (!locId||ss.locationId===locId)) heldByItem[ss.itemId]=U.num(ss.qty); });
    // total issued per item across all issues for this salesman (for allocation)
    var totalIssuedByItem = {}; DB.all('SalesmanIssueItems').forEach(function(li){
      var iss = DB.byId('SalesmanIssues', li.issueId);
      if(!iss || iss.salesmanId!==salesmanId || (locId && iss.locationId!==locId)) return;
      totalIssuedByItem[li.itemId]=(totalIssuedByItem[li.itemId]||0)+U.num(li.qty);
    });
    var totalReturnedByItem = {}; DB.all('SalesmanReturnItems').forEach(function(li){
      var ret = DB.byId('SalesmanReturns', li.returnId);
      if(!ret || ret.salesmanId!==salesmanId || (locId && ret.locationId!==locId)) return;
      totalReturnedByItem[li.itemId]=(totalReturnedByItem[li.itemId]||0)+U.num(li.qty);
    });
    // total sold via consume is not directly trackable; estimate = totalIssued - totalReturned - held
    var detail = items.map(function(it){
      var issued = U.num(it.qty);
      var returned = returnByItem[it.itemId]||0;
      // clamp returned to issued
      if(returned>issued) returned=issued;
      var totalIssued = totalIssuedByItem[it.itemId]||issued;
      var totalReturned = totalReturnedByItem[it.itemId]||0;
      var held = heldByItem[it.itemId]||0;
      var totalSoldEst = Math.max(0, totalIssued - totalReturned - held);
      var soldForThisIssue = totalIssued>0 ? Math.round((issued/totalIssued)*totalSoldEst*1000)/1000 : 0;
      var remaining = Math.max(0, U.round(issued - returned - soldForThisIssue,3));
      return {
        itemId: it.itemId, code: it.code, name: it.name,
        issued: issued, sold: soldForThisIssue, returned: returned, remaining: remaining,
        cost: U.num(it.cost), issuedValue: U.round(issued*U.num(it.cost),2),
        returnedValue: U.round(returned*U.num(it.cost),2), remainingValue: U.round(remaining*U.num(it.cost),2),
        customerId: it.customerId||'', customerName: it.customerName||'',
        routeId: it.routeId||'', area: it.area||'', purpose: it.purpose||''
      };
    });
    var sumIssued = U.sum(detail,function(d){return d.issued;});
    var sumSold = U.sum(detail,function(d){return d.sold;});
    var sumRet = U.sum(detail,function(d){return d.returned;});
    var sumRem = U.sum(detail,function(d){return d.remaining;});
    return {
      issue: { id: issue.id, issueNo: issue.issueNo, date: issue.date, salesmanId: salesmanId, salesman: Salesman._name(salesmanId), purpose: issue.purpose||'', area: issue.area||'', routeId: issue.routeId||'', customerName: issue.customerName||'', reference: issue.reference||'', total: U.num(issue.total) },
      items: detail,
      totals: { issued: sumIssued, sold: U.round(sumSold,3), returned: sumRet, remaining: U.round(sumRem,3), issuedValue: U.round(U.sum(detail,function(d){return d.issuedValue;}),2), soldValue: U.round(U.sum(detail,function(d){return d.sold*d.cost;}),2), returnedValue: U.round(U.sum(detail,function(d){return d.returnedValue;}),2), remainingValue: U.round(U.sum(detail,function(d){return d.remainingValue;}),2) }
    };
  },

  /* quick list issues for return picker — shows remaining */
  issuesForReturn: function(p,s){
    Auth.require(s,'sales.view');
    p=p||{}; var sid=p.salesmanId; if(!sid) throw new Error('salesmanId chahiye');
    var locId=p.locationId||'';
    var issues=DB.all('SalesmanIssues').filter(function(r){ return r.salesmanId===sid && (!locId || r.locationId===locId); });
    issues.sort(function(a,b){return U.str(b.date).localeCompare(U.str(a.date));});
    var out=issues.slice(0, U.num(p.limit,100)).map(function(r){
      var trace=Salesman.issueTrace({issueId:r.id},s);
      return {
        id:r.id, issueNo:r.issueNo, date:r.date, reference:r.reference||'', area:r.area||'', purpose:r.purpose||'',
        customerName:r.customerName||'', total:U.num(r.total),
        remainingValue: trace.totals.remainingValue, remainingQty: trace.totals.remaining,
        hasRemaining: trace.totals.remaining>0.001
      };
    });
    if(p.onlyWithRemaining) out=out.filter(function(o){return o.hasRemaining;});
    return out;
  },

  /* ==========================================================================
     RETURN — salesman → company (linked to original issue)
     ========================================================================== */

  returnStock: function (payload, s) {
    Auth.require(s, 'stock.transfer');
    var items = payload.items || [];
    if (!items.length) throw new Error('Kam az kam ek item chahiye.');
    if (!payload.salesmanId) throw new Error('Salesman select karein.');
    var locId = payload.locationId || s.locationId;
    var issueId = U.str(payload.issueId || payload.linkedIssueId || '');
    var issueNo = '';
    if(issueId){ try{var iss=DB.byId('SalesmanIssues',issueId); if(iss) issueNo=iss.issueNo||'';}catch(e){} }
    // if no explicit issueId but legacy call, try infer from payload
    var rec = DB.insert('SalesmanReturns', {
      id: U.uid('SRT'), returnNo: DB.nextNumber('SRT', locId),
      date: payload.date || U.dateOnly(), salesmanId: payload.salesmanId, locationId: locId,
      status: 'POSTED', total: 0, notes: payload.notes || '',
      createdBy: s.userId, createdAt: U.iso(),
      issueId: issueId, issueNo: issueNo, reason: U.str(payload.reason||'').slice(0,500)
    }, s);

    var total = 0, lines = 0;
    // Build remaining guard per item if issue linked
    var remainingByItem = {};
    if(issueId){
      try{
        var trace=Salesman.issueTrace({issueId:issueId},s);
        trace.items.forEach(function(it){ remainingByItem[it.itemId]=it.remaining; });
      }catch(e){}
    }
    items.forEach(function (line) {
      var it = DB.byId('Items', line.itemId) || {};
      var qty = U.num(line.qty);
      if (qty <= 0) return;
      // clamp by remaining of that issue if linked
      if(issueId && remainingByItem[line.itemId]!==undefined){
        var rem = remainingByItem[line.itemId]||0;
        if(qty > rem) qty = rem;
      }
      if (qty <= 0) return;
      var row = DB.findOne('SalesmanStock', function (r) {
        return r.salesmanId === payload.salesmanId && r.itemId === line.itemId &&
          (!locId || r.locationId === locId);
      });
      var held = row ? U.num(row.qty) : 0;
      if (qty > held) qty = held;
      if (qty <= 0) return;
      var cost = U.num(line.cost || (row?row.avgCost: U.num(it.costPrice)));
      if (!cost) cost = U.num(it.costPrice);
      DB.update('SalesmanStock', row.id, {
        qty: String(U.round(held - qty, 3)), updatedAt: U.iso()
      });
      Inventory.post(line.itemId, locId, qty, cost, 'SALESMAN_RETURN', rec.id, s,
        'Returned by salesman ' + rec.returnNo + (issueNo?' (issue '+issueNo+')':''));

      var lt = U.round(qty * cost, 2);
      total += lt; lines++;
      var issueItemId = U.str(line.issueItemId||'');
      DB.insert('SalesmanReturnItems', {
        id: U.uid('SRI'), returnId: rec.id, itemId: line.itemId,
        code: it.code || line.code || '', name: it.name || line.name || '',
        qty: String(qty), cost: String(cost), lineTotal: String(lt),
        issueId: issueId, issueItemId: issueItemId
      });
      // decrement remaining guard for next lines of same item in same payload (prevent over clamp within same return)
      if(issueId && remainingByItem[line.itemId]!==undefined){
        remainingByItem[line.itemId] = Math.max(0, remainingByItem[line.itemId]-qty);
      }
    });

    DB.update('SalesmanReturns', rec.id, { total: String(U.round(total, 2)) }, s);

    Audit.log('SALESMAN_RETURN', 'SalesmanReturns', rec.id, null,
      { returnNo: rec.returnNo, salesmanId: payload.salesmanId, locationId: locId,
        issueId: issueId, issueNo: issueNo, lines: lines, total: U.round(total, 2) }, s);
    Salesman._autoDoc('SALESMAN_RETURN', rec, s);

    return { id: rec.id, returnNo: rec.returnNo, issueId: issueId, issueNo: issueNo, total: U.round(total, 2), lines: lines };
  },

  listReturns: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('SalesmanReturns').filter(function (r) {
      if (p.salesmanId && r.salesmanId !== p.salesmanId) return false;
      if (p.locationId && r.locationId !== p.locationId) return false;
      if (p.issueId && U.str(r.issueId) !== U.str(p.issueId)) return false;
      if (p.from && Salesman._d(r.date) < Salesman._d(p.from)) return false;
      if (p.to && Salesman._d(r.date) > Salesman._d(p.to)) return false;
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    return rows.slice(0, U.num(p.limit, 200)).map(function (r) {
      return {
        id: r.id, returnNo: r.returnNo, date: r.date, salesmanId: r.salesmanId,
        salesman: Salesman._name(r.salesmanId), locationId: r.locationId,
        status: r.status, total: U.num(r.total), issueId: r.issueId||'', issueNo: r.issueNo||'', reason: r.reason||''
      };
    });
  },

  getReturn: function(id,s){
    Auth.require(s,'sales.view');
    var r=DB.byId('SalesmanReturns',id); if(!r) throw new Error('Return nahi mila');
    return {
      id:r.id, returnNo:r.returnNo, date:r.date, salesmanId:r.salesmanId, salesman:Salesman._name(r.salesmanId),
      locationId:r.locationId, status:r.status, total:U.num(r.total), notes:r.notes||'', issueId:r.issueId||'', issueNo:r.issueNo||'', reason:r.reason||'',
      items: DB.all('SalesmanReturnItems').filter(function(x){return x.returnId===id;}).map(function(x){return {itemId:x.itemId, code:x.code, name:x.name, qty:U.num(x.qty), cost:U.num(x.cost), lineTotal:U.num(x.lineTotal), issueId:x.issueId||'', issueItemId:x.issueItemId||''};})
    };
  },

  /* ==========================================================================
     SALE → SALESMAN STOCK GHATAYE (Sales.create se call hota hai)
     ========================================================================== */

  consume: function (sale, lineRows, s) {
    try {
      if (!sale || U.str(sale.source) !== 'SALESMAN' || !sale.salespersonId) return;
      var locId = sale.locationId || (s && s.locationId) || '';
      (lineRows || []).forEach(function (li) {
        var row = DB.findOne('SalesmanStock', function (r) {
          return r.salesmanId === sale.salespersonId && r.itemId === li.itemId &&
            (!locId || r.locationId === locId);
        });
        if (!row) return;
        var qty = U.num(li.qty);
        if (qty <= 0) return;
        DB.update('SalesmanStock', row.id, {
          qty: String(U.round(U.num(row.qty) - qty, 3)), updatedAt: U.iso()
        });
      });
    } catch (e) {
      Logger.log('Salesman.consume: ' + e.message);
    }
  },

  /* ==========================================================================
     SETTLEMENT — poora hisaab
     ========================================================================== */

  settle: function (payload, s) {
    Auth.require(s, 'sales.view');
    if (!payload.salesmanId) throw new Error('Salesman select karein.');
    var locId = payload.locationId || s.locationId;
    var from = U.str(payload.from) || '';
    var to = Salesman._d(payload.to) || U.dateOnly();

    var last = Salesman._lastSettlement(payload.salesmanId, locId);
    var since = Salesman._d(from) || (last ? Salesman._d(last.date) : '');

    var issuedQty = 0, issuedValue = 0;
    DB.all('SalesmanIssues').forEach(function (r) {
      if (r.salesmanId !== payload.salesmanId) return;
      if (locId && r.locationId !== locId) return;
      if (since && Salesman._d(r.date) <= since) return;
      if (to && Salesman._d(r.date) > to) return;
      DB.all('SalesmanIssueItems').forEach(function (li) {
        if (li.issueId !== r.id) return;
        issuedQty += U.num(li.qty);
        issuedValue += U.num(li.lineTotal);
      });
    });

    var returnedQty = 0, returnedValue = 0;
    DB.all('SalesmanReturns').forEach(function (r) {
      if (r.salesmanId !== payload.salesmanId) return;
      if (locId && r.locationId !== locId) return;
      if (since && Salesman._d(r.date) <= since) return;
      if (to && Salesman._d(r.date) > to) return;
      DB.all('SalesmanReturnItems').forEach(function (li) {
        if (li.returnId !== r.id) return;
        returnedQty += U.num(li.qty);
        returnedValue += U.num(li.lineTotal);
      });
    });

    var soldValue = 0, cashCollected = 0, soldQty = 0;
    DB.all('Sales').forEach(function (x) {
      if (U.str(x.status) === 'VOID') return;
      if (U.str(x.source) !== 'SALESMAN') return;
      if (x.salespersonId !== payload.salesmanId) return;
      if (locId && x.locationId !== locId) return;
      if (since && Salesman._d(x.date) <= since) return;
      if (to && Salesman._d(x.date) > to) return;
      cashCollected += U.num(x.paid);
      DB.all('SaleItems').forEach(function (li) {
        if (li.saleId !== x.id) return;
        soldQty += U.num(li.qty);
        soldValue += U.num(li.qty) * U.num(li.cost);
      });
    });

    var openingValue = last ? U.num(last.countedValue) : 0;
    var expectedValue = U.round(openingValue + issuedValue - soldValue - returnedValue, 2);

    var countedValue = 0;
    var lines = [];
    (payload.items || []).forEach(function (c) {
      var it = DB.byId('Items', c.itemId) || {};
      var cost = U.num(c.cost, U.num(it.costPrice));
      var counted = U.num(c.countedQty);
      countedValue += counted * cost;
      lines.push({
        id: U.uid('SSI'), itemId: c.itemId, code: it.code || '', name: it.name || '',
        expectedQty: c.expectedQty !== undefined ? c.expectedQty : '',
        countedQty: counted, cost: cost
      });
    });
    if (!lines.length) {
      countedValue = Salesman.stockValue(payload.salesmanId, locId);
    }
    countedValue = U.round(countedValue, 2);
    var varianceValue = U.round(countedValue - expectedValue, 2);

    var cashDeposited = U.num(payload.cashDeposited);
    var dueFromSalesman = U.round(cashCollected - cashDeposited, 2);

    var rec = DB.insert('SalesmanSettlements', {
      id: U.uid('SST'), settleNo: DB.nextNumber('SST', locId),
      date: to, salesmanId: payload.salesmanId, locationId: locId,
      openingValue: String(openingValue), issuedValue: String(U.round(issuedValue, 2)),
      soldValue: String(U.round(soldValue, 2)), returnedValue: String(U.round(returnedValue, 2)),
      expectedValue: String(expectedValue), countedValue: String(countedValue),
      varianceValue: String(varianceValue),
      cashCollected: String(U.round(cashCollected, 2)),
      cashDeposited: String(cashDeposited),
      dueFromSalesman: String(dueFromSalesman),
      status: 'POSTED', notes: payload.notes || '',
      createdBy: s.userId, createdAt: U.iso()
    }, s);

    lines.forEach(function (l) {
      l.settlementId = rec.id;
      l.varianceQty = U.round(U.num(l.countedQty) - U.num(l.expectedQty), 3);
      l.varianceValue = U.round(l.varianceQty * l.cost, 2);
      DB.insert('SalesmanSettlementItems', {
        id: l.id, settlementId: rec.id, itemId: l.itemId, code: l.code, name: l.name,
        expectedQty: String(l.expectedQty), countedQty: String(l.countedQty),
        varianceQty: String(l.varianceQty), cost: String(l.cost),
        varianceValue: String(l.varianceValue)
      });
    });

    Audit.log('SALESMAN_SETTLE', 'SalesmanSettlements', rec.id,
      last ? { settleNo: last.settleNo, date: last.date, countedValue: U.num(last.countedValue) } : null,
      { settleNo: rec.settleNo, salesmanId: payload.salesmanId, locationId: locId,
        issuedValue: U.round(issuedValue, 2), soldValue: U.round(soldValue, 2),
        returnedValue: U.round(returnedValue, 2), expectedValue: expectedValue,
        countedValue: countedValue, varianceValue: varianceValue,
        cashCollected: U.round(cashCollected, 2), dueFromSalesman: dueFromSalesman }, s);
    Salesman._autoDoc('SALESMAN_SETTLE', rec, s);

    return Salesman.getSettlement(rec.id, s);
  },

  _lastSettlement: function (salesmanId, locationId) {
    var rows = DB.all('SalesmanSettlements').filter(function (r) {
      return r.salesmanId === salesmanId && (!locationId || r.locationId === locationId);
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    return rows[0];
  },

  getSettlement: function (id, s) {
    Auth.require(s, 'sales.view');
    var r = DB.byId('SalesmanSettlements', id);
    if (!r) throw new Error('Settlement nahi mila');
    return {
      id: r.id, settleNo: r.settleNo, date: r.date, salesmanId: r.salesmanId,
      salesman: Salesman._name(r.salesmanId), locationId: r.locationId,
      openingValue: U.num(r.openingValue), issuedValue: U.num(r.issuedValue),
      soldValue: U.num(r.soldValue), returnedValue: U.num(r.returnedValue),
      expectedValue: U.num(r.expectedValue), countedValue: U.num(r.countedValue),
      varianceValue: U.num(r.varianceValue),
      cashCollected: U.num(r.cashCollected), cashDeposited: U.num(r.cashDeposited),
      dueFromSalesman: U.num(r.dueFromSalesman),
      status: r.status, notes: r.notes || '',
      items: DB.all('SalesmanSettlementItems').filter(function (x) { return x.settlementId === id; })
        .map(function (x) {
          return { itemId: x.itemId, code: x.code, name: x.name,
            expectedQty: U.num(x.expectedQty), countedQty: U.num(x.countedQty),
            varianceQty: U.num(x.varianceQty), cost: U.num(x.cost),
            varianceValue: U.num(x.varianceValue) };
        })
    };
  },

  listSettlements: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('SalesmanSettlements').filter(function (r) {
      if (p.salesmanId && r.salesmanId !== p.salesmanId) return false;
      if (p.locationId && r.locationId !== p.locationId) return false;
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    return rows.slice(0, U.num(p.limit, 200)).map(function (r) {
      return {
        id: r.id, settleNo: r.settleNo, date: r.date, salesmanId: r.salesmanId,
        salesman: Salesman._name(r.salesmanId), locationId: r.locationId,
        issuedValue: U.num(r.issuedValue), soldValue: U.num(r.soldValue),
        returnedValue: U.num(r.returnedValue), expectedValue: U.num(r.expectedValue),
        countedValue: U.num(r.countedValue), varianceValue: U.num(r.varianceValue),
        cashCollected: U.num(r.cashCollected), dueFromSalesman: U.num(r.dueFromSalesman),
        status: r.status
      };
    });
  },

  /* ==========================================================================
     VISITS
     ========================================================================== */

  logVisit: function (payload, s) {
    Auth.require(s, 'sales.view');
    var rec = DB.insert('SalesmanVisits', {
      id: U.uid('SVS'), date: payload.date || U.dateOnly(),
      salesmanId: payload.salesmanId || s.userId,
      customerId: payload.customerId || '', customerName: payload.customerName || '',
      purpose: payload.purpose || 'SALES', outcome: payload.outcome || 'VISITED',
      orderValue: String(U.num(payload.orderValue)), collected: String(U.num(payload.collected)),
      notes: payload.notes || '', locationId: payload.locationId || s.locationId,
      createdAt: U.iso()
    }, s);
    Audit.log('SALESMAN_VISIT', 'SalesmanVisits', rec.id, null,
      { date: rec.date, salesmanId: rec.salesmanId, customerId: rec.customerId,
        orderValue: U.num(rec.orderValue), collected: U.num(rec.collected) }, s);
    return rec;
  },

  saveRoute: function (payload, s) {
    Auth.require(s, 'sales.view');
    var name = U.str(payload.name).slice(0, 80);
    if (!name) throw new Error('Route ka naam likhein.');
    if (!payload.salesmanId) throw new Error('Salesman select karein.');
    var ids = payload.customerIds || [];
    if (typeof ids === 'string') { try { ids = JSON.parse(ids || '[]'); } catch (e) { ids = []; } }
    var days = payload.days || [];
    if (typeof days === 'string') { try { days = JSON.parse(days || '[]'); } catch (e) { days = []; } }
    var existing = payload.id ? DB.findOne('SalesmanRoutes', function (r) { return r.id === payload.id; }) : null;
    var rec = {
      id: payload.id || U.uid('SRT'),
      routeNo: existing && existing.routeNo ? existing.routeNo : DB.nextNumber('SMROUTE', payload.locationId || s.locationId),
      name: name, salesmanId: payload.salesmanId,
      locationId: payload.locationId || s.locationId,
      customerIds: JSON.stringify(ids), days: JSON.stringify(days),
      targetValue: String(U.num(payload.targetValue)),
      active: payload.active === false || payload.active === 'false' ? 'false' : 'true',
      notes: U.str(payload.notes).slice(0, 500),
      createdBy: existing ? existing.createdBy || (s && s.userId) : (s ? s.userId : ''),
      createdAt: existing ? existing.createdAt || U.iso() : U.iso(),
      updatedAt: U.iso()
    };
    if (existing) DB.update('SalesmanRoutes', rec.id, rec, s); else DB.insert('SalesmanRoutes', rec, s);
    Audit.log(existing ? 'SALESMAN_ROUTE_UPDATE' : 'SALESMAN_ROUTE_CREATE', 'SalesmanRoutes',
      rec.id, existing, { name: rec.name, salesmanId: rec.salesmanId, customers: ids.length }, s);
    return Salesman._routeBrief(rec);
  },

  listRoutes: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('SalesmanRoutes').filter(function (r) {
      if (p.salesmanId && r.salesmanId !== p.salesmanId) return false;
      if (p.locationId && r.locationId && r.locationId !== p.locationId) return false;
      if (p.activeOnly && U.str(r.active) === 'false') return false;
      return true;
    });
    return rows.map(Salesman._routeBrief);
  },

  deleteRoute: function (p, s) {
    Auth.require(s, 'sales.view');
    var r = DB.findOne('SalesmanRoutes', function (x) { return x.id === p.id; });
    if (!r) throw new Error('Route nahi mila.');
    DB.update('SalesmanRoutes', r.id, { active: 'false', updatedAt: U.iso() }, s);
    Audit.log('SALESMAN_ROUTE_DISABLE', 'SalesmanRoutes', r.id, { active: r.active }, { active: 'false' }, s);
    return { ok: true, id: r.id };
  },

  _routeBrief: function (r) {
    var ids = [], days = [];
    try { ids = JSON.parse(r.customerIds || '[]'); } catch (e) { }
    try { days = JSON.parse(r.days || '[]'); } catch (e) { }
    return {
      id: r.id, routeNo: r.routeNo, name: r.name, salesmanId: r.salesmanId,
      salesman: Salesman._name(r.salesmanId), locationId: r.locationId,
      customerIds: ids, customers: ids.length, days: days,
      targetValue: U.num(r.targetValue), active: U.str(r.active) !== 'false',
      notes: r.notes || '', updatedAt: r.updatedAt || ''
    };
  },

  listVisits: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('SalesmanVisits').filter(function (r) {
      if (p.salesmanId && r.salesmanId !== p.salesmanId) return false;
      if (p.customerId && r.customerId !== p.customerId) return false;
      if (p.from && U.str(r.date) < U.str(p.from)) return false;
      if (p.to && U.str(r.date) > U.str(p.to)) return false;
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    return rows.slice(0, U.num(p.limit, 500)).map(function (r) {
      return {
        id: r.id, date: r.date, salesmanId: r.salesmanId, salesman: Salesman._name(r.salesmanId),
        customerId: r.customerId, customerName: r.customerName, purpose: r.purpose,
        outcome: r.outcome, orderValue: U.num(r.orderValue), collected: U.num(r.collected),
        notes: r.notes || ''
      };
    });
  },

  /* ==========================================================================
     PERFORMANCE METRICS — issued/sold/returned/remaining + breakdown + rating
     ========================================================================== */

  performance: function(p,s){
    Auth.require(s,'sales.view');
    p=p||{}; var salesmanId=p.salesmanId; if(!salesmanId) throw new Error('salesmanId chahiye');
    var locId=p.locationId||''; var from = p.from ? Salesman._d(p.from) : ''; var to = p.to ? Salesman._d(p.to) : '';
    // helpers to filter by date range
    function inRange(d){ var dd=Salesman._d(d); if(from && dd < from) return false; if(to && dd > to) return false; return true; }

    // ---- ISSUED
    var issuedByItem={}, issuedValByItem={}, issuedByCustomer={}, issuedByRoute={}, issuedByArea={}, issuedQty=0, issuedVal=0;
    DB.all('SalesmanIssues').forEach(function(r){
      if(r.salesmanId!==salesmanId || (locId && r.locationId!==locId) || !inRange(r.date)) return;
      var custKey = r.customerId||'_UNASSIGNED'; var routeKey=r.routeId||'_NO_ROUTE'; var areaKey=r.area||'_NO_AREA';
      DB.all('SalesmanIssueItems').forEach(function(li){
        if(li.issueId!==r.id) return;
        var qty=U.num(li.qty), val=U.num(li.lineTotal);
        issuedQty+=qty; issuedVal+=val;
        issuedByItem[li.itemId]=(issuedByItem[li.itemId]||0)+qty;
        issuedValByItem[li.itemId]=(issuedValByItem[li.itemId]||0)+val;
        var ck = li.customerId || r.customerId || '_UNASSIGNED';
        issuedByCustomer[ck]=(issuedByCustomer[ck]||0)+val;
        var rk = li.routeId || r.routeId || '_NO_ROUTE';
        issuedByRoute[rk]=(issuedByRoute[rk]||0)+val;
        var ak = li.area || r.area || '_NO_AREA';
        issuedByArea[ak]=(issuedByArea[ak]||0)+val;
      });
    });

    // ---- RETURNED
    var returnedByItem={}, returnedValByItem={}, returnedQty=0, returnedVal=0;
    DB.all('SalesmanReturns').forEach(function(r){
      if(r.salesmanId!==salesmanId || (locId && r.locationId!==locId) || !inRange(r.date)) return;
      DB.all('SalesmanReturnItems').forEach(function(li){
        if(li.returnId!==r.id) return;
        var qty=U.num(li.qty), val=U.num(li.lineTotal);
        returnedQty+=qty; returnedVal+=val;
        returnedByItem[li.itemId]=(returnedByItem[li.itemId]||0)+qty;
        returnedValByItem[li.itemId]=(returnedValByItem[li.itemId]||0)+val;
      });
    });

    // ---- SOLD (via Sales where source SALESMAN)
    var soldByItem={}, soldValByItem={}, soldInvoices=[], soldQty=0, soldVal=0, soldCash=0;
    DB.all('Sales').forEach(function(x){
      if(U.str(x.status)==='VOID' || U.str(x.source)!=='SALESMAN' || x.salespersonId!==salesmanId || (locId && x.locationId!==locId) || !inRange(x.date)) return;
      soldInvoices.push(x);
      soldCash+=U.num(x.paid);
      DB.all('SaleItems').forEach(function(li){
        if(li.saleId!==x.id) return;
        var qty=U.num(li.qty), val=U.num(li.lineTotal), costVal=U.num(li.qty)*U.num(li.cost);
        soldQty+=qty; soldVal+=costVal; // soldVal as COGS for consistency with issued/remaining (cost basis). Also track retail sold total separately.
        soldByItem[li.itemId]=(soldByItem[li.itemId]||0)+qty;
        soldValByItem[li.itemId]=(soldValByItem[li.itemId]||0)+costVal;
      });
    });

    // ---- CURRENT STOCK (remaining)
    var stockInfo = Salesman.stock({salesmanId:salesmanId, locationId: locId||undefined, all:false}, s);
    var remainingQty = stockInfo.summary.qty;
    var remainingVal = stockInfo.summary.value;

    // Alternative remaining derived from issued - returned - sold (should match stock)
    var derivedRemaining = Math.max(0, issuedQty - returnedQty - soldQty);

    // ---- CUSTOMER / ROUTE / AREA activity (merge issued+sold)
    function mapToArray(map, labelFn){
      var arr=[]; Object.keys(map).forEach(function(k){
        var label = labelFn(k);
        var iss = map[k]||0;
        // find sold/returned for same key? For customer/route/area, sold grouping requires joining Sale customer? For now show issued vs estimated sold split via salesman stock not per-customer.
        arr.push({ key:k, label:label, issuedValue: iss });
      });
      arr.sort(function(a,b){return b.issuedValue-a.issuedValue;});
      return arr.slice(0,20);
    }
    var byCustomer = mapToArray(issuedByCustomer, function(k){
      if(k==='_UNASSIGNED') return '(Unassigned)';
      try{ var c=DB.byId('Customers',k); if(c) return c.name; }catch(e){}
      // also check issue customerName cache
      var f=DB.all('SalesmanIssues').filter(function(rr){return rr.customerId===k;})[0];
      return (f && f.customerName) || k;
    });
    var byRoute = mapToArray(issuedByRoute, function(k){
      if(k==='_NO_ROUTE') return '(No Route)';
      try{ var rr=DB.byId('SalesmanRoutes',k); if(rr) return rr.name; }catch(e){}
      return k;
    });
    var byArea = mapToArray(issuedByArea, function(k){
      if(k==='_NO_AREA') return '(No Area)';
      return k;
    });

    // ---- COLLECTION PERFORMANCE
    var collected = 0, due = 0;
    // salesman cash collected via sales paid + direct payments where collector = salesman or createdBy
    soldInvoices.forEach(function(x){ collected+=U.num(x.paid); due+=U.num(x.due); });
    // also add Payments where partyType=CUSTOMER and collectorId = salesmanId (or createdBy) and within range
    var paymentRows = DB.all('Payments').filter(function(pr){
      // filter by collector or createdBy salesman; and date range
      var collMatch = (U.str(pr.collectorId)===salesmanId || U.str(pr.createdBy)===salesmanId);
      if(!collMatch) return false;
      if(pr.partyType && U.str(pr.partyType)!=='CUSTOMER') return false;
      if(!inRange(pr.date)) return false;
      if(locId && pr.locationId && pr.locationId!==locId) return false;
      return true;
    });
    paymentRows.forEach(function(pr){ collected += U.num(pr.amount); });
    var collectionRate = (issuedVal>0) ? U.round((collected / (issuedVal||1))*100,1) : 0;
    if(collectionRate>100) collectionRate=100;

    // ---- RETURNS PERFORMANCE
    var returnRate = issuedQty>0 ? U.round((returnedQty/issuedQty)*100,1) : 0;

    // ---- SALES PERFORMANCE (invoice count, avg, top items)
    var invCount = soldInvoices.length;
    var totalRetailSold = U.sum(soldInvoices,function(x){return U.num(x.total);});
    var avgInvoice = invCount ? U.round(totalRetailSold/invCount,2) : 0;

    // top items by sold qty
    var topItems = Object.keys(soldByItem).map(function(id){
      var it=DB.byId('Items',id)||{}; return {itemId:id, code:it.code||'', name:it.name||id, qty:soldByItem[id], value: soldValByItem[id]||0 };
    }).sort(function(a,b){return b.qty-a.qty;}).slice(0,8);

    // ---- RATING (composite 0-100)
    // issued→sold efficiency (sold/issued), low return rate good, collection good, remaining low good
    var sellEff = issuedQty>0 ? soldQty/issuedQty : 0;
    var retPenalty = Math.max(0, 1 - returnRate/50); // 0% return=1, 50%+ return ~0
    var collEff = Math.min(1, collected / Math.max(1, soldCash + due));
    var remainingPenalty = Math.max(0, 1 - remainingQty/Math.max(1, issuedQty));
    var rating = U.round((sellEff*0.4 + retPenalty*0.2 + collEff*0.3 + remainingPenalty*0.1)*5,1); // 0-5 scale
    if(rating>5) rating=5; if(rating<0) rating=0;
    var ratingPct = U.round((rating/5)*100,0);

    return {
      salesmanId: salesmanId, salesman: Salesman._name(salesmanId), locationId: locId, from: from, to: to,
      totals: {
        issuedQty: U.round(issuedQty,3), issuedValue: U.round(issuedVal,2),
        soldQty: U.round(soldQty,3), soldValue: U.round(soldVal,2), soldRetail: U.round(totalRetailSold,2),
        returnedQty: U.round(returnedQty,3), returnedValue: U.round(returnedVal,2),
        remainingQty: U.round(remainingQty,3), remainingValue: U.round(remainingVal,2),
        derivedRemainingQty: U.round(derivedRemaining,3),
        invoices: invCount, avgInvoice: avgInvoice
      },
      byCustomer: byCustomer,
      byRoute: byRoute,
      byArea: byArea,
      sales: { invoices: invCount, avgInvoice: avgInvoice, topItems: topItems, cashCollected: U.round(soldCash,2), due: U.round(due,2) },
      returns: { qty: U.round(returnedQty,3), value: U.round(returnedVal,2), rate: returnRate },
      collection: { collected: U.round(collected,2), due: U.round(due,2), rate: collectionRate, payments: paymentRows.length },
      rating: { score: rating, percent: ratingPct, label: rating>=4.5?'Excellent': rating>=3.5?'Good': rating>=2.5?'Average': rating>=1.5?'Below Avg':'Poor' }
    };
  },

  /* ==========================================================================
     LEDGER / HISTORY — unified timeline for salesman
     ========================================================================== */
  ledger: function(p,s){
    Auth.require(s,'sales.view');
    p=p||{}; var salesmanId=p.salesmanId||''; var locId=p.locationId||'';
    var from=p.from?Salesman._d(p.from):''; var to=p.to?Salesman._d(p.to):'';
    function inRange(d){ var dd=Salesman._d(d); if(from && dd<from) return false; if(to && dd>to) return false; return true; }
    var rows=[];
    DB.all('SalesmanIssues').forEach(function(r){
      if(salesmanId && r.salesmanId!==salesmanId) return; if(locId && r.locationId!==locId) return; if(!inRange(r.date)) return;
      rows.push({ ts: r.date+'T00:00:00', date: r.date, type:'ISSUE', refType:'SALESMAN_ISSUE', refId:r.id, refNo:r.issueNo||r.id.slice(-6), salesmanId:r.salesmanId, amount:U.num(r.total), note: (r.purpose||'')+' '+(r.reference||''), meta:r });
    });
    DB.all('Sales').forEach(function(x){
      if(U.str(x.status)==='VOID' || U.str(x.source)!=='SALESMAN') return;
      if(salesmanId && x.salespersonId!==salesmanId) return; if(locId && x.locationId!==locId) return; if(!inRange(x.date)) return;
      rows.push({ ts: x.date+'T00:00:00', date:x.date, type:'SALE', refType:'SALE', refId:x.id, refNo:x.invoiceNo||'', salesmanId:x.salespersonId, amount:U.num(x.total), paid:U.num(x.paid), due:U.num(x.due), note: x.customerName||'' });
    });
    DB.all('SalesmanReturns').forEach(function(r){
      if(salesmanId && r.salesmanId!==salesmanId) return; if(locId && r.locationId!==locId) return; if(!inRange(r.date)) return;
      rows.push({ ts: r.date+'T00:00:00', date:r.date, type:'RETURN', refType:'SALESMAN_RETURN', refId:r.id, refNo:r.returnNo||'', salesmanId:r.salesmanId, amount:-U.num(r.total), note: (r.reason||'')+(r.issueNo?' ← '+r.issueNo:''), meta:r });
    });
    DB.all('Payments').forEach(function(pr){
      // consider payments collected by/for salesman
      var isSalesmanPayment = (salesmanId && (U.str(pr.collectorId)===salesmanId || U.str(pr.createdBy)===salesmanId));
      // If salesmanId not given, include all? but ledger filtered by salesmanId, so only linked.
      if(salesmanId && !isSalesmanPayment) return;
      if(!salesmanId && pr.partyType!=='CUSTOMER') return;
      if(locId && pr.locationId && pr.locationId!==locId) return; if(!inRange(pr.date)) return;
      rows.push({ ts: pr.date, date: pr.date, type:'PAYMENT', refType:'PAYMENT', refId:pr.id, refNo:pr.voucherNo||'', salesmanId: U.str(pr.collectorId)||U.str(pr.createdBy)||'', amount:U.num(pr.amount), method: pr.method, note: pr.partyName||'' });
    });
    // visits
    DB.all('SalesmanVisits').forEach(function(v){
      if(salesmanId && v.salesmanId!==salesmanId) return; if(locId && v.locationId!==locId) return; if(!inRange(v.date)) return;
      rows.push({ ts: v.date+'T00:00:00', date:v.date, type:'VISIT', refType:'VISIT', refId:v.id, refNo:'', salesmanId:v.salesmanId, amount:U.num(v.orderValue), note: (v.customerName||'')+' '+(v.purpose||'') });
    });
    rows.sort(function(a,b){ return U.str(a.date).localeCompare(U.str(b.date)) || U.str(a.ts).localeCompare(U.str(b.ts)); });
    // Running balance? Issued increases due, sale? For salesman consignment: issued = stock +, return = stock -, sale = stock -. So ledger can show running stock value? Keep amount signed above.
    var bal=0; rows.forEach(function(r){ if(r.type==='ISSUE'){ bal+=r.amount; } else if(r.type==='RETURN'){ bal+=r.amount; /* amount negative */ } else if(r.type==='SALE'){ /* stock reduces by cost; approximate */ bal-= r.amount; } r.balance=U.round(bal,2); });
    var start=U.num(p.offset||0); var limit=Math.min(200, U.num(p.limit,100));
    return { rows: rows.slice(start, start+limit), total: rows.length, from: from, to: to };
  },

  /* ==========================================================================
     UDHAR WASOOLI — detailed payment record (prev/new balance, collector...)
     ========================================================================== */
  collectPayment: function(payload,s){
    Auth.require(s,'payments.create');
    if(!payload.customerId) throw new Error('Customer select karein.');
    var locId = payload.locationId || s.locationId;
    var customer = DB.byId('Customers', payload.customerId) || { name: payload.customerName||'' };
    var amount = U.num(payload.amount); if(amount<=0) throw new Error('Amount >0 chahiye.');
    var date = payload.date || U.dateOnly();
    var method = U.str(payload.method||'CASH').toUpperCase();
    var prevBalance = U.num(payload.prevBalance);
    // if prev not supplied, compute from ledger
    if(!prevBalance){
      try{
        var partiesInfo = Parties.customerCreditInfo ? Parties.customerCreditInfo(payload.customerId) : null;
        if(partiesInfo) prevBalance = U.num(partiesInfo.balance||partiesInfo.bal||0);
        else {
          // fallback: sum ledger debits - credits? use max 0? We'll trust 0.
        }
      }catch(e){}
      if(!prevBalance) prevBalance = U.num(payload.prevBalance||0);
    }
    var newBalance = U.round(Math.max(0, prevBalance - amount),2);
    // If payload provides newBalance, trust but ensure monotonic?
    if(payload.newBalance!==undefined && payload.newBalance!=='') newBalance = U.num(payload.newBalance);

    var collectorId = U.str(payload.collectorId || s.userId);
    var collectorName = U.str(payload.collectorName || Salesman._name(collectorId));

    var pay = DB.insert('Payments',{
      id: U.uid('PAY'), voucherNo: DB.nextNumber('PAY', locId),
      date: date, type: 'RECEIPT', partyType: 'CUSTOMER', partyId: payload.customerId, partyName: customer.name||payload.customerName||'',
      amount: String(amount), method: method, reference: U.str(payload.reference||payload.txnId||'').slice(0,80),
      locationId: locId, sessionId: '', notes: U.str(payload.notes||'').slice(0,500),
      createdBy: s.userId, createdAt: U.iso(),
      status: 'CLEARED', fee: '0', fed:'0', net: String(amount), settleDate:'', bankName:U.str(payload.bankName||'').slice(0,60),
      accountNo:U.str(payload.accountNo||'').slice(0,60), chequeNo:U.str(payload.chequeNo||''), chequeDate:U.str(payload.chequeDate||''),
      clearingDate:'', bounceCharges:'0', walletNumber:U.str(payload.walletNumber||''), txnId:U.str(payload.txnId||'').slice(0,80),
      raastId:U.str(payload.raastId||''), cardLast4:'', approvalCode:'', payerMobile:U.str(payload.payerMobile||''),
      receiverMobile:'', dueDate:'', feePct:'0', fedPct:'0', clearedBy: s.userId, clearedAt: U.iso(),
      saleId:'', purchaseId:'',
      prevBalance: String(prevBalance), newBalance: String(newBalance), collectorId: collectorId, collectorName: collectorName,
      invoiceNos: U.str(payload.invoiceNos||payload.relatedInvoices||'').slice(0,300), relatedRef: U.str(payload.relatedRef||'').slice(0,80)
    }, s);

    // Ledger entry: customer ledger credit (payment reduces due)
    try{
      DB.insert('Ledger',{
        id: U.uid('LED'), date: date, partyType:'CUSTOMER', partyId: payload.customerId,
        refType:'PAYMENT', refId: pay.id, description: 'Udhar wasooli — '+method+' '+(payload.reference||''),
        debit:'0', credit:String(amount), balance:String(newBalance), locationId: locId, createdAt: U.iso()
      });
    }catch(e){}

    // Also log visit/collected if salesman context?
    if(collectorId){
      try{
        DB.insert('SalesmanVisits',{
          id: U.uid('SVS'), date: date, salesmanId: collectorId,
          customerId: payload.customerId, customerName: customer.name||'',
          purpose:'COLLECTION', outcome:'COLLECTED', orderValue:'0', collected: String(amount),
          notes: 'Wasooli '+method+' '+(payload.reference||''), locationId: locId, createdAt: U.iso()
        });
      }catch(e){}
    }

    Audit.log('SALESMAN_COLLECTION','Payments',pay.id,null,{customerId:payload.customerId, amount:amount, method:method, prevBalance:prevBalance, newBalance:newBalance, collectorId:collectorId},s);
    // Notifications?
    return { id: pay.id, voucherNo: pay.voucherNo, customerId: payload.customerId, amount: amount, prevBalance: prevBalance, newBalance: newBalance, method: method, collectorName: collectorName };
  },

  paymentHistory: function(p,s){
    Auth.require(s,'payments.view');
    p=p||{};
    var rows=DB.all('Payments').filter(function(r){
      if(p.customerId && r.partyId!==p.customerId) return false;
      if(p.salesmanId && !(U.str(r.collectorId)===p.salesmanId || U.str(r.createdBy)===p.salesmanId)) return false;
      if(p.collectorId && U.str(r.collectorId)!==U.str(p.collectorId) && U.str(r.createdBy)!==U.str(p.collectorId)) return false;
      if(p.method && U.str(r.method)!==U.str(p.method)) return false;
      if(p.from && Salesman._d(r.date) < Salesman._d(p.from)) return false;
      if(p.to && Salesman._d(r.date) > Salesman._d(p.to)) return false;
      if(p.q){
        var q=U.norm(p.q); var hay=U.norm((r.partyName||'')+' '+(r.voucherNo||'')+' '+(r.reference||'')+' '+(r.notes||''));
        if(hay.indexOf(q)<0) return false;
      }
      return true;
    });
    rows.sort(function(a,b){return U.str(b.date).localeCompare(U.str(a.date)) || U.str(b.voucherNo).localeCompare(U.str(a.voucherNo));});
    var slice=rows.slice(0, U.num(p.limit,200));
    return slice.map(function(r){
      return {
        id:r.id, voucherNo:r.voucherNo, date:r.date, partyId:r.partyId, partyName:r.partyName,
        amount:U.num(r.amount), method:r.method, reference:r.reference||'', bankName:r.bankName||'', accountNo:r.accountNo||'',
        txnId:r.txnId||'', collectorId:r.collectorId||r.createdBy||'', collectorName:r.collectorName||Salesman._name(r.collectorId||r.createdBy||''),
        prevBalance:U.num(r.prevBalance), newBalance:U.num(r.newBalance), invoiceNos:r.invoiceNos||'', notes:r.notes||'',
        status:r.status||''
      };
    });
  },

  /* ==========================================================================
     SUMMARY — salesman screen ka card (backward compat)
     ========================================================================== */

  summary: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var locId = p.locationId || '';
    var id = p.salesmanId;
    if (!id) return { stockValue: 0, issuedValue: 0, soldValue: 0, returnedValue: 0, due: 0 };

    var issuedValue = 0;
    DB.all('SalesmanIssues').forEach(function (r) {
      if (r.salesmanId !== id || (locId && r.locationId !== locId)) return;
      issuedValue += U.num(r.total);
    });
    var returnedValue = 0;
    DB.all('SalesmanReturns').forEach(function (r) {
      if (r.salesmanId !== id || (locId && r.locationId !== locId)) return;
      returnedValue += U.num(r.total);
    });
    var soldValue = 0, due = 0;
    DB.all('Sales').forEach(function (x) {
      if (x.salespersonId !== id || U.str(x.status) === 'VOID') return;
      if (locId && x.locationId !== locId) return;
      soldValue += U.num(x.total);
      due += U.num(x.due);
    });

    return {
      salesmanId: id,
      stockValue: Salesman.stockValue(id, locId),
      issuedValue: U.round(issuedValue, 2),
      returnedValue: U.round(returnedValue, 2),
      soldValue: U.round(soldValue, 2),
      customerDue: U.round(due, 2)
    };
  },

  /* ==========================================================================
     HELPERS
     ========================================================================== */

  _name: function (id) {
    if (!id) return '';
    try {
      var u = DB.byId('Users', id);
      if (u) return U.str(u.fullName || u.name || u.username || u.email || id);
    } catch (e) { }
    return id;
  },

  list: function (p, s) {
    Auth.require(s, 'sales.view');
    var out = [];
    try {
      DB.all('Users').forEach(function (u) {
        if (U.str(u.active) === 'false') return;
        var role = U.str(u.role).toUpperCase();
        if (role === 'SALESMAN' || role === 'SALES' || role === 'OWNER' || role === 'MANAGER') {
          out.push({ id: u.id, name: Salesman._name(u.id), role: role });
        }
      });
    } catch (e) { }
    return out;
  },

  _autoDoc: function (kind, rec, s) {
    try {
      if (typeof Docs === 'undefined' || !Docs.autoFor) return;
      Docs.autoFor(kind, rec, s);
    } catch (e) {
      Logger.log('Salesman autoDoc: ' + e.message);
    }
  }
};
