/**
 * HASEEB AUTOS - ERP / POS  ::  AUDIT LOG
 * Har important write yahan jata hai (before/after JSON ke sath).
 * Non-blocking: audit fail ho to main operation fail nahi hota.
 */

var Audit = {

  SENSITIVE: ['Users', 'Groups', 'Settings', 'Sales', 'SaleItems', 'GRN', 'PurchaseOrders',
    'StockAdjustments', 'Transfers', 'Payments', 'Items', 'Customers', 'Suppliers'],

  log: function (action, entity, entityId, before, after, sessionOrCtx) {
    try {
      var ctx = sessionOrCtx || {};
      var beforeS = before ? JSON.stringify(before) : '';
      var afterS = after ? JSON.stringify(after) : '';
      if (beforeS.length > 4000) beforeS = beforeS.substring(0, 4000);
      if (afterS.length > 4000) afterS = afterS.substring(0, 4000);
      DB.sheet('AuditLog').appendRow([
        U.uid('LOG'), U.iso(), ctx.userId || '', ctx.username || '', action, entity,
        entityId || '', beforeS, afterS,
        (ctx.ip || ''), (ctx.locationId || ctx.defaultLocationId || '')
      ]);
      /* v2.7 — ye write seedhe `appendRow` se hoti hai, DB.touch() ke bager.
         Agar kabhi AuditLog ko CACHED_SHEETS mein shamil kiya jaye to purana
         data nazar aata. Cache ko saaf karna zaroori hai. */
      try { DB.touch('AuditLog'); } catch (e2) { }
    } catch (e) {
      Logger.log('Audit error: ' + e.message);
    }
  },

  /** Purane logs archive/delete */
  purgeOlderThan: function (days) {
    var cutoff = U.daysAgo(days || 180);
    return DB.purge('AuditLog', function (r) {
      var d = U.parseDate(r.ts); return d && d < cutoff;
    });
  },

  search: function (opts, session) {
    Auth.require(session, 'audit.view');
    opts = opts || {};
    var rows = DB.all('AuditLog').reverse();
    if (opts.entity) rows = rows.filter(function (r) { return r.entity === opts.entity; });
    if (opts.action) rows = rows.filter(function (r) { return r.action === opts.action; });
    if (opts.userId) rows = rows.filter(function (r) { return r.userId === opts.userId; });
    if (opts.from) {
      var from = U.startOfDay(opts.from);
      rows = rows.filter(function (r) { var d = U.parseDate(r.ts); return d && d >= from; });
    }
    if (opts.to) {
      var to = U.startOfDay(opts.to); to.setDate(to.getDate() + 1);
      rows = rows.filter(function (r) { var d = U.parseDate(r.ts); return d && d < to; });
    }
    if (opts.q) {
      var q = U.norm(opts.q);
      rows = rows.filter(function (r) {
        return U.norm(r.username + ' ' + r.entity + ' ' + r.action + ' ' + r.entityId).indexOf(q) > -1;
      });
    }
    var limit = U.num(opts.limit, 200);
    return rows.slice(0, limit).map(function (r) {
      return { id: r.id, ts: r.ts, username: r.username, action: r.action, entity: r.entity,
        entityId: r.entityId, before: r.before ? safeJson(r.before) : null,
        after: r.after ? safeJson(r.after) : null, locationId: r.locationId };
    });
  },

  /** kisi entity ki poori history */
  trail: function (entity, entityId, session) {
    Auth.require(session, 'audit.view');
    return DB.all('AuditLog')
      .filter(function (r) { return r.entity === entity && r.entityId === entityId; })
      .map(function (r) {
        return { ts: r.ts, username: r.username, action: r.action,
          before: r.before ? safeJson(r.before) : null, after: r.after ? safeJson(r.after) : null };
      });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return s; } }
