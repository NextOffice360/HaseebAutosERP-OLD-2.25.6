/**
 * ============================================================================
 * Fields.gs — GLOBAL FIELD VISIBILITY & PERMISSIONS  (v2.28.0 · W5)
 * ----------------------------------------------------------------------------
 * Spec (Part-1 §9 / §18 #5):
 *   "Create reusable field-level visibility rules supporting:
 *    Role → Scope → Module → Section → Field → Permission"
 *   "Sensitive fields must be protected at the BACKEND/API authorization level,
 *    not merely hidden with frontend CSS."
 *
 * Design (ek jagah, sab modules par):
 *   • Families   — ek field "family" (cost, margin, contact, finance, supplier,
 *                  notes) ka column-name regex + us ka permission key.
 *   • Role       — har role ke ROLE_PERMISSIONS mein field.*.* keys (Schema.gs).
 *                  Per-user extra/denied permissions bhi apne aap lagti hain
 *                  (Auth._buildSession), koi alag code nahi.
 *   • Module     — Fields.wrap(action, data, session, module): action ka module
 *                  (pos / items / purchase / reports …) sirf us response par
 *                  lagta hai jahan read/write ho raha ho.
 *   • Scope      — location scope pehle se Auth.canAccessLocation se lagta hai;
 *                  family rules data ke saath chalti hain (rows already scoped).
 *   • Field      — response se column hata diya jata hai (strip) aur incoming
 *                  payload se bhi (scrub) — yani frontend "jaan bujh kar" bhej
 *                  bhi de to backend maanta nahi.
 *
 * Enforcement points (sirf 2 — is liye koi module ise bhool nahi sakta):
 *   1. Code.gs ▸ api()  — response par Fields.wrap(), incoming par Fields.scrub()
 *   2. (optional) koi bhi module chahe to Fields.wrap(...) khud bhi call kar sakta hai
 *
 * Kill-switch: Fields._features.on = false  (tests/SENS negative proof)
 * ============================================================================
 */
