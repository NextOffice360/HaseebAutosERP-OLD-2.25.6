/**
 * HASEEB AUTOS - ERP / POS  ::  LANGUAGE / TRANSLATIONS
 * ------------------------------------------------------------------------
 * Har label, button, tab aur message yahan stored hai — Settings ▸ Language se
 * user khud English / Roman Urdu / اردو text edit kar sakta hai.
 * Sheet: Translations (key, en, roman, ur, scope)
 *   • Lang.all()      → { key: {en, roman, ur} }
 *   • Lang.dict(lang) → { key: text }  (frontend isi se render hota hai)
 *   • Lang.save()     → single row update
 *   • Lang.auto()     → AI se missing translations bharwa deta hai
 */
var Lang = {

  /* ============================== READ ==================================== */
  all: function (s) {
    var rows = DB.all('Translations').filter(function (r) {
      return U.str(r.scope).indexOf('user:') !== 0;      // personal overrides alag (lang.myOverrides)
    });
    if (!rows.length) return Lang.seed(s);
    var out = {};
    rows.forEach(function (r) {
      out[r.key] = { en: r.en || '', roman: r.roman || '', ur: r.ur || '', scope: r.scope || '' };
    });
    return out;
  },

  /**
   * Frontend isi se render hota hai.
   * Order: global dictionary → **user overrides** (scope = 'user:<userId>') → fallback english.
   * Is se har user apni pasand ka label/word rakh sakta hai — doosron par asar nahi.
   */
  dict: function (lang, s) {
    var all = Lang.all(s), out = {};
    var f = lang === 'ur' ? 'ur' : (lang === 'roman' ? 'roman' : 'en');
    Object.keys(all).forEach(function (k) {
      if (U.str(all[k].scope).indexOf('user:') === 0) return;      // personal rows alag se
      var v = all[k][f] || all[k].en || '';
      if (v) out[k] = v;
    });
    if (s && s.userId) {
      var mine = 'user:' + s.userId;
      DB.all('Translations').forEach(function (r) {
        if (U.str(r.scope) !== mine) return;
        var v = (f === 'ur' ? r.ur : (f === 'roman' ? r.roman : r.en)) || r.en || '';
        if (v) out[r.key] = v;
      });
    }
    return out;
  },

  /* ============================ USER PREFS ================================ */
  /** User ki settings: { lang:'en'|'roman'|'ur', dateFormat, ... } — Users.prefs (JSON) */
  prefs: function (s) {
    s = s || {};
    var stored = {};
    try { stored = JSON.parse(U.str((DB.byId('Users', s.userId) || {}).prefs) || '{}') || {}; } catch (e) { stored = {}; }
    // session sirf ek snapshot hai — asli source Users.prefs (DB) hai
    var out = Object.assign({}, (s.prefs && typeof s.prefs === 'object') ? s.prefs : {}, stored);
    if (!out.lang) out.lang = U.str(DB.settings().defaultLanguage) || 'en';
    return out;
  },

  /** Apni (ya users.manage ho to kisi ki bhi) prefs save — language yahin persist hoti hai */
  savePrefs: function (patch, s) {
    if (!s) throw new Error('Login zaroori hai.');
    patch = patch || {};
    var target = U.str(patch.userId) || s.userId;
    if (!target) throw new Error('User nahi mila.');
    if (target !== s.userId) Auth.require(s, 'users.manage');

    var u = DB.byId('Users', target);
    if (!u) throw new Error('User nahi mila: ' + target);

    var cur = {};
    try { cur = JSON.parse(U.str(u.prefs) || '{}') || {}; } catch (e) { cur = {}; }
    Object.keys(patch).forEach(function (k) { if (k !== 'userId') cur[k] = patch[k]; });

    DB.update('Users', target, { prefs: JSON.stringify(cur) }, s);
    if (target === s.userId) s.prefs = cur;                 // current session turant update
    return cur;
  },

  /** Sirf apni personal override rows (translation editor ▸ "Mere liye") */
  myOverrides: function (s) {
    if (!s || !s.userId) return {};
    var mine = 'user:' + s.userId, out = {};
    DB.all('Translations').forEach(function (r) {
      if (U.str(r.scope) === mine) out[r.key] = { en: r.en || '', roman: r.roman || '', ur: r.ur || '', scope: mine };
    });
    return out;
  },

  /* ============================== WRITE =================================== */
  save: function (rec, s) {
    if (!rec.key) throw new Error('Translation key zaroori hai.');
    var scope = rec.scope || 'UI';
    var isPersonal = U.str(scope).indexOf('user:') === 0;
    var existing = DB.findOne('Translations', function (r) {
      if (r.key !== rec.key) return false;
      var rs = U.str(r.scope);
      // personal row sirf apni scope se match; global row sirf non-user scope se
      return isPersonal ? rs === U.str(scope) : rs.indexOf('user:') !== 0;
    });
    if (U.str(existing ? existing.scope : scope).indexOf('user:') === 0) {
      // apni personal row: koi bhi logged-in user edit kar sakta hai
      if (U.str(existing ? existing.scope : scope) !== 'user:' + (s && s.userId)) Auth.require(s, 'settings.manage');
    } else {
      Auth.require(s, 'settings.manage');
    }
    var payload = {
      key: rec.key,
      en: rec.en !== undefined ? rec.en : (existing ? existing.en : rec.key),
      roman: rec.roman !== undefined ? rec.roman : (existing ? existing.roman : ''),
      ur: rec.ur !== undefined ? rec.ur : (existing ? existing.ur : ''),
      scope: scope || (existing ? existing.scope : 'UI')
    };
    if (existing) return DB.update('Translations', existing.id, payload, s);
    payload.updatedAt = U.iso();
    return DB.insert('Translations', payload, s);
  },

  remove: function (id, s) {
    Auth.require(s, 'settings.manage');
    return DB.remove('Translations', id, s);
  },

  /* ========================== DEFAULT DICTIONARY ========================== */
  seed: function (s) {
    var defs = Lang.defaults();
    var out = {};
    Object.keys(defs).forEach(function (k) {
      var v = defs[k];
      out[k] = { en: v.en, roman: v.roman, ur: v.ur, scope: v.scope || 'UI' };
      DB.insert('Translations', { key: k, en: v.en, roman: v.roman, ur: v.ur,
        scope: v.scope || 'UI', updatedAt: U.iso() });
    });
    return out;
  },

  reset: function (s) {
    Auth.require(s, 'settings.manage');
    DB.all('Translations').forEach(function (r) { DB.remove('Translations', r.id, s); });
    return Lang.seed(s);
  },

  /** AI se khaali (ya selected) translations bharwa deta hai */
  auto: function (opts, s) {
    Auth.require(s, 'settings.manage');
    opts = opts || {};
    var rows = DB.all('Translations');
    var pending = rows.filter(function (r) {
      if (opts.all === true) return true;
      return !U.str(r.roman) || !U.str(r.ur);
    });
    if (opts.limit) pending = pending.slice(0, U.num(opts.limit));
    if (!pending.length) return { translated: 0 };

    var done = 0, failed = 0;
    for (var i = 0; i < pending.length; i += 25) {
      var batch = pending.slice(i, i + 25);
      var prompt = 'Translate the following UI labels of a POS/ERP app for auto parts shop.\n' +
        'Return ONLY strict JSON array. Each element: {"key":...,"roman":...<Roman Urdu, latin script>...,"ur":...<Urdu, Arabic script>...}.\n' +
        'Keep it short and natural for shop keepers. Do not translate brand names or codes.\n\n' +
        JSON.stringify(batch.map(function (r) { return { key: r.key, en: r.en }; }));
      var out;
      try { out = AI.complete(prompt, s); } catch (e) { out = ''; }
      var arr = null;
      try {
        var m = String(out).match(/\[[\s\S]*\]/);
        arr = JSON.parse(m ? m[0] : out);
      } catch (e) { arr = null; }
      if (!arr || !arr.length) { failed += batch.length; continue; }
      arr.forEach(function (row) {
        var src = batch.filter(function (b) { return b.key === row.key; })[0];
        if (!src) return;
        Lang.save({ key: row.key, en: src.en, roman: row.roman || src.roman, ur: row.ur || src.ur, scope: src.scope }, s);
        done++;
      });
    }
    return { translated: done, failed: failed };
  },

  /* ============================ DEFAULTS ================================== */
  defaults: function () {
    return {
      /* ---- navigation ---- */
      'nav.dashboard': { en: 'Dashboard', roman: 'Dashboard', ur: 'ڈیش بورڈ' },
      'nav.pos': { en: 'Point of Sale', roman: 'Point of Sale (Bill)', ur: 'پوائنٹ آف سیل (بل)' },
      'nav.sales': { en: 'Sales History', roman: 'Sales History', ur: 'سیلز ہسٹری' },
      'nav.items': { en: 'Items', roman: 'Items (Products)', ur: 'آئٹمز (پروڈکٹس)' },
      'nav.inventory': { en: 'Inventory', roman: 'Inventory (Stock)', ur: 'انوینٹری (اسٹاک)' },
      'nav.warehouse': { en: 'Warehouse', roman: 'Warehouse (Godam)', ur: 'ویئر ہاؤس (گودام)' },
      'nav.purchase': { en: 'Purchase', roman: 'Purchase (Khareed)', ur: 'پرچیز (خرید)' },
      'nav.reorder': { en: 'Auto Reorder', roman: 'Auto Reorder', ur: 'آٹو ری آرڈر' },
      'nav.parties': { en: 'Customers & Suppliers', roman: 'Customers & Suppliers', ur: 'کسٹمرز اور سپلائرز' },
      'nav.money': { en: 'Payments & Cash', roman: 'Payments & Cash', ur: 'پیمنٹس اور کیش' },
      'nav.reports': { en: 'Reports', roman: 'Reports', ur: 'رپورٹس' },
      'nav.insights': { en: 'Dashboards', roman: 'Dashboards', ur: 'ڈیش بورڈز' },
      'nav.shop': { en: 'Shop Open/Close', roman: 'Shop Open / Close', ur: 'دکان کھولنا / بند کرنا' },
      'nav.users': { en: 'Users & Security', roman: 'Users & Security', ur: 'یوزرز اور سیکیورٹی' },
      'nav.settings': { en: 'Settings', roman: 'Settings', ur: 'سیٹنگز' },

      /* ---- common actions ---- */
      'btn.save': { en: 'Save', roman: 'Save karein', ur: 'محفوظ کریں' },
      'btn.cancel': { en: 'Cancel', roman: 'Cancel', ur: 'منسوخ' },
      'btn.close': { en: 'Close', roman: 'Band karein', ur: 'بند کریں' },
      'btn.add': { en: 'Add', roman: 'Add karein', ur: 'شامل کریں' },
      'btn.edit': { en: 'Edit', roman: 'Edit karein', ur: 'تبدیل کریں' },
      'btn.delete': { en: 'Delete', roman: 'Delete karein', ur: 'حذف کریں' },
      'btn.refresh': { en: 'Refresh', roman: 'Refresh', ur: 'تازہ کریں' },
      'btn.export': { en: 'Export', roman: 'Export', ur: 'ایکسپورٹ' },
      'btn.import': { en: 'Import', roman: 'Import', ur: 'امپورٹ' },
      'btn.print': { en: 'Print', roman: 'Print', ur: 'پرنٹ' },
      'btn.new': { en: 'New', roman: 'Naya', ur: 'نیا' },
      'btn.search': { en: 'Search', roman: 'Dhoondain', ur: 'تلاش کریں' },
      'btn.filters': { en: 'Filters', roman: 'Filters', ur: 'فلٹرز' },
      'btn.confirm': { en: 'Confirm', roman: 'Confirm karein', ur: 'تصدیق کریں' },
      'btn.apply': { en: 'Apply', roman: 'Apply karein', ur: 'لاگو کریں' },
      'btn.clear': { en: 'Clear', roman: 'Clear', ur: 'صاف کریں' },

      /* ---- POS ---- */
      'pos.title': { en: 'Point of Sale', roman: 'Bill banaayein', ur: 'بل بنائیں' },
      'pos.search': { en: 'Scan or type item name / code / barcode', roman: 'Item ka naam / code / barcode likhein', ur: 'آئٹم کا نام / کوڈ / بارکوڈ لکھیں' },
      'pos.allItems': { en: 'All items', roman: 'Saare items', ur: 'تمام آئٹمز' },
      'pos.categories': { en: 'Categories', roman: 'Categories', ur: 'کیٹیگریز' },
      'pos.favourites': { en: 'Favourites', roman: 'Pasandida', ur: 'پسندیدہ' },
      'pos.recent': { en: 'Recently sold', roman: 'Abhi beche gaye', ur: 'ابھی بکے ہوئے' },
      'pos.held': { en: 'Held bills', roman: 'Rukay hue bill', ur: 'رکے ہوئے بل' },
      'pos.cart': { en: 'Current bill', roman: 'Ye bill', ur: 'یہ بل' },
      'pos.subtotal': { en: 'Subtotal', roman: 'Sub total', ur: 'سب ٹوٹل' },
      'pos.discount': { en: 'Discount', roman: 'Discount', ur: 'ڈسکاؤنٹ' },
      'pos.tax': { en: 'Tax', roman: 'Tax', ur: 'ٹیکس' },
      'pos.total': { en: 'TOTAL', roman: 'TOTAL', ur: 'ٹوٹل' },
      'pos.pay': { en: 'Cash', roman: 'Cash (F9)', ur: 'نقد (F9)' },
      'pos.card': { en: 'Card', roman: 'Card', ur: 'کارڈ' },
      'pos.split': { en: 'Split', roman: 'Split payment', ur: 'اسپلٹ ادائیگی' },
      'pos.credit': { en: 'Udhaar', roman: 'Udhaar', ur: 'ادھار' },
      'pos.customer': { en: 'Customer', roman: 'Customer', ur: 'کسٹمر' },
      'pos.walkin': { en: 'Walk-in Customer', roman: 'Walk-in customer', ur: 'عام گاہک' },
      'pos.hold': { en: 'Hold', roman: 'Hold (F8)', ur: 'رکیں (F8)' },

      /* ---- inventory / warehouse ---- */
      'inv.stock': { en: 'Stock levels', roman: 'Stock', ur: 'اسٹاک' },
      'inv.moves': { en: 'Stock ledger', roman: 'Stock ledger', ur: 'اسٹاک لیجر' },
      'inv.adjust': { en: 'Adjustments', roman: 'Adjustments', ur: 'ایڈجسٹمنٹس' },
      'inv.transfer': { en: 'Transfers', roman: 'Branch transfer', ur: 'برانچ ٹرانسفر' },
      'inv.count': { en: 'Count sheet', roman: 'Ginti (count sheet)', ur: 'گنتی شیٹ' },
      'inv.lots': { en: 'Lots / expiry', roman: 'Lot / expiry', ur: 'لاٹ / میعاد' },
      'wh.bins': { en: 'Bins & racks', roman: 'Bins & racks', ur: 'بنس اور ریک' },
      'wh.putaway': { en: 'Put-away / move', roman: 'Stock move karein', ur: 'اسٹاک منتقل کریں' },

      /* ---- reorder ---- */
      'ro.title': { en: 'Auto reorder', roman: 'Auto reorder', ur: 'آٹو ری آرڈر' },
      'ro.suggestions': { en: 'Suggestions', roman: 'Suggestions', ur: 'تجاویز' },
      'ro.rules': { en: 'Rules', roman: 'Rules (settings)', ur: 'قواعد (سیٹنگز)' },
      'ro.create': { en: 'Create purchase orders', roman: 'PO banaayein', ur: 'پی او بنائیں' },
      'ro.suggested': { en: 'Suggested qty', roman: 'Suggested qty', ur: 'تجویز کردہ مقدار' },
      'ro.daysCover': { en: 'Days cover', roman: 'Kitne din chalay ga', ur: 'کتنے دن چلے گا' },

      /* ---- parties ---- */
      'party.customers': { en: 'Customers', roman: 'Customers', ur: 'کسٹمرز' },
      'party.suppliers': { en: 'Suppliers', roman: 'Suppliers', ur: 'سپلائرز' },
      'party.balance': { en: 'Balance', roman: 'Balance', ur: 'بقایا' },
      'party.ledger': { en: 'Ledger', roman: 'Ledger (khata)', ur: 'لیجر (کھاتہ)' },

      /* ---- settings ---- */
      'set.title': { en: 'Settings & Configuration', roman: 'Settings', ur: 'سیٹنگز' },
      'set.language': { en: 'Language', roman: 'Zaban', ur: 'زبان' },
      'set.customFields': { en: 'Custom fields', roman: 'Apne fields', ur: 'اپنے فیلڈز' },
      'set.menu': { en: 'Menu builder', roman: 'Menu builder', ur: 'مینو بلڈر' },
      'set.templates': { en: 'Print templates', roman: 'Print templates', ur: 'پرنٹ ٹیمپلیٹس' },

      /* ---- messages ---- */
      'msg.saved': { en: 'Saved', roman: 'Save ho gaya', ur: 'محفوظ ہو گیا' },
      'msg.deleted': { en: 'Deleted', roman: 'Delete ho gaya', ur: 'حذف ہو گیا' },
      'msg.required': { en: 'This field is required', roman: 'Ye field zaroori hai', ur: 'یہ فیلڈ ضروری ہے' },
      'msg.noData': { en: 'No data found', roman: 'Koi data nahi mila', ur: 'کوئی ڈیٹا نہیں ملا' },
      'msg.loading': { en: 'Loading…', roman: 'Load ho raha hai…', ur: 'لوڈ ہو رہا ہے…' }
    };
  }
};
