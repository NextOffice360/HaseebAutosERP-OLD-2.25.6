/**
 * HASEEB AUTOS - ERP / POS  ::  MIGRATION PATH (Sheets → Firebase / Cloud SQL)
 * ---------------------------------------------------------------------------
 * Sheet jab bari ho jaye (≈50k+ rows ya 1M+ cells) to Apps Script + Sheets
 * slow ho jata hai. Ye module us din ke liye hai:
 *
 *   assess()  — har table ke rows, cells, estimated bytes, risk score, tier
 *               SHEETS_OK (<25k rows) · OPTIMIZE (25k–100k) · MIGRATE (>100k ya >1M cells)
 *   plan()    — Firestore collection map, composite indexes, security rules,
 *               copy-paste cutover checklist, code adapter notes
 *   export()  — har table ka JSON dump (chunked ≤ 4.5MB) → Drive file links
 *   sync()    — changed rows (updatedAt > lastSyncAt) Firebase REST par push:
 *               • Realtime DB : PUT {DB_URL}/{collection}/{id}.json?auth={SECRET}
 *               • Firestore   : POST /v1/projects/{ID}/databases/(default)/documents:commit
 *   status()  — config presence + per-table last sync timestamps
 *
 * Script Properties (Project Settings ▸ Script properties):
 *   FIREBASE_DB_URL      https://<project>.firebaseio.com        (Realtime DB)
 *   FIREBASE_DB_SECRET   database secret                          (Realtime DB)
 *   FIREBASE_PROJECT_ID  <project-id>                             (Firestore)
 *   FIREBASE_ID_TOKEN    OAuth2 access token (short-lived)        (Firestore)
 * ---------------------------------------------------------------------------
 */

