/**
 * HASEEB AUTOS - ERP / POS  ::  BARCODE / QR / LABEL
 * Rendering client-side hoti hai (offline-safe, CDN-free).
 * Server: data + templates + auto code assignment.
 */

var Barcode = {

  /** Naye item ke liye unique barcode generate karo (EAN-13 style ya internal CODE128) */
  generate: function (p, s) {
    p = p || {};
    var type = p.type || 'CODE128';
    var value = p.value || '';
    if (!value) {
      if (type === 'EAN13') value = Barcode.ean13();
      else value = 'HA' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    }
    if (type === 'EAN13') value = Barcode.withChecksum(value);
    // uniqueness check
    var exists = DB.findOne('Items', function (r) { return U.str(r.barcode) === value; });
    if (exists && !p.force) value = value + '-' + Math.random().toString(36).substring(2, 4).toUpperCase();
    return { value: value, type: type, qrPayload: Barcode.qrPayload(p.itemId || '', value) };
  },

  ean13: function () {
    var base = '896'; // GS1 Pakistan prefix
    var body = '';
    for (var i = 0; i < 9; i++) body += Math.floor(Math.random() * 10);
    return Barcode.withChecksum(base + body);
  },

  withChecksum: function (code12) {
    var code = U.str(code12).replace(/\D/g, '').substring(0, 12);
    while (code.length < 12) code = '0' + code;
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      var d = parseInt(code.charAt(i), 10);
      sum += (i % 2 === 0) ? d : d * 3;
    }
    return code + ((10 - (sum % 10)) % 10);
  },

  /** QR payload — scanner isay read kar ke direct item dhoond leta hai */
  qrPayload: function (itemId, code) {
    return JSON.stringify({ app: 'HA', v: 1, t: 'ITEM', id: itemId || '', c: code || '' });
  },

  /** Label printing data (multiple items × copies) */
  labelData: function (ids, templateId, s) {
    Auth.require(s, 'items.view');
    var tpl = templateId ? DB.byId('LabelTemplates', templateId) : DB.findOne('LabelTemplates', function (r) { return U.str(r.isDefault) === 'true'; });
    var settings = DB.settings();
    var rows = (ids || []).map(function (id) {
      var it = DB.byId('Items', id);
      if (!it) return null;
      return {
        id: it.id, code: it.code, name: it.name, nameUr: it.nameUr || '',
        brand: it.brand || '', category: it.category || '',
        price: U.num(it.retailPrice), wholesale: U.num(it.wholesalePrice),
        mrp: U.num(it.retailPrice), barcode: it.barcode || it.code,
        barcodeType: 'CODE128',
        qr: Barcode.qrPayload(it.id, it.barcode || it.code),
        unit: it.unit || 'PCS', rack: it.rack || '',
        currency: settings.currencySymbol || 'Rs'
      };
    }).filter(Boolean);
    return {
      template: tpl ? U.clone(tpl) : Barcode.defaultTemplate(),
      rows: rows,
      business: { name: settings.businessName, phone: settings.phone }
    };
  },

  defaultTemplate: function () {
    return {
      id: 'default', name: 'Standard 50x30', width: 50, height: 30, isDefault: 'true',
      fields: ['name', 'price', 'barcode', 'code'],
      json: JSON.stringify({
        showPrice: true, showName: true, showCode: true, showBrand: false,
        barcodeType: 'CODE128', fontSize: 9, copies: 1, qr: false
      })
    };
  },

  saveTemplate: function (payload, s) {
    Auth.require(s, 'settings.manage');
    if (payload.isDefault === 'true' || payload.isDefault === true) {
      DB.all('LabelTemplates').forEach(function (t) {
        DB.update('LabelTemplates', t.id, { isDefault: 'false' }, s);
      });
    }
    if (payload.id) return DB.update('LabelTemplates', payload.id, U.pick(payload, ['name', 'width', 'height', 'fields', 'json', 'isDefault']), s);
    return DB.insert('LabelTemplates', U.pick(payload, ['name', 'width', 'height', 'fields', 'json', 'isDefault']), s);
  },

  listTemplates: function (s) {
    var rows = DB.all('LabelTemplates');
    if (!rows.length) return [Barcode.defaultTemplate()];
    return rows;
  },

  /** Bulk barcode assign (jo items ke barcode khali hain) */
  autoAssign: function (s) {
    Auth.require(s, 'items.edit');
    var n = 0;
    DB.all('Items').forEach(function (it) {
      if (!U.str(it.barcode) || it.barcode === it.code) {
        var val = Barcode.generate({ type: 'CODE128' }, s).value;
        DB.update('Items', it.id, { barcode: val, updatedAt: U.iso() }, s);
        n++;
      }
    });
    return { assigned: n };
  }
};