var Fields = {

  /* ---------------- kill-switch (tests + SENS) ---------------- */
  _features: { on: true },

  /* ---------------- families: column regex → permission ---------------- */
  FAMILIES: {
    cost: {
      label: 'Cost price / lagat', perm: 'field.cost.view',
      cols: /^(costPrice|purchasePrice|cost|avgCost|unitCost|landedCost|lastCost|valuation|wavgCost)$/i
    },
    margin: {
      label: 'Margin / profit', perm: 'field.margin.view',
      cols: /^(margin|marginPct|profit|profitPct|grossProfit|markup|markupPct|netProfit)$/i
    },
    contact: {
      label: 'Customer contact', perm: 'field.contact.view',
      cols: /^(phone|mobile|whatsapp|email|cnic|nic|ntn|strn|contactPerson|secondaryPhone|contact|address|billingAddress|shippingAddress|postalCode)$/i
    },
    finance: {
      label: 'Financial internals', perm: 'field.finance.view',
      cols: /^(balance|outstanding|creditLimit|openingBalance|ledgerBalance|closingBalance|salary|commissionRate|commissionPct)$/i
    },
    supplier: {
      label: 'Supplier internals', perm: 'field.supplier.view',
      cols: /^(supplierId|primarySupplierId|vendorId|supplierRef|paymentTerms|creditDays|bankAccount|iban|bankName|bankBranch)$/i
    },
    notes: {
      label: 'Internal notes', perm: 'field.notes.view',
      cols: /^(internalNotes|privateNotes|adminNotes|auditNote)$/i
    }
  },

  /* ------------------- module hints (spec: Module level) ------------------- */
  /* action prefix → module. Sirf record rakhne ke liye + aage chal kar per-module
     hide rules ke liye (Rules tab) — enforcement aaj permission se hoti hai. */
  MODULES: {
    'pos.': 'pos', 'sales.': 'pos', 'sale.': 'pos',
    'items.': 'items', 'stock.': 'items', 'warehouse.': 'warehouse',
    'purchase.': 'purchase', 'grn.': 'purchase', 'po.': 'purchase', 'suppliers.': 'purchase',
    'customers.': 'sales', 'parties.': 'sales', 'reports.': 'reports', 'dashboard.': 'dashboard',
    'accounting.': 'accounting', 'journal.': 'accounting', 'expenses.': 'accounting',
    'payments.': 'money', 'salesman.': 'salesman', 'ai.': 'ai'
  },
  moduleOf: function (action) {
    var a = U.str(action), keys = Object.keys(Fields.MODULES);
    for (var i = 0; i < keys.length; i++) {
      if (a.indexOf(keys[i]) === 0) return Fields.MODULES[keys[i]];
    }
    return 'general';
  },

  /* ---------------- which families of this action's data? ---------------- */
  /* Row-shape wale actions: response ke rows par seedha strip. */
  ROW_ACTIONS: /^(items\.|stock\.|warehouse\.|purchase\.|grn\.|po\.|suppliers\.|customers\.|parties\.|sales\.|sale\.|salesman\.|demand\.|orders\.|reorder\.|accounting\.|journal\.|expenses\.)/,
  /* KPI/report actions: id-wale rows nahi hote — plain keys (cost/profit/margin) bhi strip */
  KPI_ACTIONS: /^(reports\.|dashboard\.|analytics\.|cashbook\.|day\.)/,
  /* In par incoming payload scrub NAHI karna (settings/AI ke apne keys) */
  NO_SCRUB: /^(config\.|settings\.|ai\.|system\.|auth\.|media\.|print\.)/,
  /* v2.28.0 — FINANCIAL WRITES: in routes ka `cost` payload se aata hai aur
     stock/COGS ki qeemat banta hai (e.g. Purchase.gs:344 GRN post). Agar hum
     cost-blind user ka cost hata dein to stock ZERO value par chala jaye —
     "chup chaap ghalat" se behtar hai ke module-perm (purchase.grn /
     stock.adjust …) hi faisla kare, is liye in par scrub nahi hota.
     (Read-side strip in par bhi lagta hai — list/detail par cost nahi dikhta.) */
  LEAVE_ALONE: /^(purchase\.(grn|po|return)|grn\.|po\.|stock\.(adjust|transfer|audit)|salesman\.(issue|sale|return)|inventory\.|warehouse\.(putaway|transfer))/, 

  /* Payload containers jinke andar row-like data aata hai (write routes) */
  CONTAINERS: ['item', 'customer', 'supplier', 'party', 'record', 'rows', 'items', 'lines',
    'data', 'values', 'entries', 'list', 'order', 'grn', 'sale'],

  /* =========================== permission side =========================== */
  /** session ke liye kaun si families MANA hain? (module optional) */
  denied: function (session, module) {
    var fams = Object.keys(Fields.FAMILIES), out = [];
    for (var i = 0; i < fams.length; i++) {
      var f = fams[i];
      if (!Fields.can(session, f, module)) out.push(f);
    }
    return out;
  },

  /** ek family dikh sakti hai? */
  can: function (session, family, module) {
    var F = Fields.FAMILIES[family];
    if (!F) return true;
    /* public/anon call — sirf business-sensitive families rok do */
    if (!session) {
      return ['contact'].indexOf(family) > -1;   /* cost/margin/finance/supplier/notes → rok */
    }
    if (typeof Auth !== 'undefined' && Auth.can && Auth.can(session, F.perm)) return true;
    /* module-level grant: kuch modules apni module-perm se bhi field dikha sakte hain
       (e.g. reports.financial → finance/margin family) */
    var grants = Fields.MODULE_GRANTS[module] || [];
    for (var i = 0; i < grants.length; i++) {
      if (grants[i].family === family && Auth.can(session, grants[i].perm)) return true;
    }
    return false;
  },

  /* module-perm se field family ka grant (spec: Role → Module → Field) */
  MODULE_GRANTS: [
    { family: 'finance', perm: 'dashboard.financial', module: 'dashboard' },
    { family: 'finance', perm: 'reports.financial', module: 'reports' },
    { family: 'margin', perm: 'reports.financial', module: 'reports' },
    { family: 'cost', perm: 'reports.financial', module: 'reports' }
  ],

  /** kis family ka column hai? */
  familyOf: function (col) {
    var fams = Object.keys(Fields.FAMILIES);
    for (var i = 0; i < fams.length; i++) {
      if (Fields.FAMILIES[fams[i]].cols.test(col)) return fams[i];
    }
    return null;
  },

  /* ============================ strip (read) ============================ */
  _rowLike: function (v, parentIsArray) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    return parentIsArray === true || v.id !== undefined;
  },

  /** ek row/object se denied columns hatao (mutate + return) */
  strip: function (obj, denied) {
    if (!obj || typeof obj !== 'object' || !denied || !denied.length) return obj;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var fam = Fields.familyOf(keys[i]);
      if (fam && denied.indexOf(fam) > -1) { try { delete obj[keys[i]]; } catch (e) {} }
    }
    return obj;
  },

  /**
   * poore response par family rules (row-like objects + KPI dicts).
   * NOTE (real bug jo gate ne pakda): pehle ye rows ko IN-PLACE mutate karta tha
   * (`delete row.phone`) — aur DB cache wahi row objects return karta hai, is liye
   * ek denied user ki call doosre (allowed) user ka data bhi kha jati thi.
   * Ab sirf COPY banti hai — asli data chhoota hi nahi.
   */
  wrap: function (action, data, session, module) {
    if (!Fields._features.on) return data;
    if (data === null || data === undefined) return data;
    var denied = Fields.denied(session, module || Fields.moduleOf(action));
    if (!denied.length) return data;
    var a = U.str(action);
    var kpi = Fields.KPI_ACTIONS.test(a);

    var copy = function (v, depth, parentIsArray) {
      if (v === null || v === undefined || depth > 7) return v;
      if (v instanceof Date) return v;
      if (Array.isArray(v)) {
        var arr = [];
        for (var i = 0; i < v.length; i++) arr.push(copy(v[i], depth + 1, true));
        return arr;
      }
      if (typeof v !== 'object') return v;
      var rowish = (parentIsArray === true || v.id !== undefined) || (kpi && depth > 0);
      var keys = Object.keys(v), o = {};
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (rowish) {
          var fam = Fields.familyOf(key);
          if (fam && denied.indexOf(fam) > -1) continue;      /* family band → key gayab */
        }
        var val = v[key];
        o[key] = (val !== null && typeof val === 'object') ? copy(val, depth + 1, false) : val;
      }
      return o;
    };

    return copy(data, 0, false);
  },

  /* =========================== scrub (write) =========================== */
  /**
   * Incoming payload se denied columns hata do.
   * Update routes patch-semantics par chalte hain (DB.update = sirf di gayi keys),
   * is liye key hata dena = "purani value waise hi rahegi" — security + safety dono.
   */
  scrub: function (action, payload, session) {
    if (!Fields._features.on || !payload || typeof payload !== 'object') return payload;
    var a = U.str(action);
    if (Fields.NO_SCRUB.test(a) || Fields.LEAVE_ALONE.test(a)) return payload;
    if (!Fields.ROW_ACTIONS.test(a) && !/\.(save|update|post|create|add|receive|adjust|issue|return)$/i.test(a)) return payload;
    var denied = Fields.denied(session, Fields.moduleOf(action));
    if (!denied.length) return payload;
    var seen = [];
    (function walk(v, depth, parentIsArray, parentKey) {
      if (depth > 4 || !v || typeof v !== 'object') return;
      if (seen.indexOf(v) > -1) return;          /* circular guard */
      seen.push(v);
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) walk(v[i], depth + 1, true, parentKey);
        return;
      }
      var isRoot = depth === 0;
      var isContainer = Fields.CONTAINERS.indexOf(U.str(parentKey)) > -1;
      if (!isRoot && (parentIsArray || isContainer || v.id !== undefined)) Fields.strip(v, denied);
      var keys = Object.keys(v);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j], c = v[k];
        if (isRoot && Fields.CONTAINERS.indexOf(k) === -1) continue;   /* root par sirf containers */
        if (c && typeof c === 'object') walk(c, depth + 1, false, k);
      }
    })(payload, 0, false, '');
    return payload;
  },

  /* =========================== admin / reporting =========================== */
  /** Users & Security ▸ Field visibility tab ke liye matrix */
  matrix: function (payload, s) {
    if (typeof Auth !== 'undefined' && Auth.require) Auth.require(s, 'users.view');
    var fams = Object.keys(Fields.FAMILIES), roles = (typeof ROLES !== 'undefined' ? ROLES : []);
    var out = {};
    roles.forEach(function (r) {
      out[r] = {};
      fams.forEach(function (f) { out[r][f] = Fields.can({ permissions: Auth.rolePerms(r), locationIds: [] }, f); });
    });
    return {
      families: fams.map(function (f) {
        return { key: f, label: Fields.FAMILIES[f].label, perm: Fields.FAMILIES[f].perm };
      }),
      roles: roles, matrix: out
    };
  },

  /** test/diagnostic: is session ko kya kya milta hai */
  summary: function (session) {
    var out = {};
    Object.keys(Fields.FAMILIES).forEach(function (f) {
      out[f] = { perm: Fields.FAMILIES[f].perm, allowed: Fields.can(session, f), denied: !Fields.can(session, f) };
    });
    return out;
  }
};
