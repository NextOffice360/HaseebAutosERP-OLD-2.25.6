/**
 * HASEEB AUTOS v2.11 — PROVIDER ADAPTERS
 * ============================================================================
 * Provider-agnostic AI engine: `AI.gs` (engine) sirf is registry se baat
 * karti hai. Har provider ka apna adapter hai jo teen kaam karta hai:
 *
 *   run(ctx)      → ek model-round. Sirf ye format jaanta hai (payload banao,
 *                   UrlFetchApp, parse). Return: { text } | { functionCall }
 *                   | { error } | { text|functionCall, rawSteps }
 *   verify(ctx)   → sasti auth check (models-list ya /key) — testConnection
 *                   isi se shuru karta hai, phir mini-chat round.
 *   listModels(ctx) → live model discovery (engine cache wrapper ke andar).
 *
 * `ctx` (engine banata hai, har round par dobara):
 *   { provider, mode, model, key, system, message, history, tools,
 *     temp, maxTokens, settings, s }
 *   history items: {role:'user'|'model', text} | {role:'model', functionCall,
 *   rawSteps?} | {role:'user', functionResponse}.
 *
 * Official API sources (docs padh kar + LIVE keys se verify kiya, 2026-09-19):
 *   Gemini  : ai.google.dev/api/interactions-api   (Interactions — GA June 2026)
 *             + generateContent (legacy fallback, abhi supported)
 *   OpenAI  : platform.openai.com/docs/guides/reasoning · /v1/responses
 *   Ollama  : docs.ollama.com/api/chat (+ /api/tags models list)
 *   OpenRouter: openrouter.ai/docs — OpenAI-compatible /api/v1/chat/completions,
 *             /api/v1/models PUBLIC list (pricing + supported_parameters ke sath)
 *
 * Privacy default: Interactions/Responses call `store:false` (stateless) — provider par
 * app conversation storage request nahi karta; security logs par provider policy lagu hai. (Gemini: server-side state chahiye to
 * is app mein stateful storage enabled nahi hai.)
 * ============================================================================
 */

/* ============================ shared plumbing ============================= */
var AI_ADAPTERS = {};

/** v2.12: cooperative execution budget; provider sockets also have a deadline.
 * Official UrlFetchApp advanced parameter: timeoutSeconds (default 360s).
 * No automatic retries on timeout, quota errors, or writes.
 */
var AI_REQUEST_BUDGET = null;
function ai_withBudget_(fn) {
  if (AI_REQUEST_BUDGET) return fn();
  AI_REQUEST_BUDGET = { deadline: Date.now() + 50000, requests: 0, limit: 4 };
  try { return fn(); } finally { AI_REQUEST_BUDGET = null; }
}

/** Chhota HTTP helper — JSON in/out, errors kabhi throw nahi karte */
function ai_http_(method, url, headers, payloadObj) {
  try {
    var budget = AI_REQUEST_BUDGET || { deadline: Date.now() + 20000, requests: 0, limit: 1 };
    var remaining = Math.floor((budget.deadline - Date.now()) / 1000);
    if (remaining < 2 || budget.requests >= budget.limit) {
      return { code: 0, body: {}, text: '', transportError: 'AI_TIME_BUDGET: provider waqt le raha hai. Chhota sawal ya tez model chunein; automatic retry nahi hui.' };
    }
    budget.requests++;
    var opts = { method: method, headers: headers || {}, muteHttpExceptions: true, followRedirects: false,
      timeoutSeconds: Math.max(1, Math.min(20, remaining)) };
    if (payloadObj) {
      if (Array.isArray(payloadObj.tools) && !payloadObj.tools.length) { delete payloadObj.tools; delete payloadObj.toolConfig; }
      opts.contentType = 'application/json';
      opts.payload = JSON.stringify(payloadObj);
    }
    if (!/^https:\/\//i.test(url)) throw new Error('HTTPS endpoint required');
    var res = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();
    var text = '';
    try { text = res.getContentText() || ''; } catch (e) { text = ''; }
    var body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { _raw: text }; }
    return { code: code, body: body, text: text };
  } catch (e) {
    return { code: 0, body: {}, text: '', transportError: e.message };
  }
}

/** Providers ke API-key headers (engine key sirf yahan se network ko deta hai) */
function ai_authHeaders_(key) {
  return key ? { Authorization: 'Bearer ' + key } : {};
}

