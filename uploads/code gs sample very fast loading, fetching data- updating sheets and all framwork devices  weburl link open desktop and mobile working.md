/* ============================================================================
 * HASEEB AUTOS — Google Apps Script backend
 * Sheets-as-database: one tab per store, rows = [id, updatedAt, json]
 * (schemaless — app evolves without migrations; JSON is source of truth)
 *
 * SETUP (one time): run  setupAll()  from the editor → authorize → it creates
 * the spreadsheet, all sheets, and prints the URL to the log.
 * Then: Deploy ▸ New deployment ▸ Web app (Execute as: Me · Access: Anyone).
 * ==========================================================================*/

const PROP = PropertiesService.getScriptProperties();
const CACHE = CacheService.getScriptCache();
const STORES = ['settings', 'products', 'categories', 'customers', 'suppliers', 'sales', 'purchases', 'payrec', 'expenses', 'moves', 'transfers', 'sessions', 'counters', 'notifications', 'audit'];
const CACHE_KEY = 'haseeb.bootstrap.v1';

/* Shared modules are INLINED at the two marker lines below by tools/build-deploy.mjs:
 *   marker TABULAR      ← src/tabular-store.js   (attaches WE.tabular)
 *   marker AI_PROVIDERS ← src/ai-providers.js    (attaches WE.aiProviders)
 * Do NOT edit the copies inside deploy/1-Code.gs — edit the src files. */
/* ============ inlined src/tabular-store.js (edit the src file, regenerate) ============ */
/* ============================================================================
 * TABULAR STORE — proper spreadsheets: one row per record, one COLUMN per
 * field (readable, filterable, professional). Shared by:
 *   · Apps Script backend (inlined into Code.gs via build-deploy)
 *   · node tests (shape + legacy-migration verification)
 *
 * Legacy format was  id | updatedAt | json  (opaque blobs). This module maps
 * every store to real columns; nested arrays/objects stay in a *_json column;
 * unknown extra fields are preserved in a trailing _extra (json) column —
 * nothing is ever lost.
 * ==========================================================================*/
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.WE = root.WE || {}, root.WE.tabular = mod;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* Field order per store = column order in the sheet.
 * Column names are exactly the row keys (id is always first). */
const FIELDS = {
  settings: null, /* single config document — stays json-mode [id, updatedAt, json] */
  counters: ['sale', 'purchase', 'receipt', 'payment', 'expense', 'transfer', 'session', 'return_'],
  categories: ['name', 'emoji', 'color', 'active'],
  products: ['code', 'name', 'category', 'subCategory', 'brand', 'barcode', 'sku', 'uom', 'size', 'cost', 'price', 'wholesale', 'minPrice', 'avgCost', 'taxRate', 'minStock', 'supplier', 'active', 'emoji', 'createdAt'],
  customers: ['name', 'phone', 'type', 'creditLimit', 'openingBalance', 'points', 'address', 'active', 'createdAt'],
  suppliers: ['name', 'company', 'phone', 'address', 'openingBalance', 'active', 'createdAt'],
  sales: ['no', 'date', 'customerId', 'customerName', 'userId', 'branch', 'status', 'subtotal', 'discount', 'tax', 'total', 'paid', 'due', 'profit', 'method', 'sessionId', 'items_json', 'payments_json', 'createdAt'],
  purchases: ['no', 'date', 'supplierId', 'supplierName', 'branch', 'status', 'total', 'paid', 'due', 'items_json', 'payments_json', 'createdAt'],
  payrec: ['no', 'type', 'partyType', 'partyId', 'date', 'amount', 'method', 'methodType', 'note', 'createdAt'],
  expenses: ['no', 'date', 'category', 'amount', 'method', 'note', 'createdAt'],
  moves: ['productId', 'warehouse', 'type', 'qty', 'cost', 'date', 'ref', 'note'],
  transfers: ['no', 'fromWarehouse', 'toWarehouse', 'status', 'date', 'note', 'lines_json', 'createdAt'],
  sessions: ['no', 'warehouse', 'userId', 'status', 'openedAt', 'closedAt', 'float', 'expected', 'counted', 'variance', 'totals_json', 'openDenoms_json', 'closeDenoms_json'],
  notifications: ['date', 'icon', 'title', 'body', 'severity', 'read', 'link_json'],
  audit: ['date', 'user', 'action', 'store', 'refId', 'summary'],
};

