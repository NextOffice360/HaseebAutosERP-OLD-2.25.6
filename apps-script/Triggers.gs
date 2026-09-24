/**
 * HASEEB AUTOS - ERP / POS  ::  SCHEDULED JOBS (time-driven triggers)
 * ---------------------------------------------------------------------------
 * Apps Script ke time-based triggers yahan se install/remove hote hain.
 * Sab kuch Settings ▸ Automation ▸ Scheduled jobs se configurable:
 *   job.dailyReorder   (switch)  — roz subah reorder suggestions + notification
 *   job.dailyHour      (0-23)    — kab chalay (default 7, Asia/Karachi)
 *   job.dailyAutoPO    (switch)  — suggestions se khud PO bana day (default false)
 *   job.dailyAlerts    (switch)  — alerts (low stock, udhaar, PO pending) regenerate
 *   job.alertsHour     (0-23)    — alerts ka waqt (default 6)
 *   job.cacheWarm      (switch)  — v2.13.4: business hours mein CacheService
 *                                  garam rakhein (default on; 15-min interval,
 *                                  7..22 Asia/Karachi = 64 runs/day, consumer
 *                                  90/day hadd ke andar)
 *   job.warmFrom / job.warmTo (0-23) — warm-up ki window (default 7 aur 22)
 *
 * Editor se manually chalayein:
 *   installTriggers()   → jobs install
 *   removeTriggers()    → jobs hataayein
 *   triggerStatus()     → list dekhein
 *   runReorderNow()     → abhi chalayein (test ke liye)
 *   warmCacheNow()      → cache warm abhi (manual; hours guard skip)
 */

