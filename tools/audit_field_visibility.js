#!/usr/bin/env node
/* ============================================================================
   AUDIT — Global Field Visibility & Permissions  (spec Part-1 §9, §18 #5)
   ----------------------------------------------------------------------------
   Ye tool SIRF dekhta hai (kuch badalta nahi). Sawal:
     1. Kaun se API routes "sensitive" columns wali tables parhte hain?
     2. Un routes par kaun sa permission lagta hai (module-level) — aur kya
        field-level koi rok hai? (spec: "sensitive fields must be protected at
        the backend/API authorization level, not merely hidden with CSS")
     3. Frontend mein aise fields kahan CSS/DOM se chhupaye ja rahe hain?
   Output: tmp/field-visibility-audit.json  +  console summary
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const S = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---------- 1. SCHEMA → tables × columns ---------- */
const schemaSrc = S('apps-script/Schema.gs');
const schemaBody = schemaSrc.slice(schemaSrc.indexOf('var SCHEMA = {'), schemaSrc.indexOf('};', schemaSrc.indexOf('var SCHEMA = {')) + 2);
const SCHEMA = new Function(schemaBody + '; return SCHEMA;')();
const tables = Object.keys(SCHEMA);

/* ---------- 2. Sensitive field families (spec §9 examples) ---------- */
const FAMILIES = {
  cost: { label: 'Cost price (lagat)', cols: /^(costPrice|purchasePrice|cost|landedCost|avgCost|unitCost|lastCost)$/i, perm: 'field.cost.view' },
  margin: { label: 'Margin / profit', cols: /^(margin|marginPct|profit|profitPct|grossProfit|markup|markupPct)$/i, perm: 'field.margin.view' },
  contact: { label: 'Customer contact info', cols: /^(phone|mobile|whatsapp|email|cnic|ntn|strn|contactPerson|secondaryPhone|contact)$/i, perm: 'field.contact.view' },
  address: { label: 'Address / location detail', cols: /^(address|city|area|postalCode|billingAddress|shippingAddress)$/i, perm: 'field.contact.view' },
  supplier: { label: 'Supplier / vendor info', cols: /^(supplierId|primarySupplierId|vendorId|paymentTerms|creditDays|bankAccount|iban|bankName|supplierRef)$/i, perm: 'field.supplier.view' },
  finance: { label: 'Financial internals', cols: /^(balance|outstanding|creditLimit|salary|commission|commissionRate|openingBalance|ledgerBalance|debit|credit)$/i, perm: 'field.finance.view' },
  intern: { label: 'Internal notes / audit-ish', cols: /^(internalNotes|privateNotes|remarks|adminNotes|auditNote)$/i, perm: 'field.notes.view' }
};
const famOf = col => { for (const k in FAMILIES) if (FAMILIES[k].cols.test(col)) return k; return null; };
const sensitiveTables = {};   // table → { fam: [cols] }
tables.forEach(t => {
  const cols = (SCHEMA[t] || []).filter(c => famOf(c));
  if (cols.length) sensitiveTables[t] = cols;
});

/* ---------- 3. ROUTES → action → impl call + permission ---------- */
const codeSrc = S('apps-script/Code.gs');
const routesBlock = codeSrc.slice(codeSrc.indexOf('var ROUTES = {'));
const routeRe = /'([a-z][a-z0-9._]+)'\s*:\s*function\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\s*\},?\n/g;
const routes = []; let m;
while ((m = routeRe.exec(routesBlock))) routes.push({ action: m[1], args: m[2], body: m[3] });
/* brace-accurate pass — har `'action': function (` par asli body nikaalo (upar ka
   lazy regex multi-line bodies par jaldi ruk jata hai; ye poora body deta hai) */
const headRe = /'([a-z][a-z0-9._]+)'\s*:\s*function\s*\(([^)]*)\)\s*\{/g;
const routes2 = []; let h;
while ((h = headRe.exec(routesBlock))) {
  let i = routesBlock.indexOf('{', h.index), depth = 0, j = i;
  for (; j < routesBlock.length; j++) {
    if (routesBlock[j] === '{') depth++;
    else if (routesBlock[j] === '}') { depth--; if (!depth) break; }
  }
  routes2.push({ action: h[1], args: h[2], body: routesBlock.slice(i, j + 1) });
}
if (routes2.length >= routes.length) { routes.length = 0; routes.push(...routes2); }

/* impl: `Items.list(p, s)` → file Items.gs, function name `list` */
const backend = {};
['apps-script'].forEach(() => { });
fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.gs')).forEach(f => backend[f] = S('apps-script/' + f));

function implSource(call) {
  const mm = /([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/.exec(call || '');
  if (!mm) return null;
  const file = mm[1] + '.gs';
  const fn = mm[2];
  if (!backend[file]) return null;
  const src = backend[file];
  const re = new RegExp('\\b' + fn + '\\s*:\\s*function\\s*\\(', 'g');
  const hit = re.exec(src);
  if (!hit) return null;
  // brace match
  let i = src.indexOf('{', hit.index), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) break; }
  }
  return { file: file.replace('.gs', ''), fn, src: src.slice(i, j + 1) };
}