const EXTRA = '_extra';
const LEGACY_HEAD = ['id', 'updatedAt', 'json'];

function isLegacyHeader(head) {
  return head && head.length === 3 && head[0] === 'id' && head[1] === 'updatedAt' && head[2] === 'json';
}
function isTabular(store) { return !!FIELDS[store]; }
function headerFor(store) { return isTabular(store) ? ['id', 'updatedAt'].concat(FIELDS[store], EXTRA) : LEGACY_HEAD.slice(); }

/* object → row cells (aligned to headerFor) */
function toCells(store, obj, opts) {
  opts = opts || {};
  const o = obj || {};
  if (!isTabular(store)) return [o.id, o.updatedAt || opts.now || '', JSON.stringify(o)];
  const extra = {};
  const hasJsonCol = FIELDS[store].some((c) => /_json$/.test(c));
  Object.keys(o).forEach((k) => {
    if (k === 'id' || k === 'updatedAt' || FIELDS[store].indexOf(k) >= 0) return;
    if (hasJsonCol && FIELDS[store].indexOf(k + '_json') >= 0) return; /* mapped to its *_json column */
    if (/_json$/.test(k) && FIELDS[store].indexOf(k) >= 0) return;
    extra[k] = o[k];
  });
  return ['id', 'updatedAt'].concat(FIELDS[store], EXTRA).map((col) => {
    if (col === EXTRA) return Object.keys(extra).length ? JSON.stringify(extra) : '';
    if (col === 'updatedAt') return o.updatedAt || opts.now || '';
    /* column "items_json" ← object key "items" (or an explicit *_json key) */
    let v = o[col];
    if (/_json$/.test(col) && (v == null)) v = o[col.replace(/_json$/, '')];
    if (v == null) return '';
    if (/_json$/.test(col)) return typeof v === 'string' ? v : JSON.stringify(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

/* row cells → object (aligned to header) */
function toObject(store, cells) {
  if (!cells || cells[0] == null || cells[0] === '') return null;
  if (!isTabular(store)) {
    if (isLegacyHeader(LEGACY_HEAD) && cells.length >= 3 && cells[2]) { try { return JSON.parse(cells[2]); } catch (e) { /* fall through */ } }
    return { id: cells[0], updatedAt: cells[1] || '' };
  }
  const cols = ['id', 'updatedAt'].concat(FIELDS[store], EXTRA);
  const o = {};
  cols.forEach((col, i) => {
    const v = cells[i];
    if (v == null || v === '') return;
    if (/_json$/.test(col)) {
      const realKey = col.replace(/_json$/, '');
      try { o[realKey] = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { o[realKey] = v; }
      return;
    }
    if (col === EXTRA) {
      try { Object.assign(o, typeof v === 'string' ? JSON.parse(v) : v); } catch (e) { /* ignore */ }
      return;
    }
    o[col] = v;
  });
  return o;
}

/* migrate legacy rows [{id,updatedAt,json}] → tabular cells for headerFor(store) */
function legacyToCells(store, legacyRows, now) {
  return (legacyRows || []).map((r) => {
    let obj = null;
    try { obj = JSON.parse(r.json); } catch (e) { obj = { id: r.id }; }
    if (obj && !obj.id) obj.id = r.id;
    if (obj && !obj.updatedAt) obj.updatedAt = r.updatedAt || now || '';
    return toCells(store, obj, { now: now });
  }).filter((c) => c && c[0]);
}

return { FIELDS: FIELDS, EXTRA: EXTRA, LEGACY_HEAD: LEGACY_HEAD, isLegacyHeader: isLegacyHeader, isTabular: isTabular, headerFor: headerFor, toCells: toCells, toObject: toObject, legacyToCells: legacyToCells };
}));

/* ============ inlined src/ai-providers.js (edit the src file, regenerate) ============ */
/* ============================================================================
 * UNIVERSAL AI PROVIDERS — single source of truth, shared by:
 *   · browser (src/ai.js via WE.aiProviders)        — direct/browser fetch
 *   · Apps Script backend (inlined into Code.gs)    — server-side proxy
 *   · node tests                                    — shape verification
 *
 * Nothing is hard-locked: provider, model (free text + suggestions), baseUrl,
 * API key and temperature are ALL user-editable in Settings ▸ AI Assistant.
 * Model IDs last verified against official docs, Sept 2026.
 * ==========================================================================*/
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.WE = root.WE || {}, root.WE.aiProviders = mod;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* request families: 'gemini' | 'openaiCompat' | 'anthropic' */
const PROVIDERS = {
  LOCAL: {
    label: 'Built-in LOCAL engine (offline · free · always on)', family: 'local',
    needsKey: false, models: [],
  },
  GEMINI: {
    label: 'Google Gemini', family: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey', keyLabel: 'aistudio.google.com/apikey',
    defaultModel: 'gemini-3.5-flash',
    models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash', 'gemini-3.1-pro', 'gemini-2.5-flash'],
    note: 'FREE tier available — koi card nahi chahiye',
  },
  OPENAI: {
    label: 'OpenAI (ChatGPT)', family: 'openaiCompat',
    base: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys', keyLabel: 'platform.openai.com/api-keys',
    defaultModel: 'gpt-5-mini',
    models: ['gpt-5-mini', 'gpt-5-nano', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-4.1-mini'],
    note: 'Paid — platform.openai.com billing',
  },
  ANTHROPIC: {
    label: 'Anthropic Claude', family: 'anthropic',
    base: 'https://api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys', keyLabel: 'console.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-opus-5'],
    note: 'Paid — console.anthropic.com',
  },
  GROQ: {
    label: 'Groq (ultra-fast · free tier)', family: 'openaiCompat',
    base: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys', keyLabel: 'console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-4-scout-17b-16e-instruct', 'qwen3-32b', 'deepseek-r1-distill-70b', 'kimi-k2-instruct'],
    note: 'FREE tier ~14,400 requests/day — bohat fast',
  },
  OPENROUTER: {
    label: 'OpenRouter (200+ models, one key)', family: 'openaiCompat',
    base: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys', keyLabel: 'openrouter.ai/keys',
    defaultModel: 'openai/gpt-5-mini',
    models: ['openai/gpt-5-mini', 'anthropic/claude-sonnet-5', 'google/gemini-2.5-flash', 'meta-llama/llama-4-scout', 'deepseek/deepseek-chat'],
    note: 'Ek key se sab models — pay per use',
  },
  XAI: {
    label: 'xAI Grok', family: 'openaiCompat',
    base: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai/', keyLabel: 'console.x.ai',
    defaultModel: 'grok-4',
    models: ['grok-4', 'grok-4-fast', 'grok-3-mini'],
    note: 'Paid — console.x.ai',
  },
  MISTRAL: {
    label: 'Mistral AI', family: 'openaiCompat',
    base: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys/', keyLabel: 'console.mistral.ai',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest'],
    note: 'Free experiment tier available',
  },
  OLLAMA: {
    label: 'Ollama (apne PC par — 100% free, private)', family: 'openaiCompat',
    base: 'http://localhost:11434/v1',
    needsKey: false, browserOnly: true,
    keyUrl: 'https://ollama.com/download', keyLabel: 'ollama.com',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'qwen3', 'mistral', 'deepseek-r1', 'gemma3'],
    note: 'Apne computer par chalta hai — internet nahi chahiye. Browser se direct call hoti hai.',
  },
  CUSTOM: {
    label: 'Custom / any OpenAI-compatible endpoint', family: 'openaiCompat',
    base: '', needsKey: false, defaultModel: '',
    models: [], note: 'Koi bhi OpenAI-compatible API (LM Studio, vLLM, Together…) — base URL apne hisaab se likhein',
  },
};