var Triggers = {

  /* Trigger entry points — inhi ke naam se ScriptApp trigger banta hai */
  HANDLER_REORDER: 'triggerDailyReorder',
  HANDLER_ALERTS: 'triggerDailyAlerts',
  HANDLER_DEMAND: 'triggerDemandMonitor',
  HANDLER_WARM: 'triggerCacheWarm',

  /* ============================== SETTINGS ================================ */
  config: function () {
    var s = DB.settings();
    var pick = function (a, b, def) { return s[a] !== undefined ? s[a] : (s[b] !== undefined ? s[b] : def); };
    var hour = function (v, def) {
      var n = U.num(v, def);
      if (n < 0) n = 0; if (n > 23) n = 23;
      return Math.round(n);
    };
    return {
      reorder: U.str(pick('job.dailyReorder', 'jobs.reorder', 'true')) !== 'false',
      hour: hour(pick('job.dailyHour', 'jobs.hour', 7), 7),
      autoPO: U.str(pick('job.dailyAutoPO', 'jobs.autoPO', 'false')) === 'true',
      alerts: U.str(pick('job.dailyAlerts', 'jobs.alerts', 'true')) !== 'false',
      alertsHour: hour(pick('job.alertsHour', 'jobs.alertsHour', 6), 6),
      demand: U.str(pick('job.demandMonitor', 'jobs.demandMonitor', 'true')) !== 'false',
      demandHour: hour(pick('job.demandHour', 'jobs.demandHour', 8), 8),
      warm: U.str(pick('job.cacheWarm', 'jobs.cacheWarm', 'true')) !== 'false',
      warmFrom: hour(pick('job.warmFrom', 'jobs.warmFrom', 7), 7),
      warmTo: hour(pick('job.warmTo', 'jobs.warmTo', 22), 22),
      timezone: U.str(pick('job.timezone', 'jobs.timezone', 'Asia/Karachi')) || 'Asia/Karachi'
    };
  },

  /* ============================ SYSTEM SESSION ============================ */
  /** Triggers ke paas koi login session nahi hota — OWNER ka system session banate hain */
  systemSession: function () {
    var users = DB.all('Users').filter(function (u) { return U.str(u.active) !== 'false'; });
    var owner = users.filter(function (u) { return u.role === 'OWNER'; })[0] || users[0];
    if (!owner) throw new Error('Koi active user nahi mila — pehle Setup.setupAll() chalayein.');
    var s = Auth._buildSession(owner);
    s.__system = true;
    return s;
  },

  /* ============================== INSTALL ================================= */
  /**
   * opts = { force:false }  → settings ke mutabiq triggers (re)create karta hai
   * Har call pe pehle purane Haseeb triggers delete hote hain (duplicate nahi banta).
   */
  install: function (opts, s) {
    opts = opts || {};
    if (s) Auth.require(s, 'settings.manage'); else s = Triggers.systemSession();
    if (typeof ScriptApp === 'undefined') {
      return { installed: [], skipped: true,
        note: 'ScriptApp sirf Apps Script project mein milta hai (local/demo mode mein triggers nahi chal sakte).' };
    }

    Triggers.remove({ silent: true, system: true });

    var c = Triggers.config(), made = [];
    if (c.reorder) {
      made.push(ScriptApp.newTrigger(Triggers.HANDLER_REORDER)
        .timeBased().inTimezone(c.timezone).atHour(c.hour).everyDays(1).create());
    }
    if (c.alerts) {
      made.push(ScriptApp.newTrigger(Triggers.HANDLER_ALERTS)
        .timeBased().inTimezone(c.timezone).atHour(c.alertsHour).everyDays(1).create());
    }
    if (c.demand) {
      made.push(ScriptApp.newTrigger(Triggers.HANDLER_DEMAND)
        .timeBased().inTimezone(c.timezone).atHour(c.demandHour).everyDays(1).create());
    }
    if (c.warm) {
      /* v2.13.4 — 15-min interval; waqt ki guard cacheWarm ke andar hai
         (consumer trigger quota 90/day: 7..22 window = 64 runs safe) */
      made.push(ScriptApp.newTrigger(Triggers.HANDLER_WARM)
        .timeBased().inTimezone(c.timezone).everyMinutes(15).create());
    }

    var out = {
      installed: made.map(function (t) {
        return { handler: t.getHandlerFunction ? t.getHandlerFunction() : '',
          id: t.getUniqueId ? t.getUniqueId() : '' };
      }),
      config: c,
      at: U.iso()
    };
    Audit.log('TRIGGER_INSTALL', 'System', '', null, out, s);
    return out;
  },

  /** Sirf is project ke apne triggers hatata hai (doosre scripts ko haath nahi lagata) */
  remove: function (opts, s) {
    opts = opts || {};
    if (typeof ScriptApp === 'undefined') return { removed: 0, skipped: true };
    if (!opts.system) {
      try { if (s) Auth.require(s, 'settings.manage'); } catch (e) { }
    } else if (!s) { try { s = Triggers.systemSession(); } catch (e) { } }

    var mine = {};
    mine[Triggers.HANDLER_REORDER] = 1;
    mine[Triggers.HANDLER_ALERTS] = 1;
    mine[Triggers.HANDLER_DEMAND] = 1;
    mine[Triggers.HANDLER_WARM] = 1;
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      var fn = t.getHandlerFunction ? t.getHandlerFunction() : '';
      if (!mine[fn]) return;
      try { ScriptApp.deleteTrigger(t); removed++; } catch (e) { }
    });
    /* v2.6 §15 — install se pehle ka state bhi (konsa trigger hataya gaya) */
    if (!opts.silent && s) Audit.log('TRIGGER_REMOVE', 'System', '',
      { trigger: U.str(opts.triggerName || opts.name || ''), installed: true },
      { removed: removed }, s);
    return { removed: removed };
  },

  status: function (opts, s) {
    opts = opts || {};
    var c = Triggers.config();
    var list = [];
    if (typeof ScriptApp !== 'undefined') {
      var mine = {}; mine[Triggers.HANDLER_REORDER] = 1; mine[Triggers.HANDLER_ALERTS] = 1; mine[Triggers.HANDLER_DEMAND] = 1; mine[Triggers.HANDLER_WARM] = 1;
      list = ScriptApp.getProjectTriggers().map(function (t) {
        return { handler: t.getHandlerFunction ? t.getHandlerFunction() : '',
          id: t.getUniqueId ? t.getUniqueId() : '' };
      }).filter(function (x) { return !!mine[x.handler]; });
    }
    var last = {};
    try { last = JSON.parse(U.str(PropertiesService.getScriptProperties().getProperty('LAST_JOB_RUN') || '{}')); } catch (e) { last = {}; }
    return {
      available: typeof ScriptApp !== 'undefined',
      config: c,
      installed: list,
      installedCount: list.length,
      lastRun: last,
      timezone: c.timezone
    };
  },

  /* ============================ CACHE WARM (v2.13.4) ======================
     MASLA: Apps Script idle hone ke baad CacheService khali milta hai —
     pehla user har subah/pehli visit par poori read khud karta hai. Sample
     backend ye cost apni combined bootstrap ke andar chupa deta hai; hum
     isko ek READ-ONLY trigger se hal karte hain: business hours mein har
     15 minute CACHED_SHEETS (Schema.gs) ki copy CacheService mein bhijh
     dete hain. Koi row nahi badalti, koi audit nahi likhta.
     HIFAZAT: writes DB.touch() se cache foran saaf karte hain — is liye
     warm-up kabhi purana data force nahi karta; deadline guard execution ko
     25s se zyada nahi khinchnay deta; Settings ▸ Automation job.cacheWarm
     'false' se poora band.
     ==================================================================== */
  _warmHour: function (d, tz) {
    return Number(Utilities.formatDate(d, tz, 'H'));
  },

  cacheWarm: function (opts) {
    opts = opts || {};
    var c = Triggers.config();
    var out = { at: U.iso(), warmed: [], skipped: null, ms: 0, deadlineHit: false,
      note: 'Read-only cache warm. No data changed. DB.touch() still invalidates on writes.' };
    if (typeof ScriptApp === 'undefined') { out.skipped = 'no-ScriptApp'; return out; }
    if (!c.warm && !opts.manual) { out.skipped = 'off'; return out; }
    var now = opts.now || new Date();
    var hr = Triggers._warmHour(now, c.timezone);
    out.hour = hr;
    if (!opts.manual && (hr < c.warmFrom || hr > c.warmTo)) {
      out.skipped = 'outside-hours';
      return out;
    }
    var t0 = Date.now();
    for (var i = 0; i < CACHED_SHEETS.length; i++) {
      if (Date.now() - t0 > 25000) { out.deadlineHit = true; break; }
      var name = CACHED_SHEETS[i];
      try {
        var rows = DB._readSheet(name);
        var cached = DB._cacheSet(name, rows);
        out.warmed.push({ sheet: name, rows: (rows || []).length, cached: !!cached });
      } catch (e) {
        out.warmed.push({ sheet: name, error: String((e && e.message) || e) });
      }
    }
    out.ms = Date.now() - t0;
    return out;
  },

  /* =============================== JOBS =================================== */
  /** Rozana: har branch ke liye reorder suggestions (aur optionally POs) */
  dailyReorder: function (opts) {
    opts = opts || {};
    var c = Triggers.config();
    var s = Triggers.systemSession();
    var out = { ranAt: U.iso(), method: (Reorder.rules() || {}).method, locations: [], created: 0, items: 0, value: 0 };

    var locs = DB.all('Locations').filter(function (l) { return U.str(l.active) !== 'false'; });
    if (opts.locationId) locs = locs.filter(function (l) { return l.id === opts.locationId; });
    if (!locs.length) locs = [{ id: '', name: 'All branches' }];

    locs.forEach(function (loc) {
      var res, entry = { locationId: loc.id, name: loc.name, items: 0, value: 0, purchaseOrders: 0 };
      try {
        res = Reorder.run({ locationId: loc.id }, s);
      } catch (e) { entry.error = e.message; out.locations.push(entry); return; }

      var rows = res.rows || [];
      entry.items = rows.length;
      entry.value = (res.summary && res.summary.value) || 0;
      out.items += entry.items;
      out.value += entry.value;

      if (c.autoPO && rows.length) {
        try {
          var po = Reorder.createPOs({ locationId: loc.id, items: rows }, s);
          entry.purchaseOrders = po.created || 0;
          out.created += entry.purchaseOrders;
        } catch (e) { entry.error = String(e.message || e); }
      }
      out.locations.push(entry);
    });

    out.value = U.round(out.value, 2);
    Triggers._stamp('REORDER');
    Audit.log('JOB_REORDER', 'Reorder', '', null, out, s);
    return out;
  },

  /** Rozana: alerts regenerate (low stock, out of stock, udhaar, pending PO, expiry) */
  dailyAlerts: function () {
    var s = Triggers.systemSession();
    var created = 0;
    try {
      var g = Notifications.generate(s);
      created = (g && typeof g === 'object') ? U.num(g.created) : U.num(g);
    } catch (e) { created = 0; }
    var out = { ranAt: U.iso(), created: created };
    Triggers._stamp('ALERTS');
    Audit.log('JOB_ALERTS', 'Notifications', '', null, out, s);
    return out;
  },

  /** Rozana: customer demand monitor (overdue / arrived-not-notified / pending PO) */
  dailyDemand: function () {
    var s = Triggers.systemSession();
    var res = { ranAt: U.iso(), alerts: 0 };
    try {
      var r = CustomerDemands.monitor(s);
      res.alerts = U.num(r.alerts);
      res.notes = r.notes || [];
    } catch (e) { res.error = e.message; }
    Triggers._stamp('DEMAND');
    Audit.log('JOB_DEMAND', 'CustomerDemands', '', null, res, s);
    return res;
  },

  _stamp: function (name) {
    try {
      var key = 'LAST_JOB_RUN';
      var cur = {};
      try { cur = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '{}'); } catch (e) { cur = {}; }
      cur[name] = U.iso();
      PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(cur));
    } catch (e) { }
  }
};