var Migration = {
  /* tables jinki mapping Firestore collections me hoti hai */
  TABLES: ['Items', 'Customers', 'Suppliers', 'Sales', 'SaleItems', 'Purchases', 'PurchaseItems',
    'StockLedger', 'Payments', 'Expenses', 'Ledger', 'Stock', 'AuditLog', 'Notifications',
    'LoyaltyLedger', 'Messages', 'PriceImports'],

  /* ============================== ASSESS =================================== */
  assess: function (s) {
    Auth.require(s, 'settings.view');
    var tables = [];
    var totalRows = 0, totalCells = 0, totalBytes = 0;

    Migration.TABLES.forEach(function (name) {
      var cols = (SCHEMA[name] || []).length || 8;
      var rows = 0;
      try { rows = DB.count(name); } catch (e) { rows = 0; }
      var cells = rows * cols;
      var bytes = Math.round(cells * 42);            // ~42 bytes/cell average
      totalRows += rows; totalCells += cells; totalBytes += bytes;
      tables.push({ table: name, rows: rows, cols: cols, cells: cells, bytes: bytes,
        firestore: Migration._collection(name), risk: Migration._risk(rows, cells) });
    });

    tables.sort(function (a, b) { return b.rows - a.rows; });

    var tier = (totalRows > 100000 || totalCells > 1000000) ? 'MIGRATE'
      : (totalRows > 25000 || totalCells > 250000) ? 'OPTIMIZE' : 'SHEETS_OK';

    return {
      tier: tier,
      totals: { rows: totalRows, cells: totalCells, bytes: totalBytes,
        mb: U.round(totalBytes / 1048576, 2) },
      limits: { sheetsCells: 10000000, appsScriptQuotaMb: 100, maxRowsPerSheet: 5000000 },
      usedPct: U.round((totalCells / 10000000) * 100, 3),
      tables: tables,
      heavy: tables.filter(function (t) { return t.rows > 10000; }),
      advice: Migration._advice(tier, tables),
      config: Migration.status(s).config
    };
  },

  _collection: function (name) {
    return name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() + 's';
  },
  _risk: function (rows, cells) {
    if (rows > 100000 || cells > 1000000) return 'HIGH';
    if (rows > 25000 || cells > 250000) return 'MEDIUM';
    return 'LOW';
  },
  _advice: function (tier, tables) {
    var a = [];
    var heavy = tables.filter(function (t) { return t.risk !== 'LOW'; }).slice(0, 5);
    if (tier === 'SHEETS_OK') {
      a.push('Sheet abhi theek hai — archival policy rakhein (purani Sales/StockLedger rows archive karein).');
    } else if (tier === 'OPTIMIZE') {
      a.push('Indexes + caching on rakhein, purane rows archive karein, aur Firebase sync abhi se set kar lein.');
    } else {
      a.push('Firebase (Firestore) par migrate karein: read/write latency aur 5M cell limit dono ka hal.');
    }
    heavy.forEach(function (t) {
      a.push(t.table + ': ' + t.rows.toLocaleString() + ' rows → Firestore collection "' + t.firestore + '" me jayega.');
    });
    a.push('Cutover checklist: export → Firestore import → dual-write 1 hafta → read switch → sheets read-only.');
    return a;
  },

  /* =============================== PLAN ==================================== */
  plan: function (s) {
    Auth.require(s, 'settings.view');
    var assess = Migration.assess(s);
    var collections = assess.tables.filter(function (t) { return t.rows > 0 || ['Items', 'Sales'].indexOf(t.table) > -1; })
      .map(function (t) {
        return { collection: t.firestore, source: t.table, rows: t.rows,
          docId: 'row.id',
          fields: (SCHEMA[t.table] || []).slice(0, 12),
          indexes: Migration._indexes(t.table) };
      });

    return {
      target: 'Firestore (Native mode)', region: 'asia-south1 (Mumbai) — Pakistan ke qareeb',
      collections: collections,
      indexes: [
        { collection: 'sales', fields: ['date DESC', 'locationId ASC'] },
        { collection: 'sales', fields: ['customerId ASC', 'date DESC'] },
        { collection: 'sale_items', fields: ['saleId ASC'] },
        { collection: 'stock_ledgers', fields: ['itemId ASC', 'date DESC'] },
        { collection: 'items', fields: ['code ASC'] }, { collection: 'items', fields: ['barcode ASC'] },
        { collection: 'payments', fields: ['date DESC', 'method ASC'] }
      ],
      rules: [
        'match /databases/{db}/documents/{col}/{id} {',
        '  allow read: if request.auth != null;',
        '  allow write: if request.auth != null && request.auth.token.role in ["Owner","Manager"];',
        '}'
      ].join('\n'),
      steps: [
        { n: 1, title: 'Firebase project banayein', detail: 'console.firebase.google.com → project → Firestore (asia-south1) → Realtime DB off (agar sirf Firestore chahiye).' },
        { n: 2, title: 'Service account key', detail: 'Project settings ▸ Service accounts ▸ Generate key (JSON) → Apps Script Script Properties me FIREBASE_PROJECT_ID + key daalein.' },
        { n: 3, title: 'Export data', detail: 'Settings ▸ Migration ▸ Export JSON — har table ka Drive file milega.' },
        { n: 4, title: 'Import to Firestore', detail: 'Node script ya Firebase CLI: firebase firestore:import (docs/backup/FIRESTORE_IMPORT.md dekhein).' },
        { n: 5, title: 'Dual-write (1 hafta)', detail: 'migration.sync() roz chale — naye/updated rows dono jagah jayenge.' },
        { n: 6, title: 'Read switch', detail: 'DB adapter ka source FIRESTORE kar dein (DB.useSource("FIRESTORE")) — frontend code badalne ki zaroorat nahi.' },
        { n: 7, title: 'Sheets read-only', detail: 'Purani sheet archive karein, triggers hata dein.' }
      ],
      codeNotes: [
        'DB.gs me ek adapter layer hai: DB.all/DB.byId/DB.insert/DB.update/DB.remove — sirf inke andar source badalna hai.',
        'OfflineSync.gs ka queue Firebase par bhi replay ho sakta hai (same payload).',
        'Auth/RBAC waisa hi rahega — Users table Firestore me shift ho jayegi.'
      ],
      estimate: {
        rows: assess.totals.rows, cells: assess.totals.cells, mb: assess.totals.mb,
        firestoreWrites: assess.totals.rows,
        firestoreCostNote: 'Free tier 20k writes/day; ek baar ka import ~' +
          assess.totals.rows.toLocaleString() + ' writes (batch 500 per commit).'
      }
    };
  },

  _indexes: function (table) {
    var map = {
      Sales: ['date DESC', 'locationId ASC'], SaleItems: ['saleId ASC'],
      StockLedger: ['itemId ASC', 'date DESC'], Items: ['code ASC'],
      Payments: ['date DESC'], Ledger: ['partyId ASC', 'date DESC']
    };
    return map[table] || ['date DESC'];
  },

  /* ============================== EXPORT =================================== */
  /** Har table ka JSON dump → Drive files (chunked 4.5MB) */
  export: function (p, s) {
    Auth.require(s, 'settings.view');
    p = p || {};
    var names = (p.tables && p.tables.length) ? p.tables : Migration.TABLES;
    var folder = DriveApp.createFolder('Haseeb Autos Migration — ' + U.dateOnly());
    var files = [];

    names.forEach(function (name) {
      var rows = [];
      try { rows = DB.all(name); } catch (e) { rows = []; }
      if (!rows.length) return;
      var json = JSON.stringify(rows);
      var chunkSize = 4500000;
      var parts = Math.ceil(json.length / chunkSize);
      for (var i = 0; i < parts; i++) {
        var blob = Utilities.newBlob(json.substring(i * chunkSize, (i + 1) * chunkSize), 'application/json',
          Migration._collection(name) + (parts > 1 ? '-part' + (i + 1) : '') + '.json');
        var f = folder.createFile(blob);
        files.push({ table: name, collection: Migration._collection(name),
          name: f.getName(), id: f.getId(), url: f.getUrl(), bytes: f.getSize(), part: i + 1, parts: parts });
      }
    });

    var manifest = Utilities.newBlob(JSON.stringify({
      exportedAt: U.iso(), tables: names, files: files,
      mapping: names.map(function (n) { return { sheet: n, collection: Migration._collection(n) }; })
    }, null, 2), 'application/json', 'manifest.json');
    var mf = folder.createFile(manifest);

    DB.insert('MigrationLog', { id: U.uid('MIG'), date: U.iso(), action: 'EXPORT',
      tables: names.join(','), files: files.length, bytes: U.sum(files, 'bytes'),
      status: 'OK', notes: folder.getUrl(), createdBy: s.userId, createdAt: U.iso() }, s);

    return { folderUrl: folder.getUrl(), folderId: folder.getId(),
      manifestUrl: mf.getUrl(), files: files };
  },

  /* =============================== SYNC ==================================== */
  status: function (s) {
    var props = {};
    try { props = PropertiesService.getScriptProperties().getProperties() || {}; } catch (e) { }
    var last = {};
    DB.all('MigrationLog').forEach(function (r) {
      if (r.action === 'SYNC' && (!last[r.tables] || U.str(r.date) > U.str(last[r.tables].date))) last[r.tables] = r;
    });
    var mode = props.FIREBASE_DB_URL ? 'REALTIME_DB' : (props.FIREBASE_PROJECT_ID ? 'FIRESTORE' : 'NONE');
    return {
      config: {
        mode: mode,
        ready: mode !== 'NONE',
        dbUrl: props.FIREBASE_DB_URL ? 'set' : '',
        projectId: props.FIREBASE_PROJECT_ID || '',
        hasToken: !!(props.FIREBASE_DB_SECRET || props.FIREBASE_ID_TOKEN),
        autoSync: U.str(DB.settings()['migration.autoSync']) === 'true'
      },
      lastSync: Object.keys(last).map(function (k) {
        return { tables: k, date: last[k].date, status: last[k].status, notes: last[k].notes };
      })
    };
  },

  /**
   * Changed rows Firebase par bhejein.
   * p = { tables:[], since:'ISO', limit }
   */
  sync: function (p, s) {
    Auth.require(s, 'settings.view');
    p = p || {};
    var st = Migration.status(s);
    if (!st.config.ready) throw new Error('Firebase config missing — Script Properties set karein (guide dekhein).');
    var props = PropertiesService.getScriptProperties();
    var since = p.since || Migration._lastSyncAt(p.tables) || '1970-01-01T00:00:00.000Z';
    var names = (p.tables && p.tables.length) ? p.tables : Migration.TABLES;
    var limit = U.num(p.limit, 500);
    var pushed = 0, errors = [];

    names.forEach(function (name) {
      var rows = [];
      try { rows = DB.all(name); } catch (e) { rows = []; }
      var changed = rows.filter(function (r) {
        var t = U.str(r.updatedAt || r.createdAt || r.date || '');
        return t > since;
      }).slice(0, limit);
      if (!changed.length) return;
      if (st.config.mode === 'REALTIME_DB') {
        changed.forEach(function (r) {
          try {
            UrlFetchApp.fetch(props.getProperty('FIREBASE_DB_URL') + '/' +
              Migration._collection(name) + '/' + r.id + '.json?auth=' + props.getProperty('FIREBASE_DB_SECRET'),
              { method: 'put', contentType: 'application/json', payload: JSON.stringify(r), muteHttpExceptions: true });
            pushed++;
          } catch (e) { errors.push(name + '/' + r.id + ': ' + e.message); }
        });
      } else {
        // Firestore batch commit (max 500 writes per commit)
        var writes = changed.slice(0, 500).map(function (r) {
          return { update: { name: 'projects/' + props.getProperty('FIREBASE_PROJECT_ID') +
            '/databases/(default)/documents/' + Migration._collection(name) + '/' + r.id,
            fields: Migration._toFirestore(r) } };
        });
        try {
          UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' +
            props.getProperty('FIREBASE_PROJECT_ID') + '/databases/(default)/documents:commit', {
            method: 'post', contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + props.getProperty('FIREBASE_ID_TOKEN') },
            payload: JSON.stringify({ writes: writes }), muteHttpExceptions: true
          });
          pushed += writes.length;
        } catch (e) { errors.push(name + ': ' + e.message); }
      }
    });

    DB.insert('MigrationLog', { id: U.uid('MIG'), date: U.iso(), action: 'SYNC',
      tables: names.join(','), files: 0, bytes: pushed, status: errors.length ? 'PARTIAL' : 'OK',
      notes: (errors.slice(0, 3).join(' | ') || ('pushed ' + pushed + ' docs since ' + since)),
      createdBy: s.userId, createdAt: U.iso() }, s);

    return { pushed: pushed, errors: errors, since: since, mode: st.config.mode };
  },

  _lastSyncAt: function (tables) {
    var key = (tables && tables.length) ? tables.join(',') : Migration.TABLES.join(',');
    var rows = DB.all('MigrationLog').filter(function (r) { return r.action === 'SYNC' && r.tables === key; });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    return rows[0].date;
  },

  /** JS object → Firestore value map */
  _toFirestore: function (obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === null || v === undefined) { out[k] = { nullValue: null }; return; }
      if (typeof v === 'number') {
        out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      } else if (typeof v === 'boolean') {
        out[k] = { booleanValue: v };
      } else if (typeof v === 'object') {
        out[k] = { stringValue: JSON.stringify(v) };
      } else {
        var n = Number(v);
        out[k] = (U.str(v) !== '' && !isNaN(n) && /^-?\d+(\.\d+)?$/.test(U.str(v)))
          ? (Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n })
          : { stringValue: String(v) };
      }
    });
    return out;
  },

  log: function (p, s) {
    Auth.require(s, 'settings.view');
    var rows = DB.all('MigrationLog').sort(function (a, b) {
      return U.str(b.date).localeCompare(U.str(a.date));
    }).slice(0, U.num(p && p.limit, 50));
    return rows.map(function (r) {
      return { id: r.id, date: r.date, action: r.action, tables: r.tables,
        files: U.num(r.files), bytes: U.num(r.bytes), status: r.status, notes: r.notes };
    });
  }
};
