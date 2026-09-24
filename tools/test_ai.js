#!/usr/bin/env node
/* ============================================================================
   tools/test_ai.js — AI ADAPTER GATE (v2.11)
   ----------------------------------------------------------------------------
   Provider-agnostic adapters (AI_Adapters.gs) ka contract lock karta hai:
     · GEMINI AUTO → Interactions API (store:false, steps protocol)
       + legacy generateContent fallback (explicit mode ya 404 par)
     · OPENAI AUTO → Responses API (input items, flat tools, NO temperature
       — reasoning models 400 dete hain) + chat/completions fallback
     · OPENROUTER → OpenAI-compatible chat/completions + attribution headers
     · OLLAMA → native /api/chat, endpoint lazmi
     · tool loops official protocol par (function_result steps /
       function_call_output items) — "TOOL RESULT:" text ka purana tareeqa nahi
     · testConnection = pehle sasta verify (key check), phir mini-round;
       ghalat key par KABHI ok:true nahi
     · aiEndpoint (custom base URL) har adapter mein respect ho
   UrlFetchApp stub ke zariye ASLI payload capture hote hain.
   ========================================================================== */
'use strict';
const path = require('path');
const { loadBackend } = require('./mock_gs');

let PASS = 0, FAIL = 0;
function ok(name, cond, note) {
  if (cond) { PASS++; console.log('  \x1b[32m✔\x1b[0m ' + name + (note ? '  \x1b[2m→ ' + note + '\x1b[0m' : '')); }
  else { FAIL++; console.log('  \x1b[31m✘ ' + name + '\x1b[0m' + (note ? '  → ' + note : '')); }
}

const { sandbox, services } = loadBackend(path.join(__dirname, '..', 'apps-script'));
const { AI, DB } = sandbox;
const UFA = services.UrlFetchApp;

const S = { userId: 'U-OWNER', role: 'OWNER', username: 'owner', locationId: 'LOC-SDQ', permissions: ['*'], name: 'Owner' };
sandbox.setupAll();
AI.setKey('TEST-OPENAI-KEY', 'OPENAI');
AI.setKey('TEST-ROUTER-KEY', 'OPENROUTER');
AI.setKey('TEST-KEY-1234567890', 'GEMINI', 'gemini-2.0-flash');

function lastPayload() {
  const rec = UFA.log[UFA.log.length - 1];
  if (!rec) return null;
  try { return JSON.parse(rec.opts.payload || '{}'); } catch (e) { return null; }
}
function stub(fn) { UFA.reset(); UFA.handle(fn); }
const J = o => ({ code: 200, text: JSON.stringify(o) });

/* ==========================================================================
   1. schema converter (Gemini UPPERCASE → standard JSON Schema)
   ========================================================================== */
(function schemaConversion() {
  const gem = { type: 'OBJECT', properties: {
    query: { type: 'STRING', description: 'search text' },
    limit: { type: 'NUMBER' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } }
  }, required: ['query'] };
  const j = AI._jsonSchema(gem);
  ok('1 · object type lowercase', j.type === 'object', j.type);
  ok('1 · nested STRING → string', j.properties.query.type === 'string');
  ok('1 · NUMBER → number', j.properties.limit.type === 'number');
  ok('1 · ARRAY → array + items convert', j.properties.tags.type === 'array' && j.properties.tags.items.type === 'string');
  ok('1 · description + required mehfooz', j.properties.query.description === 'search text' && j.required[0] === 'query');
  ok('1 · additionalProperties:false', j.additionalProperties === false);
})();

/* ==========================================================================
   2. adapter registry — har provider ka adapter, meta ke sath
   ========================================================================== */
