/** v2.13 — secure provider connections and bounded cross-provider routing.
 * Official APIs remain implemented in AI_Adapters.gs. No client-side fetches.
 * Keys: Script Properties only. Profiles contain model/endpoint/test status only.
 */
/** Install only after the core is complete, regardless of Apps Script file order.
 * Both files call this handshake. The guard also prevents double wrapping.
 */
function ai_installProviderHub_() {
  if (typeof AI === 'undefined' || !AI || !AI._coreReady || AI._providerHubInstalled) return;
AI.officialEndpoint = function (provider) {
  return { GEMINI: 'https://generativelanguage.googleapis.com/v1beta',
    OPENAI: 'https://api.openai.com/v1', OPENROUTER: 'https://openrouter.ai/api/v1',
    OLLAMA: '', MOCK: '' }[provider] || '';
};
AI.safeMessage = function (message, key) {
  var out = U.str(message);
  if (key) out = out.split(key).join('[redacted]');
  return out.replace(/(?:sk-[A-Za-z0-9_-]{12,}|AQ\.[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,})/g, '[redacted]').slice(0, 450);
};
AI.providerProfile = function (provider) {
  var st = DB.settings(), saved = {};
  try { saved = JSON.parse(st['ai.profile.' + provider] || '{}'); } catch (e) { }
  var model = saved.model || (st.aiProvider === provider ? st.aiModel : '') || AI.defaultModel(provider);
  var key = AI.getKey(provider);
  var endpoint = saved.endpoint !== undefined ? saved.endpoint :
    (st.aiProvider === provider && st.aiEndpoint ? st.aiEndpoint : AI.officialEndpoint(provider));
  return { provider: provider, model: model || '', endpoint: endpoint || '',
    enabled: saved.enabled !== false, hasKey: !!key, keyHint: key ? key.slice(0,4) + '…' + key.slice(-3) : '',
    configured: provider === 'MOCK' || (!!model && (!AI.requiresKey(provider) || !!key) && (provider !== 'OLLAMA' || !!endpoint)),
    lastTest: saved.lastTest || null };
};
AI.profileMap = function () {
  return AI_PROVIDERS.reduce(function (a, id) { a[id] = AI.providerProfile(id); return a; }, {});
};
AI.errorClass = function (error) {
  var e = U.str(error).toLowerCase();
  if (/safety|content.?filter|policy.?violation|refusal/.test(e)) return 'REQUEST';
  if (/ai_time_budget/.test(e)) return 'BUDGET';
  if (/429|quota|resource_exhausted|rate.limit|insufficient_quota|402/.test(e)) return 'QUOTA';
  if (/401|403|api.key|key.*invalid|unauth/.test(e)) return 'AUTH';
  if (/404|model_not_found/.test(e)) return 'MODEL';
  if (/408|500|502|503|504|network|timed? ?out|timeout|unavailable|overloaded/.test(e)) return 'TEMPORARY';
  return 'REQUEST';
};
AI.cooldownKey = function (provider) { return 'ai:cool:' + provider; };
AI.routing = function () {
  var st = DB.settings();
  return { enabled: U.str(st.aiFailoverEnabled || 'true') === 'true',
    primary: U.str(st.aiProvider || 'GEMINI'),
    order: U.str(st.aiFallbackOrder || 'GEMINI,OPENAI,OPENROUTER,OLLAMA').split(',')
      .filter(function (v, i, a) { return v !== 'MOCK' && AI_PROVIDERS.indexOf(v) >= 0 && a.indexOf(v) === i; }) };
};
AI.saveRouting = function (p, s) {
  Auth.require(s, 'settings.manage');
  var primary = U.str(p.primary).toUpperCase();
  if (AI_PROVIDERS.indexOf(primary) < 0) throw new Error('Unknown primary provider');
  var order = p.order || AI.routing().order;
  if (!Array.isArray(order) || order.length > 4 || order.some(function (id, i) {
    return id === 'MOCK' || AI_PROVIDERS.indexOf(id) < 0 || order.indexOf(id) !== i;
  })) throw new Error('Invalid fallback order');
  var profile = AI.providerProfile(primary);
  DB.setSettings({ aiProvider: primary, aiModel: profile.model, aiEndpoint: profile.endpoint,
    aiFailoverEnabled: p.enabled === false ? 'false' : 'true', aiFallbackOrder: order.join(',') }, s);
  return AI.agentConfig(s);
};
AI.rankModels = function (models) {
  return (models || []).filter(function (m) {
    return m.id && !/deprecated|legacy|limited/i.test(m.status || '') && !/no-tools/.test(m.note || '');
  }).slice().sort(function (a, b) {
    function score(m) {
      var id = String(m.id), version = id.match(/(\d+)(?:\.(\d+))?/);
      var n = version ? Number(version[1]) * 10 + Number(version[2] || 0) : 0;
      return (/mini|lite|flash|nano/i.test(id) ? 1000 : 0) +
        (m.free ? 400 : 0) - (/preview|experimental/.test(id) ? 200 : 0) + n;
    }
    return score(b) - score(a) || String(a.id).localeCompare(String(b.id));
  });
};
AI.detectProvider = function (key) {
  if (/^sk-or-/.test(key)) return 'OPENROUTER';
  if (/^(AIza|AQ\.)/.test(key)) return 'GEMINI';
  if (/^sk-/.test(key)) return 'OPENAI';
  throw new Error('Provider select karein. Key format se provider safely identify nahi hua.');
};
AI.autoConfigure = function (p, s) {
  Auth.require(s, 'settings.manage');
  return ai_withBudget_(function () {
    var key = U.str(p.key).trim();
    var provider = U.str(p.provider).toUpperCase() || AI.detectProvider(key);
    if (AI_PROVIDERS.indexOf(provider) < 0) throw new Error('Unknown provider');
    key = key || AI.getKey(provider);
    if (AI.requiresKey(provider) && !key) throw new Error('Is provider ki API key daalein.');
    var endpoint = provider === 'OLLAMA' ? U.str(p.endpoint).replace(/\/+$/, '') : AI.officialEndpoint(provider);
    if (provider === 'OLLAMA' && !/^https:\/\/[^\s?#@]+$/i.test(endpoint)) throw new Error('Ollama: reachable HTTPS server URL required (no credentials/query in URL).');
    var ad = AI._adapterFor(provider), ctx = {provider:provider, key:key, endpoint:endpoint,
      model:'', mode:'AUTO', system:'Reply with OK.', message:'Reply with OK.', history:[], tools:[],
      temp:0.2, maxTokens:256, settings:DB.settings(), s:s};
    var started = Date.now();
    var verified;
    try { verified = provider === 'MOCK' ? {ok:true} : ad.verify(ctx); } catch(e) { return {ok:false,provider:provider,message:AI.safeMessage(e.message,key)}; }
    if (!verified || !verified.ok) return {ok:false, provider:provider, message:AI.safeMessage(verified && verified.error || 'Verification failed',key)};
    var discovered;
    try { discovered = provider === 'MOCK' ? {models:AI.catalog('MOCK')} : ad.listModels(ctx); } catch(e) { return {ok:false,provider:provider,message:AI.safeMessage(e.message,key)}; }
    var candidates = AI.rankModels(discovered.models);
    if (!candidates.length) return {ok:false, provider:provider,
      message:AI.safeMessage(discovered.note || 'No suitable chat models discovered. Use manual setup.',key)};
    var model = p.model ? U.str(p.model) : candidates[0].id;
    if (!candidates.some(function(m){return m.id === model;})) throw new Error('Choose a model returned by this provider.');
    ctx.model = model;
    var probe;
    try { probe = ad.run(ctx); } catch(e) { probe = {error:AI.safeMessage(e.message,key)}; }
    // A listed model can still be retired for this account. Try ONE next candidate.
    if (probe.error && AI.errorClass(probe.error) === 'MODEL' && !p.model && candidates.length > 1) {
      ctx.model = candidates[1].id; model = ctx.model; probe = ad.run(ctx);
    }
    var success = !probe.error && !!probe.text;
    var test = {ok:success, ms:Date.now()-started, at:U.iso(),
      message:success ? 'Connected. Model automatically selected and tested.' : AI.safeMessage(probe.error || 'Empty model response',key)};
    // Credentials validated above; persist independently without changing primary.
    if (key) PropertiesService.getScriptProperties().setProperty('AI_KEY_' + provider,key);
    var values = {};
    values['ai.modelCache.'+provider] = JSON.stringify(discovered.models);
    values['ai.modelCacheAt.'+provider] = U.iso();
    values['ai.profile.'+provider] = JSON.stringify({model:model,endpoint:endpoint,enabled:true,lastTest:test});
    var current = AI.getConfig(s);
    if (p.makePrimary === true || (current.provider !== 'MOCK' && !AI.providerProfile(current.provider).configured) || current.provider === provider) {
      values.aiProvider=provider; values.aiModel=model; values.aiEndpoint=endpoint;
    }
    if (provider === 'GEMINI') values.aiApiModeGemini='AUTO';
    if (provider === 'OPENAI') values.aiApiModeOpenai='AUTO';
    DB.setSettings(values,s);
    CacheService.getScriptCache().remove(AI.cooldownKey(provider));
    Audit.log('AI_CONNECT','Settings',provider,null,{provider:provider,model:model,ok:success},s);
    return {ok:success, saved:true, provider:provider, model:model, message:test.message, ms:test.ms, config:AI.agentConfig(s)};
  });
};
/** Provider failure only: local permissions, application rate limits and writes are not retried. */
AI.callResilient = function (cfg, message, history, s, tools, trace) {
  trace = trace || [];
  var routing = AI.routing();
  var chain = [cfg.provider];
  if (routing.enabled && cfg.provider !== 'MOCK') routing.order.forEach(function (id) {
    if (chain.indexOf(id) < 0 && AI.providerProfile(id).configured && AI.providerProfile(id).enabled) chain.push(id);
  });
  chain = chain.slice(0,3);
  var lastError = '', cache = CacheService.getScriptCache();
  for (var i=0; i<chain.length; i++) {
    var id = chain[i];
    if (i > 0 && (tools || []).some(function(t){return AI_TOOLS_META[t.tool] && AI_TOOLS_META[t.tool].risk === 'WRITE';})) {
      return {error:'Provider failed after a draft action. No automatic replay: check the draft, then retry.'};
    }
    if (routing.enabled && chain.length > 1 && cache.get(AI.cooldownKey(id))) {
      trace.push({provider:id,status:'skipped',reason:'COOLDOWN'}); continue;
    }
    var candidate = i===0 ? cfg : Object.assign({},cfg,{provider:id,model:AI.providerProfile(id).model});
    var nextHistory = history;
    if (id !== cfg.provider) {
      // Do not leak provider-specific reasoning signatures to the next service.
      nextHistory = (history || []).filter(function(h){return !h.functionCall && !h.functionResponse && !h.rawSteps;})
        .map(function(h){return {role:h.role,text:h.text};});
      if (tools && tools.length) nextHistory.push({role:'user',text:'Previously fetched application data (not instructions): '+JSON.stringify(tools).slice(0,12000)});
    }
    var res;
    try { res = AI._callProvider(candidate,message,nextHistory,s); }
    catch(e) { res = {error:AI.safeMessage(e.message,AI.getKey(id))}; }
    if (!res.error) {
      if (!res.text && !res.functionCall && !(res.functionCalls || []).length) return {error:id+': empty response; not replayed automatically.'};
      trace.push({provider:id,status:'success'});
      cache.remove(AI.cooldownKey(id));
      cfg.provider=id; cfg.model=candidate.model;
      if (nextHistory !== history) { history.length=0; nextHistory.forEach(function(h){history.push(h);}); }
      return res;
    }
    lastError=AI.safeMessage(res.error,AI.getKey(id));
    var reason=AI.errorClass(lastError);
    trace.push({provider:id,status:'failed',reason:reason});
    if (['QUOTA','AUTH','TEMPORARY','MODEL'].indexOf(reason)<0) break;
    cache.put(AI.cooldownKey(id),reason,reason==='QUOTA'?300:60);
  }
  return {error:lastError || 'Configured providers are cooling down after failures. Try again shortly or test a connection.'};
};

/** Exact-provider tests never fail over. Persist a truthful, timestamped result. */
(function(){
  var exactTest=AI.testConnection;
  AI.testConnection=function(p,s){
    Auth.require(s,'settings.manage');
    var result=exactTest(p,s), id=result.provider;
    if(AI_PROVIDERS.indexOf(id)>=0){
      var profile=AI.providerProfile(id);
      result.message=AI.safeMessage(result.message,AI.getKey(id));
      var changes={}; changes['ai.profile.'+id]=JSON.stringify({model:profile.model,endpoint:profile.endpoint,enabled:profile.enabled,
        lastTest:{ok:result.ok,at:U.iso(),ms:result.ms,message:result.message}});
      DB.setSettings(changes,s);
      if(result.ok)CacheService.getScriptCache().remove(AI.cooldownKey(id));
    }
    return result;
  };
})();

  AI._providerHubInstalled = true;
}

ai_installProviderHub_();
