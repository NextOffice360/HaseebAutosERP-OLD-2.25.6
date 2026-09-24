#!/usr/bin/env python3
"""
Haseeb Autos — Upload Inbox (browser drag & drop -> workspace)
----------------------------------------------------------------
Chat attachments kabhi platform par fail ho jate hain. Ye chhota server
aapke browser se files seedha workspace mein likhta hai:

    /home/user/uploads/                 (upload inbox)
    /home/user/haseeb-autos/uploads/    (project copy — git/push ke liye)

Run:  python3 tools/upload_inbox_server.py            (default port 8033)
      PORT=8033 python3 tools/upload_inbox_server.py
"""
import http.server
import json
import os
import urllib.parse

PORT = int(os.environ.get("PORT", "8033"))
DEST_DIRS = [
    "/home/user/uploads",
    "/home/user/haseeb-autos/uploads",
]
for d in DEST_DIRS:
    os.makedirs(d, exist_ok=True)

PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haseeb Autos — Upload Inbox</title>
<style>
 :root{--bg:#0f1216;--card:#171c22;--line:#2a323c;--tx:#e8edf2;--mut:#93a1b0;--acc:#2f9e6f;--acc2:#1f7fdb;}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,Segoe UI,Roboto,sans-serif;padding:24px}
 .wrap{max-width:820px;margin:0 auto}
 h1{font-size:22px;margin:0 0 4px}
 .sub{color:var(--mut);font-size:14px;margin-bottom:18px}
 .drop{background:var(--card);border:2px dashed var(--line);border-radius:14px;padding:38px 20px;text-align:center;cursor:pointer;transition:.15s}
 .drop.hot{border-color:var(--acc);background:#12211b}
 .drop b{display:block;font-size:18px;margin-bottom:6px}
 .drop small{color:var(--mut)}
 .row{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
 button{background:var(--acc2);color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;cursor:pointer;min-height:48px}
 button.gh{background:#222b35}
 button:disabled{opacity:.5;cursor:default}
 ul{list-style:none;padding:0;margin:14px 0}
 li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;gap:12px;align-items:center}
 li.ok{border-color:#2a6b4d} li.bad{border-color:#8a3b3b}
 .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .sz{color:var(--mut);font-size:13px;flex:none}
 .list{max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px;background:#12171d}
 .list div{padding:6px 8px;border-bottom:1px solid #1e242c;font-size:14px;color:var(--mut)}
 .list div:last-child{border:0}
 .ok-txt{color:var(--acc)} .bad-txt{color:#e07d7d}
</style></head><body><div class="wrap">
 <h1>Haseeb Autos — Upload Inbox</h1>
 <div class="sub">Files yahan drag karein ya click karein. Ye seedha <code>/home/user/uploads/</code> mein save hoti hain (project copy bhi banti hai). / Drag files here or click to pick — they save straight into the workspace uploads folder.</div>

 <div class="drop" id="drop">
   <b>📁 Files yahan chhorein / Drop files here</b>
   <small>PDF · PNG · JPG · TXT · MD · DOCX · XLSX · CSV · ZIP — multiple files OK</small>
 </div>
 <input type="file" id="pick" multiple hidden>

 <div class="row">
   <button id="refresh" class="gh">↻ Uploads list refresh karein</button>
   <button id="clear" class="gh">List clear</button>
 </div>

 <ul id="log"></ul>

 <div class="sub" style="margin:18px 0 6px">Workspace uploads/ mein maujood files:</div>
 <div class="list" id="listing">…</div>
</div>
<script>
const drop=document.getElementById('drop'),pick=document.getElementById('pick');
const log=document.getElementById('log'),listing=document.getElementById('listing');
function human(b){if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(1)+' KB';return (b/1048576).toFixed(2)+' MB';}
function line(name,cls,txt){const li=document.createElement('li');li.className=cls;
 li.innerHTML='<span class="nm">'+name.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</span><span class="sz">'+txt+'</span>';
 log.prepend(li);}
async function refresh(){try{const r=await fetch('list',{cache:'no-store'});const j=await r.json();
 listing.innerHTML=j.files.length?j.files.map(f=>'<div>'+f+'</div>').join(''):'<div>(khaali / empty)</div>';
}catch(e){listing.innerHTML='<div class="bad-txt">list error: '+e.message+'</div>';}}
async function send(file){
 line(file.name,'','… '+human(file.size));
 try{
  const r=await fetch('upload?name='+encodeURIComponent(file.name),{method:'POST',body:file});
  const j=await r.json();
  if(j.ok){line(file.name,'ok','✔ saved '+human(j.bytes));}
  else{line(file.name,'bad','✖ '+j.error);}
 }catch(e){line(file.name,'bad','✖ '+e.message);}
}
async function handle(files){for(const f of files){await send(f);}refresh();}
drop.addEventListener('click',()=>pick.click());
pick.addEventListener('change',()=>{handle(pick.files);pick.value='';});
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('hot');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('hot');}));
drop.addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files)handle(e.dataTransfer.files);});
document.getElementById('refresh').addEventListener('click',refresh);
document.getElementById('clear').addEventListener('click',()=>log.innerHTML='');
refresh();
</script></body></html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "HaseebUploadInbox/1.0"

    def _send(self, code, body: bytes, ctype="application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/list":
            try:
                files = sorted(
                    f for f in os.listdir(DEST_DIRS[0])
                    if os.path.isfile(os.path.join(DEST_DIRS[0], f))
                )
                self._send(200, json.dumps({"files": files}).encode())
            except Exception as e:
                self._send(500, json.dumps({"error": str(e)}).encode())
        elif path == "/health":
            self._send(200, b'{"ok":true}')
        else:
            self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/upload":
            self._send(404, b'{"error":"not found"}')
            return
        q = urllib.parse.parse_qs(u.query)
        raw_name = q.get("name", ["unnamed"])[0]
        name = os.path.basename(raw_name.replace("\\", "/")).strip() or "unnamed"
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 0:
            self._send(400, json.dumps({"error": "empty body"}).encode())
            return
        try:
            data = self.rfile.read(n)
            written = []
            for d in DEST_DIRS:
                os.makedirs(d, exist_ok=True)
                p = os.path.join(d, name)
                with open(p, "wb") as fh:
                    fh.write(data)
                written.append(p)
            print(f"RECV {name} {len(data)} bytes -> {', '.join(written)}", flush=True)
            self._send(200, json.dumps({"ok": True, "name": name, "bytes": len(data)}).encode())
        except Exception as e:
            print(f"ERR {name}: {e}", flush=True)
            self._send(500, json.dumps({"ok": False, "error": str(e)}).encode())

    def log_message(self, fmt, *args):
        print("HTTP " + (fmt % args), flush=True)


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Upload Inbox: http://0.0.0.0:{PORT}/  ->  {', '.join(DEST_DIRS)}", flush=True)
        httpd.serve_forever()
