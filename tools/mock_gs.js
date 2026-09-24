/**
 * mock_gs.js — In-memory Google Apps Script runtime for the Haseeb Autos backend.
 * Lets Node load the real .gs files and exercise real business logic
 * (sales, purchase, stock, payments, warehouse, reports) against a fake
 * spreadsheet, so every formula/calculation can be verified before deploy.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ------------------------------ Fake Sheet ------------------------------- */
class Range {
  constructor(sheet, row, col, nRows, nCols) {
    this.sheet = sheet; this.row = row; this.col = col;
    this.nRows = nRows; this.nCols = nCols;
  }
  _box() {
    const out = [];
    for (let r = 0; r < this.nRows; r++) {
      const line = [];
      for (let c = 0; c < this.nCols; c++) line.push(this.sheet.get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValues() { return this._box().map(r => r.map(v => (v === '' || v === undefined || v === null ? '' : v))); }
  /** Apps Script getDisplayValues → always strings, numbers formatted plainly */
  getDisplayValues() {
    return this._box().map(r => r.map(v => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return String(v);
    }));
  }
  setValues(vals) {
    for (let r = 0; r < vals.length; r++)
      for (let c = 0; c < (vals[r] || []).length; c++)
        this.sheet.set(this.row + r, this.col + c, vals[r][c]);
    return this;
  }
  clearContent() { this.setValues(this._box().map(r => r.map(() => ''))); return this; }
  clear() { return this.clearContent(); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontSize() { return this; }
  setHorizontalAlignment() { return this; }
  setWrap() { return this; }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
}

class Sheet {
  constructor(name, headers) {
    this.name = name;
    this.data = headers ? [headers.slice()] : [];
  }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(r, c, nr, nc) {
    nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
    return new Range(this, r - 1, c - 1, nr, nc);
  }
  get(row, col) {
    const r = this.data[row];
    if (!r) return '';
    const v = r[col];
    return v === undefined ? '' : v;
  }
  set(row, col, val) {
    while (this.data.length <= row) this.data.push([]);
    const r = this.data[row];
    while (r.length <= col) r.push('');
    r[col] = val;
  }
  appendRow(arr) { this.data.push(arr.slice()); return this; }
  insertColumnsAfter(after, n) {
    this.data.forEach(r => { for (let i = 0; i < n; i++) r.splice(after + i, 0, ''); });
    return this;
  }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  clear() { const head = this.data[0]; this.data = head ? [head] : []; return this; }
  deleteRow(n) { this.data.splice(n - 1, 1); return this; }
  deleteRows(start, n) { this.data.splice(start - 1, n); return this; }
  insertRowAfter(n) { this.data.splice(n, 0, []); return this; }
}

class Spreadsheet {
  constructor(id) { this.id = id; this.sheets = {}; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name, headers) {
    const s = new Sheet(name, headers);
    this.sheets[name] = s;
    return s;
  }
  deleteSheet(s) { delete this.sheets[s.getName()]; }
  getSheets() { return Object.values(this.sheets); }
}

/* ------------------------------ Services --------------------------------- */
function makeServices() {
  const DB_ = { spreadsheets: {}, counters: {} };
  const props = {};
  const cacheScript = {};
  const cacheUser = {};

  /* v2.8.4 — CacheService ko ASLI Apps Script jaisa banaya:
       • getAll(keys)  → SIRF maangi gayi keys (pehle poora store deta tha)
       • removeAll(keys) → SIRF woh keys (pehle poora store saaf kar deta tha!)
       • 100 KB per-key hadd ENFORCE hoti hai — warna chunked cache ka test
         jhoota pass ho jata (production mein put() throw karta hai).
     Official docs: developers.google.com/apps-script/reference/cache/cache */
  const CACHE_VALUE_LIMIT = 100 * 1024;
  const cacheApi = store => ({
    get: k => (k in store ? store[k] : null),
    getAll: keys => {
      const out = {};
      (Array.isArray(keys) ? keys : []).forEach(k => { if (k in store) out[k] = store[k]; });
      return out;
    },
    put: (k, v, ttl) => {
      const s = String(v);
      if (s.length > CACHE_VALUE_LIMIT) {
        throw new Error('Cache value too large: ' + s.length + ' bytes (limit ' + CACHE_VALUE_LIMIT + ')');
      }
      store[k] = s;
    },
    putAll: (obj, ttl) => {
      let total = 0;
      Object.keys(obj || {}).forEach(k => { total += String(obj[k]).length; });
      if (total > CACHE_VALUE_LIMIT) {
        throw new Error('Cache putAll too large: ' + total + ' bytes (limit ' + CACHE_VALUE_LIMIT + ')');
      }
      Object.keys(obj || {}).forEach(k => { store[k] = String(obj[k]); });
    },
    remove: k => { delete store[k]; },
    removeAll: keys => { (Array.isArray(keys) ? keys : []).forEach(k => { delete store[k]; }); },
    _store: store,
    _clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  });

  const SpreadsheetApp = {
    openById(id) {
      if (!DB_.spreadsheets[id]) DB_.spreadsheets[id] = new Spreadsheet(id);
      return DB_.spreadsheets[id];
    },
    create(name) {
      const id = 'SS-' + (Object.keys(DB_.spreadsheets).length + 1);
      DB_.spreadsheets[id] = new Spreadsheet(id);
      return DB_.spreadsheets[id];
    },
    getActiveSpreadsheet() {
      const id = props.SPREADSHEET_ID;
      return id ? SpreadsheetApp.openById(id) : null;
    },
    flush() { }
  };

  const Utilities = {
    getUuid: (function () { let n = 0; return () => 'uuid-' + (++n) + '-' + Math.random().toString(36).slice(2, 8); })(),
    /**
     * Apps Script jaisa formatter — single-quoted literals ('T', 'at', ...) verbatim
     * nikalte hain, warna U.iso() "2026-09-15'T'12:00:00" banata (Date parse fail).
     */
    formatDate(date, tz, fmt) {
      if(Object.prototype.toString.call(date)!=='[object Date]' || isNaN(date.getTime()))
        throw new Error("The parameters don't match the method signature for Utilities.formatDate: Date required");
      const d = new Date(date);
      const p = (n, l) => String(n).padStart(l || 2, '0');
      const map = {
        yyyy: () => d.getFullYear(),
        yy: () => String(d.getFullYear()).slice(-2),
        MMMM: () => d.toLocaleString('en-US', { month: 'long' }),
        MMM: () => d.toLocaleString('en-US', { month: 'short' }),
        MM: () => p(d.getMonth() + 1),
        dd: () => p(d.getDate()),
        HH: () => p(d.getHours()),
        hh: () => p(d.getHours() % 12 || 12),
        mm: () => p(d.getMinutes()),
        ss: () => p(d.getSeconds()),
        SSS: () => p(d.getMilliseconds(), 3),
        a: () => (d.getHours() < 12 ? 'AM' : 'PM')
      };
      const tokens = ['yyyy', 'MMMM', 'MMM', 'SSS', 'yy', 'MM', 'dd', 'HH', 'hh', 'mm', 'ss', 'a'];
      const f = String(fmt);
      let out = '', i = 0;
      while (i < f.length) {
        if (f[i] === "'") {                       // quoted literal → verbatim
          const end = f.indexOf("'", i + 1);
          if (end === -1) { out += f.slice(i + 1); break; }
          out += f.slice(i + 1, end); i = end + 1; continue;
        }
        const tok = f.slice(i, i + 4);
        let hit = null;
        for (const k of tokens) { if (tok.indexOf(k) === 0) { hit = k; break; } }
        if (hit) { out += map[hit](); i += hit.length; }
        else { out += f[i]; i += 1; }
      }
      return out;
    },
    formatString: (s) => s,
    /** Apps Script ki tarah: string ya byte[] dono se base64 banata hai */
    base64Encode(value, charset) {
      let bytes;
      if (Array.isArray(value)) bytes = Buffer.from(value.map(v => v & 0xFF));
      else if (value && value.length !== undefined && typeof value !== 'string' && !(value instanceof Buffer)) bytes = Buffer.from(Array.from(value));
      else if (Buffer.isBuffer(value)) bytes = value;
      else bytes = Buffer.from(String(value), 'utf8');
      return bytes.toString('base64');
    },
    base64Decode(value, charset) {
      return Buffer.from(String(value || ''), 'base64').toString('utf8');
    },
    /**
     * Apps Script ka `Utilities.newBlob(data, contentType, name)` ek Blob deta
     * hai jis par getName()/getBytes()/getAs() hote hain, aur
     * `folder.createFile(blob)` ek File (getId/getName/getUrl/getSize).
     * Mock mein sirf getBytes tha → Migration.export "blob.getId is not a
     * function" deta tha (jhoota failure). Ab dono shape sahi hain.
     */
    newBlob(value, type, name) {
      /* Apps Script newBlob(byte[]) bhi leta hai — v2.8.4 se signed token
         decode karne ke liye zaroori. Pehle mock sirf string sambhalta tha,
         is liye array "104,101,…" ban kar galat decode hota. */
      let bytes;
      if (Array.isArray(value)) bytes = Array.from(Buffer.from(value.map(v => v & 0xFF)));
      else if (Buffer.isBuffer(value)) bytes = Array.from(value);
      else bytes = Array.from(Buffer.from(String(value), 'utf8'));
      let nm = String(name || 'blob');
      const blob = {
        getBytes: () => bytes.slice(),
        getDataAsString: () => Buffer.from(bytes).toString('utf8'),
        getContentType: () => String(type || 'application/octet-stream'),
        getSize: () => bytes.length,
        getName: () => nm,
        setName(x) { nm = String(x); return blob; },
        getAs: () => blob,
        copyBlob: () => blob,
        getUrl: () => 'https://drive/blob/' + encodeURIComponent(nm),
        getId: () => 'BLOB-' + nm
      };
      return blob;
    },
    /** Apps Script ki tarah: signed byte[] (har byte -128…127) return karta hai */
    computeHmacSha256Signature(value, key, charset) {
      const crypto = require('crypto');
      let bytes;
      if (Array.isArray(value)) bytes = Buffer.from(value.map(v => v & 0xFF));
      else if (value && Array.isArray(value.bytes)) bytes = Buffer.from(value.bytes.map(v => v & 0xFF));
      else if (Buffer.isBuffer(value)) bytes = value;
      else bytes = Buffer.from(String(value), 'utf8');
      const dig = crypto.createHmac('sha256', Buffer.from(String(key), 'utf8')).update(bytes).digest();
      return Array.from(dig).map(b => (b > 127 ? b - 256 : b));
    },
    computeHmacSignature(alg, value, key, charset) {
      return Utilities.computeHmacSha256Signature(value, key, charset);
    },
    computeDigest(alg, value, charset) {
      const crypto = require('crypto');
      return crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(String(value)).digest()
        .map(b => ((b + 0x100) % 0x100).toString(16).padStart(2, '0'));
    },
    sleep() { },
    /* v2.8.4 — signed session tokens ke liye zaroori. Ye pehle mock mein NAHI
       the, is liye Auth.issue()/verify() test hi nahi ho sakte the. */
    base64Encode(data) {
      const b = Array.isArray(data) ? Buffer.from(data.map(v => v & 0xFF)) : Buffer.from(String(data), 'utf8');
      return b.toString('base64');
    },
    base64EncodeWebSafe(data) {
      return Utilities.base64Encode(data).replace(/\+/g, '-').replace(/\//g, '_');
    },
    base64Decode(b64) {
      const s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
      return Array.from(Buffer.from(s, 'base64'));
    },
    base64DecodeWebSafe(b64) {
      return Utilities.base64Decode(b64);
    },
    DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' }
  };

  const CacheService = {
    getScriptCache: () => cacheApi(cacheScript),
    getUserCache: () => cacheApi(cacheUser),
    getDocumentCache: () => cacheApi({})
  };

  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: k => { delete props[k]; },
      getProperties: () => Object.assign({}, props)
    }),
    getUserProperties: () => ({ getProperty: () => null, setProperty: () => { }, deleteProperty: () => { } }),
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => { }, deleteProperty: () => { } })
  };

  const LockService = {
    getScriptLock: () => ({ waitLock: () => true, releaseLock: () => { }, tryLock: () => true, hasLock: () => true }),
    getUserLock: () => ({ waitLock: () => true, releaseLock: () => { }, tryLock: () => true, hasLock: () => true })
  };

  const Session = {
    getScriptTimeZone: () => 'Asia/Karachi',
    getActiveUser: () => ({ getEmail: () => 'tester@haseeb.local' }),
    getEffectiveUser: () => ({ getEmail: () => 'tester@haseeb.local' })
  };

  /* ------------------------------------------------------------------
     HtmlService — v2.8.1 se ASLI Apps Script jaisa behave karta hai.
     Pehle ye stub tha (addMetaTag hi nahi tha), is liye doGet() kabhi
     actually chala hi nahi — aur production mein "The meta tag you
     specified is not allowed in this context" ka crash pakda nahi gaya.
     Ab addMetaTag() wahi exception deta hai jo Google deta hai, taake
     test_metatags.js doGet()/Pwa.serve() ko end-to-end chala sake.
     Docs: developers.google.com/apps-script/reference/html/html-output
     ------------------------------------------------------------------ */
  const GAS_ALLOWED_META = ['viewport', 'apple-mobile-web-app-capable',
    'mobile-web-app-capable', 'google-site-verification'];

  function _mkOutput(content) {
    const out = {
      _content: content || '<html></html>',
      _meta: [],
      _title: '',
      getContent() { return this._content; },
      getTitle() { return this._title; },
      getMetaTags() { return this._meta.slice(); },
      setTitle(t) { this._title = t; return this; },
      setContent(c) { this._content = c; return this; },
      append(c) { this._content += c; return this; },
      appendUntrusted(c) { this._content += c; return this; },
      setXFrameOptionsMode() { return this; },
      setSandboxMode() { return this; },
      setFaviconUrl() { return this; },
      getFaviconUrl() { return ''; },
      setWidth() { return this; }, getWidth() { return 0; },
      setHeight() { return this; }, getHeight() { return 0; },
      getAs() { return { getBytes: () => Buffer.from(this._content) }; },
      getBlob() { return { getBytes: () => Buffer.from(this._content) }; },
      asTemplate() { return HtmlService.createTemplateFromFile('__inline__'); },
      clear() { this._content = ''; return this; },
      /* ASLI pabandi: sirf 4 meta tags allowed, warna exception */
      addMetaTag(name, content) {
        const n = String(name || '').toLowerCase();
        if (GAS_ALLOWED_META.indexOf(n) === -1) {
          throw new Error('The meta tag you specified is not allowed in this context. (' + name + ')');
        }
        this._meta.push({ name: n, content: String(content) });
        return this;
      }
    };
    return out;
  }

  const HtmlService = {
    _allowedMeta: GAS_ALLOWED_META,
    createTemplateFromFile(name) {
      const tpl = {
        _file: name,
        evaluate() {
          let html = '<html></html>';
          try {
            const fs = require('fs'); const path = require('path');
            const f = path.join(__dirname, '..', 'apps-script', name + '.html');
            if (fs.existsSync(f)) html = fs.readFileSync(f, 'utf8');
          } catch (e) { /* test env mein file na mile to bhi chale */ }
          return _mkOutput(html);
        }
      };
      return tpl;
    },
    createHtmlOutput(content) { return _mkOutput(content); },
    createHtmlOutputFromFile(name) {
      let html = '<html></html>';
      try {
        const fs = require('fs'); const path = require('path');
        const f = path.join(__dirname, '..', 'apps-script', name + '.html');
        if (fs.existsSync(f)) html = fs.readFileSync(f, 'utf8');
      } catch (e) { /* ignore */ }
      return _mkOutput(html);
    },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    SandboxMode: { IFRAME: 'IFRAME' }
  };

  /* ContentService — JSONP / webhook jawab (Code.gs jsonp() isi par hai) */
  const ContentService = {
    MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript', TEXT: 'text/plain' },
    createTextOutput(body) {
      let mime = 'text/plain';
      const o = {
        getContent: () => String(body),
        getMimeType: () => mime,
        setMimeType(m) { mime = m; return o; },
        append: (t) => { body += t; return o; }
      };
      return o;
    }
  };

  /* Test harness ke liye controllable UrlFetchApp:
       UrlFetchApp.handle(fn)   → fake responses ke liye handler set karein
       UrlFetchApp.log          → abhi tak ki saari calls (url + opts)        */
  const FETCH_LOG = [];
  let fetchHandler = null;
  const UrlFetchApp = {
    log: FETCH_LOG,
    handle(fn) { fetchHandler = fn; },
    reset() { FETCH_LOG.length = 0; fetchHandler = null; },
    fetch(url, opts) {
      const rec = { url: url, opts: opts || {} };
      FETCH_LOG.push(rec);
      if (!fetchHandler) throw new Error('UrlFetch disabled in test harness (no handler set)');
      const r = fetchHandler(url, opts || {}, rec) || {};
      const code = r.code === undefined ? 200 : r.code;
      const text = r.text === undefined ? '' : r.text;
      return {
        getResponseCode: () => code,
        getContentText: () => text,
        getContent: () => text
      };
    }
  };

  /* ---- Drive: server-side PDF paths (invoice/report/PO/GRN/dayReport) ke liye ---- */
  const FILES = {};
  const mkFile = (name, content) => {
    let nm = String(name);
    const f = {
      getId: () => 'FILE-' + nm,
      getName: () => nm,
      getUrl: () => 'https://drive/' + encodeURIComponent(nm),
      getSize: () => String(content == null ? '' : content).length,
      setName(n) { nm = String(n); return f; },
      setTrashed(v) { f._trashed = !!v; return f; },
      setSharing() { return f; },
      getAs: () => mkFile(nm.replace(/\.html$/i, '.pdf'), content),
      /* v2.14.0 fidelity: real Drive File has getContent, Blob has getDataAsString */
      getContent: () => content,
      getDataAsString: () => String(content == null ? '' : content)
    };
    return f;
  };
  const folder = {
    getId: () => 'FOLDER',
    getName: () => 'Haseeb Autos Exports',
    getUrl: () => 'https://drive/folder',
    /* asli Apps Script: folder.createFile(blob) → FILE (na ke blob) */
    createFile: (blob) => {
      const nm = (blob && blob.getName) ? blob.getName() : 'file';
      const f = mkFile(nm, (blob && blob.getDataAsString) ? blob.getDataAsString() : '');
      FILES[f.getId()] = f; return f;
    },
    setSharing() { return folder; }
  };
  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    createFile: (name, content) => { const f = mkFile(name, content); FILES[f.getId()] = f; return f; },
    getFileById: (id) => FILES[id] || mkFile('unknown', ''),
    createFolder: (nm) => nm ? Object.assign({}, folder, { getName: () => String(nm) }) : folder,
    getFoldersByName: () => ({ hasNext: () => true, next: () => folder }),
    getRootFolder: () => folder
  };
  const MimeType = { HTML: 'text/html', PDF: 'application/pdf', CSV: 'text/csv' };

  /* ---------------- fake ScriptApp (time-driven triggers) ---------------- */
  const TRIGGERS = [];
  let triggerSeq = 0;
  const ScriptApp = {
    _triggers: TRIGGERS,
    getProjectTriggers() { return TRIGGERS.slice(); },
    newTrigger(handler) {
      const builder = {
        _handler: handler,
        timeBased() {
          const tb = {
            _hour: 0, _tz: 'UTC', _days: 1, _minutes: 0,
            atHour(h) { this._hour = h; return this; },
            inTimezone(t) { this._tz = t; return this; },
            everyDays(d) { this._days = d; return this; },
            everyMinutes(m) { this._minutes = m; return this; },
            create() {
              const tr = {
                _id: 'trg' + (++triggerSeq), _handler: builder._handler,
                _hour: this._hour, _tz: this._tz, _days: this._days, _minutes: this._minutes,
                getUniqueId() { return this._id; },
                getHandlerFunction() { return this._handler; },
                getTriggerSource() { return 'CLOCK'; },
                getEventType() { return 'CLOCK'; }
              };
              TRIGGERS.push(tr);
              return tr;
            }
          };
          return tb;
        }
      };
      return builder;
    },
    deleteTrigger(t) {
      const i = TRIGGERS.indexOf(t);
      if (i > -1) TRIGGERS.splice(i, 1);
    },
    /* v2.8.2 — Diagnose.gs ▸ buildUrlReport() isi se /exec URL leta hai aur
       mobile ke liye /a/~/ variant banata hai. Stub hota to wo code path
       kabhi test hi na hota (aur wahi asal fix hai). */
    getService() {
      return {
        getUrl() { return 'https://script.google.com/macros/s/AKfycbTEST/exec'; },
        _getUrl() { return 'https://script.google.com/macros/u/0/s/AKfycbTEST/dev'; }
      };
    }
  };

  return { SpreadsheetApp, Utilities, CacheService, PropertiesService, LockService, Session, HtmlService, UrlFetchApp, DriveApp, ScriptApp, DB_, MimeType, ContentService };
}

