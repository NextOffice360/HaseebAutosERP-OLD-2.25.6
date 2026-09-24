/**
 * HASEEB AUTOS - ERP / POS  ::  SETUP
 * Ek hi baar chalana hai: setupAll()
 *  1) Spreadsheet banata hai (ya existing attach karta hai)
 *  2) SCHEMA ke mutabiq saari sheets + headers banata hai
 *  3) 3 locations, 9 users, customer types, number series, default settings seed karta hai
 */

var Setup = {

  /**
   * MASTER SETUP. Naya spreadsheet banata hai aur Script Property set karta hai.
   * Existing sheet use karni ho to: Setup.attach('<SHEET_ID>')
   */
  setupAll: function () {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return { complete: false, busy: true,
      message: 'Setup pehle se chal raha hai. Thori der baad setupAll dobara Run karein.' };
    try {
      var props = PropertiesService.getScriptProperties();
      var id = props.getProperty('SPREADSHEET_ID');
      var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('Haseeb Autos - ERP Database');
      if (!id) props.setProperty('SPREADSHEET_ID', ss.getId());
      DB.resetConnection();
      var state = {};
      try { state = JSON.parse(props.getProperty('SETUP_PROGRESS_V212') || '{}'); } catch (e) { }
      if (state.id !== ss.getId() || state.version !== CONFIG.VERSION) {
        state = { id: ss.getId(), version: CONFIG.VERSION, next: 0 };
      }
      var sheets = Object.keys(SCHEMA);
      var seedPlan = setupSeedPlan_();
      var seeds = seedPlan.map(function(step){return step.method;});
      var total = sheets.length + seeds.length + 1;
      var deadline = Date.now() + 45000;
      if(typeof state.next!=='number' || !isFinite(state.next) || state.next<0 || state.next>total || Math.floor(state.next)!==state.next) state.next=0;
      var recovery = [];
      // A stored checkpoint is progress, not proof that physical seed rows exist.
      if(state.next>=sheets.length){
        var initial=setupSeedStatus_(ss);
        if(!initial.ready){
          recovery=initial.missing;
          state.next=Math.min(state.next,sheets.length+initial.firstMissingStep);
          props.setProperty('SETUP_PROGRESS_V212',JSON.stringify(state));
        }
      }
      while (state.next < total && Date.now() < deadline) {
        var n = state.next;
        if (n < sheets.length) Setup.createSheet(sheets[n]);
        else if (n < sheets.length + seeds.length) {
          var step=seedPlan[n-sheets.length];
          setupRunSeedStep_(ss,step);
        }
        else if (typeof Triggers !== 'undefined') state.jobs = Triggers.install({});
        state.next++;
        props.setProperty('SETUP_PROGRESS_V212', JSON.stringify(state));
      }
      var seedStatus = state.next>=sheets.length ? setupSeedStatus_(ss) : null;
      var complete = state.next >= total && !!seedStatus && seedStatus.ready;
      if(state.next>=total && !complete){state.next=sheets.length+seedStatus.firstMissingStep;props.setProperty('SETUP_PROGRESS_V212',JSON.stringify(state));}
      return { spreadsheetId: ss.getId(), url: ss.getUrl(), complete: complete,
        completedSteps: state.next, totalSteps: total, jobs: state.jobs || {},
        phase: complete?'COMPLETE':state.next<sheets.length?'SCHEMA':'SEEDING',
        nextStep: complete?'':state.next<sheets.length?'createSheet: '+sheets[state.next]:(seeds[state.next-sheets.length]||'installTriggers'),
        seedCounts: seedStatus?Object.keys(seedStatus.tables).reduce(function(out,name){out[name]=seedStatus.tables[name].rows;return out;},{}):{},
        missingSeedTables: seedStatus?seedStatus.missing:[], recoveryDetected: recovery,
        demoDataSkipped: seedStatus?(seedStatus.skipped||[]).length>0:false,
        seedSkips: seedStatus?(seedStatus.skipped||[]):[],
        message: complete ? 'Setup complete. Ab Deploy > New deployment > Web app karein.' :
          'Progress mehfooz: ' + state.next + '/' + total + '. Setup.gs > setupAll > Run dobara karein; wahi database resume ho ga.' };
    } finally { lock.releaseLock(); }
  },

  /** Existing spreadsheet ko is script se link karo */
  attach: function (spreadsheetId) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheetId);
    try { DB.resetConnection(); } catch (e) { }
    return Setup.setupAll();
  },

  /** Sirf sheets banayein / naye columns add karein (safe, data preserve) */
  buildAll: function () {
    Object.keys(SCHEMA).forEach(function (name) { Setup.createSheet(name); });
    return true;
  },

  /**
   * SCHEMA HEALTH — kaunsi sheet ghaayab hai, kaunse columns missing hain.
   * (Naye columns code likhta hai par sheet mein na hon to data chupke se drop
   *  ho jata hai — is liye ye check zaroori hai.)
   */
  schemaHealth: function (s) {
    var ss = DB.ss();
    var names = Object.keys(SCHEMA);
    var missingSheets = [], missingColumns = {}, present = [], rowCounts = {};
    names.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) { missingSheets.push(name); return; }
      var last = sh.getLastColumn();
      var existing = last ? sh.getRange(1, 1, 1, last).getDisplayValues()[0] : [];
      var miss = SCHEMA[name].filter(function (c) { return existing.indexOf(c) === -1; });
      if (miss.length) missingColumns[name] = miss;
      present.push(name);
      rowCounts[name] = Math.max(0, sh.getLastRow() - 1);
    });
    var missColCount = Object.keys(missingColumns).reduce(function (a, k) { return a + missingColumns[k].length; }, 0);
    return {
      sheets: names.length, present: present.length, missingSheets: missingSheets,
      missingColumns: missingColumns, missingColumnCount: missColCount,
      rowCounts: rowCounts,
      totalRows: Object.keys(rowCounts).reduce(function (a, k) { return a + rowCounts[k]; }, 0),
      columns: names.reduce(function (a, k) { return a + SCHEMA[k].length; }, 0),
      healthy: missingSheets.length === 0 && missColCount === 0
    };
  },

  /** REPAIR / UPGRADE — ghaayab sheets banayein, missing columns append karein (data safe) */
  repair: function (s) {
    Auth.require(s, 'settings.manage');
    var before = Setup.schemaHealth(s);
    Setup.buildAll();
    var after = Setup.schemaHealth(s);
    Audit.log('SETUP', 'SCHEMA', '', JSON.stringify(before.missingSheets), JSON.stringify(after.missingSheets), s);
    return {
      created: after.present - before.present,
      columnsAdded: Math.max(0, before.missingColumnCount - after.missingColumnCount),
      before: { missingSheets: before.missingSheets.length, missingColumns: before.missingColumnCount },
      after: { missingSheets: after.missingSheets.length, missingColumns: after.missingColumnCount },
      healthy: after.healthy, sheets: after.sheets, totalRows: after.totalRows
    };
  },

  createSheet: function (name) {
    var ss = DB.ss();
    var sh = ss.getSheetByName(name);
    var cols = SCHEMA[name];
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, cols.length)
        .setBackground('#0b1220').setFontColor('#e6edf3').setFontWeight('bold').setFontSize(10);
    } else if (sh.getLastColumn() === 0) {
      /* sheet maujood par bilkul khali — headers pehli bar likhein */
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, cols.length)
        .setBackground('#0b1220').setFontColor('#e6edf3').setFontWeight('bold').setFontSize(10);
    } else {
      // missing columns append karein (schema upgrade)
      var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      var missing = cols.filter(function (c) { return existing.indexOf(c) === -1; });
      if (missing.length) {
        sh.insertColumnsAfter(Math.max(existing.length, 1), missing.length);
        sh.getRange(1, existing.length + 1, 1, missing.length)
          .setValues([missing])
          .setBackground('#0b1220').setFontColor('#e6edf3').setFontWeight('bold');
      }
    }
    // Batch formatting: two service calls, not one RPC per column.
    try {
      sh.setColumnWidth(1, 150);
      if (cols.length > 1) sh.setColumnWidths(2, cols.length - 1, 120);
    } catch (e) { }

    /* v2.8 — ye sheet ab ban chuki / isme columns jud chuke hain.
       DB._rows aur _rowIdx IN-EXECUTION memo hain: agar is execution mein
       kisi ne is sheet ko pehle padha tha (masalan DB.gs:48 ne jab sheet
       missing thi to DB.all() khali/partial rows laya), to woh purana data
       ab bhi memo me baitha hoga aur nayi columns/headers nazar nahi aayengi
       — chupke se ghalat data. Isliye cache saaf karna LAZMI hai.
       (Audit.gs ka appendRow wala bug isi ki ek shakl tha.) */
    DB.touch(name);
    return sh;
  },

  /* ================================ SEEDING ================================ */
  seedAll: function () {
    Setup.seedLocations();
    Setup.seedGroupsAndUsers();
    Setup.seedCustomerTypes();
    Setup.seedSettings();
    Setup.seedNumberSeries();
    Setup.seedCatalog();
    Setup.seedWarehouses();
    Setup.seedTemplates();
    Setup.seedCustomFields();
    Setup.seedTranslations();
    Setup.seedAccounts();
    /* v2.30.0 — fresh install foran usable: demo customer/supplier/items.
       Ye khud ko gate karta hai (data.seedDemo + live DB) — { skipped:true } wapas. */
    try { Setup.seedDemoData(); } catch (e) { Logger.log('seedDemoData skipped: ' + e.message); }
    return 'Seeded: locations, users, catalog, warehouses, templates, custom fields, chart of accounts, demo data.';
  },

  /** v2.5: default chart of accounts (Accounting module) */
  seedAccounts: function () {
    return Accounting.seedAccounts(null); // failures must not be marked as successful setup
  },

  seedLocations: function () {
    if (DB.count('Locations')) return;
    var defs = [
      { code: 'SDQ', name: 'Sadiqabad City', address: 'Main Bazar, Sadiqabad', isDefault: 'true' },
      { code: 'MCH', name: 'Machi Goth', address: 'Machi Goth, Sadiqabad', isDefault: 'false' },
      { code: 'RYK', name: 'RYK Branch', address: 'Rahim Yar Khan', isDefault: 'false' }
    ];
    defs.forEach(function (l) {
      DB.insert('Locations', {
        id: 'LOC-' + l.code, code: l.code, name: l.name, address: l.address,
        phone: '', manager: '', isDefault: l.isDefault, active: 'true', createdAt: U.iso()
      });
    });
  },

  seedGroupsAndUsers: function () {
    if (!DB.count('Groups')) {
      var groups = [
        { id: 'GRP-OWNER', name: 'Owners', type: 'Admin', permissions: '*', saleReturnLimit: '0', dataViewLimit: '0' },
        { id: 'GRP-HO', name: 'Head Office', type: 'Admin', permissions: '*', saleReturnLimit: '0', dataViewLimit: '0' },
        { id: 'GRP-MGR', name: 'Shop Managers', type: 'Shop', permissions: '', saleReturnLimit: '100000', dataViewLimit: '365' },
        { id: 'GRP-SAL', name: 'Sales Shops', type: 'Shop', permissions: '', saleReturnLimit: '5000', dataViewLimit: '30' },
        { id: 'GRP-WH', name: 'Warehouse', type: 'Shop', permissions: '', saleReturnLimit: '0', dataViewLimit: '90' }
      ];
      DB.insertMany('Groups', groups.map(function (g) {
        return { id: g.id, name: g.name, type: g.type, permissions: g.permissions,
          saleReturnLimit: g.saleReturnLimit, dataViewLimit: g.dataViewLimit, comments: '', active: 'true' };
      }));
    }
    if (DB.count('Users')) return;

    var staff = [
      { u: 'owner', n: 'Haseeb (Owner)', r: 'OWNER', g: 'GRP-OWNER', loc: 'LOC-SDQ,LOC-MCH,LOC-RYK', pw: 'admin123' },
      { u: 'manager', n: 'Shop Manager', r: 'MANAGER', g: 'GRP-MGR', loc: 'LOC-SDQ,LOC-MCH,LOC-RYK', pw: 'manager123' },
      { u: 'sales1', n: 'Salesman One', r: 'SALESMAN', g: 'GRP-SAL', loc: 'LOC-SDQ', pw: 'sales123' },
      { u: 'purchase', n: 'Purchase Officer', r: 'PURCHASE', g: 'GRP-MGR', loc: 'LOC-SDQ,LOC-RYK', pw: 'purchase123' },
      { u: 'warehouse', n: 'Warehouse Incharge', r: 'WAREHOUSE', g: 'GRP-WH', loc: 'LOC-SDQ,LOC-MCH,LOC-RYK', pw: 'ware123' },
      { u: 'accountant', n: 'Accountant', r: 'ACCOUNTANT', g: 'GRP-HO', loc: 'LOC-SDQ,LOC-MCH,LOC-RYK', pw: 'acc123' },
      { u: 'cashier', n: 'Cashier', r: 'CASHIER', g: 'GRP-SAL', loc: 'LOC-SDQ', pw: 'cash123' },
      { u: 'delivery', n: 'Delivery Boy', r: 'DELIVERY', g: 'GRP-SAL', loc: 'LOC-SDQ', pw: 'del123' },
      { u: 'other', n: 'Helper / Other', r: 'OTHER', g: 'GRP-WH', loc: 'LOC-SDQ', pw: 'other123' }
    ];
    DB.insertMany('Users', staff.map(function (s) {
      var h = U.hashPassword(s.pw);
      return {
        id: U.uid('USR'), username: s.u, fullName: s.n, passwordHash: h.hash, salt: h.salt,
        email: s.u + '@haseebautos.pk', phone: '', role: s.r, groupId: s.g, locationIds: s.loc,
        defaultLocationId: s.loc.split(',')[0], commissionRate: s.r === 'SALESMAN' ? '1' : '0',
        discountLimit: s.r === 'OWNER' ? '100' : (s.r === 'MANAGER' ? '10' : '2'),
        active: 'true', createdAt: U.iso()
      };
    }));
  },

  seedCustomerTypes: function () {
    if (DB.count('CustomerTypes')) return;
    [{ name: 'Retail / Walk-in', discountPct: '0', priceTier: 'RETAIL', creditLimit: '0' },
     { name: 'Wholesale', discountPct: '10', priceTier: 'WHOLESALE', creditLimit: '500000' },
     { name: 'Mechanic', discountPct: '5', priceTier: 'RETAIL', creditLimit: '50000' },
     { name: 'VIP / Member', discountPct: '7', priceTier: 'RETAIL', creditLimit: '100000' },
     { name: 'Corporate', discountPct: '12', priceTier: 'WHOLESALE', creditLimit: '1000000' }
    ].forEach(function (c) {
      DB.insert('CustomerTypes', { id: U.uid('CT'), name: c.name, discountPct: c.discountPct,
        creditLimit: c.creditLimit, priceTier: c.priceTier, active: 'true' });
    });
  },


  /* ============================ v2 SEEDING ================================ */
  seedCatalog: function () {
    if (!DB.count('Categories')) {
      [['CAR-CARE', 'Car Care'], ['CLEANING', 'Car Cleaning'], ['PARTS', 'Auto Parts'],
       ['LIGHTS', 'Lights'], ['BRAKES', 'Brakes'], ['OIL', 'Oil & Lubricants'],
       ['ELECTRICAL', 'Electrical'], ['BATTERY', 'Battery'], ['TYRES', 'Tyres'],
       ['DECOR', 'Decoration'], ['INTERIOR', 'Interior'], ['BIKE', 'Bike Accessories'],
       ['TOOLS', 'Tools'], ['OTHER', 'Other']].forEach(function (c, i) {
        DB.insert('Categories', { id: 'CAT-' + c[0], code: c[0], name: c[1], parentId: '',
          imageUrl: '', sortOrder: String(i + 1), active: 'true' });
      });
    }
    if (!DB.count('Brands')) {
      ['Flamingo', 'Philips', 'NGK', 'Exide', 'Shell', 'Caltex', 'Bosch', 'Gates',
       'Guard', 'NKM', 'General', 'AutoStyle', 'Local'].forEach(function (b) {
        DB.insert('Brands', { id: 'BRD-' + U.slug(b).toUpperCase().substring(0, 8), code: U.slug(b).substring(0, 6).toUpperCase(),
          name: b, notes: '', active: 'true' });
      });
    }
    if (!DB.count('Units')) {
      [['PCS', 'Piece', 'PCS', 1], ['SET', 'Set', 'PCS', 1], ['BOX', 'Box', 'PCS', 12],
       ['DZN', 'Dozen', 'PCS', 12], ['LTR', 'Litre', 'LTR', 1], ['KG', 'Kilogram', 'KG', 1],
       ['PAIR', 'Pair', 'PCS', 2]].forEach(function (u) {
        DB.insert('Units', { id: 'UNT-' + u[0], code: u[0], name: u[1], baseUnit: u[2],
          conversion: String(u[3]), active: 'true' });
      });
    }
    if (!DB.count('TaxCodes')) {
      [['STD', 'Standard 17%', 17], ['ZERO', 'Zero rated', 0], ['EXEMPT', 'Exempt', 0],
       ['RED', 'Reduced 10%', 10]].forEach(function (t) {
        DB.insert('TaxCodes', { id: 'TAX-' + t[0], code: t[0], name: t[1], rate: String(t[2]),
          type: 'PCT', active: 'true' });
      });
    }
  },

  seedWarehouses: function () {
    var warehouses=DB.all('Warehouses').slice(), bins=DB.all('Bins').slice(), newWarehouses=[], newBins=[];
    DB.all('Locations').forEach(function(loc,i){
      var w=warehouses.filter(function(row){return row.locationId===loc.id;})[0];
      if(!w){
        w={id:'WH-'+loc.code,code:loc.code+'-MAIN',name:loc.name+' Main Store',locationId:loc.id,
          incharge:'',isDefault:i===0?'true':'false',notes:'',active:'true'};
        warehouses.push(w);newWarehouses.push(w);
      }
      ['A','B','C'].forEach(function(rack){for(var shelf=1;shelf<=4;shelf++){
        var id='BIN-'+loc.code+'-'+rack+shelf;
        if(bins.some(function(row){return row.id===id || (row.warehouseId===w.id && row.rack===rack && String(row.shelf)===String(shelf));}))continue;
        var bin={id:id,code:rack+'-0'+shelf,name:loc.name+' Rack '+rack+' Shelf '+shelf,
          warehouseId:w.id,rack:rack,shelf:String(shelf),capacity:'100',notes:'',active:'true'};
        bins.push(bin);newBins.push(bin);
      }});
    });
    DB.insertMany('Warehouses',newWarehouses);DB.insertMany('Bins',newBins);
  },

  seedTemplates: function () {
    if (DB.count('PrintTemplates')) return;
    DB.insert('PrintTemplates', { id: U.uid('TPL'), type: 'RECEIPT', name: 'Thermal 80mm',
      active: 'true', json: JSON.stringify(Config.defaultTemplate('RECEIPT').json) });
    DB.insert('PrintTemplates', { id: U.uid('TPL'), type: 'LABEL', name: 'Standard 50x30',
      active: 'true', json: JSON.stringify(Config.defaultTemplate('LABEL').json) });
  },

  seedTranslations: function () {
    if (DB.count('Translations')) return;
    var defs = Lang.defaults();
    DB.insertMany('Translations', Object.keys(defs).map(function (k) {
      var v = defs[k];
      return { key: k, en: v.en, roman: v.roman, ur: v.ur,
        scope: v.scope || 'UI', updatedAt: U.iso() };
    }));
  },

  seedCustomFields: function () {
    if (DB.count('CustomFields')) return;
    DB.insert('CustomFields', { id: U.uid('CF'), entity: 'ITEM', key: 'cf_shelf_life',
      label: 'Shelf life (months)', type: 'NUMBER', options: '', defaultValue: '',
      required: 'false', showInTable: 'false', showInForm: 'true', showInPos: 'false',
      tab: 'Extra', sortOrder: '1', active: 'true' });
    DB.insert('CustomFields', { id: U.uid('CF'), entity: 'CUSTOMER', key: 'cf_vehicle',
      label: 'Vehicle (model/plate)', type: 'TEXT', options: '', defaultValue: '',
      required: 'false', showInTable: 'true', showInForm: 'true', showInPos: 'false',
      tab: 'Extra', sortOrder: '1', active: 'true' });
  },

  /** Real Flamingo catalogue (71 products from list.pdf + barcode.pdf) */
  seedProducts: function (opts) {
    try { return seedRealProducts(opts); }
    catch (e) { return { error: 'Seed_Products.gs missing: ' + e.message }; }
  },

  /** v2.5.2: CSV catalogue ↔ Items sheet ka milan — kuch write nahi karta */
  auditProducts: function () {
    try { return auditRealProducts(); }
    catch (e) { return { error: 'Seed_Products.gs missing: ' + e.message }; }
  },

  seedSettings: function () {
    var exists = {};
    DB.all('Settings').forEach(function (r) { exists[r.key] = true; });
    var missing = Object.keys(DEFAULT_SETTINGS).filter(function (k) { return !exists[k]; });
    return DB.insertMany('Settings', missing.map(function (k) {
      return { id: U.uid('SET'), key: k, value: String(DEFAULT_SETTINGS[k]),
        type: typeof DEFAULT_SETTINGS[k], updatedAt: U.iso() };
    }));
  },

  seedNumberSeries: function () {
    if (DB.count('NumberSeries')) return;
    ['LOC-SDQ', 'LOC-MCH', 'LOC-RYK'].forEach(function (loc) {
      [['SALE', 'INV'], ['RETURN', 'RTN'], ['PO', 'PO'], ['GRN', 'GRN'], ['PRET', 'PRT'],
       ['TRANSFER', 'TRF'], ['ADJ', 'ADJ'], ['PAY', 'PAY'], ['EXP', 'EXP'], ['SESSION', 'CS']]
        .forEach(function (p) {
          DB.insert('NumberSeries', {
            id: U.uid('NS'), entity: p[0], locationId: loc,
            prefix: p[1] + '-' + loc.replace('LOC-', ''), next: '1001', padding: '5', updatedAt: U.iso()
          });
        });
    });
  },

  /* ============================ DEMO / TRAINING =========================== */
  /** Demo items import karna ho (training mode) */
  seedDemoItems: function (opts) {
    opts = opts || {};
    var demoFlag = opts.markDemo ? 'true' : '';
    var locations = DB.all('Locations');
    var sample = [
      ['HLG-001', 'LED Headlight H4 60/55W', 'Car Lights', 'Philips', 'LIGHTING', 'Universal', '', 850, 1200, 1050],
      ['BRK-001', 'Brake Pad Set Front (Corolla)', 'Brakes', 'NKM', 'BRAKES', 'Toyota', 'Corolla 2009-2020', 2200, 3200, 2800],
      ['OIL-001', 'Engine Oil 20W-50 4L', 'Lubricants', 'Shell', 'OIL', 'Universal', '', 2400, 3000, 2700],
      ['BTRY-001', 'Battery 12V 65AH', 'Electrical', 'Exide', 'BATTERY', 'Universal', '', 11500, 14500, 13200],
      ['TYR-001', 'Tyre 175/70 R13', 'Tyres', 'General', 'TYRE', 'Universal', '', 7800, 9500, 8800],
      ['DEC-001', 'Car Dashboard Decor Kit', 'Decoration', 'AutoStyle', 'DECOR', 'Universal', '', 950, 1800, 1500],
      ['BIK-001', 'Bike LED Strip Light', 'Bike Decoration', 'AutoStyle', 'DECOR', 'Motorcycle', '', 350, 700, 600],
      ['FLR-001', 'Car Floor Mat 5D', 'Interior', 'AutoStyle', 'DECOR', 'Universal', '', 2800, 4500, 4000],
      ['SPK-001', 'Spark Plug Iridium', 'Engine', 'NGK', 'ENGINE', 'Universal', '', 750, 1100, 980],
      ['FLT-001', 'Oil Filter (Corolla/Civic)', 'Filters', 'Guard', 'FILTER', 'Toyota', 'Corolla', 380, 650, 560]
    ];
    var rows = sample.map(function (s) {
      return {
        id: U.uid('ITM'), code: s[0], name: s[1], nameUr: '', category: s[2], subCategory: '',
        brand: s[3], partType: s[4], make: s[5], model: s[6], yearFrom: '', yearTo: '',
        engine: '', chassis: '', unit: 'PCS', barcode: s[0], altBarcodes: '',
        costPrice: s[7], retailPrice: s[8], wholesalePrice: s[9], minPrice: s[7], taxRate: '0', hsn: '',
        minStock: '5', reorderLevel: '10', rack: 'A1', defaultLocationId: 'LOC-SDQ',
        trackSerial: 'false', hasExpiry: 'false', imageUrl: '', notes: '', status: 'ACTIVE',
        createdAt: U.iso(), updatedAt: U.iso(), isDemo: demoFlag
      };
    });
    DB.insertMany('Items', rows);
    // opening stock
    locations.forEach(function (loc) {
      rows.forEach(function (it, i) {
        var qty = [40, 25, 60, 12, 18, 30, 45, 22, 70, 55][i] || 20;
        DB.insert('Stock', { id: U.uid('STK'), itemId: it.id, locationId: loc.id, qty: String(qty),
          avgCost: it.costPrice, rack: 'A1', lastCountedAt: '', updatedAt: U.iso(), isDemo: demoFlag });
      });
    });
    return { items: rows.length, message: 'Demo items + stock added.' };
  },

  /* ------------------------------------------------------------------------
     v2.30.0 — DEMO DATA (fresh install foran usable ho)
     Aap ki shikayat: "fresh setup ne spreadsheet banai magar data nahi tha;
     login fail hua; DEMO customer maujood nahi tha."
     Ab fresh install par ye cheezein seed hoti hain (sab isDemo='true'):
       · 2 demo customers (DEMO-WALKIN walk-in + DEMO-CASH) + 1 demo supplier
       · 10 demo items + opening stock (teeno branches)
       · 1 demo user (demo / demo123, role CASHIER) — sirf training ke liye
     Setting `data.seedDemo` = false karne se ye step chhup jata hai.
     Production jaane se pehle: Settings ▸ Demo Data ▸ "Demo data hatao"
     (ya Setup.gs ▸ removeDemoData ▸ Run) — sirf isDemo rows jati hain.
     ---------------------------------------------------------------------- */
  seedDemoData: function (opts) {
    opts = opts || {};
    var st = {};
    try { st = DB.settings() || {}; } catch (e) { st = {}; }
    if (!opts.force && U.str(st['data.seedDemo']) === 'false') {
      return { skipped: true, reason: 'data.seedDemo = false' };
    }
    /* v2.30.0 — zinda business ke data mein demo rows nahi ghusate */
    if (!opts.force && typeof Setup.isFreshDb_ === 'function' && !Setup.isFreshDb_()) {
      return { skipped: true, reason: 'Live database (sales/payments mojood) — demo data skip' };
    }
    var made = { customers: 0, suppliers: 0, items: 0, stock: 0, users: 0 };

    /* demo customers — walk-in aur cash */
    if (!DB.findOne('Customers', function (r) { return r.code === 'DEMO-WALKIN'; })) {
      var types = DB.all('CustomerTypes');
      var walkType = (types[0] || {}).id || '';
      DB.insert('Customers', {
        id: U.uid('CUS'), code: 'DEMO-WALKIN', name: 'Walk-in Customer (Demo)',
        phone: '0300-0000000', email: '', address: 'Counter sale', cnic: '', ntn: '',
        customerTypeId: walkType, openingBalance: '0', creditLimit: '0', membershipId: '',
        points: '0', priceTier: 'RETAIL', notes: 'Demo record — Settings ▸ Demo data se hata sakte hain',
        active: 'true', customFields: '', isDemo: 'true'
      });
      made.customers++;
    }
    if (!DB.findOne('Customers', function (r) { return r.code === 'DEMO-CASH'; })) {
      var t2 = DB.all('CustomerTypes');
      DB.insert('Customers', {
        id: U.uid('CUS'), code: 'DEMO-CASH', name: 'Demo Cash Customer',
        phone: '0300-1111111', email: '', address: 'Sadiqabad', cnic: '', ntn: '',
        customerTypeId: (t2[1] || t2[0] || {}).id || '', openingBalance: '0',
        creditLimit: '50000', membershipId: '', points: '0', priceTier: 'RETAIL',
        notes: 'Demo record', active: 'true', customFields: '', isDemo: 'true'
      });
      made.customers++;
    }

    /* demo supplier */
    if (!DB.findOne('Suppliers', function (r) { return r.code === 'DEMO-SUP'; })) {
      DB.insert('Suppliers', {
        id: U.uid('SUP'), code: 'DEMO-SUP', name: 'Demo Supplier (Flamingo)',
        phone: '0300-2222222', email: 'sales@flamingo-parts.example', address: 'Multan Road, Lahore',
        ntn: '1234567-8',
        openingBalance: '0', creditLimit: '250000', paymentTerms: '30 days', ledgerAccount: '',
        notes: 'Demo record', active: 'true', customFields: '', isDemo: 'true'
      });
      made.suppliers++;
    }

    /* demo user (sirf training/testing — real staff upar seed hote hain) */
    if (!DB.findOne('Users', function (r) { return r.username === 'demo'; })) {
      var h = U.hashPassword('demo123');
      var loc = (DB.all('Locations')[0] || {});
      DB.insert('Users', {
        id: U.uid('USR'), username: 'demo', fullName: 'Demo User (training)',
        passwordHash: h.hash, salt: h.salt, email: 'demo@haseebautos.pk', phone: '',
        role: 'CASHIER', groupId: 'GRP-SAL', locationIds: U.str(loc.id),
        defaultLocationId: U.str(loc.id), commissionRate: '0', discountLimit: '2',
        active: 'true', createdAt: U.iso(), isDemo: 'true'
      });
      made.users++;
    }

    /* demo items + opening stock (seedDemoItems ka logic reuse, isDemo mark ke sath) */
    var before = DB.count('Items');
    if (before === 0) {
      var res = Setup.seedDemoItems({ markDemo: true });
      made.items = (res && res.items) || 0;
    }
    /* opening stock rows par bhi flag (Stock rows itemId se match karte hain) */
    var demoItemIds = {};
    DB.all('Items').forEach(function (r) { if (U.str(r.isDemo) === 'true') demoItemIds[r.id] = true; });
    DB.all('Stock').forEach(function (r) {
      if (demoItemIds[r.itemId] && U.str(r.isDemo) !== 'true') {
        DB.update('Stock', r.id, { isDemo: 'true' });
      }
    });
    made.stock = DB.all('Stock').filter(function (r) { return U.str(r.isDemo) === 'true'; }).length;

    return {
      seeded: true, made: made,
      message: 'Demo data tayyar: demo customer, demo supplier, 10 demo items + stock' +
        (made.users ? ', demo user (demo/demo123)' : '') + '.'
    };
  },

  /** Demo data hatao — sirf isDemo rows (real data safe rehta hai) */
  removeDemoData: function () {
    return Shop.removeDemoData({}, { userId: 'setup', role: 'OWNER', permissions: ['*'], locationIds: [] });
  },

  /** Password reset (owner ke liye) */
  resetPassword: function (username, newPassword) {
    var u = DB.findOne('Users', function (r) { return r.username === username; });
    if (!u) throw new Error('User not found');
    var h = U.hashPassword(newPassword);
    DB.update('Users', u.id, { passwordHash: h.hash, salt: h.salt });
    return 'Password updated for ' + username;
  },

  /** purana data delete (Data Deletion Utility) */
  deleteData: function (entity, olderThanDays, keepLast) {
    var cutoff = U.daysAgo(olderThanDays || 365);
    var removed = DB.purge(entity, function (row) {
      var d = U.parseDate(row.date || row.ts || row.createdAt);
      return d && d < cutoff;
    });
    return { entity: entity, removed: removed };
  },

  /** ReIndex: ids ko clean karo + duplicates hatado */
  reindex: function (entity) {
    var rows = DB.all(entity, true);
    var seen = {}, dups = 0;
    var clean = rows.filter(function (r) {
      if (!r.id) { dups++; return false; }
      if (seen[r.id]) { dups++; return false; }
      seen[r.id] = true; return true;
    });
    DB.purge(entity, function () { return true; });
    if (clean.length) DB.insertMany(entity, clean);
    DB.touch(entity);
    return { entity: entity, kept: clean.length, removed: dups };
  }
};