(function registry() {
  const A = sandbox.AI_ADAPTERS;
  ok('2 · registry: 5 adapters', A && ['GEMINI', 'OPENAI', 'OPENROUTER', 'OLLAMA', 'MOCK'].every(k => A[k]), Object.keys(A || {}).join(','));
  ['GEMINI', 'OPENAI', 'OPENROUTER', 'OLLAMA', 'MOCK'].forEach(k => {
    ok('2 · ' + k + ' adapter: run+meta+apiModes', typeof A[k].run === 'function' && A[k].meta && Array.isArray(A[k].meta.apiModes) && A[k].meta.apiModes.length >= 1,
      (A[k].meta.apiModes || []).map(m => m.id).join('|'));
  });
  const provs = AI.providers();
  ok('2 · AI.providers() ab adapters SE banti hai (single source)', provs.length === 5 &&
    provs.filter(p => p.id === 'GEMINI')[0].caps.tools === true, 'caps ok');
  ok('2 · GEMINI meta: Interactions + legacy modes', provs.filter(p => p.id === 'GEMINI')[0].apiModes.map(m => m.id).join(',') === 'AUTO,INTERACTIONS,GENERATE_CONTENT');
  ok('2 · OPENAI meta: Responses + chat modes', provs.filter(p => p.id === 'OPENAI')[0].apiModes.map(m => m.id).join(',') === 'AUTO,RESPONSES,CHAT');
  ok('2 · OLLAMA: endpointRequired, key nahi mangta', provs.filter(p => p.id === 'OLLAMA')[0].endpointRequired === true && provs.filter(p => p.id === 'OLLAMA')[0].needsKey === false);
  ok('2 · modeFor: settings se mode', (function () {
    DB.setSetting('aiApiModeGemini', 'GENERATE_CONTENT');
    const m1 = sandbox.AI_ADAPTERS.modeFor('GEMINI');
    DB.setSetting('aiApiModeGemini', 'AUTO');
    const m2 = sandbox.AI_ADAPTERS.modeFor('GEMINI');
    const m3 = sandbox.AI_ADAPTERS.modeFor('OPENROUTER');
    return m1 === 'GENERATE_CONTENT' && m2 === 'AUTO' && m3 === 'CHAT';
  })(), 'per-provider mode setting');
})();

/* ==========================================================================
   3. GEMINI AUTO → Interactions payload (live-verified shape)
   ========================================================================== */
(function geminiInteractions() {
  DB.setSetting('aiProvider', 'GEMINI');
  DB.setSetting('aiApiModeGemini', 'AUTO');
  stub(() => J({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'OK' }] }] }));
  const r = AI._callProvider({ provider: 'GEMINI', model: 'gemini-2.0-flash' }, 'hello', [], S);
  const rec = UFA.log[UFA.log.length - 1];
  const pl = JSON.parse(rec.opts.payload);
  ok('3 · URL = {base}/interactions', /generativelanguage\.googleapis\.com\/v1beta\/interactions$/.test(rec.url), rec.url);
  ok('3 · key HEADER mein (x-goog-api-key), URL query mein NAHI', rec.opts.headers['x-goog-api-key'] === 'TEST-KEY-1234567890' && rec.url.indexOf('key=') === -1);
  ok('3 · store:false (no retention)', pl.store === false);
  ok('3 · system_instruction STRING hai (object 400 deta hai — verified)', typeof pl.system_instruction === 'string');
  ok('3 · input = steps array (user_input/text blocks)', Array.isArray(pl.input) && pl.input[0].type === 'user_input' && pl.input[0].content[0].type === 'text');
  ok('3 · tools FLAT + lowercase schema', pl.tools[0].type === 'function' && pl.tools[0].name === 'search_items' && pl.tools[0].parameters.type === 'object');
  ok('3 · response parse: model_output → text', r.text === 'OK');
  ok('3 · rawSteps pass back (signature echo ke liye)', Array.isArray(r.rawSteps) && r.rawSteps.length === 1);
})();

/* ==========================================================================
   4. GEMINI tool loop = steps VERBATIM + function_result (docs-shart)
   ========================================================================== */