/**
 * 'Unsupported parameter: temperature' / 'field: max_output_tokens' type 400s
 * ke liye: naam nikaal kar payload se woh field cheen do (retry caller karta hai).
 * Koi model-name hardcoding nahi — error message hi batata hai kya chubhan hai.
 */
function ai_unsupportedField_(errBody) {
  var m = JSON.stringify(errBody || {}).match(/Unsupported parameter:?\s*'([a-zA-Z_.]+)'|Invalid (?:argument|value)[^.]*for\s+\[?([a-zA-Z_.]+)\]?|field\(s\)?\s+'([a-zA-Z_.]+)'\s+not supported/i);
  if (!m) return '';
  return m[1] || m[2] || m[3] || '';
}

/** Tools (engine ka uppercase schema) → OpenAI-style lowercase JSON Schema */
function ai_openTools_(tools) {
  return (tools || []).map(function (t) {
    return { type: 'function', function: {
      name: t.name, description: t.description,
      parameters: AI._jsonSchema(t.parameters || { type: 'OBJECT', properties: {} })
    } };
  });
}
/** Gemini/Responses-style FLAT tool objects */
function ai_flatTools_(tools) {
  return (tools || []).map(function (t) {
    return { type: 'function', name: t.name, description: t.description,
      parameters: AI._jsonSchema(t.parameters || { type: 'OBJECT', properties: {} }), strict: false };
  });
}

/* ============================== GEMINI ==================================== */
/**
 * Do API modes:
 *  INTERACTIONS  — POST {base}/interactions ; body: {model, input, store:false,
 *                  system_instruction(STRING), tools:[flat], generation_config}
 *    response: {id, status:'completed'|'requires_action', steps:[…]}
 *    steps: thought{signature} · function_call{id,name,arguments(OBJECT)} ·
 *           model_output{content:[{type:'text',text}]} · user_input · function_result
 *    TOOL LOOP (stateless, docs-verified): agla request = purana input +
 *    returned steps VERBATIM (thought signature lazmi) + function_result steps.
 *  GENERATE_CONTENT — legacy :generateContent (older deployments ke liye).
 *  AUTO — pehle INTERACTIONS; 404/'no longer available'/invalid-mode par legacy.
 */
