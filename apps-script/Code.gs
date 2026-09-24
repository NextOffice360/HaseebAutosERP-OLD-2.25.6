/**
 * HASEEB AUTOS - ERP / POS  ::  ENTRY POINT & API ROUTER
 * ---------------------------------------------------------------------------
 *  doGet  → PWA serve karta hai (sirf shell; data client side se API call par aata hai)
 *  api()  → SAB client calls isi se guzarti hain: api(action, payload)
 *  jsonp()→ External static PWA ke liye GET transport (CORS-free)
 *
 *  Client (Apps Script hosted):  google.script.run.withSuccessHandler(cb).api(action, payload)
 *  Client (external PWA):        JSONP: <script src=".../exec?t=jsonp&a=items.list&p=...&cb=fn">
 */

/* ==========================================================================
   v2.6 §10 / §11 / §13 — HAR PWA KA APNA URL
   --------------------------------------------------------------------------
     .../exec              → poori ERP app (desktop + mobile)
     .../exec?app=wh       → Warehouse PWA   (alag naam, alag icon)
     .../exec?app=fo       → Field Order PWA
     .../exec?app=sm       → Salesman PWA
   Har ek alag <title>, theme-color aur manifest ke sath serve hoti hai,
   is liye phone ki home screen par 3 alag apps lagte hain.
   Ek deployment se 3 URL — deploy karne ke liye 3 project banane zaroori nahi.
   ========================================================================== */
var PWA_TEMPLATES = { wh: 'Pwa_Warehouse', fo: 'Pwa_Field', sm: 'Pwa_Salesman', pos: 'Pwa_POS' };

function doGet(e) {
  e = e || {};
  var prm = e.parameter || {};
  var appId = U.str(prm.app || '').toLowerCase();

  /* ---- JSONP API (static hosting: Netlify / Vercel / GitHub Pages) ----
     Frontend ka `API.jsonp()` (App_Core.html) isi contract par bhejta hai:
        GET <exec>?t=jsonp&cb=<callback>&a=<action>&p=<JSON payload>
     Jawab: application/javascript  →  <callback>({ok:…, data:…})
     Ye `api()` ko hi reuse karta hai — is liye koi doosra raasta nahi,
     wahi auth, wahi routes, wahi audit trail.
     Sirf GET hai, is liye POST-only kaam (file upload waghera) yahan nahi
     aate — wo gas-web-app par hi rehte hain.
  */
  if (U.str(prm.t).toLowerCase() === 'jsonp') {
    __lastDoGetEvent = e;
    return jsonp(prm.a, prm.p, prm.cb, e);
  }

  /* ---- PWA branch ---- */
  if (appId && PWA_TEMPLATES[appId]) {
    return Pwa.serve(appId);
  }

  /* ---- full ERP app ---- */
  var t = HtmlService.createTemplateFromFile('Index');
  t.title = 'Haseeb Autos — ERP & POS';
  t.appVersion = CONFIG.VERSION;
  t.serveMode = 'apps-script';
  t.apiUrl = '';
  /* v2.8.1: ab direct .addMetaTag() NAHI — sirf `addSafeMetaTag()` se, warna
     "not allowed in this context" exception se poora page fail ho jata tha.
     Jo tags allowed nahi (theme-color, status-bar-style, description ...) wo
     Index.html ke <head> mein CLIENT-SIDE inject hotay hain. */
  var out = t.evaluate()
    .setTitle('Haseeb Autos — ERP & POS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  addSafeMetaTag(out, 'viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  addSafeMetaTag(out, 'apple-mobile-web-app-capable', 'yes');
  addSafeMetaTag(out, 'mobile-web-app-capable', 'yes');
  return out;
}

/** HTML partials ko index mein include karne ke liye */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ==========================================================================
   META TAG SAFETY (v2.8.1) — production outage fix
   --------------------------------------------------------------------------
   ASLI MASLA: Apps Script ka `addMetaTag()` SIRF 4 meta tags allow karta hai
   (official docs: developers.google.com/apps-script/reference/html/html-output):
       viewport · apple-mobile-web-app-capable · mobile-web-app-capable ·
       google-site-verification
   Koi AUR tag (theme-color, description, apple-mobile-web-app-title,
   apple-mobile-web-app-status-bar-style) dene par exception aata hai:
       "The meta tag you specified is not allowed in this context"
   ...aur POORA PAGE FAIL ho jata hai — doGet() hi error de deta hai.

   HAL:
     1. Server sirf ALLOWED tags add kare (ye helper).
     2. Baqi tags CLIENT-SIDE JS se inject hon ge (browser mein koi pabandi nahi)
        — dekhein Index.html aur Pwa_Shell.html.

   Naya meta tag add karte waqt: pehle yahan check karein, warna app down.
   ========================================================================== */
var GAS_ALLOWED_META = {
  'viewport': 1,
  'apple-mobile-web-app-capable': 1,
  'mobile-web-app-capable': 1,
  'google-site-verification': 1
};

/** Sirf allowed meta tag add karega; baqi chupke se skip (page down na ho) */
function addSafeMetaTag(out, name, content) {
  if (!out || !name) return out;
  if (!GAS_ALLOWED_META[String(name).toLowerCase()]) return out;  // skip: not allowed
  try { return out.addMetaTag(String(name), String(content)); }
  catch (e) { return out; }   // kabhi na ho, phir bhi page khul jaye
}

/* ==========================================================================
                                API ROUTER
   ========================================================================== */

var PUBLIC_ACTIONS = ['auth.login', 'system.ping', 'system.health', 'system.loginConfig'];
var __lastDoGetEvent = null;

/**
 * Single entry point for every client call.
 * @param {string} action  e.g. "items.list"
 * @param {Object} payload { token, ...params }
 * @param {Object} _event  doGet/doPost event for origin checks (optional)
 */
function api(action, payload, _event) {
  payload = payload || {};
  var started = new Date().getTime();
  var session = null;
  try {
    try {
      if (typeof Security !== 'undefined' && Security.assertRate) {
        var rlKey = payload.token ? 'api:tok:' + U.str(payload.token).slice(-12) : 'api:anon:' + U.str(action).slice(0,40);
        var lim = 1000; try{ var isExt = _event && _event.parameter && (_event.parameter._origin || _event.parameter._integrationKey); if(isExt) lim=60; }catch(e){} Security.assertRate(rlKey, lim, 60);
      }
    } catch (rlErr) { return U.fail(rlErr.message, 'RATE_LIMIT'); }
    if (action === 'auth.login' && payload.username) {
      try {
        if (typeof Security !== 'undefined' && Security.assertRate) {
          var lu = U.str(payload.username).toLowerCase().slice(0,40);
          Security.assertRate('login:' + lu, 5, 300, 'Too many login attempts for "' + lu + '" — 5 tries per 5 minutes. Please wait.');
        }
      } catch (rl2) { return U.fail(rl2.message, 'RATE_LIMIT'); }
    }
    if (_event && typeof Security !== 'undefined' && Security.checkExternal) {
      try { Security.checkExternal(_event, payload); } catch (gateErr) { return U.fail(gateErr.message, 'PERMISSION'); }
    }
    if (payload && (payload._integrationKey !== undefined || payload._origin)) {
      var needKey = false;
      try { needKey = String((DB.settings()['integration.requireToken'] || 'false')) === 'true'; } catch (e) {}
      if (needKey) {
        var cand = U.str(payload._integrationKey || payload.integrationKey || '');
        if (!cand) return U.fail('Integration API key required. Set it in Settings -> Backend & Integrations -> External frontends.', 'PERMISSION');
        if (typeof Integration !== 'undefined' && !Integration.verifyApiKey(cand)) return U.fail('Invalid integration API key.', 'PERMISSION');
      } else if (payload._integrationKey) {
        try {
          var has = false;
          try { has = !!PropertiesService.getScriptProperties().getProperty(Integration.PROP_API_KEY_HASH); } catch(e) {}
          if (has && typeof Integration !== 'undefined' && !Integration.verifyApiKey(payload._integrationKey)) {
            return U.fail('Invalid integration API key.', 'PERMISSION');
          }
        } catch (e2) {}
      }
    }
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      session = Auth.verify(payload.token);
      session.locationId = payload.locationId && Auth.canAccessLocation(session, payload.locationId)
        ? payload.locationId : session.defaultLocationId;
      payload.__session = session;
    }
    /* v2.28.0 (W5) — GLOBAL FIELD VISIBILITY: ek hi jagah se sab routes par.
       Spec §9: sensitive fields backend/API par roke jayein, sirf CSS se chhupaye
       na jayein. Incoming payload bhi scrub hota hai (hidden field bhej kar bhi
       badla nahi ja sakta). */
    if (typeof Fields !== 'undefined') {
      try { payload = Fields.scrub(action, payload, session); } catch (eScrub) { Logger.log('FIELDS scrub failed [' + action + ']: ' + eScrub.message); }
    }
    var fn = ROUTES[action];
    if (!fn) return U.fail('Unknown action: ' + action, 'NO_ROUTE');
    var data = fn(payload, session);
    if (typeof Fields !== 'undefined') {
      try { data = Fields.wrap(action, data, session); } catch (eWrap) { Logger.log('FIELDS wrap failed [' + action + ']: ' + eWrap.message); }
    }
    return U.ok(data, { action: action, ms: new Date().getTime() - started });
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    if (msg === 'SESSION_EXPIRED' || msg === 'NO_SESSION') {
      return U.fail('Session expire ho gaya. Dobara login karein.', 'SESSION_EXPIRED');
    }
    if (typeof Security !== 'undefined' && Security.sanitizeError) {
      var safe = Security.sanitizeError(err, session, action);
      Logger.log('API ERROR [' + action + ']: ' + msg + ' -> sanitized: ' + safe + '\n' + (err.stack || ''));
      return U.fail(safe, 'SERVER_ERROR');
    }
    Logger.log('API ERROR [' + action + ']: ' + msg + '\n' + (err.stack || ''));
    return U.fail(msg, 'SERVER_ERROR');
  }
}

