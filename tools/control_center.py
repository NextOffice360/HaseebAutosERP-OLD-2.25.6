#!/usr/bin/env python3
"""
Haseeb Autos — CONTROL CENTER (port 8035)
=========================================
Ek hi page (normal browser tab mein kholein) jahan sab kuch hai:
  1. GitHub push  — live device code (khud refresh hota hai) + authorize link + live log
  2. Downloads    — project bundle (.bundle) + release ZIP, seedha is sandbox se
  3. Upload Inbox — files drag & drop -> /home/user/uploads + haseeb-autos/uploads

Status 8034 (device worker) se server-side proxy hota hai — koi CORS masla nahi.
"""
import http.server
import json
import os
import urllib.parse
import urllib.request

PORT = int(os.environ.get("PORT", "8035"))
UPSTREAM = "http://127.0.0.1:8034"
DEST_DIRS = ["/home/user/uploads", "/home/user/haseeb-autos/uploads"]
BUNDLE = "/tmp/haseeb-autos-v2.29.0.bundle"
ZIP = "/home/user/haseeb-autos/release/haseeb-autos-v2.29.0.zip"
REPO = "NextOffice360/HaseebAutosERP-OLD-2.25.6"
MIRROR = "https://litter.catbox.moe/npagtq.bundle"
for d in DEST_DIRS:
    os.makedirs(d, exist_ok=True)


def fetch_status():
    try:
        with urllib.request.urlopen(UPSTREAM + "/status", timeout=10) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {"phase": "unknown", "message": f"status upstream error: {e}", "log": [], "user_code": ""}


PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haseeb Autos — Control Center</title>
<style>
 :root{--bg:#0e1116;--card:#161b22;--line:#2a323c;--tx:#e9eef3;--mut:#92a0af;--grn:#2f9e6f;--blu:#2f81f7;--amb:#d9a441;--red:#d96a6a}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.55 system-ui,Segoe UI,Roboto,sans-serif;padding:20px}
 .wrap{max-width:880px;margin:0 auto}
 h1{font-size:22px;margin:0 0 2px}
 .sub{color:var(--mut);font-size:13.5px;margin:0 0 16px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
 .card h2{font-size:16.5px;margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
 .code{font:700 42px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:4px;background:#0b0e13;border:2px dashed var(--blu);border-radius:12px;padding:16px;text-align:center;user-select:all;margin:12px 0 6px}
 .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
 button,a.btn{background:var(--blu);color:#fff;border:0;border-radius:10px;padding:13px 18px;font-size:15px;cursor:pointer;min-height:48px;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
 button.gh,a.gh{background:#222b35}
 .pill{display:inline-block;padding:4px 11px;border-radius:999px;font-size:12.5px;font-weight:600}
 .p-wait{background:#3a2f14;color:var(--amb)} .p-ok{background:#123324;color:#66d19e}
 .p-bad{background:#3a1b1b;color:#f09191} .p-run{background:#12263a;color:#7cb8ff}
 .log{background:#0b0e13;border:1px solid var(--line);border-radius:10px;padding:10px;max-height:200px;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#b7c3cf;white-space:pre-wrap}
 .drop{background:#111722;border:2px dashed var(--line);border-radius:12px;padding:26px 16px;text-align:center;cursor:pointer}
 .drop.hot{border-color:var(--grn);background:#12211b}
 ul{list-style:none;padding:0;margin:12px 0 0}
 li{background:#111722;border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin-bottom:7px;display:flex;justify-content:space-between;gap:10px;font-size:14px}
 li.ok{border-color:#2a6b4d} li.bad{border-color:#8a3b3b}
 .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .sz{color:var(--mut);font-size:12.5px;flex:none}
 .filelist{max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px;background:#0b0e13;font-size:13px;color:var(--mut)}
 .filelist div{padding:5px 7px;border-bottom:1px solid #1c222a} .filelist div:last-child{border:0}
 .kv{color:var(--mut);font-size:13.5px}
 .kv b{color:var(--tx)}
 .flex{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
</style></head><body><div class="wrap">
 <h1>Haseeb Autos — Control Center</h1>
 <p class="sub">Repo: """ + REPO + """ · commit 9b41980 · 395 files. Neeche sirf 2 kaam hain.</p>

 <div class="card">
  <h2>STEP 1 — GitHub push <span id="pill" class="pill p-run">…</span></h2>
  <div class="kv" id="msg" style="margin-bottom:6px">…</div>
  <div id="codebox" style="display:none">
    <div class="code" id="code">----</div>
    <div class="flex">
      <div>
        <div class="row">
          <a class="btn" href="https://github.com/login/device" target="_blank" rel="noopener">1. github.com/login/device kholein ↗</a>
          <button class="gh" id="copy">2. Code copy karein</button>
        </div>
        <div class="kv" style="margin-top:8px">Phir <b>Authorize</b> dabayein — push khud-ba-khud shuru ho jayega. <span id="ttl"></span></div>
      </div>
      <img src="/qr.png" alt="QR: github.com/login/device" style="width:150px;height:150px;background:#fff;border-radius:10px;padding:6px">
    </div>
    <div class="kv" style="margin-top:8px">QR phone se scan karke bhi code daal sakte hain. Screen par "GitHub CLI" aayega — GitHub ka official app hai; koi token share nahi hota.</div>
  </div>
  <div id="donebox" style="display:none">
    <div class="kv">Remote refs: <b id="refs">—</b></div>
    <div class="kv">Commit: <b id="commit">—</b></div>
    <div class="kv">Tracked files: <b id="files">—</b></div>
  </div>
  <div class="log" id="log" style="margin-top:12px">…</div>
 </div>

 <div class="card">
  <h2>STEP 2 — Files upload (chat attach kaam na kare to)</h2>
  <div class="drop" id="drop"><b>📁 Files yahan chhorein / Drop files here</b><br><small style="color:var(--mut)">PDF · PNG · TXT · MD · DOCX · XLSX · CSV · ZIP — multiple OK · seedha workspace uploads/ mein jati hain</small></div>
  <input type="file" id="pick" multiple hidden>
  <ul id="ulog"></ul>
  <div class="kv" style="margin-top:10px">uploads/ mein maujood: <span id="ucount" class="pill p-ok">—</span></div>
  <div class="filelist" id="listing">…</div>
 </div>

 <div class="card">
  <h2>Backup — apni machine se push karna ho to</h2>
  <div class="row">
    <a class="btn gh" href="/download/bundle">⬇ Project bundle (47 MB, git)</a>
    <a class="btn gh" href="/download/zip">⬇ Release ZIP v2.29.0 (6 MB)</a>
    <a class="btn gh" href=""" + '"' + MIRROR + '"' + """>⬇ Bundle mirror (72h)</a>
  </div>
  <div class="kv" style="margin-top:10px"><b>Bundle se push:</b> <code>git clone haseeb-autos-v2.29.0.bundle haseeb-autos</code> → <code>cd haseeb-autos</code> → <code>git push -u origin main</code><br>
  <b>ZIP:</b> unzip → <code>git init -b main &amp;&amp; git add -A &amp;&amp; git commit -m "v2.29.0"</code> → <code>git remote add origin https://github.com/""" + REPO + """.git</code> → <code>git push -u origin main</code></div>
 </div>
</div>
<script>
const $=id=>document.getElementById(id);
let lastPhase='';
function esc(s){return String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
function human(b){if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(1)+' KB';return (b/1048576).toFixed(2)+' MB';}
const PILL={waiting:['p-wait','WAITING FOR YOU'],approved:['p-run','APPROVED'],pushing:['p-run','PUSHING…'],done:['p-ok','PUSHED ✔'],failed:['p-bad','FAILED'],starting:['p-run','STARTING…'],unknown:['p-bad','STATUS?']};
function render(s){
 const p=PILL[s.phase]||['p-run',String(s.phase).toUpperCase()];
 $('pill').className='pill '+p[0]; $('pill').textContent=p[1];
 $('msg').textContent=s.message||'';
 const waiting=(s.phase==='waiting'||s.phase==='starting')&&s.user_code;
 $('codebox').style.display=waiting?'block':'none';
 if(waiting){
   $('code').textContent=s.user_code;
   const left=Math.max(0,(s.expires_at||0)-(s.now||0));
   $('ttl').textContent=left>0?('⏳ Code valid: '+Math.floor(left/60)+'m '+(left%60)+'s'):'naya code ban raha hai…';
 }
 if(s.phase==='done'||s.phase==='failed'){
   $('donebox').style.display='block';
   $('refs').textContent=(s.refs&&s.refs.length)?s.refs.join(' · '):'—';
   $('commit').textContent=s.commit||'—'; $('files').textContent=s.files||'—';
 }
 $('log').textContent=(s.log||[]).join('\\n'); $('log').scrollTop=$('log').scrollHeight;
 if(s.phase!==lastPhase){lastPhase=s.phase;refreshList();}
}
async function poll(){try{const r=await fetch('status',{cache:'no-store'});render(await r.json());}catch(e){$('msg').textContent='status error: '+e.message;}}
async function refreshList(){try{const r=await fetch('list',{cache:'no-store'});const j=await r.json();
 $('ucount').textContent=j.count+' files'; $('listing').innerHTML=j.files.length?j.files.map(f=>'<div>'+esc(f)+'</div>').join(''):'<div>(khaali / empty)</div>';
}catch(e){$('listing').textContent='list error: '+e.message;}}
function line(name,cls,txt){const li=document.createElement('li');li.className=cls;
 li.innerHTML='<span class="nm">'+esc(name)+'</span><span class="sz">'+txt+'</span>'; $('ulog').prepend(li);}
async function send(f){line(f.name,'','… '+human(f.size));
 try{const r=await fetch('upload?name='+encodeURIComponent(f.name),{method:'POST',body:f});const j=await r.json();
  if(j.ok){line(f.name,'ok','✔ '+human(j.bytes));}else{line(f.name,'bad','✖ '+j.error);}
 }catch(e){line(f.name,'bad','✖ '+e.message);}}
async function handle(files){for(const f of files){await send(f);}refreshList();}
$('drop').addEventListener('click',()=>$('pick').click());
$('pick').addEventListener('change',()=>{handle($('pick').files);$('pick').value='';});
['dragenter','dragover'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.add('hot');}));
['dragleave','drop'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.remove('hot');}));
$('drop').addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files)handle(e.dataTransfer.files);});
$('copy').addEventListener('click',async()=>{const t=$('code').textContent.trim();
 try{await navigator.clipboard.writeText(t);$('copy').textContent='✔ Copied';}
 catch(e){const r=document.createRange();r.selectNodeContents($('code'));const s=getSelection();s.removeAllRanges();s.addRange(r);$('copy').textContent='Select — Ctrl+C';}
 setTimeout(()=>$('copy').textContent='2. Code copy karein',2500);});
setInterval(poll,2000); poll(); refreshList();
</script></body></html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "HaseebControlCenter/1.0"

    def _bytes(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def _file(self, path, filename):
        if not os.path.isfile(path):
            self._bytes(404, b'{"error":"file missing"}')
            return
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(size))
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            with open(path, "rb") as fh:
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except BrokenPipeError:
            pass

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p in ("/", "/index.html"):
            self._bytes(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif p == "/status":
            self._bytes(200, json.dumps(fetch_status()).encode())
        elif p == "/list":
            files = sorted(f for f in os.listdir(DEST_DIRS[0]) if os.path.isfile(os.path.join(DEST_DIRS[0], f)))
            self._bytes(200, json.dumps({"files": files, "count": len(files)}).encode())
        elif p == "/qr.png":
            try:
                with open("/tmp/qr_device.png", "rb") as fh:
                    self._bytes(200, fh.read(), "image/png")
            except Exception:
                self._bytes(404, b'{"error":"no qr"}')
        elif p == "/download/bundle":
            self._file(BUNDLE, "haseeb-autos-v2.29.0.bundle")
        elif p == "/download/zip":
            self._file(ZIP, "haseeb-autos-v2.29.0.zip")
        elif p == "/health":
            self._bytes(200, b'{"ok":true}')
        else:
            self._bytes(404, b'{"error":"not found"}')

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/upload":
            self._bytes(404, b'{"error":"not found"}')
            return
        q = urllib.parse.parse_qs(u.query)
        raw = q.get("name", ["unnamed"])[0]
        name = os.path.basename(raw.replace("\\", "/")).strip() or "unnamed"
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 0:
            self._bytes(400, json.dumps({"error": "empty body"}).encode())
            return
        try:
            data = self.rfile.read(n)
            for d in DEST_DIRS:
                with open(os.path.join(d, name), "wb") as fh:
                    fh.write(data)
            print(f"RECV {name} ({n} bytes)", flush=True)
            self._bytes(200, json.dumps({"ok": True, "name": name, "bytes": n}).encode())
        except Exception as e:
            self._bytes(500, json.dumps({"ok": False, "error": str(e)}).encode())

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Control Center: http://0.0.0.0:{PORT}/", flush=True)
        httpd.serve_forever()