(function geminiToolLoop() {
  let n = 0;
  stub(() => {
    n++;
    if (n === 1) return J({ status: 'requires_action', id: 'ixn_1',
      steps: [{ type: 'thought', signature: 'SIG_ABC' },
        { type: 'function_call', id: 'call_1', name: 'today_sales', arguments: { locationId: 'LOC-SDQ' } }] });
    return J({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Aaj ki sale Rs 12,000 hai.' }] }] });
  });
  const out = AI.chat({ message: 'Aaj ki sale kitni hui?', history: [] }, S);
  ok('4 · interactions loop se jawab aaya', /12,000/.test(out.reply || ''), (out.reply || '').slice(0, 40));
  ok('4 · tool chala', (out.toolResults || []).length === 1 && out.toolResults[0].tool === 'today_sales');
  const pl2 = JSON.parse(UFA.log[1].opts.payload);
  const input = pl2.input || [];
  const hasThought = input.some(s => s.type === 'thought' && s.signature === 'SIG_ABC');
  const hasFC = input.some(s => s.type === 'function_call' && s.id === 'call_1');
  const hasFR = input.some(s => s.type === 'function_result' && s.call_id === 'call_1');
  ok('4 · agle request mein thought step VERBATIM (signature) — warna 400', hasThought);
  ok('4 · function_call step echo hua', hasFC);
  ok('4 · function_result step (call_id + text block) bheja', hasFR &&
    input.filter(s => s.type === 'function_result')[0].result[0].type === 'text');
  ok('4 · "TOOL RESULT:" text ka purana tareeqa nahi', !/TOOL RESULT/.test(UFA.log[1].opts.payload));
})();

/* ==========================================================================
   5. GEMINI legacy mode = generateContent (compatibility lock)
   ========================================================================== */
(function geminiLegacy() {
  DB.setSetting('aiApiModeGemini', 'GENERATE_CONTENT');
  stub(() => J({ candidates: [{ content: { parts: [{ text: 'OK-LEGACY' }] } }] }));
  const r = AI._callProvider({ provider: 'GEMINI', model: 'gemini-2.0-flash' }, 'hi', [], S);
  const rec = UFA.log[UFA.log.length - 1];
  ok('5 · legacy key header, not URL', /:generateContent$/.test(rec.url) && rec.opts.headers['x-goog-api-key'] === 'TEST-KEY-1234567890', rec.url.slice(-56));
  const pl = JSON.parse(rec.opts.payload);
  ok('5 · legacy contents[] format', Array.isArray(pl.contents) && pl.contents[0].parts[0].text === 'hi');
  ok('5 · functionDeclarations UPPERCASE schema', pl.tools[0].functionDeclarations[0].parameters.type === 'OBJECT');
  ok('5 · parse candidates → text', r.text === 'OK-LEGACY');
  DB.setSetting('aiApiModeGemini', 'AUTO');
})();

/* ==========================================================================
   6. OPENAI AUTO → Responses API
   ========================================================================== */
(function openaiResponses() {
  DB.setSetting('aiProvider', 'OPENAI');
  DB.setSetting('aiModel', 'gpt-5.6-luna');
  stub(() => J({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] }));
  AI._callProvider({ provider: 'OPENAI', model: 'gpt-5.6-luna' }, 'test', [], S);
  const rec = UFA.log[UFA.log.length - 1];
  const pl = JSON.parse(rec.opts.payload);
  ok('6 · URL = /v1/responses', /api\.openai\.com\/v1\/responses$/.test(rec.url), rec.url);
  ok('6 · Authorization Bearer header', /^Bearer /.test(rec.opts.headers.Authorization));
  ok('6 · input items (role/content)', Array.isArray(pl.input) && pl.input[0].role === 'user' && pl.input[0].content === 'test');
  ok('6 · instructions = system prompt', typeof pl.instructions === 'string' && pl.instructions.length > 10);
  ok('6 · store:false', pl.store === false);
  ok('6 · TEMPERATURE nahi bheja jata (gpt-5 400 deta hai — LIVE-verified)', pl.temperature === undefined);
  ok('6 · tools FLAT {type,name,parameters}', pl.tools[0].type === 'function' && pl.tools[0].parameters.type === 'object' && !pl.tools[0].function);
  ok('6 · max_output_tokens (camel nahi — snake field)', pl.max_output_tokens > 0);
})();

/* ==========================================================================
   7. OPENAI Responses tool loop: function_call + function_call_output items
   ========================================================================== */
(function openaiToolLoop() {
  DB.setSetting('aiProvider', 'OPENAI');
  let n = 0;
  stub(() => {
    n++;
    if (n === 1) return J({ status: 'completed', output: [
      { type: 'reasoning', id: 'rs_1' },
      { type: 'function_call', id: 'fc_1', call_id: 'call_abc', name: 'today_sales', arguments: '{}' }] });
    return J({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Aaj Rs 5,000.' }] }] });
  });
  const out = AI.chat({ message: 'Aaj ki sale?', history: [] }, S);
  ok('7 · responses loop chala', /5,000/.test(out.reply || ''), (out.reply || '').slice(0, 30));
  const pl2 = JSON.parse(UFA.log[1].opts.payload);
  const items = pl2.input || [];
  const fcItem = items.filter(i => i.type === 'function_call')[0];
  const foItem = items.filter(i => i.type === 'function_call_output')[0];
  ok('7 · function_call item echo (call_id + name + JSON-string args)', fcItem && fcItem.call_id === 'call_abc' && typeof fcItem.arguments === 'string');
  ok('7 · function_call_output item (call_id match, output string)', foItem && foItem.call_id === 'call_abc' && typeof foItem.output === 'string');
  ok('7 · reasoning items preserved for stateless continuation', items.some(i => i.type === 'reasoning'));
  ok('7 · original question preserved after tool call', items.some(i => i.role === 'user' && /Aaj ki sale/.test(i.content))); 
  DB.setSetting('aiProvider', 'GEMINI');
})();

/* ==========================================================================
   8. OPENAI CHAT mode = legacy chat/completions
   ========================================================================== */
(function openaiChatMode() {
  DB.setSetting('aiApiModeOpenai', 'CHAT');
  stub(() => J({ choices: [{ message: { content: 'OK-CHAT' } }] }));
  const r = AI._callProvider({ provider: 'OPENAI', model: 'gpt-4o-mini' }, 'hi', [], S);
  const rec = UFA.log[UFA.log.length - 1];
  ok('8 · CHAT mode URL /chat/completions', /\/v1\/chat\/completions$/.test(rec.url), rec.url);
  const pl = JSON.parse(rec.opts.payload);
  ok('8 · messages[] + nested tools {function}', pl.messages[0].role === 'system' && pl.tools[0].function.name === 'search_items');
  ok('8 · parse text', r.text === 'OK-CHAT');
  DB.setSetting('aiApiModeOpenai', 'AUTO');
})();

/* ==========================================================================
   9. self-heal: 'Unsupported parameter' 400 → field strip → retry
   ========================================================================== */
(function selfHeal() {
  DB.setSetting('aiProvider', 'OPENAI');
  let n = 0;
  stub(() => {
    n++;
    if (n === 1) return { code: 400, text: JSON.stringify({ error: { message: "Unsupported parameter: 'max_output_tokens' is not supported with this model." } }) };
    return J({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'HEALED' }] }] });
  });
  const r = AI._callProvider({ provider: 'OPENAI', model: 'gpt-5.6-luna' }, 'hi', [], S);
  ok('9 · 400 par field strip kar ke retry (koi retry setting nahi chahiye)', r.text === 'HEALED' && UFA.log.length === 2, 'calls=' + UFA.log.length);
  const pl2 = JSON.parse(UFA.log[1].opts.payload);
  ok('9 · retried payload se ghalat field nikal gaya', pl2.max_output_tokens === undefined);
  DB.setSetting('aiProvider', 'GEMINI');
})();