/** Menu se direct chalane ke liye */
/* v2.8: pehle ye sirf log karta tha aur kuch return nahi karta tha.
   Ab log BHI karta hai aur natija return BHI karta hai (pehle jaisa log
   badalta nahi — jo kuch log hota tha woh hota rahega). */
function setupAll() {
  var out = Setup.setupAll();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================================
   BEGINNER-SETUP HELPERS (v2.8)
   ----------------------------------------------------------------------------
   Apps Script editor ke Run ▸ dropdown mein SIRF top-level `function X()`
   nazar aate hain — `Setup.attach('ID')` jese object methods wahan nahi aate.
   Is liye existing spreadsheet jodne ka koi aasan tareeqa nahi tha:
   `attachSpreadsheet()` sirf PRINT karta hai ke link hai ya nahi (jodta nahi).
   Neeche do functions hain jo dropdown se seedhe chal sakte hain.
   ========================================================================== */

/** Yahan apni EXISTING spreadsheet ka ID paste karein (URL ka darmiyani hissa).
 *  Misaal: https://docs.google.com/spreadsheets/d/<<YAHAN_SE_LEIN>>/edit        */
var ATTACH_ID = '';

/**
 * EXISTING (pehle se bani hui) spreadsheet ko is script se jodein.
 * Editor: file = Setup.gs ▸ function = attachExistingSpreadsheet ▸ Run
 *
 * Do tareeqe:
 *   a) Setup.gs mein upar ATTACH_ID = '...' bhar dein, phir Run dabayein
 *   b) Ya neeche diye gaye tareeqe se ID argument mein dein
 * Naya spreadsheet chahiye to ye MAT chalayein — `setupAll` chalayein.
 */
function attachExistingSpreadsheet(id) {
  var sid = (id && String(id).trim()) || (ATTACH_ID && String(ATTACH_ID).trim());
  if (!sid) {
    var msg = 'ID nahi mila. Pehle Setup.gs mein ATTACH_ID = ""  ke darmiyan apni ' +
      'spreadsheet ka ID likhein (URL ka darmiyani hissa), phir Run dabayein. ' +
      'Naya spreadsheet banana ho to is ki jagah setupAll() chalayein.';
    Logger.log('❌ ' + msg);
    return msg;
  }
  var out = Setup.attach(sid);   // Script Property set + saari sheets banayein
  if (out && !out.complete) { Logger.log(JSON.stringify(out, null, 2)); return out; }
  Setup.seedAll();               // idempotent seed functions
  try { if (typeof Triggers !== 'undefined') Triggers.install({}); } catch (e) { }
  var done = { spreadsheetId: sid, url: out && out.url, seeded: true,
    message: 'Existing spreadsheet jod di gayi. Ab Deploy ▸ New deployment ▸ Web app karein.' };
  Logger.log('✅ ' + JSON.stringify(done, null, 2));
  return done;
}

/**
 * Abhi kaunsi spreadsheet judi hui hai — uska ID + link batata hai.
 * Editor: file = Setup.gs ▸ function = spreadsheetInfo ▸ Run
 * (Purana `attachSpreadsheet()` sirf likh kar batata tha — ye link bhi deta hai.)
 */
function spreadsheetInfo() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    var m = 'Koi spreadsheet judi hui NAHIN. Naya banane ke liye setupAll() chalayein, ' +
      'ya existing jodne ke liye attachExistingSpreadsheet() chalayein.';
    Logger.log('⚠ ' + m);
    return m;
  }
  var url = '';
  try { url = SpreadsheetApp.openById(id).getUrl(); } catch (e) { url = '(khul nahi saki: ' + e.message + ')'; }
  var sheets = [];
  try { sheets = SpreadsheetApp.openById(id).getSheets().map(function (s) { return s.getName(); }); } catch (e) { }
  var info = { spreadsheetId: id, url: url, sheetCount: sheets.length, message: 'Judi hui hai ✔' };
  Logger.log('✅ ' + JSON.stringify(info, null, 2));
  return info;
}