/**
 * JSONP bridge for externally hosted PWA (Netlify / Vercel / GitHub Pages).
 * GET only — is liye payload chhota rakhein (URL limit ~2 KB).
 *
 * SECURITY: `cb` user ke control mein hai aur jawab `application/javascript`
 * ke tor par CHALEGA — is liye sirf `[A-Za-z0-9_$.]` allow hai.
 * Bina is ke `?cb=alert(1)//` se XSS ho sakta hai.
 */
function jsonp(a, p, cb, _evt) {
  var evt = _evt || __lastDoGetEvent;
  var safe = U.str(cb).replace(/[^A-Za-z0-9_$.]/g, '');
  if (!safe) safe = 'callback';
  var payload = {};
  try { payload = p ? JSON.parse(p) : {}; } catch (e) { payload = {}; }
  try {
    if (evt && evt.parameter && (evt.parameter._origin || evt.parameter.origin || evt.parameter._integrationKey || evt.parameter.integrationKey)) {
      if (!payload._origin && evt.parameter._origin) payload._origin = U.str(evt.parameter._origin);
      if (!payload._origin && evt.parameter.origin) payload._origin = U.str(evt.parameter.origin);
      if (!payload._integrationKey && evt.parameter._integrationKey) payload._integrationKey = U.str(evt.parameter._integrationKey);
      if (!payload._integrationKey && evt.parameter.integrationKey) payload._integrationKey = U.str(evt.parameter.integrationKey);
    }
  } catch (e) {}
  try {
    if (typeof Security !== 'undefined' && Security.assertRate) {
      Security.assertRate('jsonp:' + U.str(a).slice(0,30), 60, 60, 'Too many external requests — please wait.');
    }
  } catch (rlE) {
    var bodyRl = safe + '(' + JSON.stringify(U.fail(rlE.message, 'RATE_LIMIT')).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\//g, '<\\/') + ');';
    return ContentService.createTextOutput(bodyRl).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  var result;
  try { result = api(a, payload, evt); }
  catch (err) {
    var m = err && err.message ? err.message : String(err);
    if (typeof Security !== 'undefined' && Security.sanitizeError) m = Security.sanitizeError(err, null, a);
    result = U.fail(U.str(m), 'SERVER_ERROR');
  }
  var body = safe + '(' + JSON.stringify(result)
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
    .replace(/<\//g, '<\\/') + ');';
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* Also expose doPost so external clients can POST (falls back gracefully) */
function doPost(e) {
  /* v2.5: gateway callbacks (EasyPaisa IPN / JazzCash post-back) bhi isi
     entry point se aate hain — JSON ho ya form-encoded, dono handle hote hain. */
  var raw = (e && e.postData && e.postData.contents) || '';
  var ctype = U.str(e && e.postData && e.postData.type).toLowerCase();
  var body = null;
  try { body = JSON.parse(raw); } catch (err) { body = null; }
  if (!body || typeof body !== 'object') {
    body = {};
    if (ctype.indexOf('form') > -1 || raw.indexOf('=') > -1) {
      U.str(raw).split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) body[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
      });
    }
  }
  if (body && (body.__ipn === '1' || body.pp_TxnRefNo || body.transactionStatus)) {
    var out2;
    try { out2 = U.ok(Wallet.ipn(body, null)); }
    catch (err2) { out2 = U.fail(String(err2 && err2.message || err2)); }
    return ContentService.createTextOutput(JSON.stringify(out2))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var out;
  try {
    // attach origin hints from post for external gate
    try {
      if (e && e.parameter) {
        if (!body._origin && e.parameter._origin) body._origin = U.str(e.parameter._origin);
        if (!body._origin && e.parameter.origin) body._origin = U.str(e.parameter.origin);
      }
    } catch (e2) {}
    out = api(body.action, body.payload, e);
  } catch (err) {
    var mm = err && err.message ? err.message : String(err);
    if (typeof Security !== 'undefined' && Security.sanitizeError) mm = Security.sanitizeError(err, null, body.action);
    out = U.fail(String(mm));
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
                              ROUTE TABLE
   ========================================================================== */

var ROUTES = {

  /* ------------------------------ system -------------------------------- */
  /* v2.28.0 (W5) — field visibility matrix (spec §9): kaun sa role kaun si
     family dekh sakta hai + us ka permission key (Users & Security tab) */
  'fields.matrix': function (p, s) { return Fields.matrix(p, s); },
  'system.ping': function (p) {
    return { pong: true, time: U.iso(), version: CONFIG.VERSION, provider: 'apps-script' };
  },
  /* v2.29.0 (W4) — date/time display policy (frontend ko wahi config milta hai
     jo backend use karta hai — ek hi system, do implementation nahi) */
  'system.dtconfig': function () { return U.dtConfig(); },
  'system.health': function () {
    return { status: 'ok', version: CONFIG.VERSION, rows: DB.stats(), cache: !!CacheService };
  },
  'system.loginConfig': function (p) {
    var show = 'true';
    try { var s=DB.settings(); if(s && s['login.showDemo']!==undefined) show=s['login.showDemo']; } catch(e){}
    return { showDemo: String(show)==='true' };
  },
  /* v2.8.4 — BOOT CONSOLIDATION (speed)
     Official best practice: "minimize calls to other services". Apps Script par
     har `google.script.run` round-trip ka apna ~0.5–2s overhead hai. Pehle app
     boot par 5-6 alag calls karti thi (bootstrap + ai.config + ai.suggest +
     notifications.summary + …). Ab ye sab AIK call mein aata hai — frontend
     purane routes bhi use kar sakta hai (additive, kuch hataya nahi gaya). */
  'system.bootstrap': function (p, s) {
    var rawSet = DB.settings();
    var safeSet = (typeof Security !== 'undefined' && Security.maskSettings) ? Security.maskSettings(rawSet) : rawSet;
    var out = {
      settings: safeSet,
      locations: DB.all('Locations').filter(function (l) { return U.str(l.active) !== 'false'; }),
      user: s,
      customerTypes: DB.all('CustomerTypes'),
      counts: { items: DB.count('Items'), customers: DB.count('Customers'), suppliers: DB.count('Suppliers') }
    };
    /* Optional extras — client bole to aik hi round-trip mein sab */
    if (p && p.include) {
      var want = U.str(p.include).split(',');
      if (want.indexOf('ai') > -1) {
        try { out.aiConfig = AI.getConfig(s); } catch (e) { out.aiConfig = null; }
        try { out.suggestions = AI.suggestions(s); } catch (e) { out.suggestions = []; }
      }
      if (want.indexOf('notifications') > -1) {
        try { out.notifications = Notifications.summary(s); } catch (e) { out.notifications = null; }
      }
      if (want.indexOf('cash') > -1) {
        try { out.cashSession = (typeof Cash !== 'undefined' && Cash.current) ? Cash.current(s) : null; }
        catch (e) { out.cashSession = null; }
      }
      if (want.indexOf('reorder') > -1) {
        try { out.reorder = Items.reorderSuggestion(s); } catch (e) { out.reorder = []; }
      }
    }
    return out;
  },
  'system.settings.get': function (p, s) { Auth.require(s, 'settings.view'); var raw = DB.settings(); return (typeof Security !== 'undefined' && Security.maskSettings) ? Security.maskSettings(raw) : raw; },
  'system.settings.save': function (p, s) {
    Auth.require(s, 'settings.manage');
    var vals = p.values || {};
    if (typeof Security !== 'undefined' && Security.stripSentinel) {
      try { vals = Security.stripSentinel(vals).values; } catch(e) {}
      if (!Object.keys(vals).length) { var raw0 = DB.settings(); return (typeof Security !== 'undefined' && Security.maskSettings) ? Security.maskSettings(raw0) : raw0; }
    }
    var saved = DB.setSettings(vals, s);
    Audit.log('SETTINGS_UPDATE', 'Settings', '', { values: saved.previous }, vals, s);
    var raw2 = DB.settings();
    return (typeof Security !== 'undefined' && Security.maskSettings) ? Security.maskSettings(raw2) : raw2;
  },

  /* -------------------------------- auth -------------------------------- */
  'auth.login': function (p) {
    return Auth.login(p.username, p.password, p.device || '');
  },
  'auth.logout': function (p) { return Auth.logout(p.token); },
  'auth.me': function (p, s) { return s; },
  'auth.refresh': function (p) { return Auth.refresh(p.token); },
  'auth.changePassword': function (p, s) { return Auth.changePassword(p.token, p.oldPassword, p.newPassword); },

  /* ------------------------------- users -------------------------------- */
  'users.perms': function (p, s) { return Auth.perms(p, s); },
  'users.perms.save': function (p, s) { return Auth.setPerms(p, s); },
  'users.perms.reset': function (p, s) { return Auth.resetPerms(p, s); },
  'users.list': function (p, s) { return Auth.listUsers(s); },
  'users.groups.list': function (p, s) { return Auth.listGroups(s); },
  'users.groups.save': function (p, s) { return Auth.saveGroup(p.group || p, s); },
  'users.create': function (p, s) { return Auth.createUser(p.user || p, s); },
  'users.update': function (p, s) { return Auth.updateUser(p.id, p.patch || p, s); },
  'users.matrix': function (p, s) { return Auth.permissionMatrix(); },

  /* ------------------------------ locations ----------------------------- */
  'locations.list': function (p, s) { return DB.all('Locations'); },
  'locations.save': function (p, s) {
    Auth.require(s, 'settings.manage');
    var rec = p.location || p;
    if (rec.id) return DB.update('Locations', rec.id, U.pick(rec, ['code', 'name', 'address', 'phone', 'manager', 'isDefault', 'active']), s);
    return DB.insert('Locations', U.pick(rec, ['code', 'name', 'address', 'phone', 'manager', 'isDefault', 'active']), s);
  },

  /* -------------------------------- items ------------------------------- */
  'items.uploadImage': function (p, s) { return Items.uploadImage(p, s); },
  'media.uploadLogo': function (p, s) { return uploadLogo(p, s); },
  'items.list': function (p, s) { return Items.list(p, s); },
  'items.search': function (p, s) { return Items.search(p, s); },
  'items.get': function (p, s) { return Items.get(p.id, p.withStock, s); },
  'items.save': function (p, s) { return Items.save(p.item || p, s); },
  'items.bulkSave': function (p, s) { return Items.bulkSave(p.items, s); },
  'items.delete': function (p, s) { return Items.remove(p.id, s); },
  'items.duplicates': function (p, s) { return Items.findDuplicates(s); },
  'items.changeCode': function (p, s) { return Items.changeCode(p.oldCode, p.newCode, s); },
  'items.setStatus': function (p, s) { return Items.setStatus(p.ids, p.status, s); },
  'items.prices.get': function (p, s) { return Items.getPrices(p.itemId, s); },
  'items.prices.save': function (p, s) { return Items.savePrices(p.itemId, p.prices, s); },
  'items.labels': function (p, s) { return Barcode.labelData(p.ids, p.templateId, s); },
  'items.byBarcode': function (p, s) { return Items.findByBarcode(p.code, s); },
  'items.reorderSuggest': function (p, s) { return Items.reorderSuggestion(s); },

  /* ------------------------------ inventory ----------------------------- */
  'stock.levels': function (p, s) { return Inventory.levels(p, s); },
  'stock.moves': function (p, s) { return Inventory.moves(p, s); },
  'stock.adjust.list': function (p, s) { return Inventory.listAdjustments(p, s); },
  'stock.adjust.save': function (p, s) { return Inventory.saveAdjustment(p.adjustment || p, s); },
  'stock.adjust.post': function (p, s) { return Inventory.postAdjustment(p.id, s); },
  'stock.adjust.reverse': function (p, s) { return Inventory.reverseAdjustment(p.id, s); },
  'stock.transfer.list': function (p, s) { return Inventory.listTransfers(p, s); },
  'stock.transfer.save': function (p, s) { return Inventory.saveTransfer(p.transfer || p, s); },
  'stock.transfer.receive': function (p, s) { return Inventory.receiveTransfer(p.id, s); },
  'stock.count': function (p, s) { return Inventory.quickCount(p, s); },

  /* -------------------------------- sales ------------------------------- */
  'sales.create': function (p, s) { return Sales.create(p.sale || p, s); },
  'sales.list': function (p, s) { return Sales.list(p, s); },
  'sales.get': function (p, s) { return Sales.get(p.id, s); },
  'sales.return': function (p, s) { return Sales.returnSale(p.record || p.return_ || p, s); },
  'sales.returns.list': function (p, s) { return Sales.listReturns(p, s); },
  'sales.hold': function (p, s) { return Sales.hold(p, s); },
  'sales.held.list': function (p, s) { return Sales.listHeld(s); },
  'sales.held.resume': function (p, s) { return Sales.resumeHeld(p.id, s); },
  'sales.void': function (p, s) { return Sales.voidSale(p.id, p.reason, s); },

  /* ----------------------------- purchase ------------------------------- */
  'purchase.po.get': function (p, s) { return Purchase.getPO(p.id || p.poId || p.grnId, s); },
  'purchase.grn.get': function (p, s) { return Purchase.getGRN(p.id || p.poId || p.grnId, s); },
  'purchase.supplierStatement': function (p, s) { return Purchase.supplierStatement(p, s); },
  'purchase.po.list': function (p, s) { return Purchase.listPO(p, s); },
  'purchase.po.save': function (p, s) { return Purchase.savePO(p.po || p, s); },
  'purchase.po.approve': function (p, s) { return Purchase.approvePO(p.id, s); },
  'purchase.grn.list': function (p, s) { return Purchase.listGRN(p, s); },
  /* v2.6 §3 — PO/GRN line ke liye live price context (pichhli rate + retail/wholesale) */
  'purchase.priceInfo': function (p, s) { return Purchase.priceInfo(p, s); },
  'purchase.supplierCompare': function (p, s) { return Purchase.supplierCompare(p, s); },
  'sales.itemActivity': function (p, s) { return Sales.itemActivity(p, s); },
  'purchase.grn.save': function (p, s) { return Purchase.saveGRN(p.grn || p, s); },
  'purchase.returns.list': function (p, s) { return Purchase.listReturns(p, s); },
  /* ---- v2.6 §10/§11/§13 PWA (mobile apps) ---- */
  'pwa.bootstrap': function (p, s) { return Pwa.bootstrap(p, s); },
  'pwa.wh.receive': function (p, s) { return Pwa.whReceive(p, s); },
  'pwa.wh.putaway': function (p, s) { return Pwa.whPutaway(p, s); },
  'pwa.wh.count': function (p, s) { return Pwa.whCount(p, s); },
  'pwa.wh.transfer': function (p, s) { return Pwa.whTransfer(p, s); },
  'pwa.wh.po.get': function (p, s) { return Pwa.whPoGet(p, s); },
  'pwa.wh.count.get': function (p, s) { return Pwa.whCountGet(p, s); },
  'pwa.wh.audit': function (p, s) { return Pwa.whAudit(p, s); },
  'pwa.fo.order': function (p, s) { return Pwa.foOrder(p, s); },
  'pwa.sm.sell': function (p, s) { return Pwa.smSell(p, s); },
  'pwa.sm.collect': function (p, s) { return Pwa.smCollect(p, s); },
  'pwa.sync': function (p, s) { return Pwa.sync(p, s); },
  /* v2.6 §4 — print · export · share · duplicate */
  'purchase.po.duplicate': function (p, s) { return Purchase.duplicatePO(p.id, s); },
  'purchase.po.html': function (p, s) { return Exports.poHtml(Purchase.getPO(p.id, s)); },
  'purchase.po.pdf': function (p, s) { return Exports.poPdf(p.id, s); },
  'purchase.grn.html': function (p, s) { return Exports.grnHtml(Purchase.getGRN(p.id, s)); },
  'purchase.grn.pdf': function (p, s) { return Exports.grnPdf(p.id, s); },
  'purchase.return.save': function (p, s) { return Purchase.saveReturn(p.record || p, s); },

  /* ------------------------------ parties ------------------------------- */
  'customers.list': function (p, s) { return Parties.listCustomers(p, s); },
  'customers.save': function (p, s) { return Parties.saveCustomer(p.customer || p, s); },
  'customers.ledger': function (p, s) { return Parties.ledger('CUSTOMER', p.id, s); },
  'customers.types.list': function (p, s) { return DB.all('CustomerTypes'); },
  'parties.balance': function (p, s) { return Parties.summary(p.partyType || p.type || 'CUSTOMER', p.id || p.partyId); },
  'customers.types.save': function (p, s) { return Parties.saveCustomerType(p.type || p, s); },
  'suppliers.list': function (p, s) { return Parties.listSuppliers(p, s); },
  'suppliers.save': function (p, s) { return Parties.saveSupplier(p.supplier || p, s); },
  'suppliers.ledger': function (p, s) { return Parties.ledger('SUPPLIER', p.id, s); },

  /* ------------------------------ payments ------------------------------ */
  'payments.list': function (p, s) { return Payments.list(p, s); },
  'payments.create': function (p, s) { return Payments.create(p.payment || p, s); },

  /* ------------- v2.2: payment methods (banks / wallets / Raast / cheque) --- */
  'pay.methods': function (p, s) { return PayMethods.all(s); },
  'pay.methods.enabled': function (p, s) { return PayMethods.enabled(s); },
  'pay.compute': function (p, s) { return PayMethods.compute(p.amount, p.method, s, p.date); },
  'pay.validate': function (p, s) { return PayMethods.validate(p.payment || p); },
  'pay.fields': function (p, s) { return PayMethods.fieldsFor(p.method); },
  'pay.cheques': function (p, s) { return PayMethods.cheques(p, s); },
  'pay.cheque.clear': function (p, s) { return PayMethods.clear(p, s); },
  'pay.reconcile': function (p, s) { return PayMethods.reconcile(p, s); },

  /* ------------- v2.3: comms (WhatsApp / SMS / Email) --------------------- */
  'comms.providers': function (p, s) { return Comms.providers(s); },
  'comms.templates': function (p, s) { return Comms.templates(); },
  'comms.prepare': function (p, s) { return Comms.prepare(p, s); },
  'comms.send': function (p, s) { return Comms.send(p, s); },
  'comms.shareInvoice': function (p, s) { return Comms.shareInvoice(p, s); },
  'comms.outbox': function (p, s) { return Comms.outbox(p, s); },
  'comms.retry': function (p, s) { return Comms.retry(p, s); },

  /* ------------- v2.3: exports (PDF / Excel / CSV / print) ---------------- */
  'exports.report': function (p, s) { return Exports.report(p, s); },
  'exports.payload': function (p, s) { return Exports.payload(p, s); },
  'exports.invoicePdf': function (p, s) { return Exports.invoicePdf(p.id, s); },
  'exports.sheet': function (p, s) { return Exports.sheet(p.rows || [], p.headers, p.name); },

  /* ------------- v2.3: loyalty points ------------------------------------- */
  'loyalty.summary': function (p, s) { return Loyalty.summary(p.customerId, p.total); },
  'loyalty.balance': function (p, s) { return { customerId: p.customerId, balance: Loyalty.balance(p.customerId) }; },
  'loyalty.redeem': function (p, s) { return Loyalty.redeem(p, s); },
  'loyalty.adjust': function (p, s) { return Loyalty.adjust(p, s); },
  'loyalty.history': function (p, s) { return Loyalty.history(p, s); },

  /* ------------- v2.3: supplier price-list import ------------------------- */
  'priceimport.preview': function (p, s) { return PriceImport.preview(p, s); },
  'priceimport.apply': function (p, s) { return PriceImport.apply(p, s); },
  'priceimport.history': function (p, s) { return PriceImport.history(p, s); },
  'priceimport.gmail': function (p, s) { return PriceImport.gmail(p, s); },
  'priceimport.sample': function (p, s) {
    return 'code,name,brand,cost,retail,wholesale,barcode\nBRK-001,Brake Pad Set,Bosch,620,800,760,8964000123456\nOIL-001,Engine Oil 20W-50,Caltex,980,1200,1150,8964000987654';
  },

  /* ------------- v2.3: Firebase migration path ---------------------------- */
  'migration.assess': function (p, s) { return Migration.assess(s); },
  'migration.plan': function (p, s) { return Migration.plan(s); },
  'migration.export': function (p, s) { return Migration.export(p, s); },
  'migration.sync': function (p, s) { return Migration.sync(p, s); },
  'migration.status': function (p, s) { return Migration.status(s); },
  'migration.log': function (p, s) { return Migration.log(p, s); },
  'expenses.list': function (p, s) { return Payments.listExpenses(p, s); },
  'expenses.create': function (p, s) { return Payments.createExpense(p.expense || p, s); },
  'expenses.approve': function (p, s) { return Payments.approveExpense(p.id, p.approve !== false, s); },
  /* W7 (v2.26.0) — batch: ek request mein kai expenses (N+1 ka ilaj) */
  'expenses.approveBatch': function (p, s) { return Payments.approveExpenseBatch(p.ids || [], p.approve !== false, s); },
  'cash.session.summary': function (p, s) { return Payments.sessionSummary(p, s); },
  'cash.move': function (p, s) { return Payments.cashMove(p, s); },
  'cash.session.history': function (p, s) { return Payments.sessionHistory(p, s); },
  'cash.session.open': function (p, s) { return Payments.openSession(p, s); },
  'cash.session.current': function (p, s) { return Payments.currentSession(p.locationId, s); },
  'cash.session.close': function (p, s) { return Payments.closeSession(p, s); },
  'shop.dayReport': function (p, s) { return Payments.dayReport(p, s); },
  /* v2.30.0 — SHOP SESSION RULES (login ke baad shop OPEN lazmi) */
  'shop.status': function (p, s) { return Shop.status(p, s); },
  'shop.open': function (p, s) { return Shop.open(p, s); },
  'shop.close': function (p, s) { return Shop.close(p, s); },
  'shop.lastReport': function (p, s) { return Shop.lastReport(p, s); },
  'shop.seedStatus': function (p, s) { Auth.require(s, 'settings.view'); return Shop.seeded(); },
  'system.setupStatus': function (p, s) { return Setup.wizardStatus(p, s); },
  'system.wizardSave': function (p, s) { return Setup.wizardSave(p, s); },
  'system.wizardAdminPassword': function (p, s) { return Setup.wizardSetAdminPassword(p, s); },
  'setup.diag': function (p, s) { Auth.require(s, 'settings.view'); return Setup.diagnostics(p, s); },
  /* demo data visibility + cleanup (Settings ▸ Demo Data) */
  'admin.demoStats': function (p, s) { return Shop.demoStats(p, s); },
  'admin.removeDemoData': function (p, s) { return Shop.removeDemoData(p, s); },
  'admin.seedDemoData': function (p, s) { Auth.require(s, 'settings.manage'); return Setup.seedDemoData({ force: true }); },
  'shop.dayReport.pdf': function (p, s) { return Exports.dayReportPdf(p.sessionId || p.id, s); },

  /* ------------------------------- reports ------------------------------ */
  /* --------------------- v2.5 ACCOUNTING ---------------------- */
  'accounts.list': function (p, s) { return Accounting.listAccounts(p, s); },
  'accounts.save': function (p, s) { return Accounting.saveAccount(p, s); },
  'accounts.seed': function (p, s) { Auth.require(s, 'settings.manage'); return { created: Accounting.seedAccounts(s) }; },
  'journal.post': function (p, s) { return Accounting.postJournal(p, s); },
  'journal.list': function (p, s) { return Accounting.listJournals(p, s); },
  'journal.get': function (p, s) { return Accounting.getJournal(p.id, s); },
  'journal.void': function (p, s) { return Accounting.voidJournal(p.id, s); },
  'accounting.ledger': function (p, s) { return Accounting.ledger(p, s); },
  'accounting.cashBook': function (p, s) { return Accounting.cashBook(p, s); },
  'accounting.bankBook': function (p, s) { return Accounting.bankBook(p, s); },
  'accounting.dayBook': function (p, s) { return Accounting.dayBook(p, s); },
  'accounting.trialBalance': function (p, s) { return Accounting.trialBalance(p, s); },
  'accounting.profitLoss': function (p, s) { return Accounting.profitLoss(p, s); },
  'accounting.balanceSheet': function (p, s) { return Accounting.balanceSheet(p, s); },
  'accounting.dashboard': function (p, s) { return Accounting.dashboard(p, s); },
  'accounting.stockValue': function (p, s) { return { value: Accounting.stockValue(s) }; },
  'accounting.backfill': function (p, s) { return Accounting.backfill(p, s); },
  'bank.recon.list': function (p, s) { return Accounting.reconList(p, s); },
  'bank.recon.import': function (p, s) { return Accounting.reconImport(p, s); },
  'bank.recon.match': function (p, s) { return Accounting.reconMatch(p, s); },
  'bank.recon.clear': function (p, s) { return Accounting.reconClear(p, s); },
  /* v2.5: wallet gateway (EasyPaisa / JazzCash) */
  'wallet.providers': function (p, s) { return Wallet.providers(p, s); },
  'wallet.initiate': function (p, s) { return Wallet.initiate(p, s); },
  'wallet.inquire': function (p, s) { return Wallet.inquire(p, s); },
  'wallet.list': function (p, s) { return Wallet.list(p, s); },
  'wallet.poll': function (p, s) { return Wallet.poll(p, s); },
  'wallet.link': function (p, s) { return Wallet.link(p, s); },
  'wallet.manual': function (p, s) { return Wallet.manual(p, s); },
  'wallet.checkout': function (p, s) { return Wallet.checkout(p, s); },
  'wallet.fees': function (p, s) { return Wallet.fees(p, s); },
  'wallet.summary': function (p, s) { return Wallet.summary(p, s); },

  /* v2.5: order book — mobile order taking */
  'orders.save': function (p, s) { return Orders.save(p.order || p, s); },
  'orders.get': function (p, s) { return Orders.get(p, s); },
  'orders.list': function (p, s) { return Orders.list(p, s); },
  'orders.status': function (p, s) { return Orders.status(p, s); },
  'orders.convert': function (p, s) { return Orders.convert(p, s); },
  'orders.remove': function (p, s) { return Orders.remove(p, s); },
  'orders.summary': function (p, s) { return Orders.summary(p, s); },

  'reports.dashboard': function (p, s) { return Reports.dashboard(p, s); },
  'reports.sales': function (p, s) { return Reports.sales(p, s); },
  'reports.salesByItem': function (p, s) { return Reports.salesByItem(p, s); },
  'reports.salesByCategory': function (p, s) { return Reports.salesByCategory(p, s); },
  'reports.inventoryValuation': function (p, s) { return Reports.inventoryValuation(p, s); },
  'reports.lowStock': function (p, s) { return Reports.lowStock(p, s); },
  'reports.profit': function (p, s) { return Reports.profit(p, s); },
  'reports.receivables': function (p, s) { return Reports.receivables(p, s); },
  'reports.payables': function (p, s) { return Reports.payables(p, s); },
  'reports.partyBalances': function (p, s) { return Reports.partyBalances(p, s); },
  'reports.stockMovement': function (p, s) { return Reports.stockMovement(p, s); },
  'reports.cashbook': function (p, s) { return Reports.cashbook(p, s); },
  'reports.export': function (p, s) { return Reports.exportCsv(p, s); },
  /* v2.6 §9 — report engine: ~54 reports ek hi code path se */
  /* v2.6 §12 — salesman stock & settlement (consignment) */
  'salesman.list': function (p, s) { return Salesman.list(p, s); },
  'salesman.stock': function (p, s) { return Salesman.stock(p, s); },
  'salesman.summary': function (p, s) { return Salesman.summary(p, s); },
  'salesman.issue': function (p, s) { return Salesman.issue(p, s); },
  'salesman.issue.get': function (p, s) { return Salesman.getIssue(p.id, s); },
  'salesman.issues': function (p, s) { return Salesman.listIssues(p, s); },
  'salesman.return': function (p, s) { return Salesman.returnStock(p, s); },
  'salesman.returns': function (p, s) { return Salesman.listReturns(p, s); },
  'salesman.settle': function (p, s) { return Salesman.settle(p, s); },
  'salesman.settlements': function (p, s) { return Salesman.listSettlements(p, s); },
  'salesman.settlement.get': function (p, s) { return Salesman.getSettlement(p.id, s); },
  'salesman.visits': function (p, s) { return Salesman.listVisits(p, s); },
  'salesman.visit.log': function (p, s) { return Salesman.logVisit(p, s); },
  /* v2.9 §12 — route management (area + customers + days per salesman) */
  'salesman.routes': function (p, s) { return Salesman.listRoutes(p, s); },
  'salesman.route.save': function (p, s) { return Salesman.saveRoute(p.route || p, s); },
  'salesman.route.delete': function (p, s) { return Salesman.deleteRoute(p, s); },
  /* v2.9.2 — salesman stock overhaul: trace / return guard / ledger / performance / wasooli */
  'salesman.trace': function (p, s) { return Salesman.issueTrace(p, s); },
  'salesman.issuesForReturn': function (p, s) { return Salesman.issuesForReturn(p, s); },
  'salesman.return.get': function (p, s) { return Salesman.getReturn(p.id, s); },
  'salesman.performance': function (p, s) { return Salesman.performance(p, s); },
  'salesman.ledger': function (p, s) { return Salesman.ledger(p, s); },
  'salesman.collect': function (p, s) { return Salesman.collectPayment(p.payment || p, s); },
  'salesman.payments': function (p, s) { return Salesman.paymentHistory(p, s); },
  'reports.catalog': function (p, s) { return ReportEngine.groups(s); },
  'reports.run': function (p, s) { return ReportEngine.run(p, s); },
  'reports.runCsv': function (p, s) { return ReportEngine.exportCsv(p, s); },
  /* v2.6 §7 — auto day report on shop open/close + history */
  'dayreport.generate': function (p, s) { return Reports.dayReport.generate(p, s); },
  'dayreport.list': function (p, s) { return Reports.dayReport.list(p, s); },
  'dayreport.get': function (p, s) { return Reports.dayReport.get(p, s); },
  'dayreport.html': function (p, s) { return Reports.dayReport.html(p, s); },
  'dayreport.pdf': function (p, s) { return Reports.dayReport.pdf(p, s); },
  'dayreport.csv': function (p, s) { return Reports.dayReport.csv(p, s); },
  'exports.pdf': function (p, s) { return Exports.htmlToPdf(p, s); },

  /* --------------------------------- AI --------------------------------- */
  'ai.chat': function (p, s) { return AI.chat(p, s); },
  'ai.threads': function (p, s) { return AI.threads(s); },
  /* ------------- v2.2: AI agent configuration (professional) -------------- */
  'ai.agentConfig': function (p, s) { return AI.agentConfig(s); },
  'ai.agentConfig.save': function (p, s) { return AI.saveAgentConfig(p, s); },
  'ai.test': function (p, s) { return AI.testConnection(p, s); },
  'ai.usage': function (p, s) { return AI.usage(s); },
  'ai.presets': function (p, s) { return AI_PRESETS; },
  'ai.providers': function (p, s) { return AI.providers(); },
  'ai.tools': function (p, s) { return AI.tools(); },
  'ai.autoConfigure': function (p, s) { return AI.autoConfigure(p, s); },
  'ai.routing.save': function (p, s) { return AI.saveRouting(p, s); },
  'ai.setKey': function (p, s) {
    Auth.require(s, 'settings.manage');
    var id=U.str(p.provider || DB.settings().aiProvider || 'GEMINI').toUpperCase();
    if(AI_PROVIDERS.indexOf(id)<0) throw new Error('Unknown provider');
    AI.getKey();
    PropertiesService.getScriptProperties().setProperty('AI_KEY_'+id,U.str(p.key).trim());
    var pf=AI.providerProfile(id), updates={};
    updates['ai.profile.'+id]=JSON.stringify({model:pf.model,endpoint:pf.endpoint,enabled:pf.enabled,lastTest:null});
    DB.setSettings(updates,s); CacheService.getScriptCache().remove(AI.cooldownKey(id));
    return AI.getConfig(s);
  },
  'ai.models': function (p, s) { return AI.modelOptions(s); },
  'ai.models.refresh': function (p, s) { return AI.discoverModels({ provider: p.provider, refresh: true }, s); },
  'ai.clear': function (p, s) { return AI.clear(s); },
  'ai.suggest': function (p, s) { return AI.suggestions(s); },
  'ai.config': function (p, s) { return AI.getConfig(s); },

  /* ------------------------------- barcode ------------------------------ */
  'barcode.generate': function (p, s) { return Barcode.generate(p, s); },
  'barcode.lookup': function (p, s) { return Items.findByBarcode(p.code, s); },

  /* ------------------------------- audit -------------------------------- */
  'audit.search': function (p, s) { return Audit.search(p, s); },
  'audit.trail': function (p, s) { return Audit.trail(p.entity, p.entityId, s); },

  /* ------------------------------ offline sync -------------------------- */
  'offline.sync': function (p, s) { return OfflineSync.process(p, s); },
  'offline.pull': function (p, s) { return OfflineSync.pull(p, s); },

  /* ------------------------------ utilities ----------------------------- */
  'utils.backup': function (p, s) { return Utilities_.backup(s); },
  'utils.stats': function (p, s) { return DB.stats(); },
  'utils.reindex': function (p, s) { Auth.require(s, 'settings.manage'); return Setup.reindex(p.entity); },
  'utils.deleteData': function (p, s) { Auth.require(s, 'settings.manage'); return Setup.deleteData(p.entity, p.olderThanDays); },

  /* ================================ CONFIG ================================= */
  'config.all': function (p, s) { var raw = Config.all(s); return (typeof Security !== 'undefined' && Security.maskSettings) ? Security.maskSettings(raw) : raw; },
  'config.defs': function (p, s) { return Config.defs(s); },
  'config.save': function (p, s) { return Config.save(p.values || {}, s); },
  'config.resetGroup': function (p, s) { return Config.resetGroup(p.group, s); },
  'config.get': function (p, s) { return Config.get(p.key, p.def, s); },

  'config.list': function (p, s) { return Config.list(p.entity, s, p); },
  'config.list.save': function (p, s) { return Config.saveList(p.entity, p.record || p, s); },
  'config.list.remove': function (p, s) { return Config.removeList(p.entity, p.id, s); },

  'config.fields.list': function (p, s) {
    return p.entity ? Config.customFields(p.entity, s) : Config.allCustomFields(s);
  },
  'config.fields.save': function (p, s) { return Config.saveCustomField(p.field || p, s); },
  'config.fields.remove': function (p, s) { return Config.removeCustomField(p.id, s); },

  'config.menu': function (p, s) { return Config.menu(s); },
  'config.menu.save': function (p, s) { return Config.saveMenuItem(p.item || p, s); },
  'config.menu.remove': function (p, s) { return Config.removeMenuItem(p.id, s); },
  'config.menu.reset': function (p, s) { return Config.resetMenu(s); },

  'config.templates': function (p, s) { return Config.templates(p.type, s); },
  'config.templates.save': function (p, s) { return Config.saveTemplate(p.template || p, s); },
  /* v2.7 BUG FIX — pehle ye route maujood hi nahi tha: delete button chalta
     to 'NO_ROUTE' aata, frontend chhupa deta aur "Deleted" keh deta. */
  'config.templates.remove': function (p, s) { return Config.removeTemplate(p.id, s); },

  /* ---------------- v2.2: print engine (sizes / templates / ESC-POS) ------- */
  'print.sizes': function (p, s) { return Print.sizes(); },
  'print.fieldSchema': function (p, s) { return Print.fieldSchema(p.type || 'RECEIPT'); },
  'print.defaultTemplate': function (p, s) { return Print.defaultTemplate(p.type || 'RECEIPT', p.paper); },
  'print.resolve': function (p, s) { return Print.resolve(p.type || 'RECEIPT', p.templateId, p.paper, s); },
  'print.escpos': function (p, s) {
    Auth.require(s, 'sales.view');
    var sale = Sales.get(p.id, s);
    var tpl = Print.resolve('RECEIPT', p.templateId, p.paper, s);
    var loc = DB.byId('Locations', sale.locationId) || {};
    var out = Print.escpos({ sale: sale, template: tpl, settings: DB.settings(), branchName: loc.name || '' });
    return { base64: out.base64, bytes: out.bytes.length, cols: out.cols, size: out.size };
  },

  'config.views.list': function (p, s) { return Config.savedViews(p.screen, s); },
  'config.views.save': function (p, s) { return Config.saveView(p.view || p, s); },
  'config.views.remove': function (p, s) { return Config.removeView(p.id, s); },

  /* =============================== WAREHOUSE =============================== */
  'warehouse.overview': function (p, s) { return Warehouse.overview(p.locationId || s.locationId, s); },
  'warehouse.list': function (p, s) { return Warehouse.warehouses(p.locationId, s); },
  'warehouse.save': function (p, s) { return Warehouse.saveWarehouse(p.warehouse || p, s); },
  'warehouse.bins': function (p, s) { return Warehouse.bins(p, s); },
  'warehouse.bin.save': function (p, s) { return Warehouse.saveBin(p.bin || p, s); },
  'warehouse.stockByBin': function (p, s) { return Warehouse.stockByBin(p, s); },
  'warehouse.putaway': function (p, s) { return Warehouse.putaway(p.itemId, p.binId, s); },
  'warehouse.binTransfer': function (p, s) { return Warehouse.binTransfer(p, s); },
  'warehouse.countSheet': function (p, s) { return Warehouse.countSheet(p, s); },
  'warehouse.lots': function (p, s) { return Warehouse.lots(p, s); },
  'warehouse.lot.receive': function (p, s) { return Warehouse.receiveLot(p, s); },
  /* v2.5: dedicated warehouse app — cycle counts + stock audit */
  'warehouse.count.create': function (p, s) { return Warehouse.countCreate(p, s); },
  'warehouse.count.get': function (p, s) { return Warehouse.countGet(p, s); },
  'warehouse.count.list': function (p, s) { return Warehouse.countList(p, s); },
  'warehouse.count.setQty': function (p, s) { return Warehouse.countSetQty(p, s); },
  'warehouse.count.bulk': function (p, s) { return Warehouse.countBulk(p, s); },
  'warehouse.count.post': function (p, s) { return Warehouse.countPost(p, s); },
  'warehouse.count.cancel': function (p, s) { return Warehouse.countCancel(p, s); },
  'warehouse.audit': function (p, s) { return Warehouse.audit(p, s); },

  /* ============================= NOTIFICATIONS ============================= */
  'notifications.list': function (p, s) { return Notifications.list(p, s); },
  'notifications.summary': function (p, s) { return Notifications.summary(s); },
  'notifications.read': function (p, s) { return Notifications.markRead(p.id, s); },
  'notifications.readAll': function (p, s) { return Notifications.markAllRead(s); },
  'notifications.generate': function (p, s) { return Notifications.generate(s); },
  'notifications.clear': function (p, s) { return Notifications.clear(s); },

  /* ================================ SETUP ================================== */
  'setup.seedProducts': function (p, s) { return Setup.seedProducts(p.opts || {}); },
  /* v2.5.2: CSV catalogue ↔ Items sheet ka milan (dry run, kuch write nahi) */
  'setup.auditProducts': function (p, s) { return Setup.auditProducts(); },
  'setup.health': function (p, s) { Auth.require(s, 'settings.view'); return Setup.schemaHealth(s); },
  'setup.repair': function (p, s) { return Setup.repair(s); },
  'items.facets': function (p, s) { return Items.facets(); },
  /* v2.7 BUG FIX — App_Warehouse.html is action ko call karta tha magar
     route maujood nahi tha: warehouse filter ki category dropdown hamesha
     khali rehti thi (aur `.catch(()=>{})` error chhupa deta tha). */
  'items.categories': function (p, s) {
    var out = {};
    try {
      DB.all('Categories').forEach(function (c) { if (c && c.name) out[String(c.name)] = 1; });
    } catch (e) { /* Categories sheet abhi bani hi nahi ho to chhoren */ }
    try {
      (Items.facets().categories || []).forEach(function (c) { if (c) out[String(c)] = 1; });
    } catch (e) { }
    return Object.keys(out).sort();
  },
  'reorder.suggest': function (p, s) { return Reorder.suggest(p, s); },
  'reorder.createPOs': function (p, s) { return Reorder.createPOs(p, s); },
  'reorder.run': function (p, s) { return Reorder.run(p, s); },

  /* --------------------- customer demands & AI recommendations --------------- */
  'demand.create': function (p, s) { return CustomerDemands.create(p.demand || p, s); },
  'demand.list': function (p, s) { return CustomerDemands.list(p, s); },
  'demand.get': function (p, s) { return CustomerDemands.get(p.id, s); },
  'demand.update': function (p, s) { return CustomerDemands.update(p.id, p.patch || p, s); },
  'demand.setStatus': function (p, s) { return CustomerDemands.setStatus(p.id, p.status, p.note, s); },
  'demand.cancel': function (p, s) { return CustomerDemands.cancel(p.id, p.reason || p.note, s); },
  'demand.linkPO': function (p, s) { return CustomerDemands.linkToPO(p.demandIds || p.ids, p.poId || p.id, s); },
  'demand.unlinkPO': function (p, s) { return CustomerDemands.unlinkFromPO(p.demandId || p.id, p.poId, s); },
  'demand.suggestForPO': function (p, s) { return CustomerDemands.suggestForPO(p, s); },
  'demand.vendorSuggest': function (p, s) { return CustomerDemands.suggestVendors(p, s); },
  'demand.posRecommend': function (p, s) { return CustomerDemands.posRecommend(p, s); },
  'demand.dashboard': function (p, s) { return CustomerDemands.dashboard(p, s); },
  'demand.reports': function (p, s) { return CustomerDemands.reports(p, s); },
  'demand.monitor': function (p, s) { return CustomerDemands.monitor(s); },

  /* --------------------- v2.1: scheduled jobs / triggers ------------------ */
  'system.triggers.status': function (p, s) {
    if (s) Auth.require(s, 'settings.view');
    return Triggers.status(p || {}, s);
  },
  'system.triggers.install': function (p, s) { return Triggers.install(p || {}, s); },
  'system.triggers.remove': function (p, s) { return Triggers.remove(p || {}, s); },
  'system.triggers.runNow': function (p, s) {
    Auth.require(s, 'purchase.view');
    return Triggers.dailyReorder(p || {});
  },
  'system.jobs.runAlerts': function (p, s) {
    Auth.require(s, 'dashboard.view');
    return Triggers.dailyAlerts();
  },
  'system.jobs.runDemands': function (p, s) {
    Auth.require(s, 'demand.view');
    return Triggers.dailyDemand();
  },
  'lang.all': function (p, s) { return Lang.all(s); },
  'lang.dict': function (p, s) { return Lang.dict(p.lang || 'en', s); },
  'lang.save': function (p, s) { return Lang.save(p.row || p, s); },
  'lang.remove': function (p, s) { return Lang.remove(p.id, s); },
  'lang.seed': function (p, s) { Auth.require(s, 'settings.manage'); return Lang.seed(s); },
  'lang.reset': function (p, s) { return Lang.reset(s); },
  'lang.auto': function (p, s) { return Lang.auto(p, s); },
  /* v2.1: per-user language + personal translation overrides */
  'lang.prefs': function (p, s) { return Lang.prefs(s); },
  'lang.prefs.save': function (p, s) { return Lang.savePrefs(p.prefs || p, s); },
  'lang.myOverrides': function (p, s) { return Lang.myOverrides(s); },
  'commissions.summary': function (p, s) { return Commissions.summary(p, s); },
  'commissions.pay': function (p, s) { return Commissions.pay(p.salespersonId, p.amount, p.method, s); },

  /* ================= v2.24 — BACKEND & INTEGRATIONS (owner-configurable) ================= */
  'integration.config.get': function (p, s) { return Integration.getConfig(s); },
  'integration.config.save': function (p, s) { return Integration.saveConfig(p.values || p, s); },
  'integration.test': function (p, s) { return Integration.test(p, s); },
  'integration.diag': function (p, s) { return Integration.diag(p, s); },
  'system.diag': function (p, s) { Auth.require(s, 'settings.manage'); return Integration.diag(p, s); },
  'system.backend.test': function (p, s) { return Integration.test(p, s); },

};
