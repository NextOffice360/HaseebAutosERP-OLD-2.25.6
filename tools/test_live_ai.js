#!/usr/bin/env node
/**
 * tools/test_live_ai.js — LIVE provider probe (v2.11)
 * ---------------------------------------------------------------------------
 * ASLI API calls: Gemini Interactions (text + tool loop), OpenAI Responses
 * (text + tool loop + temperature-reject self-heal proof), OpenRouter public
 * models list, Ollama (only if OLLAMA_URL is set). Keys are read from
 *   $GEMINI_API_KEY / $OPENAI_API_KEY  ya  ~/.secrets/haseeb-ai-keys.json
 * and NEVER printed. Not part of verify.sh (offline CI has no network) —
 * run by hand before a release that touches adapters.
 *
 *   node tools/test_live_ai.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

let GEMINI_KEY = process.env.GEMINI_API_KEY || '';
let OPENAI_KEY = process.env.OPENAI_API_KEY || '';
if (!GEMINI_KEY || !OPENAI_KEY) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.secrets', 'haseeb-ai-keys.json'), 'utf8'));
    GEMINI_KEY = GEMINI_KEY || j.GEMINI_KEY || '';
    OPENAI_KEY = OPENAI_KEY || j.OPENAI_KEY || '';
  } catch (e) { /* optional */ }
}

