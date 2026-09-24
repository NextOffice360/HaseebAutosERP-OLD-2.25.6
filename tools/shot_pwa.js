const path=require('path'),fs=require('fs'),puppeteer=require('puppeteer');
const ROOT=path.join(__dirname,'..');
(async()=>{
 const b=await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox'],defaultViewport:{width:390,height:844,deviceScaleFactor:2}});
 const p=await b.newPage();
 const apps=[['pwa-wh.html','wh','Receive'],['pwa-fo.html','fo','New order'],['pwa-sm.html','sm','My stock']];
 for(const [f,id,tab] of apps){
   await p.goto('file://'+path.join(ROOT,'demo',f),{waitUntil:'load'});
   await new Promise(r=>setTimeout(r,1200));
   const login=await p.evaluate(()=>!!document.querySelector('#pwaBody input[type="password"]'));
   if(login){ await p.evaluate(()=>{try{localStorage.setItem('ha_token','demo-token')}catch(e){}});
              await p.goto('file://'+path.join(ROOT,'demo',f),{waitUntil:'load'});
              await new Promise(r=>setTimeout(r,1600)); }
   await p.evaluate(t=>{const btn=[...document.querySelectorAll('#pwaBar .b')].find(x=>(x.textContent||'').indexOf(t)>-1); if(btn)btn.click();},tab);
   await new Promise(r=>setTimeout(r,700));
   await p.screenshot({path: path.join(ROOT,'release',`pwa-shot-${id}.png`)});
   console.log('shot',id);
 }
 await b.close();
})();