/** v2.1 — sirf scheduled jobs dobara install karne ke liye (purane remove ho kar naye bante hain) */
function reinstallTriggers() {
  var out = Triggers.install({ force: true });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
/* ⚠ DHYAN: ye function KUCH JODTA NAHI — sirf likh kar batata hai ke abhi
   kaunsi spreadsheet judi hui hai. (Naam se dhoka hota hai, is liye saaf
   likh rahe hain.) Purane guides isay "pehle chalayein" kehte thay — ghalat.
   ASLI kaam ke liye: naya ho to `setupAll()`, existing ho to
   `attachExistingSpreadsheet()`, sirf dekhna ho to `spreadsheetInfo()`. */
function attachSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  Logger.log(id ? 'Linked: ' + id : 'Not linked. Naya: setupAll() | Existing: attachExistingSpreadsheet()');
}
function seedDemo() { Logger.log(JSON.stringify(Setup.seedDemoItems())); }
function repairSchema() { Setup.buildAll(); Logger.log('Schema repaired.'); }

/** Required default tables only: transaction/product sheets may legitimately be empty. */
function setupSeedPlan_() {
  return [
    {method:'seedLocations',tables:['Locations']},
    {method:'seedGroupsAndUsers',tables:['Groups','Users']},
    {method:'seedCustomerTypes',tables:['CustomerTypes']},
    {method:'seedSettings',tables:['Settings']},
    {method:'seedNumberSeries',tables:['NumberSeries']},
    {method:'seedCatalog',tables:['Categories','Brands','Units','TaxCodes']},
    {method:'seedWarehouses',tables:['Warehouses','Bins']},
    {method:'seedTemplates',tables:['PrintTemplates']},
    {method:'seedCustomFields',tables:['CustomFields']},
    {method:'seedTranslations',tables:['Translations']},
    {method:'seedAccounts',tables:['Accounts']},
    /* v2.30.0 — fresh install foran usable: demo customer + supplier + items + stock.
       `freshOnly: true` — sirf NAYE (khali) database par. Recovery `repairSeedData`
       kisi zinda (live) business ke data mein demo rows NAHI ghusata. */
    {method:'seedDemoData',tables:['Customers','Suppliers','Items','Stock'],freshOnly:true}
  ];
}