AI_ADAPTERS.GEMINI = {
  id: 'GEMINI',
  meta: {
    label: 'Google Gemini', tagline: 'Free tier · naya Interactions API',
    needsKey: true, keyUrl: 'https://aistudio.google.com/apikey',
    keyHelp: 'Google account se login → "Create API key" → copy karein.',
    modelSource: 'live (models list) + fallback',
    apiModes: [
      { id: 'AUTO', label: 'Auto — Interactions try, purana fallback' },
      { id: 'INTERACTIONS', label: 'Interactions API (naya — recommended)' },
      { id: 'GENERATE_CONTENT', label: 'generateContent (legacy compatible)' }
    ],
    caps: { tools: true, freeTier: true, serverState: true, structured: true }
  },

  _base: function (ctx) { return ctx && ctx.endpoint !== undefined ? ctx.endpoint : AI._baseUrl('GEMINI'); },

  /** history+message → Interactions `input` steps (LIVE schema-verified) */
  toInput: function (history, message) {
    var steps = [];
    (history || []).forEach(function (h) {
      if (h.skipRaw) return;
      if (h.rawSteps && h.rawSteps.length) {
        /* pichle round ke steps EXACTLY as received (thought signature samet) */
        h.rawSteps.forEach(function (st) { steps.push(st); });
        if (h.functionResponse) steps.push({ type: 'function_result', name: h.functionResponse.name,
          call_id: h.functionResponse.id,
          result: [{ type: 'text', text: JSON.stringify(h.functionResponse.response).substring(0, 8000) }] });
      } else if (h.functionCall) {
        steps.push({ type: 'function_call', id: h.functionCall.id || ('ha_' + U.uid('c')),
          name: h.functionCall.name, arguments: h.functionCall.args || {} });
      } else if (h.functionResponse) {
        steps.push({ type: 'function_result', name: h.functionResponse.name,
          call_id: h.functionResponse.id || 'ha_call',
          result: [{ type: 'text', text: JSON.stringify(h.functionResponse.response).substring(0, 8000) }] });
      } else {
        steps.push(h.role === 'model'
          ? { type: 'model_output', content: [{ type: 'text', text: U.str(h.text) }] }
          : { type: 'user_input', content: [{ type: 'text', text: U.str(h.text) }] });
      }
    });
    if (message) steps.push({ type: 'user_input', content: [{ type: 'text', text: message }] });
    return steps;
  },

  /** Interactions response → engine ka round-result */
  fromResponse: function (body) {
    var steps = (body && body.steps) || [];
    var outText = '';
    var fc = null;
    steps.forEach(function (st) {
      if (st.type === 'function_call' && !fc) fc = st;
      if (st.type === 'model_output' && st.content) {
        outText += st.content.map(function (c) { return U.str(c && c.text); })
          .filter(Boolean).join('\n');
      }
    });
    if (fc) {
      var args = fc.arguments || {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch (e) { args = {}; } }
      return { functionCall: { id: fc.id || ('ha_' + U.uid('c')), name: fc.name, args: args },
        functionCalls: steps.filter(function (st) { return st.type === 'function_call'; }).map(function (st) { return { id: st.id, name: st.name, args: st.arguments || {} }; }),
        rawSteps: steps, interactionId: (body && body.id) || '' };
    }
    return { text: outText.trim(), rawSteps: steps, interactionId: (body && body.id) || '' };
  },

  run: function (ctx) {
    var mode = String(ctx.mode || 'AUTO').toUpperCase();
    if (mode === 'AUTO') mode = 'INTERACTIONS';
    if (mode === 'GENERATE_CONTENT') return this.legacy(ctx);
    if (!ctx.key) return { error: 'Gemini: API key set nahi hai' };

    var keyHdr = { 'x-goog-api-key': ctx.key, 'Content-Type': 'application/json' };
    var payload = {
      model: ctx.model, store: false,
      system_instruction: ctx.system,              /* STRING — object 400 deta hai (verified) */
      input: this.toInput(ctx.history, ctx.message),
      tools: ai_flatTools_(ctx.tools).map(function (t) { delete t.strict; return t; })
    };
    var withCfg = Object.assign({}, payload, {
      generation_config: { temperature: ctx.temp, max_output_tokens: ctx.maxTokens } });
    var url = this._base(ctx) + '/interactions';

    /* generation_config hata kar retry — API/version farq ke liye self-heal */
    var res = ai_http_('post', url, keyHdr, withCfg);
    if (res.code === 400 || res.code === 404) {
      var bad = ai_unsupportedField_(res.body);
      if (bad === 'generation_config' || res.code === 400) {
        var retry = ai_http_('post', url, keyHdr, payload);
        if (retry.code === 200) { res = retry; }
      }
    }
    if (res.transportError) return { error: 'Gemini network error: ' + res.transportError };
    if (res.code === 503) return { error: 'Gemini 503: model busy hai — 1-2 minute baad dobara koshish karein' };
    if (res.code !== 200) {
      var msg = (res.body && res.body.error && res.body.error.message) || res.text.substring(0, 200) || 'unknown';
      /* Purane/unsupported models ke liye: AUTO ho to legacy API try karo */
      if (ctx.mode !== 'INTERACTIONS' && (res.code === 404 || String(msg).toLowerCase().indexOf('interactions') > -1)) {
        return this.legacy(ctx);
      }
      return { error: 'Gemini error ' + res.code + ': ' + msg };
    }
    return this.fromResponse(res.body);
  },

  /** legacy generateContent (v2.8 ka raasta — abhi bhi fully supported) */
  legacy: function (ctx) {
    if (!ctx.key) return { error: 'Gemini: API key set nahi hai' };
    var payload = {
      system_instruction: { parts: [{ text: ctx.system }] },
      contents: AI._geminiContents(ctx.history, ctx.message),
      tools: [{ functionDeclarations: ctx.tools }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { temperature: ctx.temp, maxOutputTokens: ctx.maxTokens }
    };
    var res = ai_http_('post', this._base(ctx) + '/models/' + ctx.model +
      ':generateContent', { 'x-goog-api-key': ctx.key }, payload);
    if (res.transportError) return { error: 'Gemini network error: ' + res.transportError };
    var body = res.body || {};
    if (res.code !== 200) {
      return { error: 'Gemini error ' + res.code + ': ' + ((body.error && body.error.message) || res.text.substring(0, 160)) };
    }
    var cand = (body.candidates && body.candidates[0]) || {};
    var parts = (cand.content && cand.content.parts) || [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].functionCall) {
        return { functionCall: { id: 'ha_' + U.uid('c'), name: parts[i].functionCall.name,
          args: parts[i].functionCall.args || {} } };
      }
    }
    return { text: parts.map(function (p) { return p.text || ''; }).join('\n').trim() };
  },

  verify: function (ctx) {
    var r = ai_http_('get', this._base(ctx) + '/models?pageSize=1', { 'x-goog-api-key': ctx.key }, null);
    if (r.transportError) return { ok: false, error: 'Network: ' + r.transportError };
    if (r.code === 400 || r.code === 401 || r.code === 403) {
      return { ok: false, error: 'API key verify nahi hui (' + r.code + ') — ' +
        ((r.body.error && r.body.error.message) || 'key check karein') };
    }
    if (r.code >= 300) return { ok: false, error: 'Models list ' + r.code + ' — baad mein dobara try karein' };
    return { ok: true, note: 'key valid (models list 200)' };
  },

  listModels: function (ctx) {
    var r = ai_http_('get', this._base(ctx) + '/models?pageSize=200', { 'x-goog-api-key': ctx.key }, null);
    if (r.code !== 200) return { models: null, note: 'Models list ' + (r.code || 'network') + ' — key/endpoint check karein' };
    var found = [];
    ((r.body && r.body.models) || []).forEach(function (m) {
      var methods = m.supportedGenerationMethods || [];
      if (methods.length && methods.indexOf('generateContent') === -1) return; /* non-chat models chhodo */
      var id = U.str(m.name).replace(/^models\//, '');
      var known = AI.catalog('GEMINI').filter(function (k) { return k.id === id; })[0];
      if (known) { found.push(known); return; }
      if (/image|tts|robotics|computer-use|audio|transcribe/i.test(id)) return;
      var desc = U.str(m.description);
      found.push({ id: id, label: m.displayName || id,
        status: /preview/i.test(id) ? 'preview' : 'stable',
        free: false, note: desc.substring(0, 80) });
    });
    return { models: found.length ? found : null };
  }
};