/* ==========================================================================
   10. GEMINI AUTO: interactions 404 → legacy generateContent par giray
   ========================================================================== */
(function geminiAutoFallback() {
  let n = 0;
  stub(() => {
    n++;
    if (n === 1) return { code: 404, text: JSON.stringify({ error: { message: 'Method not found.' } }) };
    return J({ candidates: [{ content: { parts: [{ text: 'LEGACY-FLOW' }] } }] });
  });
  const r = AI._callProvider({ provider: 'GEMINI', model: 'gemini-2.0-flash' }, 'hi', [], S);
  ok('10 · AUTO mode 404 par legacy try karta hai', r.text === 'LEGACY-FLOW' && UFA.log.length === 2);
  ok('10 · doosri call legacy URL par', /generateContent/.test(UFA.log[1].url));
})();

/* ==========================================================================
   11. OPENROUTER — chat/completions + attribution + public models + verify
   ========================================================================== */
(function openrouter() {
  stub(() => J({ choices: [{ message: { content: 'OK' } }] }));
  AI._callProvider({ provider: 'OPENROUTER', model: 'x/y' }, 'hi', [], S);
  const rec = UFA.log[UFA.log.length - 1];
  ok('11 · OpenRouter default URL', /openrouter\.ai\/api\/v1\/chat\/completions$/.test(rec.url));
  ok('11 · attribution headers (docs-recommended)', rec.opts.headers['HTTP-Referer'] && rec.opts.headers['X-Title'] === 'Haseeb Autos');

  stub(() => J({ data: [
    { id: 'aa/bb:free', name: 'AA BB', pricing: { prompt: '0', completion: '0' }, context_length: 100000, supported_parameters: ['tools'] },
    { id: 'cc/dd', name: 'CC DD', pricing: { prompt: '0.001', completion: '0.002' }, context_length: 8000, supported_parameters: [] }
  ] }));
  const lm = sandbox.AI_ADAPTERS.OPENROUTER.listModels(AI._ctx({ provider: 'OPENROUTER', model: '' }, '', [], S));
  ok('11 · public models list: free pehle + no-tools flagged', lm.models && lm.models[0].free === true && lm.models[0].id === 'aa/bb:free' && lm.models[1].status === 'limited',
    lm.models.map(mm => mm.id + (mm.free ? '(free)' : '') + '/' + mm.status).join(','));

  stub(() => J({ data: { label: 'test', limit: 10 } }));
  const v = sandbox.AI_ADAPTERS.OPENROUTER.verify({ key: 'k' });
  ok('11 · verify /key endpoint use karta hai', v.ok === true && /limit \$10/.test(v.note || ''), v.note);
})();