/**
 * v2.30.0 — kya database "naya" hai? (demo data sirf naye DB par)
 * Live business ka data (sale / payment / PO / GRN) ho to demo seeding skip.
 */
Setup.isFreshDb_ = function () {
  try {
    var probes = ['Sales', 'SaleReturns', 'Payments', 'Expenses', 'PurchaseOrders', 'GRN'];
    for (var i = 0; i < probes.length; i++) {
      if (DB.count(probes[i]) > 0) return false;
    }
    return true;
  } catch (e) { return true; }
};

/** Aakhri seed run mein kaun se step skip hue (diagnostics/message ke liye) */
Setup.lastSeedSkips_ = [];

/** Direct sheet read, NEVER cache. Reports counts/header names, not account data. */
function setupSeedTableStatus_(ss, name) {
  var sh=ss.getSheetByName(name);
  if (!sh) return {rows:0,ready:false,missingSheet:true,missingColumns:SCHEMA[name].slice()};
  var last=sh.getLastRow(), columns=sh.getLastColumn();
  var headers=columns?sh.getRange(1,1,1,columns).getDisplayValues()[0]:[];
  var missing=SCHEMA[name].filter(function(k){return headers.indexOf(k)<0;});
  var keyIndex=headers.indexOf(SCHEMA[name][0]);
  var rows=0;
  if(last>1 && keyIndex>=0) rows=sh.getRange(2,keyIndex+1,last-1,1).getDisplayValues()
    .filter(function(r){return U.str(r[0]).trim()!=='';}).length;
  return {rows:rows,ready:rows>0 && missing.length===0,missingSheet:false,missingColumns:missing};
}
function setupSeedStatus_(ss) {
  var plan=setupSeedPlan_(), tables={}, missing=[], first=-1, skipped=[];
  var fresh=Setup.isFreshDb_();
  plan.forEach(function(step,i){
    /* freshOnly step (demo data) live DB par lazmi NAHI — warna har recovery
       demo tables ko "missing" batati rehti. */
    if(step.freshOnly && !fresh){skipped.push(step.method);return;}
    step.tables.forEach(function(name){
      var status=setupSeedTableStatus_(ss,name);tables[name]=status;
      if(!status.ready){missing.push(name);if(first<0)first=i;}
    });});
  return {ready:missing.length===0,tables:tables,missing:missing,firstMissingStep:first,skipped:skipped,freshDb:fresh};
}

