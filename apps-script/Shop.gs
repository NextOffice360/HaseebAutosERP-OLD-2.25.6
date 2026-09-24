/**
 * HASEEB AUTOS - ERP / POS  ::  SHOP SESSION RULES  (v2.30.0)
 * ============================================================================
 * Aap ki shart:
 *   "login ke baad, user ka assigned shop OPEN hona chahiye — tab hi sale ya
 *    doosri operational activity allowed ho. Har action authenticated
 *    user/shop ke against track ho."
 *
 * Design (mojooda system ke upar, naya parallel system NAHI):
 *   · CashSessions sheet hi shop session hai (pehle se mojood: Payments
 *     openSession / closeSession / currentSessionRaw / sessionTotals).
 *   · Shop khulne par opening report, band hone par closing report —
 *     Reports.dayReport.auto('OPEN'|'CLOSE') pehle se karta hai (settings-driven).
 *   · Ye module sirf 3 kaam karta hai:
 *       1) status()      — shop khuli hai ya band (UI banner/wizard ke liye)
 *       2) open()/close() — wrapper + report + share text + auto-print flag
 *       3) requireOpen()  — enforcement (server par, sirf CSS nahi)
 *
 * Settings (Config.gs ▸ Shop & Session):
 *   shop.requireOpen        'true'  — band shop par operational writes block
 *   shop.defaultOpeningCash '0'     — wizard/prompt ka default
 *   dayReportAutoOpen/Close/Print   — reports + auto print (pehle se mojood)
 * ============================================================================
 */

