#!/usr/bin/env node
/* audit_perf_sites.js — W7 audit (v2.26.0)
   GENUINE N+1 sirf woh hai jahan AWAIT loop ke andar ho (sequential round-trips):
     · `for (...) { … await API.call( … ) }`
     · `for (...) { … await API.call( … ) }`  (async IIFE bhi)
     · `.forEach(async … await API.call( … ))`
   `.then(x => x.forEach(…))` ya fire-and-forget parallel chains N+1 NAHI hain — alag ginte hain.
   Backend: `.gs` loops ke andar per-row Sheet/DB ops.
   (Sirf naapta hai — kuch badalta nahi.) */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'), SRC=path.join(ROOT,'apps-script');
const files=fs.readdirSync(SRC).filter(f=>/\.(html|gs)$/.test(f));
const fe=[],fp=[],be=[],waits=[];
for(const f of files){
  const s=fs.readFileSync(path.join(SRC,f),'utf-8');
  /* genuine: await API.call loop ke andar */
  let n=0, lines=[];
  const loopRx=/(?:for\s*\([^)]*\)\s*\{|while\s*\([^)]*\)\s*\{)/g;
  let m;
  while((m=loopRx.exec(s))){
    const body=s.slice(m.index, m.index+300);
    /* marked loops (khud parallel worker) skip — warna false positive */
    const pre=s.slice(Math.max(0,m.index-140), m.index);
    if((body+pre).indexOf('perf-audit: ye N+1 NAHI')>-1) continue;
    if(/await\s+API\.call\(/.test(body)){ n++; if(lines.length<4) lines.push(s.slice(0,m.index).split('\n').length); }
  }
  const feRx=/\.forEach\s*\(\s*async[\s\S]{0,400}?await\s+API\.call\(/g;
  let k=0; while((m=feRx.exec(s))){ k++; if(lines.length<4) lines.push(s.slice(0,m.index).split('\n').length); }
  if(n+k) fe.push({file:f,loops:n,forEachAsync:k,total:n+k,lines});
  /* false-positive style: .then(...forEach) chains (already parallel) */
  const fpRx=/\.then\s*\([^)]*=>[\s\S]{0,200}?\.forEach\(/g;
  let p=0; while((m=fpRx.exec(s))) p++;
  if(p) fp.push({file:f,n:p});
  /* backend per-row ops */
  if(f.endsWith('.gs')){
    /* GENUINE backend N+1 = loop ke andar PER-ROW WRITE (appendRow / setValue / DB.insert|update).
       `.gs` reads in-memory arrays (DB.all) ya cache chunks ko — woh N+1 nahi. */
    const beRx=/(for\s*\([^)]*\)\s*\{|while\s*\([^)]*\)\s*\{)(?:(?!\n\s*\}).){0,700}?(appendRow\(|\.setValue\(|DB\.(insert|update|remove)\(|DB\.upsert\()/gs;
    let b=0, ln=[]; while((m=beRx.exec(s))){ b++; if(ln.length<4) ln.push(s.slice(0,m.index).split('\n').length); }
    if(b) be.push({file:f,n:b,lines:ln});
  }
  const awaits=(s.match(/await\s+/g)||[]).length, pals=(s.match(/Promise\.all\(/g)||[]).length, par=(s.match(/API\.parallel\(/g)||[]).length;
  if(awaits>6) waits.push({file:f,awaits,pals,par});
}
fe.sort((a,b)=>b.total-a.total); be.sort((a,b)=>b.n-a.n); waits.sort((a,b)=>b.awaits-a.awaits);
console.log('\n== GENUINE N+1 (await loop ke andar) ==');
if(!fe.length) console.log('   koi nahi ✔');
fe.slice(0,12).forEach(x=>console.log(`  ${String(x.total).padStart(3)}  ${x.file}  (for:${x.loops} forEach-async:${x.forEachAsync}, lines ~${x.lines.join(',')})`));
console.log('   TOTAL:', fe.reduce((a,b)=>a+b.total,0), 'in', fe.length, 'files');
console.log('\n== already-parallel (.then(...forEach)) — N+1 NAHI ==');
console.log('   files:', fp.length, '· sites:', fp.reduce((a,b)=>a+b.n,0));
console.log('\n== BACKEND loops ke andar per-row Sheet/DB ops ==');
if(!be.length) console.log('   koi nahi ✔');
be.slice(0,10).forEach(x=>console.log(`  ${String(x.n).padStart(3)}  ${x.file}`));
console.log('   TOTAL:', be.reduce((a,b)=>a+b.n,0), 'in', be.length, 'files');
console.log('\n== awaits vs parallel helpers (top) ==');
waits.slice(0,10).forEach(x=>console.log(`  await ${String(x.awaits).padStart(3)} | Promise.all ${String(x.pals).padStart(2)} | API.parallel ${x.par}  ${x.file}`));
fs.writeFileSync(path.join(ROOT,'tmp','perf-sites.json'), JSON.stringify({fe,fp,be,waits},null,1));
console.log('\n(snapshot: tmp/perf-sites.json)');
