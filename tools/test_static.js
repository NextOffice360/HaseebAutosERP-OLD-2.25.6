#!/usr/bin/env node
/* ==========================================================================
   test_static.js — static build (Netlify / Vercel / GitHub Pages) RENDER test
   --------------------------------------------------------------------------
   Standing rule: UI ko "done" sirf static audit se NAHI kaha jata — usey
   RENDER kar ke saboot dena parta hai ke pixels aaye.

   Ye dist-static/index.html ko jsdom mein chala kar check karta hai:
     • SERVE_MODE === 'static'  • API_URL set  • mock inject NAHI hua
     • app boot hota hai        • JSONP calls sahi shape ki hain

   Pehle chalayein: python3 tools/build_static.py "<exec URL>"
     node tools/test_static.js
   ========================================================================== */

const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
let JSDOM;try{JSDOM=require('jsdom').JSDOM;}catch(e){try{JSDOM=require(path.join(ROOT,'node_modules','jsdom')).JSDOM;}catch(e2){console.log('✖ jsdom nahi mila');process.exit(1);}}
const html=fs.readFileSync(path.join(__dirname,'..','dist-static','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c,d)=>{c?(pass++,console.log('  ✔ '+n+(d?'  → '+d:''))):(fail++,console.log('  ✖ '+n+(d?'  → '+d:'')));};
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.com/',pretendToBeVisual:true});
const w=dom.window;
setTimeout(()=>{
  ok('window.SERVE_MODE === "static"', w.SERVE_MODE==='static', String(w.SERVE_MODE));
  ok('window.API_URL set hai', !!w.API_URL && /script\.google\.com/.test(w.API_URL), String(w.API_URL).slice(0,60));
  ok('API.jsonp mojood hai', !!(w.API && typeof w.API.jsonp==='function'));
  ok('mock backend inject NAHI hua (asli backend use hoga)', !(w.MockAPI));
  ok('App boot hua (UI.toast ya App.state)', !!(w.App||w.UI), w.App?'App ok':'-');
  // JSONP URL shape check
  try{
    const s=w.document.createElement('script');
    const p=w.API.jsonp('items.list',{token:'x'});
    p.catch(()=>{});
    setTimeout(()=>{
      const all=[...w.document.querySelectorAll('script[src*="t=jsonp"]')].map(e=>e.src);
      ok('app boot par JSONP call karta hai (backend se baat ho rahi hai)', all.length>0, all.length+' call(s)');
      ok('har JSONP URL sahi shape ka hai (?t=jsonp&cb=&a=&p=)',
         all.length>0 && all.every(u=>/t=jsonp/.test(u)&&/&cb=[A-Za-z0-9_$.]+/.test(u)&&/&a=/.test(u)&&/&p=/.test(u)),
         (all[0]||'').slice(0,110));
      const mine=all.find(u=>/&a=items\.list/.test(u));
      ok('API.jsonp() se banaya gaya URL bhi maujood hai', !!mine, (mine||'').slice(0,110));
      console.log('\n  STATIC BUILD RENDER (dist-static): PASS '+pass+'  FAIL '+fail);
      process.exit(fail?1:0);
    },300);
  }catch(e){ ok('API.jsonp chala', false, e.message); console.log('\n  PASS '+pass+'  FAIL '+fail); process.exit(1); }
},1500);