/* ====================== TRIGGER ENTRY POINTS (no args) ===================== */

/** Subah wala job: reorder suggestions + notification (trigger isi ko call karta hai) */
function triggerDailyReorder() {
  try { return Triggers.dailyReorder(); }
  catch (e) { Logger.log('triggerDailyReorder failed: ' + (e && e.message)); return { error: String(e && e.message || e) }; }
}

/** Subah wala job: alerts regenerate */
function triggerDailyAlerts() {
  try { return Triggers.dailyAlerts(); }
  catch (e) { Logger.log('triggerDailyAlerts failed: ' + (e && e.message)); return { error: String(e && e.message || e) }; }
}

/** Subah wala job: demand monitor */
function triggerDemandMonitor() {
  try { return Triggers.dailyDemand(); }
  catch (e) { Logger.log('triggerDemandMonitor failed: ' + (e && e.message)); return { error: String(e && e.message || e) }; }
}

/* ==================== EDITOR SE CHALANE WALAY FUNCTIONS ==================== */

/** Apps Script editor ▸ Run: jobs install karein (authorize karna parhta hai pehli dafa) */
function installTriggers() {
  var out = Triggers.install({});
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Apps Script editor ▸ Run: saare Haseeb triggers hataayein */
function removeTriggers() {
  var out = Triggers.remove({});
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Apps Script editor ▸ Run: kaunse jobs installed hain */
function triggerStatus() {
  var out = Triggers.status({});
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Apps Script editor ▸ Run: abhi reorder chalao (bina trigger ke test) */
function runReorderNow() {
  var out = Triggers.dailyReorder();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Apps Script editor ▸ Run: abhi demand monitor chalao */
function runDemandMonitorNow() {
  var out = Triggers.dailyDemand();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Apps Script editor ▸ Run: cache warm abhi (manual — hours/off guard nahi rokenge) */
function warmCacheNow() {
  var out = Triggers.cacheWarm({ manual: true });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Scheduled entry point — triggerCacheWarm; waqt/setting guard khud lagata hai */
function triggerCacheWarm() {
  return Triggers.cacheWarm({ trigger: true });
}