/* =============================== OPENAI =================================== */
/**
 * Do modes:
 *  RESPONSES — POST /v1/responses {model, input[items], store:false, tools[flat],
 *              instructions, max_output_tokens}. TEMPERATURE ISLIYE NAHI bhejte:
 *              reasoning models 400 dete hain ('Unsupported parameter') —
 *              phir bhi self-heal retry maujood hai.
 *    tool loop: output[]{type:'function_call', call_id, arguments:JSON STRING}
 *               → continue karne ke liye: wahi item + {type:'function_call_output',
 *               call_id, output} (LIVE-verified).
 *  CHAT — purana /chat/completions (jo v2.8 mein tha).
 *  AUTO — RESPONSES; agar endpoint/wapis 404/unsupported → CHAT.
 */
AI_ADAPTERS.OPENAI = {
  id: 'OPENAI',
  meta: {
    label: 'OpenAI', tagline: 'Responses API · ChatGPT wale models',
    needsKey: true, keyUrl: 'https://platform.openai.com/api-keys',
    keyHelp: 'platform.openai.com → API keys → Create new secret key.',
    modelSource: 'live (models list) + fallback',
    apiModes: [
      { id: 'AUTO', label: 'Auto — Responses try, chat fallback' },
      { id: 'RESPONSES', label: 'Responses API (naya — recommended)' },
      { id: 'CHAT', label: 'Chat Completions (legacy compatible)' }
    ],
    caps: { tools: true, serverState: true, structured: true }
  },

  _base: function (ctx) { return ctx && ctx.endpoint !== undefined ? ctx.endpoint : AI._baseUrl('OPENAI'); },

  /** engine history → Responses `input` items */
  toInput: function (history, message) {
    var items = [];
    (history || []).forEach(function (h) {
      if (h.skipRaw) return;
      if (h.rawSteps && h.rawSteps.length) { h.rawSteps.forEach(function (st) { items.push(st); });
      } else if (h.functionCall) {
        items.push({ type: 'function_call', call_id: h.functionCall.id || ('ha_' + U.uid('c')),
          name: h.functionCall.name, arguments: JSON.stringify(h.functionCall.args || {}) });
      } else if (h.functionResponse) {
        items.push({ type: 'function_call_output', call_id: h.functionResponse.id || 'ha_call',
          output: JSON.stringify(h.functionResponse.response).substring(0, 8000) });
      } else {
        items.push({ role: h.role === 'model' ? 'assistant' : 'user', content: U.str(h.text) });
      }
    });
    if (message) items.push({ role: 'user', content: message });
    return items;
  },

  fromResponse: function (body) {
    var out = (body && body.output) || [];
    var text = '';
    for (var i = 0; i < out.length; i++) {
      var o = out[i];
      if (o.type === 'function_call') {
        var args = {};
        try { args = JSON.parse(o.arguments || '{}'); } catch (e) { }
        return { functionCall: { id: o.call_id || ('ha_' + U.uid('c')), name: o.name, args: args }, rawSteps: out,
          functionCalls: out.filter(function (it) { return it.type === 'function_call'; }).map(function (it) { return { id: it.call_id, name: it.name, args: JSON.parse(it.arguments || '{}') }; }) };
      }
      if (o.type === 'message') {
        text += (o.content || []).map(function (c) { return U.str(c.text); }).filter(Boolean).join('\n');
      }
    }
    return { text: (text || '').trim() };
  },

  run: function (ctx) {
    var mode = String(ctx.mode || 'AUTO').toUpperCase();
    if (mode === 'AUTO') mode = 'RESPONSES';
    if (mode === 'CHAT') return ai_openaiChat_(ctx, this._base(ctx), ctx.model);
    if (!ctx.key) return { error: 'OpenAI: API key set nahi hai' };
    var headers = Object.assign({ 'Content-Type': 'application/json' }, ai_authHeaders_(ctx.key));
    var payload = {
      model: ctx.model, store: false,
      instructions: ctx.system,
      input: this.toInput(ctx.history, ctx.message),
      tools: ai_flatTools_(ctx.tools),
      include: ['reasoning.encrypted_content'],
      max_output_tokens: ctx.maxTokens
      /* temperature JAAN BOOJH kar nahi bheja — reasoning models 400 dete hain */
    };
    var res = ai_http_('post', this._base(ctx) + '/responses', headers, payload);
    if (res.code === 400 && !res.transportError) {
      var bad = ai_unsupportedField_(res.body);
      if (bad && payload[bad] !== undefined) {          /* e.g. tools/params is account par nahi */
        delete payload[bad];
        res = ai_http_('post', this._base(ctx) + '/responses', headers, payload);
      }
    }
    if (res.transportError) return { error: 'OpenAI network error: ' + res.transportError };
    if (ctx.mode === 'AUTO' && (res.code === 404 || (res.code === 400 && /responses.*not supported|unsupported.*responses/i.test(JSON.stringify(res.body))))) {
      return ai_openaiChat_(ctx, this._base(ctx), ctx.model);   /* older accounts: chat API */
    }
    if (res.code !== 200) {
      return { error: 'OpenAI error ' + res.code + ': ' + ((res.body && res.body.error && res.body.error.message) || res.text.substring(0, 160)) };
    }
    return this.fromResponse(res.body);
  },

  verify: function (ctx) {
    if (!ctx.key) return { ok: false, error: 'API key set nahi hai' };
    var r = ai_http_('get', this._base(ctx) + '/models', ai_authHeaders_(ctx.key), null);
    if (r.transportError) return { ok: false, error: 'Network: ' + r.transportError };
    if (r.code === 401 || r.code === 403) return { ok: false, error: 'API key ghalat/restricted (' + r.code + ')' };
    if (r.code >= 300) return { ok: false, error: 'Models list ' + r.code };
    return { ok: true, note: 'key valid (' + ((r.body && r.body.data) || []).length + ' models)' };
  },

  listModels: function (ctx) {
    if (!ctx.key) return { models: null, note: 'Key ke bagair OpenAI list nahi milti' };
    var r = ai_http_('get', this._base(ctx) + '/models', ai_authHeaders_(ctx.key), null);
    if (r.code !== 200) return { models: null, note: 'Models list ' + r.code };
    var pref = U.str(ctx.settings.aiOpenaiPrefixes || 'gpt-,o1-,o3-,o4-,chatgpt').split(',')
      .map(function (x) { return U.str(x).trim().toLowerCase(); }).filter(Boolean);
    var found = [];
    ((r.body && r.body.data) || []).forEach(function (m) {
      var id = U.str(m.id);
      if (pref.length && !pref.some(function (p) { return id.toLowerCase().indexOf(p) === 0; })) return;
      if (/transcribe|tts|dall|embed|moderation|realtime|audio|image|search|computer-use/i.test(id)) return;
      var known = AI.catalog('OPENAI').filter(function (k) { return k.id === id; })[0];
      if (known) { found.push(known); return; }
      found.push({ id: id, label: id,
        status: m.shutdown_date ? 'deprecated' : (/-\d{4}-\d{2}-\d{2}$/.test(id) ? 'snapshot' : 'stable'),
        free: false, note: (m.owned_by || 'openai') });
    });
    return { models: found.length ? found : null };
  }
};

