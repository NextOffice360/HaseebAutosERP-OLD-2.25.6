/**
 * HASEEB AUTOS - ERP / POS  ::  OFFLINE SYNC
 * POS tab band ho ya internet chala jaye → bills local queue mein jama hote hain,
 * wapas online aate hi upload ho kar server par post hote hain.
 * Har queued item ke sath clientId bheja jata hai → duplicate save nahi hota.
 */

var OfflineSync = {

  /** Compact catalog for offline cache (IndexedDB/localStorage) */
  pull: function (p, s) {
    p = p || {};
    var locId = (p.locationId && Auth.canAccessLocation(s, p.locationId)) ? p.locationId : s.locationId;
    var stock = Inventory.stockMap(locId);
    var suppliers = DB.all('Suppliers');
    var items = DB.all('Items').filter(function (i) { return U.str(i.status) === 'ACTIVE'; })
      .map(function (i) {
        /* supplier ka naam bhi catalog ke sath — POS card / quick-view mein chahiye */
        var sup = null;
        suppliers.forEach(function (x) { if (x.id && x.id === i.primarySupplierId) sup = x; });
        return {
          id: i.id, code: i.code, name: i.name, nameUr: i.nameUr || '', cat: i.category || '',
          sub: i.subCategory || '', brand: i.brand || '', unit: i.unit || '',
          cv: U.num(i.conversionFactor, 1) || 1, /* v2.9 §8 — pack size har jagah */
          bc: i.barcode || i.code, alt: i.altBarcodes || '',
          cp: U.num(i.costPrice), rp: U.num(i.retailPrice),
          wp: U.num(i.wholesalePrice), mp: U.num(i.minPrice), tx: U.num(i.taxRate),
          qty: U.num(stock[i.id], 0), rack: i.rack || '', img: i.imageUrl || '',
          sp: i.primarySupplierId || '', sup: sup ? U.str(sup.name) : '',
          reorder: U.num(i.reorderLevel, U.num(i.minStock, 0))
        };
      });
    var customers = DB.all('Customers').map(function (c) {
      return { id: c.id, code: c.code, name: c.name, phone: c.phone, typeId: c.customerTypeId,
        bal: U.round(Parties.balance('CUSTOMER', c.id), 2) };
    });
    return {
      items: items, customers: customers,
      settings: DB.settings(), locations: s.locations,
      locationId: locId, ts: U.iso(),
      itemCount: items.length
    };
  },

  /**
   * p = { queue: [ { clientId, action, payload, createdAt } ] }
   * Har entry ko real API route par chalaya jata hai (permissions lagoo rehti hain).
   */
  /* ---------------- v2.30.2 (N9.1) — SERVER-SIDE CONFLICT RESOLUTION ----------------
     Offline edit jab replay hota hai aur server par wahi record is doran badal chuka:
       · payload.__base (form ka asli-loaded record) mojood → PER-FIELD 3-way merge:
           server == base            → client ki value (server ne chheda hi nahi)
           incoming == server        → skip (pehle se wahi)
           teeno alag                → CONFLICT → SERVER value qayam + report + audit
         (client ki doosri fields phir bhi lagti hain — poora kaam zaya nahi hota)
       · __base nahi → partial-update rule (sirf bheji keys) phir bhi safe; sirf
         STALE flag lagta hai (server newer than edit) taake UI bata sake.            */
  _mergeable: { 'items.save': ['item', 'Items'], 'customers.save': ['customer', 'Customers'], 'suppliers.save': ['supplier', 'Suppliers'] },
  _mergeUpdate: function (action, payload, entry, out, s) {
    var m = OfflineSync._mergeable[action];
    if (!m) return payload;
    var rec = payload[m[0]];
    if (!rec || !rec.id) return payload;
    var row = DB.byId(m[1], rec.id) || {};
    var base = (payload.__base && typeof payload.__base === 'object') ? payload.__base : null;
    var conflicts = [];
    if (base) {
      Object.keys(rec).forEach(function (k) {
        if (k === 'id' || k.indexOf('__') === 0) return;
        var sv = (row[k] === undefined || row[k] === null) ? '' : String(row[k]);
        var bv = (base[k] === undefined || base[k] === null) ? '' : String(base[k]);
        var iv = (rec[k] === undefined || rec[k] === null) ? '' : String(rec[k]);
        if (sv === bv) return;                    /* server untouched → client value qayam */
        if (iv === sv) { delete rec[k]; return; } /* pehle se wahi — kuch nahi karna */
        conflicts.push(k); delete rec[k];         /* CONFLICT → server wins */
      });
    } else if (entry.createdAt) {
      /* server ne is record ko offline-edit ke BAAD chhua? (updatedAt wale sheets
         direct, warna AuditLog ka aakhri UPDATE ts — har DB.update audit karta hai) */
      var touched = String(row.updatedAt || '');
      if (!touched) touched = OfflineSync._lastServerTouch(m[1], rec.id, s);
      if (touched && touched > String(entry.createdAt)) out.stale = true;
    }
    payload[m[0]] = rec;
    if (conflicts.length) {
      out.conflict = { id: rec.id, fields: conflicts };
      try { Audit.log('SYNC_CONFLICT', m[1], rec.id, null,
        { fields: conflicts.join(','), clientId: entry.clientId || '' }, s); } catch (eA) { }
    }
    return payload;
  },

  _lastServerTouch: function (store, id, s) {
    try {
      var best = '';
      DB.all('AuditLog').forEach(function (r) {
        if (r.action !== 'UPDATE' || r.entity !== store || String(r.entityId) !== String(id)) return;
        var ts = U.str(r.ts);
        if (ts > best) best = ts;
      });
      return best;
    } catch (eL) { return ''; }
  },

  process: function (p, s) {
    var queue = p.queue || [];
    var results = [];
    queue.forEach(function (entry) {
      var out = { clientId: entry.clientId, ok: true };
      /* v2.30.0 (N9) — GENERIC idempotency ledger (OfflineQueue sheet).
         Pehle dedupe sirf SALE ke paas tha (offlineId notes mein) — config.save
         jaise baqi actions ka replay double apply ho sakta tha. Ab har clientId
         jo DONE ho chuka wo dobara NAHI chalta (duplicate flag ke saath). */
      var already = false;
      try {
        var prev = DB.findOne('OfflineQueue', function (r) {
          return U.str(r.clientId) === U.str(entry.clientId) && r.status === 'DONE';
        });
        if (prev) { out.duplicate = true; results.push(out); already = true; }
      } catch (eL) { }
      if (!already) {
        try {
          var route = ROUTES[entry.action];
          if (!route) throw new Error('Unknown action ' + entry.action);
          var payload = entry.payload || {};
          /* N9.1 — mergeable update par per-field conflict resolution (pehle merge, phir apply) */
          var mOut = {};
          payload = OfflineSync._mergeUpdate(entry.action, payload, entry, mOut, s);
          if (mOut.stale) out.stale = true;
          if (mOut.conflict) out.conflict = mOut.conflict;
          payload.token = p.token;
          payload.__session = s;
          payload.offlineId = entry.clientId;
          payload.source = 'OFFLINE';
          out.data = route(payload, s);
          try {
            DB.insert('OfflineQueue', { clientId: entry.clientId, action: entry.action,
              status: 'DONE', receivedAt: entry.createdAt || U.iso(), processedAt: U.iso() }, s);
          } catch (eW) { }
        } catch (e) {
          out.ok = false; out.error = e.message;
          try {
            DB.insert('OfflineQueue', { clientId: entry.clientId, action: entry.action,
              status: 'FAILED', error: String(e.message || e).slice(0, 400),
              receivedAt: entry.createdAt || U.iso(), processedAt: U.iso() }, s);
          } catch (eW2) { }
          Logger.log('Offline sync failed [' + entry.clientId + ']: ' + e.message);
        }
      }
      results.push(out);
    });
    Audit.log('OFFLINE_SYNC', 'OfflineQueue', '', null,
      { received: queue.length, ok: results.filter(function (r) { return r.ok; }).length }, s);
    return {
      received: queue.length,
      succeeded: results.filter(function (r) { return r.ok; }).length,
      failed: results.filter(function (r) { return !r.ok; }).length,
      results: results
    };
  }
};