function provider(id) { return PROVIDERS[id] || PROVIDERS.LOCAL; }
function baseUrl(id, override) { return (override && String(override).trim()) || provider(id).base || ''; }
function model(id, m) { return (m && String(m).trim()) || provider(id).defaultModel || ''; }
function isLocalhostUrl(u) { return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(String(u || '')); }

const gen = (base) => base.replace(/\/$/, '');

/* Build a provider-agnostic chat request.
 * Returns { url, headers, body, extract(json) → text|null }
 * Works identically in the browser (fetch) and in Apps Script (UrlFetchApp). */
function buildChatRequest(id, o) {
  o = o || {};
  const p = provider(id);
  const base = gen(baseUrl(id, o.baseUrl));
  const key = String(o.key || '');
  const mdl = model(id, o.model);
  const sys = o.system || '';
  const q = o.question || '';
  const temp = o.temperature == null ? 0.3 : Number(o.temperature);
  const maxTok = o.maxTokens || 600;

  if (p.family === 'gemini') {
    return {
      url: base + '/models/' + mdl + ':generateContent',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: {
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: q }] }],
        generationConfig: { temperature: temp, maxOutputTokens: maxTok },
      },
      extract: (j) => { try { const c = j.candidates && j.candidates[0]; return c && c.content && c.content.parts && c.content.parts.map((x) => x.text || '').join('') || null; } catch (e) { return null; } },
    };
  }

  if (p.family === 'anthropic') {
    return {
      url: base + '/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: { model: mdl, max_tokens: maxTok, system: sys || undefined, messages: [{ role: 'user', content: q }], temperature: temp },
      extract: (j) => { try { return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('') || null; } catch (e) { return null; } },
    };
  }

  /* openaiCompat — OpenAI, Groq, OpenRouter, xAI, Mistral, Ollama, Custom.
     Newer OpenAI reasoning/chat models (gpt-5*, o*) require max_completion_tokens;
     third-party servers still accept classic max_tokens. */
  const messages = [];
  if (sys) messages.push({ role: 'system', content: sys });
  messages.push({ role: 'user', content: q });
  const body = { model: mdl, messages: messages, temperature: temp };
  if (id === 'OPENAI' && /^(gpt-5|o\d)/.test(mdl)) body.max_completion_tokens = maxTok; else body.max_tokens = maxTok;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = 'Bearer ' + key;
  if (id === 'OPENROUTER') { headers['HTTP-Referer'] = 'https://haseeb-autos.local'; headers['X-Title'] = 'Haseeb Autos ERP'; }
  return {
    url: base + '/chat/completions',
    headers: headers, body: body,
    extract: (j) => { try { return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || null; } catch (e) { return null; } },
  };
}

