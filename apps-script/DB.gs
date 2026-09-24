/**
 * HASEEB AUTOS - ERP / POS  ::  DB LAYER
 * Google Sheets ko ek chhoti SQL-ish database ki tarah use karta hai.
 *  - Read: CacheService se 5 minute ka cache (bar bar sheet read nahi hoti)
 *  - Write: append / batch update + cache invalidate
 *  - Har write audit log mein jati hai (sensitive sheets ke liye)
 */

var DB = {

  /* ============================== CONNECTION ============================== */
  /* v2.7 PERFORMANCE — Apps Script me `SpreadsheetApp.openById()` mehnga hai
     (~50–200ms). Pehle har DB.sheet() / DB.all() par dobara chalta tha —
     ek request me 10 sheet padhne par 10 martaba spreadsheet khulti thi.
     Ab ek execution ke andar result yaad rakha jata hai (memoize).
     Naya spreadsheet banne par (Setup) cache saaf kar diya jata hai. */
  _ss: null,
  _ssId: null,

  ss: function () {
    if (DB._ss) return DB._ss;
    var id = DB.spreadsheetId();
    if (!id) throw new Error('SPREADSHEET_ID not set. Run Setup > setupSpreadsheet() first.');
    DB._ss = SpreadsheetApp.openById(id);
    return DB._ss;
  },

  /** Script property bhi har dafa parhne ki zaroorat nahi — memoize. */
  spreadsheetId: function () {
    if (DB._ssId) return DB._ssId;
    DB._ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    return DB._ssId;
  },

  /** Naya spreadsheet / id badalne par cache saaf karein. */
  resetConnection: function () { DB._ss = null; DB._ssId = null; DB._rows = {}; DB._rowIdx = {}; },

  sheetName: function (name) {
    if (!SCHEMA[name]) throw new Error('Unknown sheet: ' + name);
    return name;
  },

  /** Sheet object (auto-create + headers repair) */
  sheet: function (name) {
    DB.sheetName(name);
    var ss = DB.ss();
    var sh = ss.getSheetByName(name);
    if (!sh) sh = Setup.createSheet(name);
    return sh;
  },

  headers: function (name) { return SCHEMA[name]; },

  /* ================================ READS ================================= */
  cacheKey: function (name) { return 'db:' + DB.spreadsheetId() + ':' + name; },

  /**
   * Poora sheet → array of objects.
   * @param {string} name
   * @param {boolean} fresh  cache ignore karke direct sheet se padho
   */
  /* ----------------------------------------------------------------------
     v2.7 §16 PERFORMANCE — in-execution ROW memoization
     ----------------------------------------------------------------------
     Masla: `DB.all('JournalLines')` / `DB.all('Items')` jaisi calls loops
     mein bar bar hoti hain. CacheService hit hota hai magar JSON.parse()
     HAR dafa chalta hai — badi sheet (5,000+ rows) par ye sab se mehnga
     kaam hai. 20 accounts ka balance = 20 martaba poora array parse.

     Hal: ek execution ke andar parse hua result yaad rakha jata hai.

     HIFAZAT — do alag cache, do alag niyat:
       · CacheService (CACHED_SHEETS) = EXECUTION-ke-beech, CACHE_TTL (15 min).
         Is mein sirf wahi sheets hain jo kam badalti hain (Settings, Items…)
         — kyun ke do users ek sath kaam kar rahe hote hain. Is list ko
         barhana MULTI-USER CORRECTNESS bigarta (doosra user purana data
         dekhta). Is liye ye list waise hi rehne di gayi hai.
       · DB._rows (yahan) = SIRF isi execution ke andar. Yahan koi doosra
         user nahi, to har sheet ko yaad rakhna mehfooz hai — bas sharat
         ye ke har write path touch() bulaye.
     touch() dono cache saaf karta hai; Audit.log() (jo seedha appendRow
     karta tha) ko bhi touch() kar diya gaya. Setup/Exports jo nayi sheet
     likhte hain, usay baad mein padhte hi nahi.
     ---------------------------------------------------------------------- */
  _rows: {},

  all: function (name, fresh) {
    var useCache = CACHED_SHEETS.indexOf(name) > -1 && !fresh;

    /* ① isi execution ka yaad-karda result (har sheet ke liye) */
    if (!fresh && DB._rows[name]) return DB._rows[name];

    if (useCache) {
      var parsed = DB._cacheGet(name);
      if (parsed) {
        DB._rows[name] = parsed;
        return parsed;
      }
    }
    var rows = DB._readSheet(name);
    if (useCache) DB._cacheSet(name, rows);
    if (!fresh) DB._rows[name] = rows;
    return rows;
  },

  /* ====================== CHUNKED CACHE LAYER (v2.8.4) ====================
     ASLI MASLA (naap kar malaum hua): CacheService ki HAR KEY par 100 KB ki
     hadd hai (official docs). Hamari sab se bari sheets us se barhi hain:
         Items  422 rows = 405 KB      Stock 1266 rows = 223 KB
     Purana code `put(key, JSON)` karta tha → exception → `catch(e){}` chupke
     se nigal jata → cache KABHI BHARTA HI NAHI. Natija: har execution par
     poori Items + Stock sheet dobara parhi jati thi (apps script ki sab se
     mehengi cheez). Yehi "browsing/data fetching bohot slow" ki asal wajah thi.

     HAL: JSON ko ≤90 KB ke tukron mein torh kar alag keys mein rakho, aik
     index key (`:n`) tukron ki ginti batati hai. Padhte waqt `getAll()` se
     SARE tukre AIK service call mein aate hain (best practice: minimize calls).
     Koi tukra evict ho jaye to ginti/parse fail → sheet se dobara (mehfooz).
     Invalidation wahi purani `DB.touch(name)` se hoti hai.
     ==================================================================== */
  _CHUNK: 90000,          /* 90 KB — 100 KB hadd se mehfooz faasla */
  _MAX_CHUNKS: 14,        /* ~1.2 MB tak; us se bara ho to cache skip */

  _cacheGet: function (name) {
    try {
      var cache = CacheService.getScriptCache();
      var base = DB.cacheKey(name);
      var nRaw = cache.get(base + ':n');
      if (!nRaw) return null;
      var n = parseInt(nRaw, 10);
      if (!n || n < 1 || n > DB._MAX_CHUNKS) return null;
      var keys = [];
      for (var i = 0; i < n; i++) keys.push(base + ':' + i);
      var got = cache.getAll(keys);            /* AIK service call */
      var json = '';
      for (var j = 0; j < n; j++) {
        var part = got && got[keys[j]];
        if (!part) return null;                 /* koi tukra evict ho gaya */
        json += part;
      }
      return JSON.parse(json);
    } catch (e) { return null; }
  },

  _cacheSet: function (name, rows) {
    try {
      var json = JSON.stringify(rows);
      var cache = CacheService.getScriptCache();
      var base = DB.cacheKey(name);
      var ttl = U.num(CONFIG.CACHE_TTL, 300);
      var size = DB._CHUNK;
      var n = Math.ceil(json.length / size);
      if (n < 1) n = 1;
      if (n > DB._MAX_CHUNKS) return false;     /* bohot bara — cache skip */
      for (var i = 0; i < n; i++) {
        cache.put(base + ':' + i, json.substr(i * size, size), ttl);
      }
      cache.put(base + ':n', String(n), ttl);
      return true;
    } catch (e) { return false; }
  },

  _cacheDel: function (name) {
    try {
      var cache = CacheService.getScriptCache();
      var base = DB.cacheKey(name);
      var nRaw = cache.get(base + ':n');
      var n = parseInt(nRaw, 10) || 0;
      var keys = [base, base + ':n'];
      for (var i = 0; i < n && i < DB._MAX_CHUNKS; i++) keys.push(base + ':' + i);
      /* purane (bina-chunk) key ko bhi hatayein — upgrade ke baad bachi ho sakti hai */
      cache.removeAll(keys);
    } catch (e) {
      try { CacheService.getScriptCache().remove(DB.cacheKey(name)); } catch (e2) { }
    }
  },

  _readSheet: function (name) {
    var sh = DB.sheet(name);
    var lastRow = sh.getLastRow();
    var cols = SCHEMA[name].length;
    if (lastRow < 2) return [];
    var values = sh.getRange(1, 1, lastRow, cols).getDisplayValues();
    var headers = values[0];
    var out = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r], obj = {};
      var empty = true;
      for (var c = 0; c < headers.length; c++) {
        var v = row[c];
        if (v !== '') empty = false;
        obj[headers[c]] = v;
      }
      if (!empty) out.push(obj);
    }
    return out;
  },

  byId: function (name, id) {
    var rows = DB.all(name);
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  },

  where: function (name, fn, fresh) {
    var rows = DB.all(name, fresh);
    if (!fn) return rows;
    return rows.filter(fn);
  },

  findOne: function (name, fn) {
    var rows = DB.where(name, fn);
    return rows.length ? rows[0] : null;
  },

  /** index bhi chahiye (update/delete ke liye) */
  indexOfId: function (name, id) {
    var rows = DB.all(name);
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
    return -1;
  },

  /** Row number in sheet (1-based, header ke baad pehli row = 2) */
  /* ----------------------------------------------------------------------
     v2.7 §16 — rowOf() memoization
     ----------------------------------------------------------------------
     Pehle har rowOf() POORI sheet padhta tha (getLastRow + getDisplayValues).
     postJournal() mein 20 accounts update karte waqt ye 20 martaba chalta tha
     = 20 getLastRow + 20 sheet reads.
     Ab ek dafa id→row map banta hai aur yaad rakha jata hai (touch() par saaf).
     ---------------------------------------------------------------------- */
  _rowIdx: {},

  rowOf: function (name, id) {
    var map = DB._rowIdx[name];
    if (!map) {
      var sh = DB.sheet(name);
      var lastRow = sh.getLastRow();
      map = {};
      if (lastRow >= 2) {
        var ids = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
        for (var i = 0; i < ids.length; i++) map[ids[i][0]] = i + 2;
      }
      DB._rowIdx[name] = map;
    }
    return map[id] === undefined ? -1 : map[id];
  },

  count: function (name) { return DB.all(name).length; },

  /* ================================ WRITES ================================ */
  touch: function (name) {
    /* v2.8.4 — chunked cache ke sare tukre + index hatayein (purana single
       key bhi, upgrade se pehle ki bachi hui ho to) */
    DB._cacheDel(name);
    /* v2.7: in-execution rows cache bhi saaf — warna write ke baad purana
       data nazar aata (data integrity khatre me) */
    try { delete DB._rows[name]; } catch (e) { DB._rows[name] = null; }
    try { delete DB._rowIdx[name]; } catch (e) { DB._rowIdx[name] = null; }
  },

  /** naya record; id + timestamps auto */
  /**
   * HAR VALUE KO SHEET-CELL KE LAYAK BANAYEIN (v2.5.1)
   * -------------------------------------------------------------------------
   * Sheets sirf string/number/boolean/Date samajhta hai. Pehle object ya array
   * direct likha jata tha to cell mein "[object Object]" save ho jata tha —
   * data chala jata tha, koi error nahi.
   * Ab: object/array -> JSON string, boolean -> 'true'/'false', Date -> ISO.
   */
  _cell: function (v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return U.iso(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'object' || Array.isArray(v)) {
      try { return JSON.stringify(v); } catch (e) { return ''; }
    }
    return v;
  },

  /** JSON column wapas object/array chahiye to (read-side helper) */
  json: function (v, dft) {
    if (v === null || v === undefined || v === '') return dft === undefined ? null : dft;
    if (typeof v === 'object') return v;
    try { return JSON.parse(String(v)); } catch (e) { return dft === undefined ? null : dft; }
  },

  insert: function (name, obj, userCtx) {
    DB.sheetName(name);
    var rec = {};
    SCHEMA[name].forEach(function (k) { rec[k] = obj[k] === undefined ? '' : obj[k]; });
    if (!rec.id) rec.id = U.uid(name.substring(0, 3).toUpperCase());
    if (SCHEMA[name].indexOf('createdAt') > -1 && !rec.createdAt) rec.createdAt = U.iso();
    if (SCHEMA[name].indexOf('updatedAt') > -1) rec.updatedAt = U.iso();
    var sh = DB.sheet(name);
    sh.appendRow(SCHEMA[name].map(function (k) { return DB._cell(rec[k]); }));
    DB.touch(name);
    Audit.log('CREATE', name, rec.id, null, rec, userCtx);
    return rec;
  },

  /** bulk insert (imports ke liye) */
  insertMany: function (name, arr, userCtx) {
    if (!arr || !arr.length) return [];
    var sh = DB.sheet(name), cols = SCHEMA[name];
    var out = [], now = U.iso();
    var rows = arr.map(function (obj) {
      var rec = {};
      cols.forEach(function (k) { rec[k] = obj[k] === undefined ? '' : obj[k]; });
      if (!rec.id) rec.id = U.uid(name.substring(0, 3).toUpperCase());
      if (cols.indexOf('createdAt') > -1 && !rec.createdAt) rec.createdAt = now;
      out.push(rec);
      return cols.map(function (k) { return DB._cell(rec[k]); });
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, cols.length).setValues(rows);
    DB.touch(name);
    Audit.log('BULK_CREATE', name, '', null, { count: rows.length }, userCtx);
    return out;
  },

  /** patch by id */
  update: function (name, id, patch, userCtx) {
    var row = DB.rowOf(name, id);
    if (row === -1) throw new Error('Record not found: ' + name + '/' + id);
    var cols = SCHEMA[name];
    var sh = DB.sheet(name);
    var before = DB._rowToObject(sh, row, cols);
    var values = cols.map(function (k) {
      var v = patch[k] === undefined ? before[k] : patch[k];
      if (k === 'updatedAt' && !patch[k]) v = U.iso();
      return DB._cell(v);
    });
    sh.getRange(row, 1, 1, cols.length).setValues([values]);
    DB.touch(name);
    var after = DB._rowToObject(sh, row, cols);
    Audit.log('UPDATE', name, id, before, after, userCtx);
    return after;
  },

  /* ----------------------------------------------------------------------
     v2.7 §16 — updateMany(): kai records EK hi read + EK hi write mein
     ----------------------------------------------------------------------
     Pehle N records update karne ke liye N × (rowOf read + setValues write)
     hote thay. Ab poori sheet aik dafa padhi jati hai, sab tabdeeliyan
     memory mein lagti hain, aur aik hi setValues() se likha jata hai:
       20 accounts → 1 read + 1 write  (pehle 20 + 20)
     patches: [{ id: '...', patch: {col: value} }, ...]
     Har patch par updatedAt khud lag jata hai (update() ki tarah).
     Nateeja: [{ok:true,id,...} | {ok:false,id,error:'...'}]
     ---------------------------------------------------------------------- */
  updateMany: function (name, patches, userCtx) {
    if (!patches || !patches.length) return [];
    var cols = SCHEMA[name];
    var sh = DB.sheet(name);
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return patches.map(function (p) { return { ok: false, id: p.id, error: 'empty sheet' }; });

    var values = sh.getRange(1, 1, lastRow, cols.length).getValues();
    var now = U.iso();
    var out = [];
    var changed = false;
    var index = Object.create(null);
    var idCol = cols.indexOf('id');
    for (var ri = 1; ri < values.length; ri++) index[String(values[ri][idCol])] = ri;

    patches.forEach(function (p) {
      var ix = index[String(p.id)];
      if (ix === undefined) { out.push({ ok: false, id: p.id, error: 'not found' }); return; }
      var row = ix + 1;
      var before = {};
      cols.forEach(function (k, ci) { before[k] = values[ix][ci]; });
      cols.forEach(function (k, ci) {
        var v = (p.patch && p.patch[k] !== undefined) ? p.patch[k] : before[k];
        if (k === 'updatedAt' && !(p.patch && p.patch[k])) v = now;
        values[row - 1][ci] = DB._cell(v);
      });
      changed = true;
      out.push({ ok: true, id: p.id });
    });

    if (changed) {
      sh.getRange(1, 1, lastRow, cols.length).setValues(values);
      DB.touch(name);
    }
    try { Audit.log('BULK_UPDATE', name, '', null, { count: patches.length }, userCtx); } catch (e) { }
    return out;
  },

  /** soft delete (active/status flag ho to) warna hard delete */
  remove: function (name, id, userCtx) {
    var cols = SCHEMA[name];
    var before = DB.byId(name, id);
    if (!before) throw new Error('Record not found: ' + name + '/' + id);
    if (cols.indexOf('active') > -1) return DB.update(name, id, { active: 'false' }, userCtx);
    if (cols.indexOf('status') > -1) return DB.update(name, id, { status: 'DELETED' }, userCtx);
    var row = DB.rowOf(name, id);
    DB.sheet(name).deleteRow(row);
    DB.touch(name);
    Audit.log('DELETE', name, id, before, null, userCtx);
    return { id: id };
  },

  /** purana data saaf karo (Data Deletion Utility) */
  purge: function (name, predicateFn) {
    var sh = DB.sheet(name), cols = SCHEMA[name];
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return 0;
    var vals = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
    var keep = [];
    for (var i = 0; i < vals.length; i++) {
      var obj = {}; cols.forEach(function (k, j) { obj[k] = vals[i][j]; });
      if (!predicateFn(obj)) keep.push(vals[i]);
    }
    var removed = vals.length - keep.length;
    if (removed) {
      sh.getRange(2, 1, lastRow - 1, cols.length).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, cols.length).setValues(keep);
      DB.touch(name);
    }
    return removed;
  },

  /** raw values batch update (fast paths: stock posting) */
  setRowValues: function (name, rowNumber, values) {
    DB.sheet(name).getRange(rowNumber, 1, 1, values.length)
      .setValues([values.map(function (v) { return DB._cell(v); })]);
    DB.touch(name);
  },

  _rowToObject: function (sh, row, cols) {
    var v = sh.getRange(row, 1, 1, cols.length).getDisplayValues()[0];
    var o = {}; cols.forEach(function (k, i) { o[k] = v[i]; }); return o;
  },

  /* ============================ NUMBER SERIES ============================= */
  nextNumber: function (entity, locationId) {
    var rows = DB.all('NumberSeries', true);
    var key = entity + '|' + (locationId || 'GLOBAL');
    var rec = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].entity + '|' + rows[i].locationId === key) rec = rows[i];
    var prefixDefault = { SALE: 'INV', RETURN: 'RTN', PO: 'PO', GRN: 'GRN', PRET: 'PRT',
      TRANSFER: 'TRF', ADJ: 'ADJ', PAY: 'PAY', EXP: 'EXP', SESSION: 'CS', JV: 'JV',
      CNT: 'CNT', ORDER: 'ORD',
      /* v2.6 §12 */
      SIS: 'SIS', SRT: 'SRT', SST: 'STLM', SVS: 'VIS',
      /* v2.9 §12 — salesman routes */
      SMROUTE: 'SROUTE',
      /* v2.6 §7 */
      DRP: 'DAYREP',
      /* customer demand */
      DEMAND: 'DMD' }[entity] || 'DOC';
    var n, prefix;
    if (!rec) {
      prefix = prefixDefault + (locationId ? '-' + (DB.byId('Locations', locationId) || {}).code : '');
      n = 1;
      DB.insert('NumberSeries', { id: U.uid('NS'), entity: entity, locationId: locationId || 'GLOBAL',
        prefix: prefix, next: '2', padding: '5', updatedAt: U.iso() });
    } else {
      n = U.num(rec.next, 1); prefix = rec.prefix || prefixDefault;
      DB.update('NumberSeries', rec.id, { next: String(n + 1), updatedAt: U.iso() });
    }
    return prefix + '-' + U.pad(n, 5);
  },

  /* =============================== SETTINGS =============================== */
  settings: function () {
    var rows = DB.all('Settings');
    var out = {};
    DEFAULT_SETTINGS && Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k]; });
    rows.forEach(function (r) { if (r.key) out[r.key] = r.value; });
    return out;
  },

  /** v2.12.1: one fresh Settings read; write only changed contiguous ranges.
   * All settings writers share the script lock. No full-table overwrite of
   * unrelated rows, no read/write loop, and per-key audit records are retained.
   */
  setSettings: function (input, userCtx) {
    input = input || {};
    var lock = LockService.getScriptLock();
    var owned = lock.hasLock();
    if (!owned && !lock.tryLock(2000)) {
      throw new Error('SETTINGS_BUSY: another save is running. Wait, reload settings, then retry.');
    }
    var attempted = false;
    var committedAudits = [];
    try {
      var keys = Object.keys(input);
      if (!keys.length) return { changed: 0, records: {}, previous: {} };
      var sh = DB.sheet('Settings'), cols = SCHEMA.Settings;
      var last = sh.getLastRow();
      var rows = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
      var keyCol = cols.indexOf('key');
      var byKey = Object.create(null);
      rows.forEach(function (r, i) { if (byKey[String(r[keyCol])] === undefined) byKey[String(r[keyCol])] = i; });
      var records = {}, previous = {}, dirty = [], auditByRow = {};
      var now = U.iso(), ctx = userCtx || {};
      keys.forEach(function (key) {
        var ix = byKey[key];
        var before = null;
        if (ix !== undefined) {
          before = {};
          cols.forEach(function (c, ci) { before[c] = rows[ix][ci]; });
        }
        previous[key] = before ? before.value :
          (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key) ? DEFAULT_SETTINGS[key] : null);
        var val = String(input[key]);
        if (before && String(before.value) === val) { records[key] = before; return; }
        var rec = before ? Object.assign({}, before) : {
          id: U.uid('SET'), key: key, type: typeof input[key]
        };
        rec.value = val; rec.updatedAt = now;
        if (ix === undefined) { ix = rows.length; byKey[key] = ix; }
        rows[ix] = cols.map(function (c) { return DB._cell(rec[c]); });
        dirty.push(ix); records[key] = rec;
        auditByRow[ix] = { id: U.uid('LOG'), ts: now, userId: ctx.userId || '', username: ctx.username || '',
          action: before ? 'UPDATE' : 'CREATE', entity: 'Settings', entityId: rec.id,
          before: before ? JSON.stringify(before).substring(0, 4000) : '',
          after: JSON.stringify(rec).substring(0, 4000), ip: ctx.ip || '',
          locationId: ctx.locationId || ctx.defaultLocationId || '' };
      });
      dirty.sort(function (a, b) { return a - b; });
      for (var i = 0; i < dirty.length;) {
        var start = dirty[i], end = start; i++;
        while (i < dirty.length && dirty[i] === end + 1) { end = dirty[i]; i++; }
        attempted = true;
        sh.getRange(start + 2, 1, end - start + 1, cols.length).setValues(rows.slice(start, end + 1));
        for (var ai = start; ai <= end; ai++) committedAudits.push(auditByRow[ai]);
      }
      return { changed: dirty.length, records: records, previous: previous };
    } finally {
      // Preserve audits for successful ranges even if a later range fails.
      if (committedAudits.length) {
        try { DB.insertMany('AuditLog', committedAudits, userCtx); }
        catch (e) { Logger.log('Settings audit batch failed: ' + e.message); }
      }
      if (attempted) DB.touch('Settings');
      if (!owned) {
        try { if (attempted) SpreadsheetApp.flush(); }
        finally { lock.releaseLock(); }
      }
    }
  },

  setSetting: function (key, value, userCtx) {
    var values = {}; values[key] = value;
    return DB.setSettings(values, userCtx).records[key];
  },

  /* =============================== STATS/HEALTH =========================== */
  stats: function () {
    var out = {};
    Object.keys(SCHEMA).forEach(function (k) {
      try { out[k] = DB.sheet(k).getLastRow() - 1; } catch (e) { out[k] = -1; }
    });
    return out;
  }
};
