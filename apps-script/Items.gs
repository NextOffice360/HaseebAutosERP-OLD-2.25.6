/**
 * HASEEB AUTOS - ERP / POS  ::  ITEMS (Products)
 * Auto-parts specific fields: make / model / year range / engine / chassis / part type
 * Features: as-you-type search, alternate barcodes, nested pricing, duplicates, labels.
 */

var Items = {

  /**
   * Save/bulkSave ke liye allowed columns.
   * v2.5.2: poori SCHEMA.Items list (size, origin, conversionFactor, customFields,
   * lineItem ...) — warna item form se save karte hi yeh detail khatam ho jati.
   */
  FIELDS: ['id', 'code', 'name', 'nameUr', 'category', 'subCategory', 'brand', 'partType',
    'make', 'model', 'yearFrom', 'yearTo', 'engine', 'chassis', 'unit', 'barcode', 'altBarcodes',
    'costPrice', 'retailPrice', 'wholesalePrice', 'minPrice', 'taxRate', 'hsn',
    'minStock', 'reorderLevel', 'rack', 'defaultLocationId', 'trackSerial', 'hasExpiry',
    'imageUrl', 'notes', 'status', 'createdAt', 'updatedAt',
    /* v2 */ 'size', 'conversionFactor', 'primarySupplierId', 'barcodeType', 'binId',
    'isBundle', 'isService', 'allowDiscount', 'warranty', 'origin', 'weight',
    'gallery', 'variants', 'customFields', 'favourite', 'sortOrder',
    /* v2.5.2 */ 'lineItem'],

  /* ============================== LIST / SEARCH ============================ */
  /**
   * p: { q, category, brand, make, model, partType, locationId, status, lowStockOnly,
   *      sort, dir, page, pageSize, withStock }
   */
  list: function (p, s) {
    Auth.require(s, 'items.view');
    p = p || {};
    var locId = p.locationId || s.locationId;
    var stock = {};
    if (p.withStock !== false) stock = Inventory.stockMap(locId);

    var rows = DB.all('Items');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var it = rows[i];
      if (U.str(it.status) === 'DELETED') continue;
      if (p.status && U.str(it.status) !== p.status) continue;
      if (p.lineItem && U.str(it.lineItem) !== p.lineItem) continue;
      if (p.category && it.category !== p.category) continue;
      if (p.brand && it.brand !== p.brand) continue;
      if (p.make && it.make !== p.make) continue;
      if (p.partType && it.partType !== p.partType) continue;
      if (p.model) {
        if (U.norm(it.model).indexOf(U.norm(p.model)) === -1) continue;
      }
      if (p.lowStockOnly) {
        var q = U.num(stock[it.id], 0);
        if (q > U.num(it.reorderLevel, U.num(it.minStock, 0))) continue;
      }
      if (p.q && !Items._match(it, p.q)) continue;
      out.push(Items._decorate(it, stock));
    }

    var sortKey = p.sort || 'name';
    var dir = p.dir || 'asc';
    out.sort(function (a, b) {
      var ka = sortKey === 'stock' ? U.num(a.stock) : U.str(a[sortKey]).toLowerCase();
      var kb = sortKey === 'stock' ? U.num(b.stock) : U.str(b[sortKey]).toLowerCase();
      if (ka < kb) return dir === 'asc' ? -1 : 1;
      if (ka > kb) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    var pageSize = U.num(p.pageSize, 100);
    var page = U.num(p.page, 1);
    var total = out.length;
    var slice = p.pageSize === 0 ? out : out.slice((page - 1) * pageSize, page * pageSize);
    return { rows: slice, total: total, page: page, pageSize: pageSize, pages: Math.ceil(total / pageSize) || 1 };
  },

  /** fast search — POS / lookups ke liye (limit default 25) */
  search: function (p, s) {
    Auth.require(s, 'items.view');
    p = p || {};
    var limit = U.num(p.limit, 25);
    var stock = Inventory.stockMap(p.locationId || s.locationId);
    var rows = DB.all('Items');
    var scored = [];
    for (var i = 0; i < rows.length; i++) {
      var it = rows[i];
      if (U.str(it.status) !== 'ACTIVE' && U.str(it.status) !== '') continue;
      var score = Items._score(it, p.q);
      if (score > 0) scored.push({ it: it, score: score });
      if (scored.length > 800) break;
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit).map(function (x) { return Items._decorate(x.it, stock); });
  },

  /** scoring: exact code > barcode > startsWith > name match > category/brand */
  _score: function (it, q) {
    if (!q) return 1;
    var query = U.norm(q);
    var code = U.norm(it.code), bc = U.norm(it.barcode), name = U.norm(it.name);
    var alt = U.norm(it.altBarcodes);
    if (code === query || bc === query) return 100;
    if (alt.split(',').some(function (a) { return U.norm(a) === query; })) return 95;
    if (code.indexOf(query) === 0 || bc.indexOf(query) === 0) return 80;
    if (name.indexOf(query) === 0) return 70;
    if (name.indexOf(query) > -1) return 60;
    if (U.norm(it.nameUr || '').indexOf(query) > -1) return 55;
    if (U.norm(it.model || '').indexOf(query) > -1) return 50;
    if (U.norm(it.brand || '').indexOf(query) > -1) return 40;
    if (U.norm(it.category || '').indexOf(query) > -1) return 35;
    if (U.norm(it.altBarcodes || '').indexOf(query) > -1) return 30;
    if (U.norm(it.make || '').indexOf(query) > -1) return 25;
    // fuzzy: sab tokens kahin na kahin milay
    return U.matchAll(code + bc + name + it.brand + it.category + it.model, q) ? 15 : 0;
  },

  _match: function (it, q) { return Items._score(it, q) > 0; },

  _decorate: function (it, stockMap) {
    var qty = U.num(stockMap ? stockMap[it.id] : 0, 0);
    return {
      id: it.id, code: it.code, name: it.name, nameUr: it.nameUr,
      lineItem: it.lineItem, category: it.category, subCategory: it.subCategory,
      brand: it.brand, partType: it.partType, make: it.make, model: it.model,
      origin: it.origin, size: it.size, conversionFactor: U.num(it.conversionFactor, 1) || 1,
      unit: it.unit, barcode: it.barcode, altBarcodes: it.altBarcodes,
      costPrice: U.num(it.costPrice), retailPrice: U.num(it.retailPrice),
      wholesalePrice: U.num(it.wholesalePrice), minPrice: U.num(it.minPrice),
      taxRate: U.num(it.taxRate), rack: it.rack, status: it.status || 'ACTIVE',
      minStock: U.num(it.minStock), reorderLevel: U.num(it.reorderLevel),
      stock: qty, imageUrl: it.imageUrl, updatedAt: it.updatedAt
    };
  },

  get: function (id, withStock, s) {
    var it = DB.byId('Items', id);
    if (!it) throw new Error('Item not found');
    var out = Items._decorate(it, Inventory.stockMap(s.locationId));
    out.raw = it;
    if (withStock) {
      out.stockByLocation = DB.all('Stock').filter(function (r) { return r.itemId === id; })
        .map(function (r) { return { locationId: r.locationId, qty: U.num(r.qty), avgCost: U.num(r.avgCost), rack: r.rack }; });
      out.prices = Items.getPrices(id, s);
    }
    return out;
  },

  /* ================================= CRUD ================================= */
  /* ==========================================================================
     IMAGE UPLOAD (v2.6 QA) — "koi option nahi hai product image upload ka"
     --------------------------------------------------------------------------
     Pehle sirf URL paste kar sakte thay. Ab phone/PC se file chunein →
     client usay chhota kar ke base64 bhejta hai → yahan Google Drive mein
     save hota hai → public URL item.imageUrl mein likh diya jata hai.

     Kyun Drive? Apps Script ke paas apna filesystem nahi, aur Drive hi
     aap ke Google account ke andar rehta hai (koi teesri party, koi API key).

     Guard: sirf image/* , max ~1.2 MB (base64), duplicate folder nahi banega.
     ========================================================================== */
  uploadImage: function (p, s) {
    /* v2.6 QA — ab ye shared Media.upload use karta hai (logo bhi isi se) */
    return Media.upload(s, {
      bytes: Media.decode(p.data, p.mime),
      owner: 'ITEM',
      name: U.str((DB.byId('Items', U.str(p.itemId)) || {}).code || p.itemId)
    }, function (url, driveId) {
      var it = DB.byId('Items', U.str(p.itemId));
      var gallery = Items._galleryOf(it);
      if (p.slot === 'gallery') gallery.push(url); else gallery.unshift(url);
      DB.update('Items', it.id, {
        imageUrl: (p.slot === 'gallery') ? (it.imageUrl || url) : url,
        gallery: gallery.slice(0, 12).join('\n')
      }, s);
      Audit.log('ITEM_IMAGE', 'Items', it.id, { imageUrl: it.imageUrl },
        { imageUrl: url, slot: p.slot || 'main', driveId: driveId }, s);
      return { url: url, driveId: driveId, gallery: gallery.slice(0, 12) };
    });
  },

  _uploadImageOld: function (p, s) {
    Auth.require(s, 'items.edit');
    p = p || {};
    var itemId = U.str(p.itemId);
    if (!itemId) throw new Error('Item select karein.');
    var it = DB.byId('Items', itemId);
    if (!it) throw new Error('Item nahi mila.');

    var b64 = U.str(p.data);
    if (!b64) throw new Error('Image khaali hai.');

    /* data:image/png;base64,XXXX  → sirf XXXX */
    var mime = U.str(p.mime) || 'image/jpeg';
    if (b64.indexOf(',') > -1) {
      var head = b64.slice(0, b64.indexOf(','));
      var mm = head.match(/data:([^;]+);/);
      if (mm && mm[1]) mime = mm[1];
      b64 = b64.slice(b64.indexOf(',') + 1);
    }
    if (mime.indexOf('image/') !== 0) throw new Error('Sirf image file (JPG/PNG/WebP) upload ho sakti hai.');
    if (b64.length > 1700000) throw new Error('Image bari hai — dobara chhoti kar ke bhejein.');

    var bytes;
    try { bytes = Utilities.base64Decode(b64); }
    catch (e) { throw new Error('Image samajh nahi aayi (corrupt file).'); }

    /* ek hi folder baar baar (idempotent, duplicate nahi) */
    var folder = Items._imageFolder();
    var ext = (mime.indexOf('png') > -1) ? 'png' : (mime.indexOf('webp') > -1) ? 'webp' : 'jpg';
    var fname = U.str(it.code || it.id).replace(/[^A-Za-z0-9_-]/g, '_') + '-' + U.uid('').slice(-6) + '.' + ext;

    var blob = Utilities.newBlob(bytes, mime, fname);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }

    /* Drive direct-view URL (uc?export=view wala kabhi kabhi block hota hai) */
    var id = file.getId();
    var url = 'https://drive.google.com/uc?export=view&id=' + id;

    var gallery = Items._galleryOf(it);
    if (p.slot === 'gallery') gallery.push(url);
    else gallery.unshift(url);

    DB.update('Items', itemId, {
      imageUrl: (p.slot === 'gallery') ? (it.imageUrl || url) : url,
      gallery: gallery.slice(0, 12).join('\n')
    }, s);

    Audit.log('ITEM_IMAGE', 'Items', itemId, { imageUrl: it.imageUrl },
      { imageUrl: url, slot: p.slot || 'main', bytes: bytes.length, driveId: id }, s);

    return { url: url, driveId: id, gallery: gallery.slice(0, 12) };
  },

  /** Ek hi "Haseeb Autos — Product Images" folder (baar baar banega to nahi) */
  _imageFolder: function () {
    var name = 'Haseeb Autos — Product Images';
    try {
      var props = PropertiesService.getScriptProperties();
      var fid = props.getProperty('IMG_FOLDER_ID');
      if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { } }
      var it = DriveApp.getFoldersByName(name);
      if (it.hasNext()) { var f = it.next(); props.setProperty('IMG_FOLDER_ID', f.getId()); return f; }
      var made = DriveApp.createFolder(name);
      props.setProperty('IMG_FOLDER_ID', made.getId());
      return made;
    } catch (e) {
      return DriveApp.getRootFolder();
    }
  },

  _galleryOf: function (it) {
    return U.str(it && it.gallery).split('\n').map(function (x) { return U.str(x).trim(); })
      .filter(function (x) { return x && x.indexOf('http') === 0; });
  },

  save: function (payload, s) {
    Auth.require(s, 'items.create');
    var rec = U.pick(payload, Items.FIELDS);
    /* v2.30.0 (N1/N2 deep audit) — PARTIAL UPDATE ka asli bug:
       ① `if (!rec.name) throw` update se PEHLE chalta tha → {id, barcode} jaisi
          partial save hamesha fail ("Item name zaroori hai") — App_Masters ka
          barcode edit, "Save extra fields" aur image-URL save isi wajah se tootay thay.
       ② `if (!rec.code) rec.code = nextCode()` partial save par item ka CODE hi
          badal deta tha (data corruption) — aur barcode bhi.
       Ab: update mein sirf JO bheja gaya woh validate/update hota hai (merged
       validation), code/barcode sirf naye record par generate hote hain. */
    var existing = rec.id ? DB.byId('Items', rec.id) : null;
    if (rec.id && !existing) throw new Error('Item not found');
    var effName = rec.name !== undefined ? rec.name : (existing ? existing.name : '');
    if (!U.str(effName)) throw new Error('Item name zaroori hai.');
    if (!rec.id) {
      if (!rec.code) rec.code = Items.nextCode(payload.brand || '', s);
      if (!rec.barcode) rec.barcode = rec.code;
    }
    var effCode = U.str(rec.code) || U.str(existing && existing.code);
    if (effCode) {
      var dup = DB.findOne('Items', function (r) {
        return U.norm(r.code) === U.norm(effCode) && r.id !== rec.id;
      });
      if (dup) throw new Error('Code "' + effCode + '" already exists (item: ' + dup.name + ').');
    }

    if (rec.id) {
      /* price permission sirf tab jab price waqai bheja gaya ho */
      if (rec.retailPrice !== undefined && U.num(rec.retailPrice) !== U.num(existing.retailPrice) &&
          !Auth.can(s, 'items.price.edit')) {
        throw new Error('Price change ke liye ijazat nahi hai.');
      }
      rec.updatedAt = U.iso();
      return DB.update('Items', rec.id, rec, s);
    }
    rec.status = rec.status || 'ACTIVE';
    var created = DB.insert('Items', rec, s);
    // opening stock row (zero) for all locations
    DB.all('Locations').forEach(function (loc) {
      DB.insert('Stock', { id: U.uid('STK'), itemId: created.id, locationId: loc.id,
        qty: '0', avgCost: rec.costPrice || 0, rack: rec.rack || '', lastCountedAt: '', updatedAt: U.iso() });
    });
    return created;
  },

  bulkSave: function (items, s) {
    Auth.require(s, 'items.import');
    if (!items || !items.length) throw new Error('Koi rows nahi mili.');
    var created = 0, updated = 0, errors = [];
    var all = DB.all('Items', true);
    var byCode = {};
    all.forEach(function (r) { byCode[U.norm(r.code)] = r; });

    var toInsert = [], toUpdate = [];
    items.forEach(function (row, idx) {
      try {
        if (!row.name) { errors.push('Row ' + (idx + 2) + ': name missing'); return; }
        var key = U.norm(row.code || row.barcode || row.name);
        var match = byCode[U.norm(row.code)];
        if (match) {
          toUpdate.push({ id: match.id, patch: U.pick(row, Items.FIELDS) });
          updated++;
        } else {
          var rec = U.pick(row, Items.FIELDS);
          rec.id = U.uid('ITM');
          rec.code = rec.code || Items.nextCode(rec.brand || '', s) + '-' + (idx + 1);
          rec.barcode = rec.barcode || rec.code;
          rec.status = rec.status || 'ACTIVE';
          rec.createdAt = U.iso(); rec.updatedAt = U.iso();
          toInsert.push(rec);
          created++;
        }
      } catch (e) { errors.push('Row ' + (idx + 2) + ': ' + e.message); }
    });

    if (toInsert.length) DB.insertMany('Items', toInsert, s);
    toUpdate.forEach(function (u) { DB.update('Items', u.id, u.patch, s); });
    DB.touch('Items');
    Audit.log('IMPORT', 'Items', '', null, { created: created, updated: updated, errors: errors.length }, s);
    return { created: created, updated: updated, errors: errors };
  },

  remove: function (id, s) {
    Auth.require(s, 'items.delete');
    return DB.remove('Items', id, s);
  },

  nextCode: function (prefix, s) {
    var rows = DB.all('Items');
    var max = 0;
    rows.forEach(function (r) {
      var m = /(\d+)$/.exec(U.str(r.code));
      if (m) max = Math.max(max, U.num(m[1]));
    });
    return (U.str(prefix).substring(0, 3).toUpperCase() || 'ITM') + '-' + U.pad(max + 1, 4);
  },

  /* ============================== UTILITIES =============================== */
  findDuplicates: function (s) {
    Auth.require(s, 'items.view');
    var rows = DB.all('Items');
    var groups = {};
    rows.forEach(function (r) {
      if (U.str(r.status) === 'DELETED') return;
      var keys = [
        'name:' + U.norm(r.name),
        'code:' + U.norm(r.code),
        'barcode:' + U.norm(r.barcode)
      ];
      if (U.str(r.name) && U.str(r.brand)) keys.push('nb:' + U.norm(r.name) + U.norm(r.brand));
      keys.forEach(function (k) { (groups[k] = groups[k] || []).push(r); });
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      if (groups[k].length > 1) {
        var type = k.split(':')[0];
        out.push({ key: k, type: type, items: groups[k].map(function (i) {
          return { id: i.id, code: i.code, name: i.name, barcode: i.barcode, brand: i.brand, status: i.status };
        }) });
      }
    });
    return out;
  },

  changeCode: function (oldCode, newCode, s) {
    Auth.require(s, 'items.edit');
    var it = DB.findOne('Items', function (r) { return U.norm(r.code) === U.norm(oldCode); });
    if (!it) throw new Error('Item not found: ' + oldCode);
    var exists = DB.findOne('Items', function (r) { return U.norm(r.code) === U.norm(newCode) && r.id !== it.id; });
    if (exists) throw new Error('New code already used by: ' + exists.name);
    var old = it.code, oldBc = it.barcode;
    DB.update('Items', it.id, { code: newCode, updatedAt: U.iso() }, s);
    if (!U.str(it.barcode) || it.barcode === old) DB.update('Items', it.id, { barcode: newCode }, s);
    return { id: it.id, oldCode: old, newCode: newCode };
  },

  setStatus: function (ids, status, s) {
    Auth.require(s, 'items.edit');
    var n = 0;
    (ids || []).forEach(function (id) { DB.update('Items', id, { status: status, updatedAt: U.iso() }, s); n++; });
    return { updated: n, status: status };
  },

  /* ============================== PRICING ================================= */
  getPrices: function (itemId, s) {
    return DB.all('ItemPrices').filter(function (r) { return r.itemId === itemId && U.str(r.active) !== 'false'; });
  },

  savePrices: function (itemId, prices, s) {
    Auth.require(s, 'items.price.edit');
    // purge old for item
    DB.all('ItemPrices').filter(function (r) { return r.itemId === itemId; })
      .forEach(function (r) { DB.remove('ItemPrices', r.id, s); });
    (prices || []).forEach(function (p) {
      DB.insert('ItemPrices', {
        id: U.uid('IP'), itemId: itemId, customerTypeId: p.customerTypeId || '',
        priceType: p.priceType || 'RETAIL', minQty: p.minQty || 1, price: p.price || 0,
        discountPct: p.discountPct || 0, validFrom: p.validFrom || '', validTo: p.validTo || '', active: 'true'
      }, s);
    });
    return Items.getPrices(itemId, s);
  },

  /** customer type ke hisaab se effective price */
  priceFor: function (item, customerTypeId, qty) {
    qty = U.num(qty, 1);
    var base = U.num(item.retailPrice);
    if (!customerTypeId) return base;
    var rules = DB.all('ItemPrices').filter(function (r) {
      return r.itemId === item.id && (r.customerTypeId === customerTypeId || r.customerTypeId === '');
    });
    if (!rules.length) return base;
    var best = null;
    rules.forEach(function (r) {
      if (qty >= U.num(r.minQty, 1)) {
        if (!best || U.num(r.minQty, 1) >= U.num(best.minQty, 1)) best = r;
      }
    });
    if (!best) return base;
    var price = U.num(best.price) || base;
    if (U.num(best.discountPct)) price = price * (1 - U.num(best.discountPct) / 100);
    return U.round(price, 2);
  },

  /** Customer type ka default discount % */
  typeDiscount: function (customerTypeId) {
    var ct = DB.byId('CustomerTypes', customerTypeId);
    return ct ? U.num(ct.discountPct) : 0;
  },

  reorderSuggestion: function (s) {
    Auth.require(s, 'stock.view');
    var stock = Inventory.stockMap(s.locationId);
    var suppliers = DB.all('Suppliers');
    return DB.all('Items').filter(function (it) {
      if (U.str(it.status) !== 'ACTIVE') return false;
      return U.num(stock[it.id], 0) <= U.num(it.reorderLevel, U.num(it.minStock, 0));
    }).map(function (it) {
      return Items._decorate(it, stock);
    }).map(function (it) {
      /* Auto-reorder / "orders to verify" list: qty + supplier dono isi se bante hain */
      var reorder = U.num(it.reorderLevel, U.num(it.minStock, 0));
      var target = U.num(DB.settings().reorderTargetMultiplier, 2);
      it.suggestQty = Math.max(reorder * (target || 2) - U.num(it.stock), 10);
      it.suggestedQty = it.suggestQty;                       // UI dono naam use karta hai
      it.reorderLevel = reorder;
      it.estCost = U.round(it.suggestQty * U.num(it.costPrice), 2);
      it.value = it.estCost;
      var sup = null;
      suppliers.forEach(function (x) {
        if (x.id && x.id === it.primarySupplierId) sup = x;
      });
      if (!sup) {
        /* ItemPrices / last purchase se fallback — supplier ka pata na ho to bhi list khali na rahe */
        var lastLine = DB.all('PurchaseOrderItems').filter(function (l) { return l.itemId === it.id; }).pop();
        if (lastLine) {
          var lastPO = DB.byId('PurchaseOrders', lastLine.poId);
          if (lastPO) sup = DB.byId('Suppliers', lastPO.supplierId);
        }
      }
      it.supplierId = sup ? sup.id : (it.primarySupplierId || '');
      it.supplierName = sup ? U.str(sup.name) : '';
      it.primarySupplierId = it.supplierId;
      return it;
    });
  },

  findByBarcode: function (code, s) {
    code = U.str(code);
    if (!code) return null;
    var norm = U.norm(code);
    var rows = DB.all('Items');
    for (var i = 0; i < rows.length; i++) {
      var it = rows[i];
      if (U.str(it.status) === 'DELETED') continue;
      if (U.norm(it.barcode) === norm || U.norm(it.code) === norm) return Items._decorate(it, Inventory.stockMap(s.locationId));
      var alts = U.str(it.altBarcodes).split(',').map(U.norm);
      if (alts.indexOf(norm) > -1) return Items._decorate(it, Inventory.stockMap(s.locationId));
      // QR payload "HA:ITM:CODE" support
      if (U.str(it.barcode) && norm.indexOf(U.norm(it.barcode)) === 0) return Items._decorate(it, Inventory.stockMap(s.locationId));
    }
    return null;
  },

  /** filter dropdowns ke liye distinct values */
  facets: function () {
    var rows = DB.all('Items');
    var f = { lineItems: {}, categories: {}, subCategories: {}, brands: {}, makes: {},
              partTypes: {}, models: {}, origins: {}, sizes: {} };
    rows.forEach(function (r) {
      if (r.lineItem) f.lineItems[r.lineItem] = 1;
      if (r.category) f.categories[r.category] = 1;
      if (r.subCategory) f.subCategories[r.subCategory] = 1;
      if (r.brand) f.brands[r.brand] = 1;
      if (r.make) f.makes[r.make] = 1;
      if (r.partType) f.partTypes[r.partType] = 1;
      if (r.model) f.models[r.model] = 1;
      if (r.origin) f.origins[r.origin] = 1;
      if (r.size) f.sizes[r.size] = 1;
    });
    return {
      lineItems: Object.keys(f.lineItems).sort(),
      categories: Object.keys(f.categories).sort(),
      subCategories: Object.keys(f.subCategories).sort(),
      brands: Object.keys(f.brands).sort(),
      makes: Object.keys(f.makes).sort(),
      partTypes: Object.keys(f.partTypes).sort(),
      models: Object.keys(f.models).sort(),
      origins: Object.keys(f.origins).sort(),
      sizes: Object.keys(f.sizes).sort()
    };
  }
};