/** shared OpenAI chat/completions round (OPENAI-legacy, OPENROUTER) */
function ai_openaiChat_(ctx, base, model, extraHeaders) {
  var messages = [{ role: 'system', content: ctx.system }]
    .concat(AI._openAIMessages(ctx.history, ctx.message));
  var payload = { model: model, messages: messages, max_tokens: ctx.maxTokens };
  var tools = ai_openTools_(ctx.tools);
  if (tools.length) payload.tools = tools;
  var res = ai_http_('post', base + '/chat/completions',
    Object.assign({ 'Content-Type': 'application/json' }, ai_authHeaders_(ctx.key), extraHeaders || {}), payload);
  if (res.code === 400) {
    var bad = ai_unsupportedField_(res.body);
    if (bad && payload[bad] !== undefined) { delete payload[bad]; res = ai_http_('post', base + '/chat/completions',
      Object.assign({ 'Content-Type': 'application/json' }, ai_authHeaders_(ctx.key), extraHeaders || {}), payload); }
  }
  if (res.transportError) return { error: 'Network error: ' + res.transportError };
  var body = res.body || {};
  if (res.code !== 200) return { error: (ctx.provider || 'OpenAI') + ' error ' + res.code + ': ' +
    ((body.error && (body.error.message || body.error)) || res.text.substring(0, 160)) };
  var msg = (body.choices && body.choices[0] && body.choices[0].message) || {};
  if (msg.tool_calls && msg.tool_calls.length) {
    var tc = msg.tool_calls[0];
    var args = {};
    try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch (e) { }
    return { functionCall: { id: tc.id || ('ha_' + U.uid('c')), name: tc.function.name, args: args } };
  }
  return { text: U.str(msg.content) };
}

