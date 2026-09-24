/**
 * HASEEB AUTOS - ERP / POS  ::  NOTIFICATIONS / ALERT ENGINE
 * Settings ▸ Automation ▸ Alerts se har alert on/off aur threshold configurable.
 */

var Notifications = {

  /* ============================== GENERATE ================================= */
  /** Idempotent: har alert ki unique key hoti hai (type:entity:id) — duplicate nahi banta */
  generate: function (s) {
    var created = 0;
    var cfg = Config.all(s);
    var existing = {};
    DB.all('Notifications').forEach(function (n) {
      if (U.str(n.readAt) === '' || !n.readAt) existing[n.type + ':' + n.body] = n.id;
    });

    function push(type, title, body, severity, link, locationId) {
      var key = type + ':' + body;
      if (existing[key]) return;
      DB.insert('Notifications', {
        id: U.uid('NTF'), ts: U.iso(), type: type, title: title, body: body,
        link: link || '', userId: '', readAt: '', severity: severity || 'info',
        locationId: locationId || ''
      });
      existing[key] = 1;
      created++;
    }

    // ---- stock alerts ----
    if (U.str(cfg['alert.lowStock']) !== 'false' || U.str(cfg['alert.outOfStock']) !== 'false') {
      var stock = DB.all('Stock');
      var items = {}; DB.all('Items').forEach(function (i) { items[i.id] = i; });
      var seen = {};
      stock.forEach(function (r) {
        var it = items[r.itemId];
        if (!it || U.str(it.status) !== 'ACTIVE') return;
        var qty = U.num(r.qty);
        var reorder = U.num(it.reorderLevel, U.num(it.minStock, U.num(cfg.lowStockThreshold)));
        if (qty <= 0 && U.str(cfg['alert.outOfStock']) !== 'false') {
          if (!seen['out' + r.itemId]) {
            push('STOCK_OUT', 'Out of stock', it.name + ' (' + it.code + ') stock zero hai — ' + locName_(r.locationId),
              'error', '#/items', r.locationId);
            seen['out' + r.itemId] = 1;
          }
        } else if (qty <= reorder && U.str(cfg['alert.lowStock']) !== 'false') {
          if (!seen['low' + r.itemId]) {
            push('STOCK_LOW', 'Low stock', it.name + ' (' + it.code + ') — ' + qty + ' left (reorder at ' + reorder + ')',
              'warn', '#/items', r.locationId);
            seen['low' + r.itemId] = 1;
          }
        }
      });
    }

    // ---- receivables ageing ----
    var days = U.num(cfg['alert.receivables'], 0);
    if (days > 0) {
      var cutoff = U.daysAgo(days);
      DB.all('Ledger').filter(function (l) {
        return l.partyType === 'CUSTOMER' && U.num(l.debit) > 0;
      }).forEach(function (l) {
        var d = U.parseDate(l.date);
        if (d && d < cutoff) {
          var c = DB.byId('Customers', l.partyId);
          push('RECEIVABLE', 'Udhaar purana ho raha hai',
            (c ? c.name : l.partyId) + ' — ' + fmtMoney_(l.debit) + ' (' + days + '+ days)',
            'warn', '#/parties', l.locationId);
        }
      });
    }

    // ---- pending PO ----
    var poDays = U.num(cfg['alert.pendingPO'], 0);
    if (poDays > 0) {
      DB.all('PurchaseOrders').filter(function (p) { return U.str(p.status) !== 'RECEIVED'; })
        .forEach(function (p) {
          var d = U.parseDate(p.date);
          if (d && d < U.daysAgo(poDays)) {
            push('PURCHASE', 'PO pending', (p.poNo || 'PO') + ' abhi tak receive nahi hua',
              'info', '#/purchase', p.locationId);
          }
        });
    }

    // ---- expiry (lots) ----
    try {
      var expiring = Warehouse.lots({ expiringInDays: 30 }, s);
      expiring.forEach(function (l) {
        push('EXPIRY', 'Expiry near', l.name + ' lot ' + l.lotNo + ' — ' + (l.daysToExpiry || 0) + ' days',
          'warn', '#/inventory', l.locationId);
      });
    } catch (e) { /* lots module off */ }

    // ---- customer demands (AI monitor: overdue / arrived-not-notified / pending PO) ----
    try {
      if (typeof CustomerDemands !== 'undefined') {
        var dm = CustomerDemands.monitor(s);
        created += U.num(dm.alerts);
      }
    } catch (e) { /* demand monitor off */ }

    return { created: created };
  },

  /* ================================ READ =================================== */
  /**
   * Ek alert push karein (Reorder / jobs / kisi bhi module se).
   * Idempotent: same type+body ka unread alert 24 ghante mein dobara nahi banta.
   */
  push: function (type, title, body, severity, link, locationId, s) {
    var since = new Date().getTime() - 24 * 3600 * 1000;
    var dupe = DB.all('Notifications').filter(function (n) {
      if (n.type !== type || U.str(n.body) !== U.str(body)) return false;
      if (U.str(n.readAt)) return false;                       // read ho chuka → dobara banao
      var ts = U.parseDate(n.ts);
      return ts ? ts.getTime() >= since : false;
    })[0];
    if (dupe) return dupe;
    return DB.insert('Notifications', {
      id: U.uid('NTF'), ts: U.iso(), type: type, title: title || type, body: body || '',
      link: link || '', userId: (s && s.userId) || '', readAt: '',
      severity: severity || 'info', locationId: locationId || ''
    }, s);
  },

  list: function (opts, s) {
    opts = opts || {};
    var rows = DB.all('Notifications').reverse();
    if (opts.unreadOnly) rows = rows.filter(function (r) { return !U.str(r.readAt); });
    if (opts.severity) rows = rows.filter(function (r) { return r.severity === opts.severity; });
    if (opts.type) rows = rows.filter(function (r) { return r.type === opts.type; });
    var limit = U.num(opts.limit, 60);
    return rows.slice(0, limit).map(function (r) {
      return { id: r.id, ts: r.ts, type: r.type, title: r.title, body: r.body,
        link: r.link, severity: r.severity, locationId: r.locationId, read: !!U.str(r.readAt) };
    });
  },

  unreadCount: function (s) {
    return DB.all('Notifications').filter(function (r) { return !U.str(r.readAt); }).length;
  },

  summary: function (s) {
    var rows = DB.all('Notifications').filter(function (r) { return !U.str(r.readAt); });
    var by = { error: 0, warn: 0, info: 0 };
    rows.forEach(function (r) { by[r.severity || 'info'] = (by[r.severity || 'info'] || 0) + 1; });
    return { unread: rows.length, total: rows.length, bySeverity: by, latest: rows.slice(-5).reverse() };
  },

  markRead: function (id, s) { return DB.update('Notifications', id, { readAt: U.iso() }, s); },

  markAllRead: function (s) {
    var n = 0;
    DB.all('Notifications').filter(function (r) { return !U.str(r.readAt); })
      .forEach(function (r) { DB.update('Notifications', r.id, { readAt: U.iso() }, s); n++; });
    return { marked: n };
  },

  clear: function (s) {
    Auth.require(s, 'settings.manage');
    var n = DB.all('Notifications').length;
    DB.all('Notifications').forEach(function (r) { DB.remove('Notifications', r.id, s); });
    return { cleared: n };
  }
};

function locName_(id) { var l = DB.byId('Locations', id); return l ? l.name : (id || ''); }
function fmtMoney_(v) { return (Config.get('currencySymbol', 'Rs')) + ' ' + U.round(v, 0).toLocaleString('en-US'); }