/* Turn fetch/UrlFetch exceptions & HTTP codes into friendly Roman-Urdu notes */
function friendlyError(code, text) {
  const s = String(text || '').slice(0, 220);
  if (code === 401 || code === 403) return 'API key ghalat hai ya permission nahi (HTTP ' + code + ')';
  if (code === 404) return 'Model ka naam mil nahi raha — Settings mein model ID check karein (HTTP 404)';
  if (code === 429) return 'Rate limit / quota khatam (HTTP 429) — thori dair baad ya doosri key try karein';
  if (code >= 500) return 'Provider ka server abhi busy hai (HTTP ' + code + ')';
  return 'AI request failed' + (code ? ' (HTTP ' + code + ')' : '') + (s ? ': ' + s : '');
}

return { PROVIDERS: PROVIDERS, provider: provider, baseUrl: baseUrl, model: model, isLocalhostUrl: isLocalhostUrl, buildChatRequest: buildChatRequest, friendlyError: friendlyError };
}));

const TAB = WE.tabular;
const AIP = WE.aiProviders;

/* ------------------------------ setup ------------------------------------ */
function setupAll() {
  let id = PROP.getProperty('SPREADSHEET_ID');
  let ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Haseeb Autos - ERP Database');
    id = ss.getId();
    PROP.setProperty('SPREADSHEET_ID', id);
  }
  STORES.forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    ensureSchema_(sh, name);
  });
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (defaultSheet && STORES.indexOf(defaultSheet.getName()) < 0 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) { /* keep at least one tab */ }
  }
  return { spreadsheetId: id, url: ss.getUrl(), message: 'Setup complete ✓ Proper columns + formatting applied. Ab Deploy ▸ New deployment ▸ Web app karein.' };
}