/* ============================================================================
   v2.30.0 — FIRST-RUN WIZARD STATUS + ONE-CLICK DIAGNOSTICS
   ----------------------------------------------------------------------------
   Aap ki shart: "Add a first-run frontend Setup/Configuration Wizard that
   guides the admin through initial application configuration."
   Frontend (App_Boot) ye route login ke baad call karta hai aur `needsWizard`
   true hone par wizard kholta hai — steps wahi jo aap ne maange:
     1 business info  2 admin password  3 shop open  4 demo data  5 done
   ============================================================================ */
Setup.wizardStatus = function (p, s) {
  var st = {};
  try { st = DB.settings() || {}; } catch (e) { st = {}; }
  var counts = {};
  [['users', 'Users'], ['items', 'Items'], ['customers', 'Customers'], ['suppliers', 'Suppliers'],
   ['settings', 'Settings'], ['locations', 'Locations'], ['sales', 'Sales'], ['stock', 'Stock']]
    .forEach(function (pair) { try { counts[pair[0]] = DB.count(pair[1]); } catch (e) { counts[pair[0]] = 0; } });
  var shop = null;
  try { shop = Shop.status(p || {}, s); } catch (e) { shop = { open: false, error: e.message }; }
  var owner = DB.findOne('Users', function (u) { return U.str(u.username) === 'owner'; });
  var steps = {
    business: !!U.str(st.businessName),
    admin: !!(owner && U.str(st['setup.adminPasswordSet']) === 'true'),
    shopOpen: !!(shop && shop.open),
    demo: U.str(st['setup.demoDecision']) !== '',       /* decide: rakhna ya hatana */
    done: U.str(st['setup.wizardDone']) === 'true'
  };
  return {
    version: CONFIG.VERSION,
    needsWizard: !steps.done,
    steps: steps,
    seeded: counts,
    shop: shop,
    demoVisible: Shop.demoVisible(),
    businessName: U.str(st.businessName),
    shopName: U.str(st['shop.name']),
    message: steps.done ? 'Setup mukammal hai.' : 'First-run wizard baqi hai (business info + shop open).'
  };
};