/* ============================= OPENROUTER ================================= */
/**
 * Official: OpenAI-COMPATIBLE chat/completions. Model list PUBLIC hai
 * (/api/v1/models) — pricing.prompt==="0" ya ':free' suffix = free.
 * Recommendation docs ke mutabiq attribution headers (HTTP-Referer/X-Title).
 */
AI_ADAPTERS.OPENROUTER = {
  id: 'OPENROUTER',
  meta: {
    label: 'OpenRouter', tagline: 'Ek key, saikron models — free options bhi',
    needsKey: true, keyUrl: 'https://openrouter.ai/keys',
    keyHelp: 'openrouter.ai → Keys → Create. Free models ":free" naam ke sath hote hain.',
    modelSource: 'live (public list — key ke bagair bhi)',
    apiModes: [{ id: 'CHAT', label: 'Chat Completions (OpenAI-compatible)' }],
    caps: { tools: true, freeModels: true, structured: true }
  },

  _base: function (ctx) { return ctx && ctx.endpoint !== undefined ? ctx.endpoint : AI._baseUrl('OPENROUTER'); },
  _attr: function () { return { 'HTTP-Referer': 'https://haseebautos.pk', 'X-Title': 'Haseeb Autos' }; },

  run: function (ctx) {
    if (!ctx.key) return { error: 'OpenRouter: API key set nahi hai' };
    return ai_openaiChat_(ctx, this._base(ctx), ctx.model, this._attr());
  },

  verify: function (ctx) {
    if (!ctx.key) return { ok: false, error: 'API key set nahi hai' };
    var r = ai_http_('get', this._base(ctx) + '/key', ai_authHeaders_(ctx.key), null);
    if (r.transportError) return { ok: false, error: 'Network: ' + r.transportError };
    if (r.code === 401 || r.code === 403) return { ok: false, error: 'OpenRouter key ghalat (' + r.code + ')' };
    if (r.code >= 300) return { ok: false, error: 'Key check ' + r.code };
    var d = (r.body && r.body.data) || {};
    return { ok: true, note: 'key valid' + (d.limit !== undefined && d.limit !== null ? ' · limit $' + d.limit : '') };
  },

  listModels: function (ctx) {
    var r = ai_http_('get', this._base(ctx) + '/models', {}, null);   /* PUBLIC — key nahi chahiye */
    if (r.code !== 200) return { models: null, note: 'Models list ' + r.code };
    var found = [];
    ((r.body && r.body.data) || []).forEach(function (m) {
      var id = U.str(m.id);
      var free = /:free$/.test(id) || (m.pricing && m.pricing.prompt != null && m.pricing.completion != null && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0);
      var supportsTools = !m.supported_parameters || m.supported_parameters.indexOf('tools') > -1;
      found.push({ id: id, label: m.name || id, status: supportsTools ? 'stable' : 'limited',
        free: !!free, ctx: m.context_length || 0,
        note: (supportsTools ? '' : 'no-tools') + (m.pricing ? ' $' + m.pricing.completion + '/out' : '') });
    });
    found.sort(function (a, b) { return (b.free ? 1 : 0) - (a.free ? 1 : 0) || (b.ctx || 0) - (a.ctx || 0); });
    return { models: found.length ? found.slice(0, 150) : null };
  }
};

