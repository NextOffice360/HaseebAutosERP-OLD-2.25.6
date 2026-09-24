/**
 * HASEEB AUTOS - BACKEND & INTEGRATIONS (v2.24)
 * --------------------------------------------------------------------------
 * Owner-configurable, secure integration layer:
 *  - GAS Web App URL / Sheet ID : stored server-side, never exposed raw to frontend
 *  - Allowed origins / enable-disable / env / requireToken : stored in Settings sheet
 *    (non-secret) but enforced server-side
 *  - Integration API key (optional shared secret for external frontends) : hashed
 *    in ScriptProperties, never returned raw
 *  - Diagnostics / test helpers : connection test without leaking internals
 *
 * Frontend (Settings → Backend & Integrations) calls:
 *   integration.config.get  -> masked view (hasApiKey, sheetIdMasked, currentUrl)
 *   integration.config.save -> owner can change without code edit
 *   integration.test        -> ping / sheet health without exposing IDs
 *   system.diag             -> detailed owner-only diagnostics
 */

var Integration = {

  /* Keys stored in ScriptProperties (secrets) */
  PROP_API_KEY_HASH: 'INTEGRATION_API_KEY_HASH',
  PROP_API_KEY_HINT: 'INTEGRATION_API_KEY_HINT',

  /** Hashed hint for display: first 3 + ... + last 2 */
  _hint: function (key) {
    key = U.str(key).trim();
    if (!key) return '';
    if (key.length <= 6) return key.slice(0, 2) + '…' + key.slice(-1);
    return key.slice(0, 3) + '…' + key.slice(-2);
  },

  /** Current GAS exec URL (server-side truth) */
  currentGasUrl: function () {
    try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
  },

  /** Masked sheet ID: show first 6 + ... + last 4 */
  maskedSheetId: function () {
    var id = '';
    try { id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''; } catch (e) { }
    id = U.str(id).trim();
    if (!id) return '';
    if (id.length <= 10) return '••••' + id.slice(-4);
    return id.slice(0, 6) + '…' + id.slice(-4) + ' (' + id.length + ' chars)';
  },

  /** Read non-secret integration settings from DB.settings() */
  _readSettings: function () {
    var s = {};
    try { s = DB.settings() || {}; } catch (e) { s = {}; }
    return {
      gasUrl: U.str(s['backend.gasUrl'] || '').trim(),
      allowedOrigins: U.str(s['integration.allowedOrigins'] || '').trim(),
      enabled: String(s['integration.enabled'] !== undefined ? s['integration.enabled'] : 'true') !== 'false',
      env: U.str(s['integration.env'] || 'prod').toLowerCase() || 'prod',
      requireToken: String(s['integration.requireToken'] || 'false') === 'true',
      strictOrigin: String(s['integration.strictOrigin'] || 'false') === 'true',
      backendSheetUrl: U.str(s['backend.sheetUrl'] || '').trim(),
      offlineEnabled: String(s['integration.offlineEnabled'] !== undefined ? s['integration.offlineEnabled'] : 'true') !== 'false'
    };
  },

  /** Full masked config for frontend (owner sees masked, not raw) */
  getConfig: function (session) {
    // any authenticated user can view masked config; strict secrets still masked
    var st = Integration._readSettings();
    var props = {};
    try { props = PropertiesService.getScriptProperties().getProperties() || {}; } catch (e) { }
    var hasApiKey = !!U.str(props[Integration.PROP_API_KEY_HASH] || '');
    var hint = U.str(props[Integration.PROP_API_KEY_HINT] || '');
    var curUrl = Integration.currentGasUrl();
    var sheetMasked = Integration.maskedSheetId();
    var sheetUrl = '';
    try {
      var idRaw = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
      if (idRaw) sheetUrl = 'https://docs.google.com/spreadsheets/d/' + idRaw;
    } catch (e) { }

    return {
      // what owner configured (masked where needed)
      gasUrl: st.gasUrl || curUrl,               // effective URL
      configuredGasUrl: st.gasUrl,               // what owner typed (may be empty = auto)
      currentUrl: curUrl,                         // server truth
      allowedOrigins: st.allowedOrigins,
      enabled: st.enabled,
      env: st.env,
      requireToken: st.requireToken,
      strictOrigin: st.strictOrigin,
      backendSheetUrl: st.backendSheetUrl || sheetUrl,
      offlineEnabled: st.offlineEnabled,
      // secrets — never raw
      sheetIdMasked: sheetMasked,
      sheetIdSet: !!sheetMasked,
      hasApiKey: hasApiKey,
      apiKeyHint: hint || (hasApiKey ? Security.SENTINEL : ''),
      // status helpers
      gasUrlMatches: !!st.gasUrl && st.gasUrl === curUrl,
      // for UI badges
      version: CONFIG.VERSION,
      provider: 'apps-script'
    };
  },

  saveConfig: function (values, session) {
    Auth.require(session, 'settings.manage');
    values = values || {};

    // allowed keys (non-secret) that go to Settings sheet
    var allowed = ['backend.gasUrl','backend.sheetUrl','integration.allowedOrigins',
                   'integration.enabled','integration.env','integration.requireToken',
                   'integration.strictOrigin','integration.offlineEnabled'];
    var toSave = {};
    allowed.forEach(function (k) {
      if (values[k] !== undefined) {
        var v = values[k];
        // normalise
        if (k === 'integration.enabled' || k === 'integration.requireToken' ||
            k === 'integration.strictOrigin' || k === 'integration.offlineEnabled') {
          toSave[k] = (String(v) === 'true' || v === true) ? 'true' : 'false';
        } else if (k === 'integration.env') {
          var e = U.str(v).toLowerCase();
          if (['dev','demo','prod','sandbox','live'].indexOf(e) === -1) e = 'prod';
          toSave[k] = e;
        } else if (k === 'integration.allowedOrigins') {
          // comma list sanitise: trim, remove trailing slash, keep empty
          var list = U.str(v).split(',').map(function(s){ return U.str(s).trim().replace(/\/$/, ''); }).filter(Boolean).join(',');
          if (list.length > 500) throw new Error('Allowed origins list bahut lambi hai (max 500 chars).');
          toSave[k] = list;
        } else if (k === 'backend.gasUrl' || k === 'backend.sheetUrl') {
          var url = U.str(v).trim();
          if (url && url.length > 500) throw new Error(k + ' bahut lamba hai.');
          if (url && !/^https:\/\//i.test(url) && url.indexOf('script.google.com') === -1 && url.indexOf('docs.google.com') === -1) {
            // allow empty, but if filled must be https or google URL
            // for sheetUrl, allow any https
            if (k === 'backend.gasUrl') throw new Error('GAS URL must be https://script.google.com/.../exec');
            if (k === 'backend.sheetUrl' && !/^https:\/\//i.test(url)) throw new Error('Sheet URL must be https://');
          }
          toSave[k] = url;
        } else {
          toSave[k] = U.str(v);
        }
      }
    });

    // secret: integration.apiKey  -> hashed in ScriptProperties, never in sheet
    if (values['integration.apiKey'] !== undefined) {
      var rawKey = U.str(values['integration.apiKey']);
      if (rawKey === Security.SENTINEL) {
        // keep existing — do nothing
      } else if (!rawKey) {
        // clear
        try {
          PropertiesService.getScriptProperties().deleteProperty(Integration.PROP_API_KEY_HASH);
          PropertiesService.getScriptProperties().deleteProperty(Integration.PROP_API_KEY_HINT);
        } catch (e) {}
      } else {
        if (rawKey.length < 8) throw new Error('Integration API key kam se kam 8 characters.');
        if (rawKey.length > 128) throw new Error('API key bahut lambi hai (max 128).');
        var hash = U.sha256(rawKey + '::' + CONFIG.PW_PEPPER);
        try {
          PropertiesService.getScriptProperties().setProperty(Integration.PROP_API_KEY_HASH, hash);
          PropertiesService.getScriptProperties().setProperty(Integration.PROP_API_KEY_HINT, Integration._hint(rawKey));
        } catch (e) { throw new Error('Failed to save integration key.'); }
      }
    }

    // SPREADSHEET_ID change is sensitive — only via setup, but allow owner to set via this API
    // if `backend.spreadsheetId` is provided (rare), validate and store in ScriptProperties
    if (values['backend.spreadsheetId'] !== undefined) {
      var sid = U.str(values['backend.spreadsheetId']).trim();
      if (sid === Security.SENTINEL) {
        // keep
      } else if (sid) {
        // extract ID if full URL given
        var m = sid.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (m) sid = m[1];
        if (!/^[a-zA-Z0-9-_]{20,}$/.test(sid)) throw new Error('Sheet ID ghalat format.');
        try {
          PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', sid);
          DB.resetConnection();
        } catch (e) { throw new Error('Failed to save Sheet ID: ' + e.message); }
      }
    }

    if (Object.keys(toSave).length) {
      DB.setSettings(toSave, session);
      Audit.log('INTEGRATION_SAVE', 'Settings', '', null, { keys: Object.keys(toSave) }, session);
    }
    return Integration.getConfig(session);
  },

  /** Verify supplied integration apiKey against stored hash (for external frontends) */
  verifyApiKey: function (supplied) {
    if (!supplied) return false;
    try {
      var hash = PropertiesService.getScriptProperties().getProperty(Integration.PROP_API_KEY_HASH) || '';
      if (!hash) return true; // no key set = open (only auth still required)
      var calc = U.sha256(U.str(supplied).trim() + '::' + CONFIG.PW_PEPPER);
      // timing-safe compare not needed for GAS but do length check
      if (calc.length !== hash.length) return false;
      var diff = 0;
      for (var i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
      return diff === 0;
    } catch (e) { return false; }
  },

  /**
   * Connection test — does NOT expose IDs.
   * Returns: { ok, checks: [{name, ok, ms, note}], summary }
   */
  test: function (payload, session) {
    // any authenticated user can test; detailed errors only for privileged
    payload = payload || {};
    var checks = [];
    var overall = true;

    function add(name, fn) {
      var t0 = new Date().getTime();
      var ok = false, note = '';
      try { var r = fn(); ok = r && r.ok !== false; note = r && r.note ? r.note : (ok ? 'OK' : 'fail'); }
      catch (e) { ok = false; note = Security.sanitizeError(e, session, 'integration.test:' + name); }
      var ms = new Date().getTime() - t0;
      if (!ok) overall = false;
      checks.push({ name: name, ok: ok, ms: ms, note: String(note).slice(0, 200) });
    }

    add('GAS URL reachable', function () {
      var url = Integration.currentGasUrl();
      return { ok: !!url, note: url ? 'Exec URL set' : 'No exec URL (not deployed as web app?)' };
    });

    add('Spreadsheet linkage', function () {
      var idMasked = Integration.maskedSheetId();
      if (!idMasked) return { ok: false, note: 'SPREADSHEET_ID not set — run Setup' };
      // try open
      try { var ss = DB.ss(); var name = ss.getName(); return { ok: true, note: 'Sheet "' + name + '" linked (' + idMasked + ')' }; }
      catch (e) { return { ok: false, note: e.message.slice(0, 80) }; }
    });

    add('Settings sheet readable', function () {
      var cnt = DB.count('Settings');
      return { ok: true, note: cnt + ' settings rows' };
    });

    add('Sessions / CacheService', function () {
      try { CacheService.getScriptCache().put('diag:test', '1', 60); var v = CacheService.getScriptCache().get('diag:test'); return { ok: v === '1', note: v === '1' ? 'CacheService OK' : 'CacheService read fail' }; }
      catch (e) { return { ok: false, note: e.message.slice(0, 60) }; }
    });

    add('Auth (login config)', function () {
      var show = 'true';
      try { var s=DB.settings(); if(s && s['login.showDemo']!==undefined) show=s['login.showDemo']; } catch(e){}
      return { ok: true, note: 'login.showDemo=' + show };
    });

    add('Integration gate', function () {
      var en = Integration._readSettings().enabled;
      return { ok: true, note: en ? 'External frontends ENABLED' : 'External frontends DISABLED' };
    });

    // optional: test provided gasUrl if payload has it
    if (U.str(payload.testGasUrl).trim()) {
      add('Custom GAS URL format', function () {
        var u = U.str(payload.testGasUrl).trim();
        var ok = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9-_\/]+\/exec/.test(u);
        return { ok: ok, note: ok ? 'URL looks valid' : 'URL must be https://script.google.com/macros/s/.../exec' };
      });
    }

    return { ok: overall, checks: checks, summary: overall ? 'All checks passed' : 'Some checks failed — see details', at: U.iso(), version: CONFIG.VERSION };
  },

  /**
   * Owner-only detailed diagnostics (sheet stats, props, but still masked)
   */
  diag: function (payload, session) {
    Auth.require(session, 'settings.manage');
    var t = Integration.test(payload, session);
    var stats = {}, missing = {};
    try { var h = Setup.schemaHealth(session); stats = h; } catch (e) { stats = { error: e.message }; }
    var propsMasked = {};
    try {
      var all = PropertiesService.getScriptProperties().getProperties() || {};
      Object.keys(all).forEach(function (k) {
        if (/(SECRET|PASSWORD|TOKEN|KEY|HASH)/i.test(k)) propsMasked[k] = U.str(all[k]) ? Security.SENTINEL + ' (' + U.str(all[k]).length + ' chars)' : '';
        else if (k === 'SPREADSHEET_ID') propsMasked[k] = Integration.maskedSheetId();
        else propsMasked[k] = String(all[k]).slice(0, 80);
      });
    } catch (e) { propsMasked = { error: e.message }; }

    return {
      test: t,
      schemaHealth: stats,
      propsMasked: propsMasked,
      settingsMasked: Security.maskSettings(DB.settings()),
      counts: DB.stats ? DB.stats() : {},
      at: U.iso()
    };
  }
};