let PASS = 0, FAIL = 0;
const ok = (n, c, note) => { if (c) { PASS++; console.log('  \x1b[32m✔\x1b[0m ' + n + (note ? '  \x1b[2m→ ' + note + '\x1b[0m' : '')); } else { FAIL++; console.log('  \x1b[31m✘ ' + n + '\x1b[0m' + (note ? ' → ' + String(note).slice(0, 160) : '')); } };
const mask = k => k ? k.slice(0, 3) + '…' + k.slice(-2) + ' (' + k.length + 'ch)' : 'NONE';
const TOOL = { type: 'function', name: 'get_temperature', description: 'Get current temperature for a city',
  parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name' } }, required: ['city'] } };
const TOOL_RESULT = JSON.stringify({ city: 'Multan', temp_c: 38, condition: 'Clear' });

async function main() {
  console.log('\n\x1b[1mLIVE AI ADAPTER PROBE · keys: GEMINI=' + mask(GEMINI_KEY) + ' OPENAI=' + mask(OPENAI_KEY) + '\x1b[0m\n');

  /* ---------- GEMINI: model list ---------- */
  if (GEMINI_KEY) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': GEMINI_KEY } });
    const j = await r.json().catch(() => ({}));
    ok('Gemini verify (models list 200)', r.status === 200 && (j.models || []).length > 0, ((j.models || []).length) + ' models');

    /* text round */
    const t0 = Date.now();
    const r1 = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-3.8-flash', store: false, system_instruction: 'Answer in one short sentence.',
        input: [{ type: 'user_input', content: [{ type: 'text', text: 'Say exactly: HASEEB-OK' }] }] })
    });
    const j1 = await r1.json().catch(() => ({}));
    const txt1 = ((j1.steps || []).filter(s => s.type === 'model_output').map(s => (s.content || []).map(c => c.text || '').join('')).join(' ') || '');
    ok('Gemini Interactions text round (store:false)', r1.status === 200 && /HASEEB-OK/.test(txt1), Date.now() - t0 + ' ms · ' + txt1.slice(0, 40));

    /* tool loop: fc → result → final (stateless, signature echo) */
    const r2 = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-3.8-flash', store: false,
        input: [{ type: 'user_input', content: [{ type: 'text', text: 'What is the temperature in Multan? Use the tool.' }] }],
        tools: [TOOL] })
    });
    const j2 = await r2.json().catch(() => ({}));
    const fc = (j2.steps || []).filter(s => s.type === 'function_call')[0];
    ok('Gemini tool round → function_call', r2.status === 200 && fc && fc.name === 'get_temperature', 'status=' + j2.status);
    if (fc) {
      const r3 = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-3.8-flash', store: false, tools: [TOOL],
          input: [
            { type: 'user_input', content: [{ type: 'text', text: 'What is the temperature in Multan? Use the tool.' }] },
            ...(j2.steps || []),
            { type: 'function_result', name: fc.name, call_id: fc.id, result: [{ type: 'text', text: TOOL_RESULT }] }
          ] })
      });
      const j3 = await r3.json().catch(() => ({}));
      const txt3 = (j3.steps || []).filter(s => s.type === 'model_output').map(s => (s.content || []).map(c => c.text || '').join('')).join(' ');
      ok('Gemini stateless tool-loop continuation (steps verbatim)', r3.status === 200 && /38/.test(txt3), txt3.slice(0, 60));
    }
  } else ok('Gemini skipped (no key)', false, 'GEMINI_API_KEY missing');

  /* ---------- OPENAI: Responses ---------- */
  if (OPENAI_KEY) {
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + OPENAI_KEY } });
    const j = await r.json().catch(() => ({}));
    ok('OpenAI verify (models list 200)', r.status === 200 && (j.data || []).length > 0, ((j.data || []).length) + ' models');
    const model = (j.data || []).some(m => m.id === 'gpt-5.6-luna') ? 'gpt-5.6-luna' : 'gpt-4o-mini';

    const t0 = Date.now();
    const r1 = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY },
      body: JSON.stringify({ model, store: false, instructions: 'Answer in one short line.',
        input: [{ role: 'user', content: 'Say exactly: HASEEB-OK' }] })
    });
    const j1 = await r1.json().catch(() => ({}));
    const txt1 = (j1.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).map(c => c.text || '').join(' ');
    ok('OpenAI Responses text round (store:false, no temperature)', r1.status === 200 && /HASEEB-OK/.test(txt1), Date.now() - t0 + ' ms · ' + txt1.slice(0, 40));

    const r2 = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY },
      body: JSON.stringify({ model, store: false, tools: [TOOL],
        input: [{ role: 'user', content: 'What is the temperature in Multan? Use the tool.' }] })
    });
    const j2 = await r2.json().catch(() => ({}));
    const fc = (j2.output || []).filter(o => o.type === 'function_call')[0];
    ok('OpenAI tool round → function_call item', r2.status === 200 && fc && fc.name === 'get_temperature', 'status=' + j2.status);
    if (fc) {
      const r3 = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY },
        body: JSON.stringify({ model, store: false, tools: [TOOL],
          input: [{ role: 'user', content: 'What is the temperature in Multan? Use the tool.' },
            { type: 'function_call', call_id: fc.call_id, name: fc.name, arguments: fc.arguments },
            { type: 'function_call_output', call_id: fc.call_id, output: TOOL_RESULT }] })
      });
      const j3 = await r3.json().catch(() => ({}));
      const txt3 = (j3.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).map(c => c.text || '').join(' ');
      ok('OpenAI Responses tool-loop continuation (fc + fc_output items)', r3.status === 200 && /38/.test(txt3), txt3.slice(0, 60));
    }
    /* temperature-reject proof (engine never sends it; raw probe documents it) */
    const rT = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY },
      body: JSON.stringify({ model, store: false, temperature: 0.7, input: 'hi' })
    });
    ok('OpenAI: temperature on reasoning model REJECTED (400) — engine never sends it', rT.status === 400, 'HTTP ' + rT.status);
  } else ok('OpenAI skipped (no key)', false, 'OPENAI_API_KEY missing');

  /* ---------- OPENROUTER (public) ---------- */
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    const j = await r.json().catch(() => ({}));
    const free = (j.data || []).filter(m => /:free$/.test(m.id) || (m.pricing && Number(m.pricing.prompt) === 0));
    ok('OpenRouter public models list', r.status === 200 && (j.data || []).length > 50, (j.data || []).length + ' models · ' + free.length + ' free');
  } catch (e) { ok('OpenRouter public models list', false, e.message); }

  /* ---------- OLLAMA (only if OLLAMA_URL given) ---------- */
  const OU = process.env.OLLAMA_URL || '';
  if (OU) {
    try {
      const r = await fetch(OU.replace(/\/+$/, '') + '/api/tags');
      const j = await r.json().catch(() => ({}));
      ok('Ollama /api/tags', r.status === 200 && Array.isArray(j.models), ((j.models || []).length) + ' models');
    } catch (e) { ok('Ollama /api/tags', false, e.message); }
  } else console.log('  ·  Ollama probe skipped (set OLLAMA_URL to test a reachable server)');

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  LIVE AI PROBE   PASS: ' + PASS + '   FAIL: ' + FAIL);
  console.log('══════════════════════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
