/* ==========================================================================
   Pwa.gs — v2.6 §10 / §11 / §13
   Mobile PWAs: Warehouse · Field Order · Salesman
   --------------------------------------------------------------------------
   DESIGN NOTE (zaroor padhein):
   • Har app ka APNA URL hai:   ?app=wh   ?app=fo   ?app=sm
     doGet() is parameter se alag HTML template serve karta hai, apne
     <title>, theme-color aur manifest ke sath — yani phone ki home screen par
     3 alag icons, 3 alag naam.
   • Ek hi Apps Script project = ek hi deployment. Alag deployment chahiye to
     3 copy banwa kar alag deploy kar sakte hain (guide mein likha hai).
   • SERVICE WORKER: Apps Script `script.google.com` par serve karta hai; us
     origin par hum SW file host nahi kar sakte, is liye true SW-offline
     mumkin NAHI. Is liye offline-taqat `OfflineSync` queue + localStorage se
     milti hai: field mein kaam chalu rehta hai, net aate hi sync.
     (Apni domain / Firebase par host karenge to SW bhi chal jayega.)
   • Har screen sirf EK round trip karti hai: Pwa.bootstrap()

   Sab kuch settings-driven: Config.get('pwa.*') se on/off.
   ========================================================================== */

var Pwa = {

  /* ============================ APP REGISTRY ============================== */
  /* Yahan ek jagah har PWA ki pehchan. UI isi se banta hai. */
  APPS: {
    wh: {
      id: 'wh', slug: 'warehouse',
      name: 'Haseeb Autos — Warehouse',
      shortName: 'Warehouse',
      title: 'Haseeb Autos — Warehouse',
      icon: '🏬', theme: '#0b1220', accent: '#f59e0b',
      desc: 'Receive · Put-away · Pick · Count',
      perm: 'stock.view',
      tabs: [
        { id: 'receive', label: 'Receive', icon: '📥' },
        { id: 'putaway', label: 'Put-away', icon: '📦' },
        { id: 'count', label: 'Count', icon: '🔢' },
        { id: 'transfer', label: 'Transfer', icon: '🔄' }
      ]
    },
    fo: {
      id: 'fo', slug: 'field',
      name: 'Haseeb Autos — Field Orders',
      shortName: 'Field Orders',
      title: 'Haseeb Autos — Field Orders',
      icon: '🧾', theme: '#0b1220', accent: '#22c55e',
      desc: 'Order taking · offline · sync',
      perm: 'pos.sell',
      tabs: [
        { id: 'new', label: 'New order', icon: '➕' },
        { id: 'drafts', label: 'Pending', icon: '🕓' },
        { id: 'synced', label: 'Synced', icon: '✅' }
      ]
    },
    sm: {
      id: 'sm', slug: 'salesman',
      name: 'Haseeb Autos — Salesman',
      shortName: 'Salesman',
      title: 'Haseeb Autos — Salesman',
      icon: '🚚', theme: '#0b1220', accent: '#38bdf8',
      desc: 'My stock · Sell · Collect · Settle',
      perm: 'pos.sell',
      tabs: [
        { id: 'stock', label: 'My stock', icon: '📦' },
        { id: 'sell', label: 'Sell', icon: '🧾' },
        { id: 'collect', label: 'Collect', icon: '💰' },
        { id: 'settle', label: 'Settle', icon: '🧮' }
      ]
    },
    pos: {
      id: 'pos', slug: 'pos',
      name: 'Haseeb Autos — POS',
      shortName: 'POS',
      title: 'Haseeb Autos — POS',
      icon: '🧾', theme: '#0b1220', accent: '#f59e0b',
      desc: 'Fast billing · barcode · offline',
      perm: 'pos.sell',
      tabs: [
        { id: 'sell', label: 'Sell', icon: '🧾' },
        { id: 'held', label: 'Held', icon: '⏸' },
        { id: 'recent', label: 'Recent', icon: '📁' }
      ]
    }
  },

  _app: function (id) {
    var a = Pwa.APPS[U.str(id).toLowerCase()];
    if (!a) throw new Error('Unknown PWA: ' + id);
    return a;
  },

  enabled: function (id) {
    var a = Pwa.APPS[U.str(id).toLowerCase()];
    if (!a) return false;
    /* har app ka apna switch; default ON */
    return U.str(Config.get('pwa.' + a.id + '.enabled', 'true')) !== 'false';
  },

  /** Server-side: doGet() is se alag page serve karta hai */
  config: function (appId, s) {
    var a = Pwa._app(appId);
    var st = DB.settings ? DB.settings() : {};
    return {
      app: a,
      enabled: Pwa.enabled(a.id),
      business: {
        name: U.str(st.businessName || 'Haseeb Autos'),
        nameUr: U.str(st.businessNameUr || ''),
        currency: U.str(st.currency || 'Rs')
      },
      version: CONFIG.VERSION,
      scannerLiveUrl: U.str(Config.get('scanner.liveUrl') || ''),
      scannerInApp: U.str(Config.get('scanner.inApp', 'true')),
      /* offline queue kitna bada ho sakta hai */
      offline: {
        maxQueue: U.num(Config.get('pwa.offlineMaxQueue', 200)),
        enabled: U.str(Config.get('pwa.offlineEnabled', 'true')) !== 'false'
      },
      user: s && s.userId ? { id: s.userId, name: U.str(s.userName || ''), role: U.str(s.role || '') } : null
    };
  },

  /* ============================== SERVING ================================= */
  /**
   * Server-side render: alag template, alag title, alag theme-color,
   * aur apna manifest (data URI) — is liye har app home screen par alag lagti hai.
   */
  serve: function (appId) {
    var a = Pwa._app(appId);
    var file = PWA_TEMPLATES[appId];
    if (!file) throw new Error('PWA template missing: ' + appId);

    var t = HtmlService.createTemplateFromFile(file);
    t.appId = a.id;
    t.appName = a.shortName;
    t.title = a.title;
    t.appVersion = CONFIG.VERSION;
    t.serveMode = 'apps-script';
    t.apiUrl = '';

    /* v2.8.1: sirf allowed tags server se; baqi client-side inject hon ge.
       (Illegal addMetaTag → "not allowed in this context" → page hi fail.) */
    t.extraMetaJson = JSON.stringify({
      'theme-color': a.theme,
      'apple-mobile-web-app-title': a.shortName,
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
      'description': a.desc
    }).replace(/</g, '\\u003c');   // </script> se breakout na ho

    var out = t.evaluate()
      .setTitle(a.title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    addSafeMetaTag(out, 'viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    addSafeMetaTag(out, 'apple-mobile-web-app-capable', 'yes');
    addSafeMetaTag(out, 'mobile-web-app-capable', 'yes');

    /* favicon + apple-touch-icon — purane browsers data URI favicon nahi
       lete, par apple-touch-icon aur manifest icons kaam karte hain */
    try {
      out.setFaviconUrl(PWA_ICONS.i192);
    } catch (e) { /* setFaviconUrl purane runtime par nahi hota */ }
    return out;
  },

  /** Manifest JSON (client is se data-URI <link rel=manifest> banata hai) */
  manifest: function (appId) {
    var a = Pwa._app(appId);
    return {
      name: a.name, short_name: a.shortName, description: a.desc,
      start_url: '?app=' + a.id, scope: '.', display: 'standalone',
      orientation: 'portrait', background_color: a.theme, theme_color: a.theme,
      icons: [
        { src: PWA_ICONS.i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: PWA_ICONS.i512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    };
  },

  /* ============================ BOOTSTRAP ================================= */
  /**
   * EK round trip mein poori screen ka data.
   * Mobile net slow hota hai — 5 alag call karne se screen 5 second leti hai.
   */
  bootstrap: function (p, s) {
    p = p || {};
    var a = Pwa._app(p.app);
    if (!Pwa.enabled(a.id)) throw new Error(a.shortName + ' app is band hai (Settings ▸ PWA).');
    if (s && s.userId && a.perm && Auth.can && !Auth.can(s, a.perm)) {
      throw new Error('Aap ko ' + a.shortName + ' app ka access nahi hai.');
    }
    var locId = p.locationId || (s && s.locationId) || 'LOC-SDQ';

    var out = {
      config: Pwa.config(a.id, s),
      /* v2.28.0 (W5) — session ki permissions PWA ko bhi do taake screens hidden
         field/column UI se hata sakein (asal rok backend par hai — Fields.gs) */
      perms: (s && s.permissions) ? s.permissions.slice() : [],
      locationId: locId,
      locations: (DB.all('Locations') || []).map(function (l) {
        return { id: l.id, name: l.name };
      }),
      serverTime: U.iso(),
      items: Pwa._items(locId),
      app: a.id
    };

    if (a.id === 'wh') {
      out.bins = Pwa._bins(locId);
      out.tasks = Pwa._whTasks(locId);
      // enriched details for instant PO→GRN and count-sheet audit (no extra round trip in PWA)
      try{
        out.poMap = {};
        out.countMap = {};
        out.audit = null;
        // PO details for each RECEIVE task (first 6)
        (out.tasks||[]).filter(function(t){return t.kind==='RECEIVE';}).slice(0,6).forEach(function(t){
          try{ out.poMap[t.refId] = Purchase.getPO(t.refId, s); }catch(e){}
        });
        // Count sheet details for each COUNT task (first 4)
        (out.tasks||[]).filter(function(t){return t.kind==='COUNT';}).slice(0,4).forEach(function(t){
          try{ out.countMap[t.refId] = Warehouse.countGet({id:t.refId}, s); }catch(e){}
        });
        try{ out.audit = Warehouse.audit({locationId: locId}, s); }catch(e){}
        out.stockByBin = Warehouse.stockByBin({locationId: locId}, s).slice(0, 80);
      }catch(e){}
    } else if (a.id === 'fo') {
      out.customers = Pwa._customers();
      out.drafts = Pwa._foDrafts(locId);
      out.cats = Pwa._cats();
    } else if (a.id === 'sm') {
      var st = Pwa._smStock(s);
      out.myStock = st.rows;
      out.stockSummary = st.summary;
      out.customers = Pwa._customers();
      /* v2.31.2 (r14/F5) — "mere customers": assigned salesman (Customers.salesmanId)
         ke mutabiq filter; khali ho to POORA list (backward-safe) + client ko hisaab */
      out.salesmanId = (s && s.userId) || '';
      out.myCustomers = out.customers.filter(function (c) { return c.sm && c.sm === out.salesmanId; });
    } else if (a.id === 'pos') {
      out.customers = Pwa._customers();
      out.cats = Pwa._cats();
      out.recent = Pwa._recentSales(locId);
    }
    return out;
  },

  /* --------------------------- shared lookups ---------------------------- */
  _items: function (locId) {
    var stock = {};
    (DB.all('Stock') || []).forEach(function (r) {
      if (!locId || r.locationId === locId) stock[r.itemId] = U.num(r.qty);
    });
    return (DB.all('Items') || [])
      .filter(function (i) { return U.str(i.status) !== 'INACTIVE'; })
      .map(function (i) {
        return {
          id: i.id, code: U.str(i.code), name: U.str(i.name),
          category: U.str(i.category||''), cat: U.str(i.category||''),
          retail: U.num(i.retailPrice || i.salePrice),
          wholesale: U.num(i.wholesalePrice),
          cost: U.num(i.costPrice),
          unit: U.str(i.unit || 'pcs'),
          barcode: U.str(i.barcode || ''),
          stock: stock[i.id] || 0
        };
      });
  },

  _customers: function () {
    return (DB.all('Customers') || []).map(function (c) {
      return { id: c.id, name: U.str(c.name), phone: U.str(c.phone || ''),
        bal: U.num(c.balance||c.closingBalance), points: U.num(c.points||0),
        creditLimit: U.num(c.creditLimit||0),
        balance: U.num(c.balance||c.closingBalance),
        priceTier: U.str(c.priceTier||'RETAIL'),
        /* v2.31.2 (r14/F5) — assigned salesman (my-customers filter) */
        sm: U.str(c.salesmanId||'') };
    });
  },

  _cats: function () {
    var set = {};
    (DB.all('Items') || []).forEach(function (i) {
      var cat = U.str(i.category || i.cat || '');
      if (cat) set[cat] = 1;
    });
    return Object.keys(set).sort();
  },

  _recentSales: function (locId) {
    return (DB.all('Sales') || [])
      .filter(function (s) { return !locId || !s.locationId || s.locationId===locId; })
      .sort(function(a,b){ return U.str(b.date||b.createdAt).localeCompare(U.str(a.date||a.createdAt)); })
      .slice(0,40)
      .map(function(s){
        return { id: s.id, invoiceNo: U.str(s.invoiceNo), date: U.str(s.date||s.createdAt).slice(0,16),
          customerName: U.str(s.customerName||'Walk-in'), total: U.num(s.total), status: U.str(s.status||'PAID') };
      });
  },

  /* POS standalone: fast sale from dedicated app */
  posSell: function (p, s) {
    Auth.require(s, 'pos.sell');
    if (!Pwa.enabled('pos')) throw new Error('POS PWA band hai.');
    var lines = (p.items || []).filter(function(l){ return U.num(l.qty)>0; });
    if(!lines.length) throw new Error('Kam az kam ek item zaroori hai.');
    var pays = (p.payments||[]).filter(function(x){ return U.num(x.amount)>0; });
    if(!pays.length) pays = [{ method:'CASH', amount: U.num(p.total||0) }];
    var res = Sales.create({
      locationId: p.locationId || s.locationId,
      customerId: p.customerId || '',
      customerName: p.customerName || 'Walk-in Customer',
      discount: U.num(p.discount),
      source: 'POS_PWA',
      payments: pays.map(function(x){ return { method: U.str(x.method||'CASH'), amount: U.num(x.amount) }; }),
      items: lines.map(function(l){ return { itemId:l.itemId, qty:U.num(l.qty), price:U.num(l.price), discount:U.num(l.discount) }; })
    }, s);
    Audit.log('PWA_POS_SELL','Sales',res.id,{lines:lines.length, source:'PWA_POS', clientId:U.str(p.clientId||'')},{invoiceNo:U.str(res.invoiceNo), total:U.num(res.total)},s);
    return { ok:true, id: res.id, invoiceNo: U.str(res.invoiceNo), total: U.num(res.total) };
  },

  /**
   * BUG CAUGHT BY PREVIEW BUILD: `Bins` sheet mein `locationId` hota hi NAHI —
   * bin `warehouseId` se jurta hai, aur warehouse `locationId` se.
   * locationId se seedha filter karne se bin list khaali rehti thi →
   * Warehouse PWA ke Put-away / Transfer dropdowns mein kuch nahi aata.
   */
  _bins: function (locId) {
    var whIds = {};
    (DB.all('Warehouses') || []).forEach(function (w) {
      if (!locId || !w.locationId || w.locationId === locId) whIds[w.id] = 1;
    });
    return (DB.all('Bins') || [])
      .filter(function (b) {
        if (U.str(b.active) === 'false') return false;
        if (!locId) return true;
        return !!whIds[b.warehouseId];
      })
      .map(function (b) {
        return { id: b.id, code: U.str(b.code || b.name), name: U.str(b.name || b.code),
          warehouseId: U.str(b.warehouseId || '') };
      });
  },

  /* ========================= §10 WAREHOUSE TASKS ========================== */
  _whTasks: function (locId) {
    var tasks = [];
    /* supplier ka NAAM chahiye, ID nahi — warehouse staff ko ID se kuch nahi milta */
    var supName = {};
    (DB.all('Suppliers') || []).forEach(function (x) { supName[x.id] = U.str(x.name); });

    /* 1) GRN jo abhi receive honi hain (DRAFT/APPROVED/PARTIAL) */
    (DB.all('PurchaseOrders') || []).forEach(function (po) {
      var stt = U.upper(U.str(po.status));
      if (['DRAFT', 'APPROVED', 'PARTIAL', 'OPEN', 'PENDING'].indexOf(stt) < 0) return;
      if (locId && po.locationId && po.locationId !== locId) return;
      var lines = DB.all('PurchaseOrderItems').filter(function (r) { return r.poId === po.id; });
      var qty = U.sum(lines, 'qty');
      tasks.push({
        kind: 'RECEIVE', ref: U.str(po.poNo), refId: po.id,
        title: 'Receive ' + U.str(po.poNo),
        meta: (supName[po.supplierId] || 'Supplier') +
          ' · ' + qty + ' items' +
          (po.expectedDate ? ' · due ' + U.str(po.expectedDate).slice(0, 10) : ''),
        qty: qty, priority: stt === 'APPROVED' ? 1 : 2
      });
    });

    /* 2) Count sheets jo abhi post nahi hue
       NOTE: Warehouse.countCreate sheet ko 'DRAFT' banata hai, 'OPEN' nahi —
       is liye dono status qabil-e-ghaur hain. */
    (DB.all('CountSheets') || []).forEach(function (sh) {
      var stt = U.upper(U.str(sh.status));
      if (['DRAFT', 'OPEN', 'COUNTING', 'IN_PROGRESS'].indexOf(stt) < 0) return;
      if (locId && sh.locationId && sh.locationId !== locId) return;
      tasks.push({
        kind: 'COUNT', ref: U.str(sh.sheetNo), refId: sh.id,
        title: 'Count ' + U.str(sh.sheetNo),
        meta: U.str(sh.scope || 'all stock') + ' · ' + U.num(sh.lines) + ' lines',
        qty: U.num(sh.lines || 0), priority: 1
      });
    });

    tasks.sort(function (a, b) { return a.priority - b.priority; });
    return tasks;
  },

  /**
   * §10 — GRN receive from phone. Barcode scan → qty confirm → GRN.
   * Purane `purchase.grn.save` ko hi call karta hai (dublicate logic nahi).
   */
  whReceive: function (p, s) {
    Auth.require(s, 'purchase.grn');
    if (!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    var lines = (p.items || []).filter(function (l) { return U.num(l.qty) > 0; });
    if (!lines.length) throw new Error('Kam az kam ek item ki qty dalen.');
    var payload = {
      supplierId: p.supplierId || '',
      locationId: p.locationId || s.locationId,
      poId: p.poId || '',
      invoiceNo: p.invoiceNo || '',
      notes: U.str(p.notes || '') + (p.notes ? ' · ' : '') + 'via Warehouse PWA',
      items: lines.map(function (l) {
        return { itemId: l.itemId, qty: U.num(l.qty), cost: U.num(l.cost) };
      })
    };
    var grn = Purchase.saveGRN(payload, s);
    /* lot/serial tracking on ho to lot bhi bana do */
    if (p.lotNo && U.str(Config.get('trackLots')) === 'true') {
      try {
        lines.forEach(function (l) {
          Warehouse.receiveLot({ itemId: l.itemId, qty: U.num(l.qty), cost: U.num(l.cost),
            lotNo: p.lotNo, expiry: p.expiry || '', locationId: payload.locationId, grnId: grn.id }, s);
        });
      } catch (e) { /* lot fail ho to GRN cancel nahi hota */ }
    }
    Audit.log('PWA_WH_RECEIVE', 'GRNs', grn.id,
      { lines: lines.length, source: 'PWA' }, { grnNo: U.str(grn.grnNo) }, s);
    return { ok: true, grnNo: U.str(grn.grnNo), id: grn.id };
  },

  /** §10 — put-away: bin mein stock dalna (barcode scan kar ke) */
  whPutaway: function (p, s) {
    Auth.require(s, 'stock.adjust');
    if (!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    if (!p.itemId) throw new Error('Item scan karein.');
    if (!p.binId) throw new Error('Bin select karein.');
    var qty = U.num(p.qty);
    if (qty <= 0) throw new Error('Qty zaroori hai.');
    var res = Warehouse.putaway(p.itemId, p.binId, s);
    Audit.log('PWA_WH_PUTAWAY', 'Bins', p.binId,
      { itemId: p.itemId, qty: qty, source: 'PWA' }, res, s);
    return { ok: true, result: res };
  },

  /** §10 — stock count: counted qty save */
  whCount: function (p, s) {
    Auth.require(s, 'stock.adjust');
    if (!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    if (!p.sheetId) throw new Error('Count sheet select karein.');
    if (!p.itemId) throw new Error('Item scan karein.');
    /* sheet ki line dhoondho — scanner se itemId aata hai, countSetQty ko line id chahiye */
    var line = (DB.all('CountLines') || []).filter(function (r) {
      return r.sheetId === p.sheetId && r.itemId === p.itemId;
    })[0];
    if (!line) throw new Error('Ye item is count sheet mein nahi hai.');
    var res = Warehouse.countSetQty({ id: line.id, qty: U.num(p.qty) }, s);
    Audit.log('PWA_WH_COUNT', 'CountLines', line.id,
      { sheetId: p.sheetId, itemId: p.itemId, qty: U.num(p.qty), source: 'PWA' }, res, s);
    return { ok: true, result: res, lineId: line.id, code: U.str(line.code) };
  },

  /** §10 — bin-to-bin / branch transfer from phone */
  whTransfer: function (p, s) {
    Auth.require(s, 'stock.transfer');
    if (!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    var res = Warehouse.binTransfer({
      itemId: p.itemId, fromBinId: p.fromBinId, toBinId: p.toBinId, qty: U.num(p.qty)
    }, s);
    Audit.log('PWA_WH_TRANSFER', 'Bins', p.fromBinId,
      { itemId: p.itemId, qty: U.num(p.qty), to: p.toBinId, source: 'PWA' }, res, s);
    return { ok: true, result: res };
  },

  /* §10 — enriched fetchers for PWA (PO→GRN and Count audit) */
  whPoGet: function(p,s){
    Auth.require(s,'purchase.view');
    if(!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    var id = U.str(p.id||p.poId||p.refId);
    if(!id) throw new Error('PO id chahiye');
    return Purchase.getPO(id, s);
  },
  whCountGet: function(p,s){
    Auth.require(s,'stock.view');
    if(!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    var id = U.str(p.id||p.sheetId||p.refId);
    if(!id) throw new Error('Sheet id chahiye');
    return Warehouse.countGet({id:id}, s);
  },
  whAudit: function(p,s){
    Auth.require(s,'stock.view');
    if(!Pwa.enabled('wh')) throw new Error('Warehouse PWA band hai.');
    return Warehouse.audit(p||{}, s);
  },

  /* ======================= §11 FIELD ORDER TAKING ========================= */
  _foDrafts: function (locId) {
    return (DB.all('Orders') || [])
      .filter(function (o) { return !locId || !o.locationId || o.locationId === locId; })
      .sort(function (a, b) { return U.str(b.createdAt).localeCompare(U.str(a.createdAt)); })
      .slice(0, 100)
      .map(function (o) {
        return {
          id: o.id, orderNo: U.str(o.orderNo), date: U.str(o.date || o.createdAt).slice(0, 10),
          customerName: U.str(o.customerName || ''), total: U.num(o.total),
          status: U.str(o.status || 'DRAFT'), synced: true
        };
      });
  },

  /**
   * §11 — field order. Offline queue se bhi aa sakta hai (clientId ke sath).
   * Idempotent: same clientId do dafa aye to dobara order nahi banta.
   */
  foOrder: function (p, s) {
    Auth.require(s, 'pos.sell');
    if (!Pwa.enabled('fo')) throw new Error('Field Order PWA band hai.');
    var lines = (p.items || []).filter(function (l) { return U.num(l.qty) > 0; });
    if (!lines.length) throw new Error('Kam az kam ek item zaroori hai.');

    /* idempotency: pehle bana hua order hai to wahi return */
    if (p.clientId) {
      var dup = (DB.all('Orders') || []).filter(function (o) {
        return U.str(o.clientId) === U.str(p.clientId);
      })[0];
      if (dup) return { ok: true, id: dup.id, orderNo: U.str(dup.orderNo), duplicate: true };
      /* NOTE: dup DB row hai (raw), is liye orderNo seedha milta hai */
    }

    var order = Orders.save({
      locationId: p.locationId || s.locationId,
      customerId: p.customerId || '',
      customerName: p.customerName || '',
      date: p.date || U.dateOnly(),
      notes: U.str(p.notes || '') + (p.notes ? ' · ' : '') + 'via Field PWA',
      discount: U.num(p.discount),
      items: lines.map(function (l) {
        return { itemId: l.itemId, qty: U.num(l.qty), price: U.num(l.price), discount: U.num(l.discount) };
      })
    }, s);

    /* Orders.save() → Orders.get() wali shape deta hai: { order, items, summary, actions } */
    var hdr = (order && order.order) || order || {};
    var oid = hdr.id || (order && order.id);
    if (p.clientId && oid) {
      try { DB.update('Orders', oid, { clientId: U.str(p.clientId) }, s); } catch (e) { }
    }
    Audit.log('PWA_FO_ORDER', 'Orders', oid,
      { lines: lines.length, source: 'PWA', clientId: U.str(p.clientId || '') },
      { orderNo: U.str(hdr.orderNo), total: U.num(hdr.total) }, s);
    return { ok: true, id: oid, orderNo: U.str(hdr.orderNo),
      total: U.num(hdr.total), status: U.str(hdr.status) };
  },

  /* ===================== §13 SALESMAN (mobile) =========================== */
  /**
   * BUG CAUGHT BY TEST: `Salesman.stock()` array NAHI deta — { rows, summary }
   * deta hai. Seedha array maan kar "My stock" screen khaali rehti thi.
   * Ab shape normalize kar ke dono UI ko dete hain.
   */
  _smStock: function (s) {
    var empty = { rows: [], summary: { items: 0, qty: 0, value: 0, retailValue: 0 } };
    if (typeof Salesman === 'undefined' || !Salesman.stock) return empty;
    try {
      /* Salesman.stock(opts, s) — opts object leta hai, string nahi */
      var r = Salesman.stock({ salesmanId: (s && s.userId) || '', all: false }, s);
      if (!r) return empty;
      if (Array.isArray(r)) {
        return { rows: r, summary: { items: r.length, qty: 0, value: 0, retailValue: 0 } };
      }
      return { rows: r.rows || [], summary: r.summary || empty.summary };
    } catch (e) { return empty; }
  },

  /** §13 — mobile sale (consignment stock se) */
  smSell: function (p, s) {
    Auth.require(s, 'pos.sell');
    if (!Pwa.enabled('sm')) throw new Error('Salesman PWA band hai.');
    var lines = (p.items || []).filter(function (l) { return U.num(l.qty) > 0; });
    if (!lines.length) throw new Error('Kam az kam ek item zaroori hai.');
    /* BUG CAUGHT BY E2E TEST — SHOWTOPPER:
       Sales.create() consignment sale ke liye `salespersonId` mangta hai
       (Sales.gs: "Salesman ki sale mein salesperson lazmi hai"),
       hum `salesmanId` bhej rahe the → Salesman PWA se KOI BHI SALE hi na
       hoti. Backend tests ne is liye nahi pakda ke smSell ko kabhi asli
       tor par call hi nahi kiya gaya tha. */
    var res = Sales.create({
      locationId: p.locationId || s.locationId,
      customerId: p.customerId || '',
      customerName: p.customerName || '',
      source: 'SALESMAN',
      salespersonId: p.salespersonId || s.userId,
      salesmanId: p.salespersonId || s.userId,
      items: lines.map(function (l) {
        return { itemId: l.itemId, qty: U.num(l.qty), price: U.num(l.price), discount: U.num(l.discount) };
      }),
      payments: [{ method: U.str(p.method || 'CASH'), amount: U.num(p.paid) }]
    }, s);
    Audit.log('PWA_SM_SELL', 'Sales', res.id,
      { lines: lines.length, source: 'PWA' }, { invoiceNo: U.str(res.invoiceNo) }, s);
    return { ok: true, id: res.id, invoiceNo: U.str(res.invoiceNo) };
  },

  /** §13 — cash collection from a customer on the route */
  smCollect: function (p, s) {
    Auth.require(s, 'pos.sell');
    if (!Pwa.enabled('sm')) throw new Error('Salesman PWA band hai.');
    var amt = U.num(p.amount);
    if (amt <= 0) throw new Error('Amount zaroori hai.');
    /* BUG CAUGHT BY E2E TEST: Payments.create ledger post karne ke liye
       `partyId` mangta hai — hum `customerId` bhej rahe the. Nateeja: voucher
       ban jata tha, magar customer ka UDHAAR ghat-ta hi nahi tha (chup-chaap
       data loss — salesman samajhta balance clear ho gaya, office mein purana
       balance rehta). Ab dono bhejte hain. */
    var res = Payments.create({
      type: 'RECEIPT', partyType: 'CUSTOMER',
      partyId: p.customerId || p.partyId || '',
      customerId: p.customerId || '',
      amount: amt, method: U.str(p.method || 'CASH'), date: p.date || U.dateOnly(),
      notes: U.str(p.notes || '') + (p.notes ? ' · ' : '') + 'via Salesman PWA',
      locationId: p.locationId || s.locationId
    }, s);
    Audit.log('PWA_SM_COLLECT', 'Payments', (res && res.id) || '',
      { amount: amt, source: 'PWA' }, { voucherNo: U.str(res && res.voucherNo) }, s);
    return { ok: true, result: res };
  },

  /* ============================ OFFLINE SYNC ============================= */
  /**
   * Phone offline tha to mutations localStorage queue mein jam hote hain.
   * Net aate hi client ek hi call mein sab bhej deta hai — server sequentially
   * process karta hai, har item ka result alag alag milta hai (partial failure
   * se baqi items cancel nahi hote).
   */
  sync: function (p, s) {
    var queue = p.queue || [];
    if (!queue.length) return { ok: true, synced: 0, results: [] };
    var max = U.num(Config.get('pwa.offlineMaxQueue', 200));
    if (queue.length > max) throw new Error('Queue badi hai (' + queue.length + '). Max ' + max);

    var HANDLERS = {
      'pwa.fo.order': function (it) { return Pwa.foOrder(it.payload || {}, s); },
      'pwa.wh.receive': function (it) { return Pwa.whReceive(it.payload || {}, s); },
      'pwa.wh.count': function (it) { return Pwa.whCount(it.payload || {}, s); },
      'pwa.wh.putaway': function (it) { return Pwa.whPutaway(it.payload || {}, s); },
      'pwa.sm.sell': function (it) { return Pwa.smSell(it.payload || {}, s); },
      'pwa.sm.collect': function (it) { return Pwa.smCollect(it.payload || {}, s); },
      'pwa.pos.sell': function (it) { return Pwa.posSell(it.payload || {}, s); }
    };

    var results = [], ok = 0, failed = 0;
    queue.forEach(function (it) {
      var fn = HANDLERS[it.action];
      if (!fn) { results.push({ clientId: it.clientId, ok: false, error: 'Unknown action: ' + it.action }); failed++; return; }
      try {
        var r = fn(it);
        results.push({ clientId: it.clientId, ok: true, result: r }); ok++;
      } catch (e) {
        results.push({ clientId: it.clientId, ok: false, error: U.str(e.message || e) }); failed++;
      }
    });

    Audit.log('PWA_SYNC', 'OfflineQueue', '', { queued: queue.length, ok: ok, failed: failed },
      { ok: ok, failed: failed }, s);
    return { ok: failed === 0, synced: ok, failed: failed, results: results };
  }
};
