#!/usr/bin/env node
/* ============================================================================
   tools/test_diagnose.js — DEPLOY DIAGNOSTICS GATE (v2.8.2)
   ----------------------------------------------------------------------------
   Wajah: user ko mobile par "Sorry, unable to open the file at present" aaya.
   Wo Google ka multi-account redirect bug hai (code ki ghalti nahi), lekin
   Apps Script editor mein is ki koi wajah nazar nahi aati. Is liye
   Diagnose.gs banaya gaya — dropdown se chalne wale 3 function jo aap ke
   account ki haqeeqat batate hain.

   Ye test un teeno ko ASLI chalata hai (mock sandbox mein) aur ye bhi check
   karta hai ke mobile ke liye /a/~/ aur /a/<star>/ URL variants SAHI bante
   hain — kyunke wahi asal ilaj hai. Agar wo strings toot jayein to ye gate
   pakad lega.
   ========================================================================== */
'use strict';
const { loadBackend } = require('./mock_gs');
const { sandbox } = loadBackend(require('path').join(__dirname, '..', 'apps-script'));
let pass=0, fail=0;
const ok=(n,c,note)=>{ if(c){pass++;console.log('  ✔ '+n+(note?'  → '+note:''));} else {fail++;console.log('  ✘ '+n+(note?'  → '+note:''));} };

console.log('\n=== diagnoseWebApp() ===');
let r=null, err=null;
try { r = sandbox.diagnoseWebApp(); } catch(e){ err=e; }
ok('chalta hai, koi exception nahi', !err, err?err.message:'');
ok('webApp render hua', r && r.webApp && r.webApp.rendered===true, r&&r.webApp?('size '+r.webApp.sizeKB+' KB'):'');
ok('meta tags sirf allowed', r && r.webApp.metaTags.every(n=>['viewport','apple-mobile-web-app-capable','mobile-web-app-capable','google-site-verification'].indexOf(n)!==-1), r&&r.webApp?r.webApp.metaTags.join(', '):'');
ok('saari HTML files maujood', r && r.htmlFiles.missing.length===0, r?('present '+r.htmlFiles.present.length+' · missing '+r.htmlFiles.missing.length):'');
ok('teenon PWA ok', r && r.pwa.wh==='ok' && r.pwa.fo==='ok' && r.pwa.sm==='ok', r?JSON.stringify(r.pwa):'');
ok('advice khali nahi (mashwara milta hai)', r && r.advice.length>0);

console.log('\n=== deploymentUrls() ===');
let u=null; try { u = sandbox.deploymentUrls(); } catch(e){ u={err:e.message}; }
ok('detected URL mila', u && /\/macros\/s\//.test(u.detected||''), u&&u.detected);
ok('/a/~/ variant bana', u && u.mobileUrls && /script\.google\.com\/a\/~\/macros\/s\//.test(u.mobileUrls[0]), u&&u.mobileUrls&&u.mobileUrls[0]);
ok('/a/*/ variant bana', u && u.mobileUrls && /script\.google\.com\/a\/\*\/macros\/s\//.test(u.mobileUrls[1]));
ok('PWA URLs hain', u && u.pwaUrls && u.pwaUrls.warehouse.indexOf('?app=wh')!==-1);
ok('note mein "Anyone" ka mashwara', u && /Anyone/.test(u.note));

console.log('\n=== diagnoseAll() — pehle (koi trigger install nahi) ===');
let a=null; try { a = sandbox.diagnoseAll(); } catch(e){ a={err:e.message}; }
ok('chalta hai', a && !a.err, a&&a.err?a.err:'');
ok('0 triggers par mashwara deta hai', a && Array.isArray(a.triggers) && a.triggers.length===0 && /reinstallTriggers/.test(a.advice||''), a?('triggers='+a.triggers.length):'');

console.log('\n=== setupAll() ke baad (asli tareeqa) ===');
sandbox.setupAll();
let b=null; try { b = sandbox.diagnoseAll(); } catch(e){ b={err:e.message}; }
ok('triggers install ho gaye', b && Array.isArray(b.triggers) && b.triggers.length>0, b?(''+b.triggers.length+' triggers: '+b.triggers.map(t=>t.handler).join(', ')):'');
ok('spreadsheet report aayi', b && b.web && b.web.spreadsheet && b.web.spreadsheet.spreadsheetId, b&&b.web&&b.web.spreadsheet?('id='+b.web.spreadsheet.spreadsheetId+' sheets='+b.web.spreadsheet.sheetCount):'');
ok('web app ab bhi render hota hai', b && b.web && b.web.webApp && b.web.webApp.rendered===true);

/* ---- mobile blank-page ke 2 documented fixes (code side) ---- */
console.log('\n=== mobile blank-page guards ===');
const fs=require('fs'), path=require('path');
const SRC=path.join(__dirname,'..','apps-script');
const styles=fs.readFileSync(path.join(SRC,'Styles.html'),'utf-8');
const code=fs.readFileSync(path.join(SRC,'Code.gs'),'utf-8');
ok('Styles.html mein min-height:100vh hai', /min-height:\s*100d?vh/.test(styles),
   'warna mobile iframe collapse ho kar safaid page dikhata hai');
ok('doGet() ALLOWALL set karta hai', /setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.ALLOWALL\)/.test(code));
const shell=fs.readFileSync(path.join(SRC,'Pwa_Shell.html'),'utf-8');
/* PEHLE ye check kamzor tha (`/min-height/` kahin bhi match kar jata tha) aur
   us ne JHOOTA PASS diya — naapne par teenon PWA pages par computed min-height
   0px nikla. Ab ASLI pattern chahiye: html,body wale rule mein 100vh/100dvh. */
ok('Pwa_Shell ke html,body rule mein 100vh/100dvh guard hai',
   /html\s*,\s*body\s*\{[^}]*min-height:\s*100d?vh[^}]*\}/.test(shell),
   'warna teenon PWA mobile par safaid page dikhati hain');

console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  DEPLOY DIAGNOSTICS   PASS: '+pass+'   FAIL: '+fail);
console.log('══════════════════════════════════════════════════════════════');
process.exit(fail?1:0);
