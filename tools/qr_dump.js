const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/user/haseeb-autos/apps-script/App_QR.html','utf-8');
const code=/<script>([\s\S]*?)<\/script>/.exec(html)[1];
const sandbox={console, unescape, encodeURIComponent, btoa:s=>Buffer.from(s,'binary').toString('base64'), Math, Array, Object, String, Number, Error};
sandbox.window=sandbox;
vm.createContext(sandbox); vm.runInContext(code, sandbox);
const QR2=sandbox.QR2;
const tests=['HELLO','FL00000','https://haseeb.test/i/FL00001','INV-SDQ-01001|5440.50|2026-09-15','حسیب آٹوز','A'.repeat(80)];
const out=[];
for(const t of tests){
  const auto=QR2.matrix(t,'L');
  const rec={text:t, autoVersion:(auto.length-17)/4, autoMask:auto.mask, masks:{}};
  for(let m=0;m<8;m++){ rec.masks[m]=QR2.matrix(t,'L',m).map(r=>r.join('')); }
  out.push(rec);
}
fs.writeFileSync('/tmp/qr_js.json', JSON.stringify(out));
console.log('wrote', out.length, 'records; auto versions:', out.map(r=>r.autoVersion+'/mask'+r.autoMask).join(' '));
