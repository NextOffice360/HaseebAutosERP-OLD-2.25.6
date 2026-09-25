/**
 * HASEEB AUTOS - ERP / POS  ::  UTILS
 * Generic helpers: ids, dates, money, hashing, response envelope, validation.
 */

var U = {

  /* ---------------------------------- ids -------------------------------- */
  uid: function (prefix) {
    var t = new Date().getTime().toString(36).toUpperCase();
    var r = Math.random().toString(36).substring(2, 7).toUpperCase();
    return (prefix ? prefix + '-' : '') + t + r;
  },

  uuid: function () { return Utilities.getUuid(); },

  /* --------------------------------- dates ------------------------------- */
  now: function () { return new Date(); },
  // Persisted U.iso values are local wall-clock strings, not UTC instants.
  // Preserve their calendar fields; only real instants go to Google's formatter.
  formatDate: function (value, format) {
    if (value === undefined || value === null || value === '') value = new Date();
    if (typeof value === 'string') {
      var text=value.trim();
      var local=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/.exec(text);
      if(local){
        var y=+local[1],m=+local[2],d=+local[3],h=+(local[4]||0),n=+(local[5]||0),sec=+(local[6]||0);
        var check=new Date(0);check.setUTCFullYear(y,m-1,d);check.setUTCHours(h,n,sec,0);
        if(check.getUTCFullYear()!==y || check.getUTCMonth()!==m-1 || check.getUTCDate()!==d || h>23 || n>59 || sec>59)
          throw new Error('INVALID_DATE: invalid calendar date or time.');
        var date=local[1]+'-'+local[2]+'-'+local[3];
        if(format==='yyyy-MM-dd')return date;
        if(format==='yyyy-MM')return date.slice(0,7);
        return date+'T'+(local[4]||'00')+':'+(local[5]||'00')+':'+(local[6]||'00');
      }
      value=new Date(text);
    } else if(typeof value==='number') value=new Date(value);
    if(Object.prototype.toString.call(value)!=='[object Date]' || isNaN(value.getTime()))
      throw new Error('INVALID_DATE: expected a valid Date or ISO date string.');
    return Utilities.formatDate(value,Session.getScriptTimeZone(),format);
  },
  iso: function (d) { return U.formatDate(d,"yyyy-MM-dd'T'HH:mm:ss"); },
  dateOnly: function (d) { return U.formatDate(d,'yyyy-MM-dd'); },

  /* ==================== GLOBAL DATE/TIME SYSTEM (v2.29.0 · spec §8) ========
     Spec: "The application needs a reusable global date/time system… date only /
     time only / date + time / full timestamp, 12h/24h, seconds on/off, timezone,
     configurable display format, configurable visibility — configurable rather
     than hard-coded, aur poore app mein wahi system."

     Storage ka usool (pehle se): U.iso() LOCAL wall-clock string likhta hai
     ("2026-09-23T10:42:31") — UTC instant nahi. Is liye display par stored
     values ko waise hi parha jata hai; sirf ASLI instant (new Date()) ko
     configured timezone mein convert kiya jata hai.
     ======================================================================= */
  dtConfig: function () {
    var s = {};
    try { s = DB.settings() || {}; } catch (e) { s = {}; }
    var cfg = {
      tz: U.str(s.timezone || 'Asia/Karachi') || 'Asia/Karachi',
      format: U.str(s['dt.format'] || 'datetime'),        /* date | time | datetime | stamp */
      dateStyle: U.str(s['dt.dateStyle'] || 'DD MMM YYYY'),/* DD MMM YYYY | YYYY-MM-DD | DD/MM/YYYY | MM/DD/YYYY */
      hour12: String(s['dt.hour12']) === 'true',
      seconds: String(s['dt.seconds']) === 'true',
      showTime: s['dt.showTime'] === undefined ? true : String(s['dt.showTime']) === 'true',
      showRecords: s['dt.showRecords'] === undefined ? true : String(s['dt.showRecords']) === 'true'
    };
    return cfg;
  },

  /** instant → configured timezone ke wall-clock parts (Intl; fallback: as-is) */
  _parts: function (value, tz) {
    var d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    /* stored wall-clock string? us ko waise hi parho (koi tz math nahi) */
    if (typeof value === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value.trim());
      if (m) return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), wall: true };
    }
    try {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      var p = {};
      f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return { y: +p.year, mo: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, s: +p.second, wall: false };
    } catch (e) {
      return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), wall: false };
    }
  },

  _MON: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  _pad: function (n) { return (n < 10 ? '0' : '') + n; },

  /** shared display formatter — mode: 'date' | 'time' | 'datetime' | 'stamp' | 'auto' */
  disp: function (value, mode, cfg) {
    if (value === undefined || value === null || value === '') return '';
    cfg = cfg || U.dtConfig();
    var p = U._parts(value, cfg.tz);
    if (!p) return String(value);
    if (mode === 'auto' || !mode) mode = cfg.format || 'datetime';
    if (!cfg.showTime && (mode === 'time' || mode === 'datetime' || mode === 'stamp')) mode = 'date';
    var sec = (mode === 'stamp') ? true : cfg.seconds;
    var datePart = (function () {
      if (cfg.dateStyle === 'YYYY-MM-DD') return p.y + '-' + U._pad(p.mo) + '-' + U._pad(p.d);
      if (cfg.dateStyle === 'DD/MM/YYYY') return U._pad(p.d) + '/' + U._pad(p.mo) + '/' + p.y;
      if (cfg.dateStyle === 'MM/DD/YYYY') return U._pad(p.mo) + '/' + U._pad(p.d) + '/' + p.y;
      return U._pad(p.d) + ' ' + U._MON[p.mo - 1] + ' ' + p.y;          /* DD MMM YYYY (spec example) */
    })();
    var timePart = (function () {
      var h = p.h, ap = '';
      if (cfg.hour12) { ap = h < 12 ? 'am' : 'pm'; h = h % 12; if (!h) h = 12; }
      var t = (cfg.hour12 ? h : U._pad(h)) + ':' + U._pad(p.mi) + (sec ? ':' + U._pad(p.s) : '');
      return cfg.hour12 ? t + ' ' + ap : t;
    })();
    if (mode === 'date') return datePart;
    if (mode === 'time') return timePart;
    return datePart + ', ' + timePart;
  },

  /** record ke created/updated stamps — spec: "Created: 23 Sep 2026, 10:42:31" */
  stamp: function (rec, cfg) {
    cfg = cfg || U.dtConfig();
    var out = { created: '', updated: '', show: cfg.showRecords, full: cfg.showTime };
    if (!rec) return out;
    if (rec.createdAt) out.created = U.disp(rec.createdAt, 'stamp', cfg);
    if (rec.updatedAt) out.updated = U.disp(rec.updatedAt, 'stamp', cfg);
    return out;
  },

  monthKey: function (d) { return U.formatDate(d,'yyyy-MM'); },
  startOfDay: function (d) {
    d = d ? new Date(d) : new Date();
    d.setHours(0, 0, 0, 0); return d;
  },
  daysAgo: function (n) {
    var d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d;
  },
  parseDate: function (v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  },

  /* -------------------------------- numbers ------------------------------ */
  num: function (v, dft) {
    if (v === null || v === undefined || v === '') return dft === undefined ? 0 : dft;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? (dft === undefined ? 0 : dft) : n;
  },
  round: function (v, dp) {
    dp = dp === undefined ? 2 : dp;
    var f = Math.pow(10, dp);
    return Math.round(U.num(v) * f) / f;
  },
  money: function (v) { return U.round(v, 2); },

  /* -------------------------------- strings ------------------------------ */
  str: function (v) { return v === null || v === undefined ? '' : String(v).trim(); },
  upper: function (v) { return U.str(v).toUpperCase(); },
  slug: function (v) { return U.str(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
  /** "as user types" filtering ke liye normalized haystack */
  norm: function (v) {
    return U.str(v).toLowerCase().replace(/[\s\-_\/\\\.#]/g, '');
  },
  /** fuzzy: sab tokens present honay chahiye (AND) */
  matchAll: function (haystack, query) {
    if (!query) return true;
    var h = U.norm(haystack);
    var parts = U.norm(query).split(' ').filter(Boolean);
    for (var i = 0; i < parts.length; i++) if (h.indexOf(parts[i]) === -1) return false;
    return true;
  },
  tokens: function (q) { return U.norm(q).split(' ').filter(Boolean); },

  /* -------------------------------- security ----------------------------- */
  sha256: function (s) {
    var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
    return b.map(function (x) { return ('0' + (x & 0xFF).toString(16)).slice(-2); }).join('');
  },
  hashPassword: function (plain, salt) {
    salt = salt || Utilities.getUuid().replace(/-/g, '').substring(0, 16);
    return { salt: salt, hash: U.sha256(salt + '::' + plain + '::' + CONFIG.PW_PEPPER) };
  },

  /* ------------------------------ response envelope ---------------------- */
  ok: function (data, meta) {
    return { ok: true, data: data === undefined ? null : data, meta: meta || null, ts: U.iso() };
  },
  fail: function (message, code, details) {
    return { ok: false, error: { message: message || 'Request failed', code: code || 'ERR', details: details || null }, ts: U.iso() };
  },

  /* ------------------------------- misc utils ---------------------------- */
  pick: function (obj, keys) {
    var o = {};
    keys.forEach(function (k) { if (obj && obj[k] !== undefined) o[k] = obj[k]; });
    return o;
  },
  clone: function (o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); },
  groupBy: function (arr, keyFn) {
    return arr.reduce(function (acc, x) {
      var k = typeof keyFn === 'function' ? keyFn(x) : x[keyFn];
      (acc[k] = acc[k] || []).push(x); return acc;
    }, {});
  },
  sum: function (arr, keyFn) {
    return arr.reduce(function (a, x) {
      return a + U.num(typeof keyFn === 'function' ? keyFn(x) : x[keyFn]);
    }, 0);
  },
  sortBy: function (arr, keyFn, dir) {
    dir = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var ka = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
      var kb = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
      if (ka < kb) return -1 * dir; if (ka > kb) return 1 * dir; return 0;
    });
  },
  csv: function (rows, headers) {
    var esc = function (v) {
      v = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var out = [headers.map(esc).join(',')];
    rows.forEach(function (r) { out.push(headers.map(function (h) { return esc(r[h]); }).join(',')); });
    return out.join('\n');
  },
  pad: function (n, len) {
    n = String(n); while (n.length < len) n = '0' + n; return n;
  },
  emailLike: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(U.str(v)); },
  phoneLike: function (v) { return U.str(v).replace(/\D/g, '').length >= 10; }
};

var CONFIG = {
  PW_PEPPER: 'haseeb-autos-2026',
  SESSION_TTL: 60 * 60 * 12,      // 12 hours
  CACHE_TTL: 60 * 15,             // 15 min sheet cache (v2.13.4: 15-min warm trigger keeps it continuously warm)
  MAX_ROWS_SCAN: 60000,
  VERSION: '2.30.6'
};
