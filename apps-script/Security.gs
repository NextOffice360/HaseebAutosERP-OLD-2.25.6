/**
 * HASEEB AUTOS - SECURITY HARDENING (v2.24)
 * --------------------------------------------------------------------------
 * Central security utilities:
 *  - Secret masking (no Sheet ID / API keys / tokens in frontend)
 *  - Rate limiting (login brute-force, JSONP flood)
 *  - Origin / integration enable check
 *  - Secure error sanitization (no stack / internal leakage)
 *  - Input validation helpers
 *
 * All secrets stay in ScriptProperties (server-side) or are masked before
 * they ever leave the server. Frontend never sees raw SPREADSHEET_ID,
 * AI keys, wallet passwords, Twilio tokens, etc.
 */

var Security = {

  SENTINEL: '••••••••',

  /** Keys that are secrets even if CONFIG_DEFS forgets to mark type=password */
  SECRET_RE: /(password|passwd|secret|token|hashKey|integritySalt|apiKey|api_key|credentials|privateKey)/i,

  /** Build password-key set from CONFIG_DEFS (type=password) + regex fallback */
  _pwdSet: null,
  _buildPwdSet: function () {
    if (Security._pwdSet) return Security._pwdSet;
    var s = {};
    try {
      (typeof CONFIG_DEFS !== 'undefined' ? CONFIG_DEFS : []).forEach(function (g) {
        (g.sub || []).forEach(function (t) {
          (t.fields || []).forEach(function (f) {
            if (f.type === 'password') s[f.key] = 1;
          });
        });
      });
    } catch (e) { }
    // also well-known secret settings not via CONFIG_DEFS
    ['wallet.EASYPAISA.password','wallet.EASYPAISA.hashKey','wallet.JAZZCASH.password',
     'wallet.JAZZCASH.integritySalt','comms.whatsapp.token','comms.twilio.token',
     'integration.apiKey','backend.sheetId','SPREADSHEET_ID','AI_API_KEY'].forEach(function(k){ s[k]=1; });
    Security._pwdSet = s;
    return s;
  },

  isPasswordKey: function (key) {
    if (!key) return false;
    var set = Security._buildPwdSet();
    if (set[key]) return true;
    return Security.SECRET_RE.test(key);
  },

  /** Mask a single value: real value -> sentinel, empty -> '' */
  maskValue: function (key, val) {
    if (!Security.isPasswordKey(key)) return val;
    var v = U.str(val);
    if (!v) return '';
    // already sentinel? keep it
    if (v === Security.SENTINEL) return Security.SENTINEL;
    return Security.SENTINEL;
  },

  /** Clone object and mask all password keys */
  maskObject: function (obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (Security.isPasswordKey(k)) {
        out[k] = U.str(v) ? Security.SENTINEL : '';
      } else {
        out[k] = v;
      }
    });
    return out;
  },

  /** Mask flat settings map */
  maskSettings: function (flat) {
    if (!flat || typeof flat !== 'object') return flat;
    var out = {};
    Object.keys(flat).forEach(function (k) {
      out[k] = Security.isPasswordKey(k) ? (U.str(flat[k]) ? Security.SENTINEL : '') : flat[k];
    });
    return out;
  },

  /**
   * On save, strip sentinel so DB keeps old secret.
   * Returns cleaned map and count of stripped keys.
   */
  stripSentinel: function (values) {
    var cleaned = {};
    var stripped = 0;
    Object.keys(values || {}).forEach(function (k) {
      var v = values[k];
      if (Security.isPasswordKey(k) && U.str(v) === Security.SENTINEL) {
        stripped++;
        return; // keep old
      }
      cleaned[k] = v;
    });
    return { values: cleaned, stripped: stripped };
  },

  /* =======================================================================
     RATE LIMITING — CacheService fixed window
     Key example: "rl:login:owner" or "rl:jsonp:anonymous"
     Uses ScriptCache (6h max) with windowSec TTL.
     ======================================================================= */
  _cache: function () {
    try { return CacheService.getScriptCache(); } catch (e) { return null; }
  },

  checkRate: function (key, limit, windowSec) {
    var c = Security._cache();
    if (!c) return { allowed: true, remaining: limit, reset: 0 }; // fail open if no cache
    key = 'rl:' + U.str(key).replace(/[^A-Za-z0-9:_\-]/g, '_').slice(0, 80);
    var raw = c.get(key);
    var cur = raw ? parseInt(raw, 10) : 0;
    if (isNaN(cur)) cur = 0;
    if (cur >= limit) {
      return { allowed: false, remaining: 0, current: cur, limit: limit };
    }
    return { allowed: true, remaining: limit - cur - 1, current: cur, limit: limit };
  },

  hitRate: function (key, windowSec) {
    var c = Security._cache();
    if (!c) return;
    key = 'rl:' + U.str(key).replace(/[^A-Za-z0-9:_\-]/g, '_').slice(0, 80);
    var raw = c.get(key);
    var cur = raw ? parseInt(raw, 10) : 0;
    if (isNaN(cur)) cur = 0;
    cur++;
    try { c.put(key, String(cur), windowSec || 60); } catch (e) { }
    return cur;
  },

  assertRate: function (key, limit, windowSec, msg) {
    var chk = Security.checkRate(key, limit, windowSec);
    if (!chk.allowed) {
      throw new Error(msg || 'Too many requests — please wait a few minutes and try again. (limit ' + limit + ' / ' + windowSec + 's)');
    }
    Security.hitRate(key, windowSec);
    return true;
  },

  /* =======================================================================
     ORIGIN / INTEGRATION GATE
     ======================================================================= */
  integrationEnabled: function () {
    try {
      var v = DB.settings()['integration.enabled'];
      if (v === undefined || v === null || v === '') return true; // default ON for backward compat
      return String(v) !== 'false';
    } catch (e) { return true; }
  },

  allowedOrigins: function () {
    try {
      var raw = U.str(DB.settings()['integration.allowedOrigins'] || '').trim();
      if (!raw) return [];
      return raw.split(',').map(function (s) { return U.str(s).trim().replace(/\/$/, ''); }).filter(Boolean);
    } catch (e) { return []; }
  },

  /**
   * Validate external request origin.
   * e is doGet/doPost event. We check:
   *   1. integration.enabled — if false, block JSONP/external
   *   2. allowedOrigins list — if non-empty, request must match (payload._origin or Referer heuristic)
   * For GAS, true Origin header is not in e, so we accept payload._origin / payload.origin / e.parameter.origin
   * and also check e.parameter._origin. If list non-empty and no origin supplied, we still allow
   * authenticated (token) calls but log warning — strict mode can be enabled via `integration.strictOrigin`.
   */
  checkExternal: function (e, payload) {
    if (Security.integrationEnabled() === false) {
      throw new Error('External integration is disabled by owner. Enable it in Settings → Backend & Integrations → External frontends.');
    }
    var allowed = Security.allowedOrigins();
    if (!allowed.length) return true; // open (but still needs auth for protected actions)
    var strict = U.str(DB.settings()['integration.strictOrigin']) === 'true';
    var origin = '';
    try {
      if (payload && (payload._origin || payload.origin)) origin = U.str(payload._origin || payload.origin);
      else if (e && e.parameter && (e.parameter._origin || e.parameter.origin)) origin = U.str(e.parameter._origin || e.parameter.origin);
      else if (e && e.headers && e.headers.origin) origin = U.str(e.headers.origin);
      else if (e && e.headers && e.headers.referer) origin = U.str(e.headers.referer);
    } catch (ex) { origin = ''; }
    origin = origin.replace(/\/$/, '').trim();
    if (!origin) {
      if (strict) throw new Error('Origin required — this integration requires allowed origins check. Add your domain in Settings → Backend & Integrations.');
      return true; // permissive when not strict and no origin supplied (e.g., GAS internal)
    }
    var ok = allowed.some(function (a) {
      var aa = a.replace(/\/$/, '');
      if (aa === '*') return true;
      if (origin === aa) return true;
      // allow subdomains: *.example.com
      if (aa.indexOf('*.') === 0) {
        var suffix = aa.slice(1); // ".example.com"
        return origin.indexOf(suffix) > -1;
      }
      // prefix match for script.google.com case
      return origin.indexOf(aa) === 0;
    });
    if (!ok) throw new Error('Origin not allowed: ' + origin + ' — add it in Settings → Backend & Integrations → Allowed origins.');
    return true;
  },

  /* =======================================================================
     SECURE ERROR SANITIZATION
     - Known safe codes stay verbatim (auth, validation)
     - Unknown/server errors are generic for non-admins, full for owner/admin
     ======================================================================= */
  SAFE_CODES: { 'NO_SESSION': 1, 'SESSION_EXPIRED': 1, 'NO_ROUTE': 1, 'RATE_LIMIT': 1, 'VALIDATION': 1, 'PERMISSION': 1 },

  isPrivileged: function (session) {
    if (!session) return false;
    var p = session.permissions || [];
    if (p.indexOf('*') > -1) return true;
    if (p.indexOf('settings.manage') > -1) return true;
    if (session.role === 'OWNER') return true;
    return false;
  },

  sanitizeError: function (err, session, action) {
    var msg = err && err.message ? err.message : String(err || 'Server error');
    var code = (err && err.code) || '';
    // already a U.fail style?
    if (msg === 'SESSION_EXPIRED' || msg === 'NO_SESSION') return msg;
    // safe user-facing validation messages (contain Urdu or known prefix)
    if (/^[A-Z_]+$/.test(msg) && Security.SAFE_CODES[msg]) return msg;
    // permission / validation messages are safe to show (they are intentional)
    /* v2.30.0 — shop band hone ka message har role ko saaf dikhna chahiye */
    if (msg.indexOf('SHOP_CLOSED|') === 0) return msg;
    if (msg.indexOf('ijazat') > -1 || msg.indexOf('zaroori') > -1 || msg.indexOf('Invalid') === 0 ||
        msg.indexOf('Unknown action') === 0 || msg.indexOf('Origin') === 0 ||
        msg.indexOf('Too many') === 0 || msg.indexOf('External integration') === 0) {
      return msg;
    }
    // privileged users see full message (for debugging)
    if (Security.isPrivileged(session)) return msg;
    // for others, generic but keep action for support
    Logger.log('SECURE ERROR [' + (action || '?') + '] sanitized: ' + msg);
    return 'Server error — please try again. (' + (action || 'request') + ')';
  },

  /* =======================================================================
     INPUT VALIDATION HELPERS
     ======================================================================= */
  assertString: function (v, name, maxLen) {
    v = U.str(v);
    if (!v) throw new Error(name + ' zaroori hai.');
    if (maxLen && v.length > maxLen) throw new Error(name + ' bahut lambi hai (max ' + maxLen + ').');
    if (/[<>]/.test(v)) throw new Error(name + ' mein < > allowed nahi.');
    return v;
  },

  assertId: function (v, name) {
    v = U.str(v);
    if (!v) throw new Error((name || 'ID') + ' zaroori hai.');
    if (!/^[A-Za-z0-9_\-]+$/.test(v)) throw new Error((name || 'ID') + ' ghalat format.');
    return v;
  }
};