/** Wizard ke steps ko ek hi jagah save karo (settings + optional shop open) */
Setup.wizardSave = function (p, s) {
  Auth.require(s, 'settings.manage');
  p = p || {};
  var vals = {};
  ['businessName', 'shop.name', 'shop.phone', 'shop.address', 'receiptHeader'].forEach(function (k) {
    if (p[k] !== undefined) vals[k] = U.str(p[k]);
  });
  if (p.demoDecision !== undefined) {
    vals['data.showDemo'] = String(p.demoDecision) !== 'false' ? 'true' : 'false';
    vals['setup.demoDecision'] = String(p.demoDecision) !== 'false' ? 'keep' : 'remove';
  }
  if (p.done) vals['setup.wizardDone'] = 'true';
  if (Object.keys(vals).length) DB.setSettings(vals, s);
  var out = { saved: Object.keys(vals), status: Setup.wizardStatus({}, s) };
  if (p.demoDecision !== undefined && String(p.demoDecision) === 'false') {
    try { out.demoRemoved = Shop.removeDemoData({}, s); } catch (e) { out.demoRemoveError = e.message; }
  }
  return out;
};

/** Wizard office: admin password badlo (owner ke liye) + step flag */
Setup.wizardSetAdminPassword = function (p, s) {
  Auth.require(s, 'users.manage');
  p = p || {};
  var pw = U.str(p.password);
  if (pw.length < 6) throw new Error('Password kam az kam 6 characters ka hona chahiye.');
  var owner = DB.findOne('Users', function (u) { return U.str(u.username) === U.str(p.username || 'owner'); });
  if (!owner) throw new Error('Owner user nahi mila.');
  var h = U.hashPassword(pw);
  DB.update('Users', owner.id, { passwordHash: h.hash, salt: h.salt }, s);
  DB.setSettings({ 'setup.adminPasswordSet': 'true' }, s);
  return { ok: true, username: owner.username };
};

