#!/usr/bin/env node
/* ============================================================================
   tools/test_session.js — SESSION PERSISTENCE GATE (v2.8.4)
   ----------------------------------------------------------------------------
   User report: "webapp flashing on loading through url … ⚠ Session expire ho
   gaya — dobara login karein."

   WAJAH (official docs se tasdeeq shuda — CacheService reference):
     "The data you write to the cache is not guaranteed to persist until its
      expiration time. You must be prepared to get back null from all reads."
   Sessions SIRF CacheService mein thin → Google kabhi bhi evict kar deta →
   agla request SESSION_EXPIRED → app login par flash karti thi.

   HAL: SIGNED STATELESS TOKEN (JWT jaisa) — v2.<base64url(session)>.<hmac>.
   Verify ke liye storage ki zaroorat nahi. Cache sirf revocation ke liye.

   YE TEST: round-trip, CACHE-EVICTION survival, tampered body/signature,
   expiry, ghalat secret, aur logout-revocation — sab check karta hai.
   ========================================================================== */
'use strict';
const { loadBackend } = require('./mock_gs');
const {sandbox,services}=loadBackend(require('path').join(__dirname, '..', 'apps-script'));
let pass=0,fail=0;
const ok=(n,c,note)=>{ if(c){pass++;console.log('  ✔ '+n+(note?'  → '+note:''));} else {fail++;console.log('  ✘ '+n+(note?'  → '+note:''));} };

sandbox.setupAll();
const {Auth}=sandbox;

console.log('\n=== signed token round-trip ===');
const r=Auth.login('owner','admin123','test-device');
ok('login chala, token mila', !!r.token, String(r.token||'').slice(0,22)+'…');
ok('token signed format (v2.body.sig)', /^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(r.token||''));
const s1=Auth.verify(r.token);
ok('verify se wahi session wapas', s1 && s1.userId===r.session.userId, s1?('role='+s1.role):'');
ok('permissions intact', Array.isArray(s1.permissions)&&s1.permissions.length>0, (s1.permissions||[]).length+' perms');

console.log('\n=== CACHE EVICTION SIMULATION (asal bug) ===');
/* Google cache ko evict kar de — official docs: "not guaranteed to persist" */
services.CacheService.getScriptCache().remove('sess:'+r.token);
try{ services.CacheService.getUserCache().remove('sess:'+r.token); }catch(e){}
let survived=true, err='';
try{ const s2=Auth.verify(r.token); survived = !!s2 && s2.userId===r.session.userId; }catch(e){ survived=false; err=e.message; }
ok('cache EVICT hone ke baad bhi session ZINDA hai', survived, err||'survived ✔');

console.log('\n=== tampering / expiry / logout ===');
const parts=r.token.split('.');
const tampered='v2.'+parts[1].slice(0,-2)+'XX.'+parts[2];
let t1=false; try{ Auth.verify(tampered); t1=false; }catch(e){ t1=(e.message==='SESSION_EXPIRED'); }
ok('tampered body reject hua', t1);
const tamperedSig='v2.'+parts[1]+'.'+parts[2].slice(0,-2)+'XX';
let t2=false; try{ Auth.verify(tamperedSig); t2=false; }catch(e){ t2=(e.message==='SESSION_EXPIRED'); }
ok('tampered signature reject hua', t2);

/* expired token banayein */
const sExp=JSON.parse(JSON.stringify(r.session)); sExp.exp=Math.floor(Date.now()/1000)-10;
const b=sandbox.Utilities.base64EncodeWebSafe(sandbox.Utilities.newBlob(JSON.stringify(sExp)).getBytes()).replace(/=+$/,'');
const expTok='v2.'+b+'.'+Auth._hmac(b);
let t3=false; try{ Auth.verify(expTok); t3=false; }catch(e){ t3=(e.message==='SESSION_EXPIRED'); }
ok('expired token reject hua', t3);

/* ghalat secret se bana token */
const b2=sandbox.Utilities.base64EncodeWebSafe(sandbox.Utilities.newBlob(JSON.stringify(r.session)).getBytes()).replace(/=+$/,'');
let t4=false; try{ Auth.verify('v2.'+b2+'.deadbeef'); t4=false; }catch(e){ t4=(e.message==='SESSION_EXPIRED'); }
ok('ghalat signature reject hua', t4);

Auth.logout(r.token);
let t5=false; try{ Auth.verify(r.token); t5=false; }catch(e){ t5=(e.message==='SESSION_EXPIRED'); }
ok('logout ke baad token REVOKED (signed hone ke bawajood)', t5);

console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  SESSION PERSISTENCE   PASS: '+pass+'   FAIL: '+fail);
console.log('══════════════════════════════════════════════════════════════');
process.exit(fail?1:0);