/* ------------------------- schema, format, migrate ----------------------- */
function nowIso_() { return new Date().toISOString(); }

function formatSheet_(sh, nCols) {
  const hr = sh.getRange(1, 1, 1, nCols);
  hr.setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff').setVerticalAlignment('middle');
  sh.setRowHeight(1, 32);
  sh.setFrozenRows(1);
  try { sh.setHiddenGridlines(true); } catch (e) { /* older sheets */ }
  try { sh.autoResizeColumns(1, Math.min(nCols, 12)); } catch (e) { /* width best-effort */ }
}

/* Make the tab match the store's tabular schema:
 *  · empty/garbage tab      → write formatted headers
 *  · legacy id|updatedAt|json → MIGRATE data into real columns (no data lost)
 *  · old tabular widths     → remap columns to the current schema            */
function ensureSchema_(sh, store) {
  const want = TAB.headerFor(store);
  const last = sh.getLastRow();
  const nCols = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const legacy = TAB.isLegacyHeader(head);
  const same = head.length === want.length && head.join('') === want.join('');
  if (!legacy && same) return sh;

  let body = [];
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, nCols).getValues();
    if (legacy) {
      body = TAB.legacyToCells(store, vals.map(function (r) { return { id: r[0], updatedAt: r[1], json: r[2] }; }), nowIso_());
    } else {
      body = vals.map(function (r) {
        const o = rowByHeader_(head, r);
        return o ? TAB.toCells(store, o, { now: nowIso_() }) : null;
      }).filter(Boolean);
    }
  }
  rewriteBody_(sh, want, body);
  return sh;
}

/* header-aware row → object (works for any salvageable tab layout) */
function rowByHeader_(head, r) {
  const o = {};
  let hasId = false;
  head.forEach(function (colName, i) {
    if (!colName) return;
    const v = r[i];
    if (colName === 'id') { o.id = v; hasId = !!v; return; }
    if (v == null || v === '') return;
    if (/_json$/.test(colName)) {
      try { o[colName.replace(/_json$/, '')] = typeof v === 'string' ? JSON.parse(v) : v; }
      catch (e) { o[colName.replace(/_json$/, '')] = v; }
      return;
    }
    if (colName === '_extra') { try { Object.assign(o, JSON.parse(v)); } catch (e) { /* skip */ } return; }
    o[colName] = v;
  });
  return hasId ? o : null;
}

function rewriteBody_(sh, header, bodyCells) {
  const needCols = header.length;
  if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
  const clearRows = Math.max(sh.getLastRow(), 1);
  sh.getRange(1, 1, clearRows, Math.max(sh.getMaxColumns(), needCols)).clearContent();
  if (sh.getMaxColumns() > needCols) { try { sh.deleteColumns(needCols + 1, sh.getMaxColumns() - needCols); } catch (e) { /* keep extra cols */ } }
  sh.getRange(1, 1, 1, needCols).setValues([header]);
  if (bodyCells.length) sh.getRange(2, 1, bodyCells.length, needCols).setValues(bodyCells);
  formatSheet_(sh, needCols);
}

function ss_() {
  const id = PROP.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set — run setupAll() once from the editor.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  if (STORES.indexOf(name) < 0) throw new Error('Unknown store: ' + name);
  let sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  return ensureSchema_(sh, name);
}