/* ----------------------------------------------------------------------------
   One-click diagnostics — deployed app mein "safha blank kyun hai?" ka jawab.
   Har SCHEMA table ka row count + missing columns + shop/demo/seed status.
   (Reports/tables mein account data nahi jata — sirf counts + headers.)
   -------------------------------------------------------------------------- */
Setup.diagnostics = function (p, s) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : null;
  var tables = {}, problems = [];
  Object.keys(SCHEMA).forEach(function (name) {
    if (!ss) { tables[name] = { rows: 0, missingSheet: true }; return; }
    var stat = setupSeedTableStatus_(ss, name);
    tables[name] = { rows: stat.rows, missingSheet: !!stat.missingSheet, missingColumns: stat.missingColumns };
    if (stat.missingSheet) problems.push('MISSING SHEET: ' + name);
    else if (stat.missingColumns.length) problems.push('MISSING COLUMNS [' + name + ']: ' + stat.missingColumns.join(', '));
  });
  var shop = null;
  try { shop = Shop.status(p || {}, s); } catch (e) { shop = { error: e.message }; }
  var seed = null;
  try { seed = setupSeedStatus_(ss); } catch (e) { seed = { error: e.message }; }
  var out = {
    version: CONFIG.VERSION,
    spreadsheetId: id || '(none)',
    linked: !!id,
    tables: tables,
    seedReady: !!(seed && seed.ready),
    seedMissing: (seed && seed.missing) || [],
    shop: shop,
    demoVisible: Shop.demoVisible(),
    counts: {
      Users: tables.Users ? tables.Users.rows : 0,
      Items: tables.Items ? tables.Items.rows : 0,
      Customers: tables.Customers ? tables.Customers.rows : 0,
      Sales: tables.Sales ? tables.Sales.rows : 0
    },
    problems: problems,
    fix: problems.length
      ? 'Setup.gs ▸ repairSeedData ▸ Run chalayein (mojooda spreadsheet rehti hai; kuch reset nahi hota).'
      : 'Koi structural masla nahi mila. Safha blank ho to Items screen ke error box se "Diagnostics copy" karein.'
  };
  Logger.log(JSON.stringify(out));
  return out;
};