var Shop = {
  /** settings snapshot (kill-switch: shop.requireOpen=false → sirf track, block nahi) */
  _cfg: function () {
    var st = DB.settings() || {};
    return {
      requireOpen: U.str(st['shop.requireOpen']) !== 'false',
      defaultOpeningCash: U.num(st['shop.defaultOpeningCash'], 0),
      autoPrintOpen: U.str(st['dayReportAutoPrint']) !== 'false',
      autoPrintClose: U.str(st['dayReportAutoPrint']) !== 'false'
    };
  },

  /** location resolve: payload → session.locationId → default → pehli branch
     (session object mein kabhi `locationId` na ho to bhi kaam kare) */
  _loc: function (p, s) {
    s = s || {};
    return (p && p.locationId) || s.locationId || s.defaultLocationId ||
      (s.locationIds && s.locationIds[0]) || '';
  },

  /** open session for a location (kisi bhi user ki) — shop OPEN ka matlab */
  _openFor: function (locId) {
    return DB.findOne('CashSessions', function (r) {
      return r.status === 'OPEN' && r.locationId === locId;
    });
  },

  /** ============================ STATUS ==================================== */
  /**
   * Editor/UI dono ke liye: shop khuli hai? kis ne kholi? kitna cash?
   * Har call par location name + user name bhi deta hai (report/print ke liye).
   */
  status: function (p, s) {
    p = p || {};
    var locId = Shop._loc(p, s);
    var loc = DB.byId('Locations', locId) || {};
    var open = Shop._openFor(locId);
    var own = Payments.currentSessionRaw(locId, s.userId);
    var out = {
      open: !!open,
      locationId: locId,
      locationName: U.str(loc.name || locId),
      locationCode: U.str(loc.code),
      seeded: Shop.seeded(),
      demo: Shop.demoVisible(),
      requireOpen: Shop._cfg().requireOpen,
      byUser: open ? U.str(open.userId) : '',
      byUserName: open ? Shop._userName(open.userId) : '',
      session: null,
      ownSession: !!own
    };
    if (open) {
      out.session = {
        id: open.id, sessionNo: open.sessionNo, openedAt: open.openedAt,
        openingCash: U.num(open.openingCash), status: open.status,
        userId: open.userId, userName: Shop._userName(open.userId)
      };
    }
    return out;
  },

  _userName: function (userId) {
    var u = DB.byId('Users', userId);
    return U.str(u && (u.fullName || u.username));
  },

  /** data mojood hai ya khaali (wizard + fresh-install hints ke liye) */
  seeded: function () {
    try {
      return {
        users: DB.count('Users'),
        locations: DB.count('Locations'),
        items: DB.count('Items'),
        customers: DB.count('Customers'),
        suppliers: DB.count('Suppliers'),
        settings: DB.count('Settings'),
        businessName: U.str((DB.settings() || {}).businessName)
      };
    } catch (e) { return { error: e.message }; }
  },

  /** demo data visible? (setting `data.showDemo`) — dashboards/reports filter isi se */
  demoVisible: function () {
    var st = DB.settings() || {};
    return U.str(st['data.showDemo']) !== 'false';
  },

  /** demo rows chhupane hain to filter — [rows] → visible rows */
  visibleRows: function (rows) {
    if (Shop.demoVisible()) return rows || [];
    return (rows || []).filter(function (r) { return U.str(r && r.isDemo) !== 'true'; });
  },

  /** ek row demo hai? (UI badge ke liye) */
  isDemo: function (r) { return U.str(r && r.isDemo) === 'true'; },

  /* ============================ ENFORCEMENT =============================== */
  /**
   * Operational action se pehle lazmi check. Server par chalta hai —
   * client UI ko bypass karne se bhi faida nahi.
   * Return: { sessionId, locationId, userId } ya throw.
   */
  requireOpen: function (s, locId, what) {
    locId = locId || Shop._loc({}, s);
    var cfg = Shop._cfg();
    var open = Shop._openFor(locId);
    if (!open && cfg.requireOpen) {
      var loc = DB.byId('Locations', locId) || {};
      var err = new Error('SHOP_CLOSED|Shop band hai (' + U.str(loc.name || locId) +
        ') — ' + U.str(what || 'ye kaam') + ' se pehle Shop kholain (Opening cash ke sath). ' +
        'Settings ▸ Shop & Session mein shop.requireOpen=false kar ke ye rule band bhi ho sakta hai.');
      err.code = 'SHOP_CLOSED';
      err.shopClosed = true;
      throw err;
    }
    /* shop khuli hai magar session kisi aur user ki — apna cash session attach karo
       taake har amal authenticated user ke against track ho */
    var own = Payments.currentSessionRaw(locId, s.userId);
    if (!own && open && s && s.userId) {
      try {
        var ses = DB.insert('CashSessions', {
          id: U.uid('SES'), sessionNo: DB.nextNumber('SESSION', locId), locationId: locId,
          userId: s.userId, openingCash: 0, expectedCash: 0, closingCash: '', variance: '',
          openedAt: U.iso(), closedAt: '', status: 'OPEN',
          notes: 'Shop open session (' + U.str(open.sessionNo) + ') — auto-attach'
        }, s);
        if (ses) own = ses;
      } catch (e) { own = open; }
    }
    return {
      sessionId: U.str((own || open || {}).id),
      sessionNo: U.str((own || open || {}).sessionNo),
      locationId: locId,
      userId: U.str(s && s.userId),
      userName: Shop._userName(s && s.userId),
      open: !!open
    };
  },

  /** write rows par stamp: userId/userName/locationId/sessionId (tracking) */
  stamp: function (ctx, obj) {
    obj = obj || {};
    if (!ctx) return obj;
    if (obj.sessionId === undefined || obj.sessionId === '') obj.sessionId = ctx.sessionId || '';
    return obj;
  },

  /* ============================== OPEN =================================== */
  /**
   * Shop kholo → session + OPENING report (structured) + auto-print flag.
   * Return: { session, report, share, autoPrint, status }
   */
  open: function (p, s) {
    p = p || {};
    var locId = Shop._loc(p, s);
    var st = Shop.status({ locationId: locId }, s);
    var ses;
    if (st.open) {
      ses = DB.byId('CashSessions', st.session.id);
    } else {
      ses = Payments.openSession({
        locationId: locId,
        openingCash: p.openingCash === undefined ? Shop._cfg().defaultOpeningCash : p.openingCash,
        notes: p.notes || ''
      }, s);
    }
    var rep = Shop._report(ses, 'OPEN', s);
    return {
      session: { id: ses.id, sessionNo: ses.sessionNo, openedAt: ses.openedAt, openingCash: U.num(ses.openingCash) },
      report: rep,
      share: rep ? Shop.shareText(rep) : '',
      autoPrint: Shop._cfg().autoPrintOpen,
      status: Shop.status({ locationId: locId }, s)
    };
  },

  /* ============================== CLOSE ================================== */
  /** Shop band karo → session close + CLOSING report + share text + auto-print flag */
  close: function (p, s) {
    p = p || {};
    var locId = Shop._loc(p, s);
    var ses = Payments.currentSessionRaw(locId, s.userId) || Shop._openFor(locId);
    if (!ses) throw new Error('Koi open session nahi mili — shop pehle se band hai.');
    var updated = Payments.closeSession({
      locationId: locId, closingCash: p.closingCash, notes: p.notes || ''
    }, s);
    var rep = Shop._report(updated || ses, 'CLOSE', s);
    return {
      session: updated ? {
        id: updated.id, sessionNo: updated.sessionNo, closedAt: updated.closedAt,
        openingCash: U.num(updated.openingCash), closingCash: U.num(updated.closingCash),
        expectedCash: U.num(updated.expectedCash), variance: U.num(updated.variance), status: updated.status
      } : null,
      report: rep,
      share: rep ? Shop.shareText(rep) : '',
      autoPrint: Shop._cfg().autoPrintClose,
      status: Shop.status({ locationId: locId }, s)
    };
  },

  /**
   * Session ka report (OPEN/CLOSE):
   *   1) isi session + kind ka report pehle se hai → wohi wapas (duplicate nahi)
   *   2) warna Reports.dayReport.generate se naya (structured + audit)
   */
  _report: function (ses, kind, s) {
    try {
      if (!ses || !ses.id) return null;
      var one = DB.findOne('DayReports', function (x) { return x.sessionId === ses.id && U.upper(U.str(x.kind)) === U.upper(U.str(kind)); });
      if (one) {
        var sum = {}; try { sum = JSON.parse(one.summary || '{}'); } catch (e) { sum = {}; }
        return { id: one.id, reportNo: one.reportNo, kind: one.kind, date: one.date,
          sessionId: one.sessionId, locationId: one.locationId, userId: one.userId,
          generatedAt: one.generatedAt, method: one.method, summary: sum };
      }
      var r = Reports.dayReport.generate({ sessionId: ses.id, kind: kind, method: 'AUTO' }, s);
      return r || null;
    } catch (e) { return null; }
  },

  /** mojooda report dobara (UI "Report dekho" ke liye) */
  lastReport: function (p, s) {
    p = p || {};
    var rows = DB.all('DayReports').filter(function (r) {
      return (!p.locationId || r.locationId === p.locationId) && (!p.kind || r.kind === p.kind);
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return U.str(a.generatedAt) < U.str(b.generatedAt) ? 1 : -1; });
    var rec = rows[p.id ? 0 : 0];
    if (p.id) rec = DB.byId('DayReports', p.id) || rec;
    var sum = {};
    try { sum = JSON.parse(rec.summary || '{}'); } catch (e) { sum = {}; }
    return { id: rec.id, reportNo: rec.reportNo, kind: rec.kind, date: rec.date,
      locationId: rec.locationId, userId: rec.userId, generatedAt: rec.generatedAt, summary: sum };
  },

  /* ============================ SHARE TEXT =============================== */
  /**
   * WhatsApp / clipboard ke liye saaf text (structured report summary).
   * UI isay wa.me link mein daalta hai — koi server round-trip nahi.
   */
  shareText: function (rep) {
    if (!rep) return '';
    var sum = rep.summary || {};
    var loc = U.str((DB.byId('Locations', rep.locationId) || {}).name || rep.locationId);
    var who = Shop._userName(rep.userId);
    var m = function (v) { return 'Rs ' + U.round(U.num(v), 2); };
    var L = [];
    L.push(rep.kind === 'OPEN' ? 'SHOP OPEN REPORT' : 'SHOP CLOSE REPORT');
    L.push('Shop: ' + loc + (who ? ' | By: ' + who : ''));
    L.push('Report: ' + U.str(rep.reportNo) + ' | ' + U.str(rep.date || sum.date));
    if (sum.sessionNo) L.push('Session: ' + U.str(sum.sessionNo));
    L.push('Opening cash: ' + m(sum.openingCash));
    if (rep.kind === 'CLOSE') {
      L.push('Expected cash: ' + m(sum.expectedCash));
      L.push('Closing cash: ' + m(sum.closingCash));
      L.push('Variance: ' + m(sum.variance));
    }
    L.push('Cash sales: ' + m(sum.cashSales));
    L.push('Credit sales: ' + m(sum.creditSales));
    L.push('Refunds: ' + m(sum.refunds));
    L.push('Net sales: ' + m(sum.netSales));
    L.push('Expenses: ' + m(sum.expenseTotal));
    L.push('Invoices: ' + U.num(sum.invoices));
    L.push('- Haseeb Autos ERP');
    return L.join('\n');
  },

  /* ========================== DEMO DATA ================================== */
  /** demo rows (isDemo=true) gin kar batao — Settings screen ke liye */
  demoStats: function (p, s) {
    Auth.require(s, 'settings.view');
    var tables = ['Items', 'Customers', 'Suppliers', 'Stock', 'Sales', 'Users'];
    var out = { visible: Shop.demoVisible(), counts: {}, total: 0 };
    tables.forEach(function (t) {
      var n = DB.all(t).filter(function (r) { return U.str(r.isDemo) === 'true'; }).length;
      out.counts[t] = n; out.total += n;
    });
    return out;
  },

  /** demo data hatao (production jaane se pehle) — sirf isDemo rows */
  removeDemoData: function (p, s) {
    Auth.require(s, 'settings.manage');
    var tables = ['Stock', 'Sales', 'Items', 'Customers', 'Suppliers', 'Users'];
    var removed = {};
    tables.forEach(function (t) {
      removed[t] = DB.purge(t, function (r) { return U.str(r.isDemo) === 'true'; });
      DB.touch(t);
    });
    Audit.log('DELETE', 'DemoData', 'ALL', null, removed, s);
    return { removed: removed, message: 'Demo data hata diya gaya. Real data bilkul chhua nahi gaya.' };
  }
};