/* ------------------------------ web app ---------------------------------- */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Haseeb Autos — ERP & POS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) {
  try { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
  catch (e) { return '/* include missing: ' + name + ' */'; }
}

/* ------------------------------ api router ------------------------------- */
function api(action, payload) {
  try {
    payload = payload || {};
    switch (action) {
      case 'ping': return ok({ pong: true, ts: new Date().toISOString() });
      case 'bootstrap': return ok(bootstrap_());
      case 'list': return ok(list_(payload.store));
      case 'put': put_(payload.store, payload.row); bust_(); return ok(true);
      case 'bulk': bulk_(payload.store, payload.rows || []); bust_(); return ok(true);
      case 'del': del_(payload.store, payload.id); bust_(); return ok(true);
      case 'reset': reset_(); bust_(); return ok(true);
      case 'ai.ask': return ok(aiAsk_(payload.q || '', payload));
      default: return fail('Unknown action: ' + action);
    }
  } catch (e) {
    return fail(String(e && e.message ? e.message : e));
  }
}
function ok(data) { return { ok: true, data: data }; }
function fail(msg) { return { ok: false, error: msg }; }
function bust_() { try { CACHE.remove(CACHE_KEY); } catch (e) { /* */ } }

/* ------------------------------ data ops --------------------------------- */
function readAll_(store) {
  const sh = sheet_(store);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const nCols = sh.getLastColumn();
  const rows = sh.getRange(2, 1, last - 1, nCols).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const o = TAB.toObject(store, rows[i]);
    if (o && o.id) out.push(o);
  }
  return out;
}
function list_(store) { return readAll_(store); }
function bootstrap_() {
  const hit = CACHE.get(CACHE_KEY);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* reparse */ } }
  const out = {};
  STORES.forEach(function (s) { out[s] = readAll_(s); });
  try { CACHE.put(CACHE_KEY, JSON.stringify(out), 110); } catch (e) { /* >100KB cache limit: skip */ }
  return out;
}
function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}
function put_(store, row) {
  if (!row || !row.id) throw new Error('put: row.id required');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_(store);
    const r = findRow_(sh, row.id);
    const cells = TAB.toCells(store, row, { now: nowIso_() });
    if (r > 0) sh.getRange(r, 1, 1, cells.length).setValues([cells]); else sh.appendRow(cells);
  } finally { lock.releaseLock(); }
}
/* bulk = authoritative full-store sync (client sends the complete dataset):
 * rewrite the whole body in ONE batch — fast, and guarantees a clean schema */
function bulk_(store, rows) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const sh = sheet_(store);
    const body = (rows || []).filter(function (r) { return r && r.id; })
      .map(function (r) { return TAB.toCells(store, r, { now: nowIso_() }); });
    const last = sh.getLastRow();
    if (last > 1) sh.deleteRows(2, last - 1);
    if (body.length) sh.getRange(2, 1, body.length, TAB.headerFor(store).length).setValues(body);
    sh.setFrozenRows(1);
  } finally { lock.releaseLock(); }
}
function del_(store, id) {
  const sh = sheet_(store);
  const r = findRow_(sh, id);
  if (r > 0) sh.deleteRow(r);
}
function reset_() {
  STORES.forEach(function (s) {
    const sh = ss_().getSheetByName(s);
    if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    if (sh) ensureSchema_(sh, s);
  });
}

/* --------------------- universal AI proxy (all providers) -----------------
 * The browser sends { q, provider, key, model, baseUrl, temperature } and this
 * builds the correct request for Gemini / OpenAI-compatible / Anthropic via
 * WE.aiProviders (inlined, src/ai-providers.js — edit there, NOT here).     */