/** Editor: Setup.gs > diagnoseSeedData > Run. Read-only; RETURNS and logs. */
function diagnoseSeedData() {
  var props=PropertiesService.getScriptProperties(),id=props.getProperty('SPREADSHEET_ID');
  if(!id){var absent={ready:false,message:'No linked spreadsheet. Run setupAll for a NEW installation, or attach the intended existing spreadsheet.'};Logger.log(JSON.stringify(absent,null,2));return absent;}
  var ss=SpreadsheetApp.openById(id), status=setupSeedStatus_(ss), progress={};
  try{progress=JSON.parse(props.getProperty('SETUP_PROGRESS_V212')||'{}');}catch(e){}
  var report={version:CONFIG.VERSION,spreadsheetId:id,url:ss.getUrl(),ready:status.ready,
    checkpoint:{version:progress.version||'',next:progress.next===undefined?null:progress.next},
    tables:status.tables,missing:status.missing,
    message:status.ready?'Required default tables contain records. Empty sales/payment sheets are normal.':
      'Missing default rows or headers: '+status.missing.join(', ')+'. Run Setup.gs > repairSeedData > Run; no spreadsheet reset.'};
  Logger.log(JSON.stringify(report,null,2));return report;
}

/** Explicit recovery uses the SAME linked DB. Never create a replacement silently. */
function repairSeedData() {
  var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id) throw new Error('No spreadsheet linked. Run spreadsheetInfo and attach the intended database first; recovery will not create a new one.');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) {var busy={complete:false,busy:true,message:'Another setup/recovery is running. Try again shortly.'};Logger.log(JSON.stringify(busy));return busy;}
  try {
    DB.resetConnection();var ss=SpreadsheetApp.openById(id),deadline=Date.now()+45000;
    var plan=setupSeedPlan_(), before=setupSeedStatus_(ss), attempted=[];
    plan.forEach(function(step){step.tables.forEach(function(name){DB.touch(name);});});
    for(var i=0;i<plan.length && Date.now()<deadline;i++){
      var step=plan[i];
      /* v2.30.0 — freshOnly (demo) step live DB par skip: attempted mein bhi na aaye */
      if(step.freshOnly && !Setup.isFreshDb_()) continue;
      if(step.tables.some(function(name){return !before.tables[name] || !before.tables[name].ready;})){
        setupRunSeedStep_(ss,step);attempted.push(step.method);
      }
    }
    var after=setupSeedStatus_(ss);
    var result={complete:after.ready,spreadsheetId:id,url:ss.getUrl(),version:CONFIG.VERSION,
      attempted:attempted,missingSeedTables:after.missing,seedSkips:after.skipped||[],
      demoDataSkipped:(after.skipped||[]).length>0,
      seedCounts:Object.keys(after.tables).reduce(function(out,name){out[name]=after.tables[name].rows;return out;},{}),
      message:after.ready?'Default rows verified in the EXISTING spreadsheet. No existing passwords or transactions were reset. Change initial passwords before use.':
        'Recovery progress saved in the sheet. Run Setup.gs > repairSeedData > Run again. Missing: '+after.missing.join(', ')};
    Logger.log(JSON.stringify(result,null,2));return result;
  } finally {lock.releaseLock();}
}

/** Shared seed execution: clear cache, create missing headers, verify physical rows. */
function setupRunSeedStep_(ss,step) {
  if(step.freshOnly && !Setup.isFreshDb_()){
    Setup.lastSeedSkips_.push({method:step.method,reason:'live DB — demo data skip'});
    return {skipped:true,method:step.method,reason:'live DB — demo data skip'};
  }
  step.tables.forEach(function(name){
    var table=ss.getSheetByName(name);
    var status=table?setupSeedTableStatus_(ss,name):null;
    if(!status || status.missingColumns.length) Setup.createSheet(name);
    DB.touch(name);
  });
  if(step.method==='seedWarehouses')DB.touch('Locations');
  Setup[step.method]();
  SpreadsheetApp.flush();
  var failed=step.tables.filter(function(name){return !setupSeedTableStatus_(ss,name).ready;});
  if(failed.length) throw new Error('SEED_VERIFY_FAILED ['+step.method+']: '+failed.join(', ')+
    ' has no valid rows or headers. Run diagnoseSeedData. Progress retained; no reset.');
}