const actions = [];
let withPerm = 0, noPerm = 0;
routes.forEach(r => {
  const body = r.body;
  const perms = (body.match(/Auth\.(require|can)\s*\(\s*s[^,]*,\s*'([^']+)'/g) || []).map(x => /'([^']+)'/.exec(x)[1]);
  const impl = implSource((/return\s+([A-Za-z_]\w*\.[A-Za-z_]\w*\s*\()/.exec(body) || [])[1]);
  let tRead = [];
  if (impl) {
    const cl = impl.src.match(/DB\.all\(\s*'(\w+)'/g) || [];
    tRead = [...new Set(cl.map(x => /'(\w+)'/.exec(x)[1]))];
  }
  const sens = [];
  tRead.forEach(t => {
    (sensitiveTables[t] || []).forEach(c => {
      const f = famOf(c);
      // sirf tab count karo jab impl row ko seedha bhejta ho ya column ka zikr kare
      const mentions = new RegExp('\\b' + c + '\\b').test(impl ? impl.src : '');
      sens.push({ table: t, column: c, family: f, perm: FAMILIES[f].perm, explicit: mentions });
    });
  });
  if (perms.length) withPerm++; else noPerm++;
  if (sens.length) actions.push({ action: r.action, perms, impl: impl ? impl.file + '.' + impl.fn : null, tables: tRead, sensitive: sens });
});

/* ---------- 4. Field-level enforcement backend mein mojood hai? ---------- */
const fieldLevelBackend = /Fields\.(strip|filterResponse|visible)/.test(codeSrc) || fs.existsSync(path.join(ROOT, 'apps-script/Fields.gs'));
const permCatalog = (S('apps-script/Schema.gs').match(/id:\s*'(field\.[^']+)'/g) || []).length;

/* ---------- 5. Frontend: CSS/DOM-only hiding of sensitive fields ---------- */
const html = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
const cssHideSites = [];
const permAwareSites = [];
html.forEach(f => {
  const src = S('apps-script/' + f);
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (/costPrice|margin|profit/i.test(l)) {
      if (/display\s*:\s*none|visibility\s*:\s*hidden|classList\.add\(['"]hide|hidden\s*=\s*true|\.hidden\b/.test(l))
        cssHideSites.push({ file: f, line: i + 1, code: l.trim().slice(0, 110) });
      if (/Perms\.|Fields\.|can\(['"]/.test(l))
        permAwareSites.push({ file: f, line: i + 1, code: l.trim().slice(0, 110) });
    }
  });
});

/* ---------- report ---------- */
const out = {
  generatedAt: new Date().toISOString(),
  schema: { tables: tables.length, sensitiveTables: Object.keys(sensitiveTables).length },
  families: Object.keys(FAMILIES).map(k => ({ key: k, label: FAMILIES[k].label, perm: FAMILIES[k].perm })),
  routes: { total: routes.length, withModulePerm: withPerm, withoutPerm: noPerm, readingSensitiveTables: actions.length },
  fieldLevelBackend: fieldLevelBackend,
  fieldPermKeysInCatalog: permCatalog,
  cssOnlyHides: cssHideSites,
  permAwareSites: permAwareSites,
  byFamily: (() => { const o = {}; actions.forEach(a => a.sensitive.forEach(s => { o[s.family] = (o[s.family] || 0) + 1; })); return o; })(),
  topRoutes: actions.slice(0, 40).map(a => ({ action: a.action, perms: a.perms, impl: a.impl, tables: a.tables, sensitive: [...new Set(a.sensitive.map(s => s.table + '.' + s.column))] }))
};
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/field-visibility-audit.json'), JSON.stringify(out, null, 2));

console.log('══════════════════════════════════════════════════════════════');
console.log(' FIELD VISIBILITY AUDIT  (spec §9 · §18 #5)');
console.log('══════════════════════════════════════════════════════════════');
console.log(' schema tables            :', out.schema.tables, '· sensitive columns wali tables:', out.schema.sensitiveTables);
console.log(' routes                   :', routes.length, '· module-perm wale:', withPerm, '· bina perm:', noPerm);
console.log(' sensitive tables padhne wale routes :', actions.length);
console.log(' family-wise exposure     :', JSON.stringify(out.byFamily));
console.log(' backend field-level rok  :', fieldLevelBackend ? 'MOJOOD' : 'NAHI (koi Fields.strip/filter nahi)');
console.log(' catalog mein field.* perms:', permCatalog);
console.log(' frontend CSS-only hides  :', cssHideSites.length, '· permission-aware sites:', permAwareSites.length);
console.log('');
console.log(' Top routes (module perm → sensitive columns):');
out.topRoutes.slice(0, 14).forEach(r => console.log('   ' + (r.perms.join(',') || '(koi perm nahi)').padEnd(22) + ' ' + r.action.padEnd(26) + (r.impl || '').padEnd(18) + r.sensitive.slice(0, 5).join(', ')));
console.log('');
console.log(' → tmp/field-visibility-audit.json');