/* ==========================================================================
   12. OLLAMA — endpoint lazmi; /api/tags + /api/chat; key optional
   ========================================================================== */
(function ollama() {
  DB.setSetting('aiEndpoint', '');
  UFA.reset();
  const noEp = AI._callProvider({ provider: 'OLLAMA', model: 'm' }, 'hi', [], S);
  ok('12 · endpoint na ho to clear error (fetch nahi hoti)', noEp.error && /endpoint/.test(noEp.error) && UFA.log.length === 0, (noEp.error || '').slice(0, 60));

  DB.setSetting('aiProvider', 'OLLAMA');
  DB.setSetting('aiEndpoint', 'https://ollama.example.com');
  stub(() => J({ message: { role: 'assistant', content: 'OK-OL' } }));
  const r = AI._callProvider({ provider: 'OLLAMA', model: 'llama-x' }, 'hi', [], S);
  const rec = UFA.log[UFA.log.length - 1];
  ok('12 · native /api/chat + stream:false', /\/api\/chat$/.test(rec.url) && JSON.parse(rec.opts.payload).stream === false);
  ok('12 · parse message.content', r.text === 'OK-OL');
  stub(() => J({ models: [{ name: 'llama-a:1', size: 4e9 }, { name: 'llama-b', size: 8e9 }] }));
  const lm = sandbox.AI_ADAPTERS.OLLAMA.listModels(AI._ctx({ provider: 'OLLAMA', model: '' }, '', [], S));
  ok('12 · /api/tags list (GB size label ke sath)', lm.models.length === 2 && /GB/.test(lm.models[0].note), lm.models.map(m => m.id).join(','));
  DB.setSetting('aiEndpoint', '');
})();

/* ==========================================================================
   13. custom endpoint respect (har adapter)
   ========================================================================== */