function aiAsk_(q, opts) {
  opts = opts || {};
  const provId = opts.provider || 'GEMINI';
  const prov = AIP.provider(provId);
  if (prov.family === 'local') return { text: null, note: 'LOCAL engine server par nahi chalta — wo app ke andar built-in hai.' };

  /* key priority: app Settings ▸ AI (sent per request) → Script Property (fallback) */
  const key = String((opts.key || '')).trim() || PROP.getProperty('AI_API_KEY') || '';
  if (!key && prov.needsKey !== false) return { text: null, note: prov.label + ' ki API key set nahi hai — ⚙ Settings ▸ AI Assistant mein key save karein.' };

  if (AIP.isLocalhostUrl(AIP.baseUrl(provId, opts.baseUrl)))
    return { text: null, note: prov.label + ' localhost par hai — Apps Script server aapke PC tak nahi pahunch sakta. Standalone app mein browser se direct chalega, ya base URL ko https tunnel (ngrok/cloudflare) dein.' };

  const SYS = 'You are the business assistant of an auto-parts shop (Haseeb Autos). Answer briefly, in Roman Urdu/English mix, with ACTUAL numbers from the provided business snapshot. If the answer is not in the snapshot, say so. Format money with "Rs". No markdown tables; short bullets ok.';
  const question = 'BUSINESS SNAPSHOT (live):\n' + buildBizContext_() + '\n\nOWNER QUESTION: ' + q;
  const req = AIP.buildChatRequest(provId, {
    key: key, model: opts.model, baseUrl: opts.baseUrl,
    system: SYS, question: question, temperature: opts.temperature, maxTokens: 600,
  });
  let res;
  try {
    res = UrlFetchApp.fetch(req.url, {
      method: 'post', headers: req.headers, payload: JSON.stringify(req.body), muteHttpExceptions: true,
    });
  } catch (e) { return { text: null, note: 'Network error: ' + e.message }; }
  const code = res.getResponseCode();
  if (code !== 200) return { text: null, note: AIP.friendlyError(code, res.getContentText()) };
  let json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) { return { text: null, note: 'Provider ne JSON reply nahi diya' }; }
  const text = req.extract(json);
  return { text: text, note: text ? null : 'Empty reply from provider' };
}
function buildBizContext_() {
  const p = readAll_('products'), s = readAll_('sales'), c = readAll_('customers'), pr = readAll_('payrec'), m = readAll_('moves');
  const today = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
  const done = s.filter(function (x) { return x.status === 'COMPLETED'; });
  const tSales = done.filter(function (x) { return String(x.date).slice(0, 10) === today; });
  const tot = function (arr, f) { return arr.reduce(function (a, x) { return a + (Number(f(x)) || 0); }, 0); };
  const byProd = {};
  done.slice(-300).forEach(function (x) { (x.items || []).forEach(function (i) { byProd[i.name] = (byProd[i.name] || 0) + (i.qty || 0); }); });
  const top = Object.keys(byProd).sort(function (a, b) { return byProd[b] - byProd[a]; }).slice(0, 8)
    .map(function (k) { return k + ' (' + byProd[k] + ' pcs)'; });
  const stock = {};
  m.forEach(function (x) { stock[x.productId] = (stock[x.productId] || 0) + (x.qty || 0); });
  const low = p.filter(function (x) { return (stock[x.id] || 0) <= (x.minStock || 0); }).slice(0, 10)
    .map(function (x) { return x.name + ': ' + Math.round((stock[x.id] || 0) * 100) / 100; });
  const recv = {};
  done.forEach(function (x) { if (x.due > 0 && x.customerId) recv[x.customerId] = (recv[x.customerId] || 0) + x.due; });
  pr.filter(function (x) { return x.type === 'receipt'; }).forEach(function (x) { if (recv[x.partyId]) recv[x.partyId] -= x.amount; });
  const custById = {}; c.forEach(function (x) { custById[x.id] = x.name; });
  const topDebt = Object.keys(recv).filter(function (id) { return recv[id] > 0; }).sort(function (a, b) { return recv[b] - recv[a]; }).slice(0, 5)
    .map(function (id) { return (custById[id] || id) + ': Rs ' + Math.round(recv[id]); });
  const prodNames = p.slice(0, 80).map(function (x) { return x.name + ' @Rs' + x.price; });
  return [
    'Today sales: Rs ' + Math.round(tot(tSales, function (x) { return x.total; })) + ' (' + tSales.length + ' invoices)',
    'All-time sales: Rs ' + Math.round(tot(done, function (x) { return x.total; })),
    'Catalog (' + p.length + ' items, first 80): ' + prodNames.join(' | '),
    'Top sellers: ' + top.join(' | '),
    'Low stock: ' + (low.join(' | ') || 'none'),
    'Top receivables: ' + (topDebt.join(' | ') || 'none'),
  ].join('\n');
}"