/* ============================== UTILITIES ================================== */
var Utilities_ = {

  /** Poora database ka JSON snapshot (Drive file) */
  backup: function (s) {
    Auth.require(s, 'settings.manage');
    var dump = { createdAt: U.iso(), version: CONFIG.VERSION, sheets: {} };
    Object.keys(SCHEMA).forEach(function (k) {
      try { dump.sheets[k] = DB.all(k, true); } catch (e) { dump.sheets[k] = []; }
    });
    var file = DriveApp.createFile('HaseebAutos-Backup-' + U.iso().replace(/[:.]/g, '-') + '.json',
      JSON.stringify(dump), MimeType.PLAIN_TEXT);
    Audit.log('BACKUP', 'System', file.getId(), null, { sheets: Object.keys(SCHEMA).length }, s);
    return { fileId: file.getId(), url: file.getUrl(), size: file.getSize() };
  },

  /** Health check: missing sheets, orphan stock, negative stock */
  health: function (s) {
    Auth.require(s, 'settings.manage');
    var issues = [];
    Object.keys(SCHEMA).forEach(function (k) {
      try { DB.sheet(k); } catch (e) { issues.push('Missing sheet: ' + k); }
    });
    DB.all('Stock').forEach(function (r) {
      if (U.num(r.qty) < 0) issues.push('Negative stock: item ' + r.itemId + ' @ ' + r.locationId + ' = ' + r.qty);
    });
    DB.all('Items').forEach(function (i) {
      if (!U.str(i.code)) issues.push('Item without code: ' + i.id);
      if (!U.str(i.barcode)) issues.push('Item without barcode: ' + (i.name || i.id));
    });
    return { issues: issues, counts: DB.stats() };
  }
};