/* ------------------------------- Loader ---------------------------------- */
function loadBackend(dir, options) {
  const services = makeServices();
  const sandbox = Object.assign({
    console,
    Logger: { log: (...a) => { }, fine: () => { }, warn: () => { } },
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, isNaN, setTimeout, encodeURIComponent, decodeURIComponent
  }, services);
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);

  let files = ['Utils', 'DB', 'Auth', 'Audit', 'Schema', 'Config', 'Setup', 'Items',
    'Parties', 'Inventory', 'Sales', 'Purchase', 'Payments', 'Reports', 'Warehouse', 'Orders',
    'Notifications', 'Commissions', 'Barcode', 'OfflineSync', 'Ai', 'Code', 'Seed_Products']
    .map(n => path.join(dir, n + '.gs'))
    .filter(f => fs.existsSync(f));

  // any remaining .gs files not listed above
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).forEach(f => {
    const full = path.join(dir, f);
    if (files.indexOf(full) === -1) files.push(full);
  });

  if (options && options.firstFiles) {
    const first = options.firstFiles.map(n => path.join(dir, n + '.gs'));
    first.forEach(f => { if (!files.includes(f)) throw new Error('Unknown load-order file: ' + f); });
    files = first.concat(files.filter(f => !first.includes(f)));
  }
  files.forEach(f => {
    const code = fs.readFileSync(f, 'utf-8');
    try {
      vm.runInContext(code, ctx, { filename: f });
    } catch (e) {
      throw new Error('Load error in ' + path.basename(f) + ': ' + e.message);
    }
  });

  return { ctx, sandbox, services };
}

module.exports = { loadBackend, Spreadsheet, Sheet, Range };