/* =============================== OLLAMA =================================== */
/**
 * Native /api/chat (docs.ollama.com/api/chat): {model, messages, tools,
 * options:{temperature, num_predict}, stream:false}; tool answer:
 * {role:'tool', content:<json string>}. Models: GET /api/tags.
 * ⚠ Server ka URL Google ke servers se reachable hona chahiye (tunnel).
 */
AI_ADAPTERS.OLLAMA = {
  id: 'OLLAMA',
  meta: {
    label: 'Local / Ollama', tagline: 'Apne model server par — via Apps Script',
    needsKey: false, endpointRequired: true,
    endpointHelp: 'Server ka wo URL jo Google ke servers se reach ho sake (https://…).' +
      ' Ghar ka localhost seedha nahi chalega — tunnel (ngrok/cloudflare) lagayein.',
    modelSource: 'live (server /api/tags)',
    apiModes: [{ id: 'NATIVE', label: 'Native /api/chat' }],
    caps: { tools: true, private: true }
  },

  _base: function (ctx) {
    var b = U.str(ctx.endpoint !== undefined ? ctx.endpoint : AI._baseUrl('OLLAMA')).replace(/\/+$/, '');
    return b.replace(/\/v1$/, '');
  },

  _ollamaMessages: function (ctx) {
    var messages = [{ role: 'system', content: ctx.system }];
    (ctx.history || []).forEach(function (h) {
      if (h.functionCall) {
        messages.push({ role: 'assistant', content: '', tool_calls: [{ function: {
          name: h.functionCall.name, arguments: h.functionCall.args || {} } }] });
      } else if (h.functionResponse) {
        messages.push({ role: 'tool', content: JSON.stringify(h.functionResponse.response).substring(0, 8000) });
      } else {
        messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: U.str(h.text) });
      }
    });
    if (ctx.message) messages.push({ role: 'user', content: ctx.message });
    return messages;
  },

  run: function (ctx) {
    var base = this._base(ctx);
    if (!base || base.indexOf('http') !== 0) {
      return { error: 'Ollama: AI Agent ▸ Setup ke "Server / endpoint" mein poora URL daalein ' +
        '(misal: https://ollama.misalisite.pk) — Google ke servers se reachable hona chahiye.' };
    }
    var payload = { model: ctx.model, stream: false, messages: this._ollamaMessages(ctx),
      options: { temperature: ctx.temp, num_predict: ctx.maxTokens } };
    var tools = ai_openTools_(ctx.tools);
    if (tools.length) payload.tools = tools;
    var r = ai_http_('post', base + '/api/chat',
      Object.assign({ 'Content-Type': 'application/json' }, ai_authHeaders_(ctx.key)), payload);
    if (r.transportError) return { error: 'Ollama network error: ' + r.transportError };
    if (r.code !== 200) return { error: 'Ollama error ' + r.code + ': ' +
      ((r.body && (r.body.error || r.body.message)) || r.text.substring(0, 160)) };
    var msg = (r.body && r.body.message) || {};
    if (msg.tool_calls && msg.tool_calls.length) {
      var tc = msg.tool_calls[0];
      return { functionCall: { id: 'ol_' + U.uid('c'), name: tc.function.name,
        args: tc.function.arguments || {} } };
    }
    return { text: U.str(msg.content).trim() };
  },

  verify: function (ctx) {
    var base = this._base(ctx);
    if (!base || base.indexOf('http') !== 0) return { ok: false, error: 'Endpoint (server URL) set nahi hai' };
    var r = ai_http_('get', base + '/api/tags', ai_authHeaders_(ctx.key), null);
    if (r.transportError) return { ok: false, error: 'Server reachable nahi: ' + r.transportError };
    if (r.code >= 300) return { ok: false, error: '/api/tags ' + r.code };
    var n = ((r.body && r.body.models) || []).length;
    return { ok: true, note: 'server zinda hai · ' + n + ' models installed' };
  },

  listModels: function (ctx) {
    var base = this._base(ctx);
    if (!base || base.indexOf('http') !== 0) {
      return { models: null, note: 'Pehle endpoint URL daalein (https://… — internet se reachable).' };
    }
    var r = ai_http_('get', base + '/api/tags', ai_authHeaders_(ctx.key), null);
    var found = [];
    if (r.code === 200) {
      ((r.body && r.body.models) || []).forEach(function (m) {
        var id = U.str(m.name);
        found.push({ id: id, label: id, status: 'live', free: true,
          note: (m.size ? Math.round(m.size / 1e9 * 10) / 10 + ' GB' : '') });
      });
    }
    if (!found.length) {
      /* OpenAI-compatible endpoint bhi try karo (kuch gateways sirf /v1 kholtay hain) */
      var r2 = ai_http_('get', base + '/v1/models', ai_authHeaders_(ctx.key), null);
      if (r2.code === 200) {
        ((r2.body && r2.body.data) || []).forEach(function (m) {
          found.push({ id: U.str(m.id), label: U.str(m.id), status: 'live', free: true, note: 'via /v1' });
        });
      }
    }
    return found.length ? { models: found } : { models: null,
      note: 'Server se model list nahi aayi — kya koi model `ollama pull` kiya hai?' };
  }
};