(function customEndpoint() {
  DB.setSetting('aiProvider', 'OPENAI');
  DB.setSetting('aiEndpoint', 'https://my-proxy.example.com/v1/');
  stub(() => J({ status: 'completed', output: [] }));
  AI._callProvider({ provider: 'OPENAI', model: 'm' }, 'test', [], S);
  ok('13 · OpenAI custom → {base}/responses (trailing slash strip)',
    UFA.log[UFA.log.length - 1].url === 'https://my-proxy.example.com/v1/responses', UFA.log[UFA.log.length - 1].url);
  DB.setSetting('aiProvider', 'GEMINI'); // legacy endpoint belongs to the primary only
  stub(() => J({ status: 'completed', steps: [] }));
  AI._callProvider({ provider: 'GEMINI', model: 'g' }, 'test', [], S);
  ok('13 · Gemini custom → {base}/interactions',
    UFA.log[UFA.log.length - 1].url === 'https://my-proxy.example.com/v1/interactions', UFA.log[UFA.log.length - 1].url);
  DB.setSetting('aiEndpoint', '');
})();

/* ==========================================================================
   14. testConnection — verify-FIRST + honest errors + MOCK keyless
   ========================================================================== */
(function testConnection() {
  DB.setSetting('aiProvider', 'GEMINI'); DB.setSetting('aiApiModeGemini', 'AUTO');

  stub(() => ({ code: 401, text: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) }));
  let r = AI.testConnection({ provider: 'GEMINI', model: 'm1' }, S);
  ok('14 · 401 par ok=false (verify pakad liya)', r.ok === false && /API key not valid/.test(r.message), r.message.slice(0, 60));
  ok('14 · hint + keyCheck report', /aistudio/.test(r.hint || '') && /✖/.test(r.keyCheck || ''));

  let n = 0;
  stub(() => { n++; return n === 1 ? J({ data: [] }) : J({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'OK' }] }] }); });
  r = AI.testConnection({ provider: 'GEMINI', model: 'm1' }, S);
  ok('14 · verify-pass + mini-round → ok=true', r.ok === true, r.message.slice(0, 70));
  ok('14 · message mein keyCheck + apiMode', /✓/.test(r.message) && r.apiMode === 'AUTO', (r.message || '').slice(0, 80));

  DB.setSetting('aiProvider', 'MOCK');
  r = AI.testConnection({ provider: 'MOCK' }, S);
  ok('14 · MOCK keyless pass', r.ok === true, r.message);
  DB.setSetting('aiProvider', 'GEMINI');
})();

/* ==========================================================================
   15. MOCK adapter — engine se wired (data agent)
   ========================================================================== */
(function mockAdapter() {
  DB.setSetting('aiProvider', 'MOCK'); DB.setSetting('aiFallbackMock', 'true'); DB.setSetting('aiCanWrite', 'false');
  const out = AI.chat({ message: 'aaj ki sale kitni hui?', history: [] }, S);
  ok('15 · mock chat real data se', /Aaj ki sale Rs [\d,]+ \(\d+ bills\)/.test(out.reply || ''), (out.reply || '').slice(0, 60));
  DB.setSetting('aiProvider', 'GEMINI');
})();

(function securityChecks() {
  ok('16 · credentials isolated per provider', AI.getKey('GEMINI') !== AI.getKey('OPENAI') && AI.getKey('OLLAMA') === '');
  const cfg = AI.agentConfig(S);
  ok('16 · only masked credential status returned', cfg.credentials.OPENAI.hasKey && JSON.stringify(cfg).indexOf('TEST-OPENAI-KEY') < 0);
  AI.setKey('', 'OPENROUTER');
  const r = AI.testConnection({provider: 'OPENROUTER'}, S);
  ok('16 · missing provider key never reports mock success', r.ok === false && /key/i.test(r.message));
  ok('16 · deleting one key preserves others', AI.getKey('OPENAI') === 'TEST-OPENAI-KEY');
})();
/* ========================================================================== */
UFA.reset();
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  AI ADAPTERS   PASS: ' + PASS + '   FAIL: ' + FAIL);
console.log('══════════════════════════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