/* ================================ MOCK ==================================== */
/** Bina key/Internet — assistant aapke ASLI data par tools chala kar jawab deta hai */
AI_ADAPTERS.MOCK = {
  id: 'MOCK',
  meta: {
    label: 'Mock (built-in)', tagline: 'Bina internet — rule-based, live data par tools',
    needsKey: false,
    help: 'Koi key nahi — sawal poochein, jawab aapke asli data se banega. Demo aur offline test ke liye behtareen.',
    modelSource: 'built-in',
    apiModes: [{ id: 'MOCK', label: 'Built-in rules engine' }],
    caps: { tools: true, offline: true }
  },
  run: function (ctx) { return AI._mock(ctx.message, ctx.s); },
  verify: function () { return { ok: true, note: 'offline engine — hamesha chalta hai' }; },
  listModels: function () { return { models: null }; }   /* catalog se 'mock' entry */
};

/* ============================ helpers for engine =========================== */
/** Mode setting ka naam: GEMINI → aiApiModeGemini ; OPENAI → aiApiModeOpenai */
AI_ADAPTERS._modeKeyFor = function (provider) {
  return provider === 'GEMINI' ? 'aiApiModeGemini' : provider === 'OPENAI' ? 'aiApiModeOpenai' : '';
};
AI_ADAPTERS.modeFor = function (provider, settings) {
  var st = settings || DB.settings();
  var a = AI_ADAPTERS[provider];
  if (!a) return 'AUTO';
  var key = AI_ADAPTERS._modeKeyFor(provider);
  var v = key ? U.str(st[key]) : '';
  if (!v || v === 'AUTO') {
    var modes = (a.meta.apiModes || []);
    if (modes.length === 1) return modes[0].id;   /* OPENROUTER:CHAT, OLLAMA:NATIVE */
    return 'AUTO';
  }
  return v.toUpperCase();
};
