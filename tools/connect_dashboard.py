#!/usr/bin/env python3
"""
Haseeb Autos — Connect Dashboard (port 8034)
============================================
Do kaam, ek page par:
  1) GITHUB PUSH  — device-code generate karta hai, code page par BARA dikhata hai,
                    aapke authorize karne ke foran baad KHUD push kar deta hai.
                    Code expire ho jaye to naya code khud bana leta hai (koi rukna nahi).
                    Token sirf memory mein rehta hai — disk par kabhi nahi likha jata.
  2) UPLOAD INBOX — files drag & drop -> /home/user/uploads + haseeb-autos/uploads
"""
import http.server
import json
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request

PORT = int(os.environ.get("PORT", "8034"))
REPO_DIR = "/home/user/haseeb-autos"
REPO = "NextOffice360/HaseebAutosERP-OLD-2.25.6"
REPO_URL = f"https://github.com/{REPO}.git"
CLIENT_ID = "178c6fc778ccc68e1d6a"          # GitHub CLI public OAuth client id
SCOPE = "repo"
DEST_DIRS = ["/home/user/uploads", "/home/user/haseeb-autos/uploads"]
for d in DEST_DIRS:
    os.makedirs(d, exist_ok=True)

LOCK = threading.Lock()
STATE = {
    "phase": "starting",          # starting | waiting | approved | pushing | done | failed
    "user_code": "",
    "verify_uri": "https://github.com/login/device",
    "expires_at": 0,
    "message": "Device code banaya ja raha hai…",
    "log": [],
    "refs": [],
    "commit": "",
    "files": "",
    "attempt": 0,
}


def log(line: str):
    with LOCK:
        STATE["log"].append(line)
        del STATE["log"][:-80]
    print(line, flush=True)


def _post(url, payload):
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(payload).encode(),
        headers={"Accept": "application/json", "User-Agent": "haseeb-autos-dashboard"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def _sh(cmd, env=None, timeout=900):
    p = subprocess.run(cmd, cwd=REPO_DIR, env=env, capture_output=True, text=True, timeout=timeout)
    return (p.stdout or "") + (p.stderr or "")


def do_push(token: str):
    with LOCK:
        STATE["phase"] = "pushing"
        STATE["message"] = "Authorize ho gaya — push chal raha hai…"
    log("APPROVED — pushing…")
    try:
        env = dict(os.environ, GITHUB_TOKEN=token)
        out = _sh(["bash", "tools/git_push.sh"], env=env)
    except Exception as e:
        out = f"push exception: {e}"
    out = out.replace(token, "***TOKEN***")
    for ln in out.splitlines():
        log("  " + ln)

    refs = ""
    try:
        refs = _sh(["git", "ls-remote", REPO_URL], timeout=120)
    except Exception as e:
        log(f"ls-remote exception: {e}")
    ref_lines = [l for l in refs.splitlines() if l.strip()]
    ok = any("refs/heads/main" in l for l in ref_lines)

    commit = ""
    files = ""
    try:
        commit = _sh(["git", "log", "--oneline", "-1"], timeout=60).strip()
        files = _sh(["bash", "-lc", "git ls-files | wc -l"], timeout=60).strip()
    except Exception:
        pass

    with LOCK:
        STATE["refs"] = ref_lines[:6]
        STATE["commit"] = commit
        STATE["files"] = files
        if ok:
            STATE["phase"] = "done"
            STATE["message"] = "PUSH COMPLETE — repo par main branch mojood hai."
        else:
            STATE["phase"] = "failed"
            STATE["message"] = "Push fail hua — upar log dekhein (dobara code banane ke liye page refresh karein)."
    log("DONE" if ok else "FAILED")


def device_worker():
    """Code generate karo; expire ho jaye to naya; approve hone par push."""
    while True:
        with LOCK:
            STATE["phase"] = "waiting"
            STATE["attempt"] += 1
            STATE["message"] = "Browser mein code daalein aur Authorize dabayein."
        try:
            resp = _post(
                "https://github.com/login/device/code",
                {"client_id": CLIENT_ID, "scope": SCOPE},
            )
        except Exception as e:
            with LOCK:
                STATE["phase"] = "failed"
                STATE["message"] = f"GitHub se code nahi mila: {e}"
            log(f"device/code error: {e}")
            time.sleep(30)
            continue

        device_code = resp.get("device_code", "")
        user_code = resp.get("user_code", "")
        interval = int(resp.get("interval", 5) or 5)
        expires_in = int(resp.get("expires_in", 900) or 900)
        if not device_code:
            with LOCK:
                STATE["phase"] = "failed"
                STATE["message"] = f"GitHub response: {resp}"
            time.sleep(30)
            continue

        with LOCK:
            STATE["user_code"] = user_code
            STATE["verify_uri"] = resp.get("verification_uri", "https://github.com/login/device")
            STATE["expires_at"] = int(time.time()) + expires_in
        log(f"NEW CODE: {user_code}  (valid {expires_in // 60} min)  ->  {STATE['verify_uri']}")

        deadline = time.time() + expires_in - 10
        approved = False
        while time.time() < deadline:
            time.sleep(interval)
            try:
                tok = _post(
                    "https://github.com/login/oauth/access_token",
                    {
                        "client_id": CLIENT_ID,
                        "device_code": device_code,
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    },
                )
            except Exception as e:
                log(f"poll error: {e}")
                continue
            if tok.get("access_token"):
                approved = True
                break
            err = str(tok.get("error", ""))
            if err in ("expired_token", "access_denied", "incorrect_device_code"):
                log(f"code {user_code} -> {err}")
                break
        if approved:
            do_push(tok["access_token"])
            return
        log(f"code {user_code} expire ho gaya — naya code ban raha hai…")


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "HaseebConnectDashboard/1.0"

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
        p = urllib.parse.urlparse(self.path).path
        if p in ("/", "/index.html"):
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif p == "/status":
            with LOCK:
                s = dict(STATE)
                s["log"] = s["log"][-40:]
            s["now"] = int(time.time())
            self._send(200, json.dumps(s).encode())
        elif p == "/list":
            files = sorted(f for f in os.listdir(DEST_DIRS[0]) if os.path.isfile(os.path.join(DEST_DIRS[0], f)))
            self._send(200, json.dumps({"files": files, "count": len(files)}).encode())
        elif p == "/health":
            with LOCK:
                self._send(200, json.dumps({"ok": True, "phase": STATE["phase"]}).encode())
        else:
            self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/retry":
            threading.Thread(target=device_worker, daemon=True).start()
            self._send(200, b'{"ok":true}')
            return
        if u.path != "/upload":
            self._send(404, b'{"error":"not found"}')
            return
        q = urllib.parse.parse_qs(u.query)
        raw = q.get("name", ["unnamed"])[0]
        name = os.path.basename(raw.replace("\\", "/")).strip() or "unnamed"
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 0:
            self._send(400, json.dumps({"error": "empty body"}).encode())
            return
        try:
            data = self.rfile.read(n)
            for d in DEST_DIRS:
                with open(os.path.join(d, name), "wb") as fh:
                    fh.write(data)
            log(f"RECV {name} ({n} bytes) -> uploads/ (dono copies)")
            self._send(200, json.dumps({"ok": True, "name": name, "bytes": n}).encode())
        except Exception as e:
            self._send(500, json.dumps({"ok": False, "error": str(e)}).encode())

    def log_message(self, fmt, *args):
        pass


PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haseeb Autos — Connect &amp; Upload</title>
<style>
 :root{--bg:#0e1116;--card:#161b22;--line:#2a323c;--tx:#e9eef3;--mut:#92a0af;--grn:#2f9e6f;--blu:#2f81f7;--amb:#d9a441;--red:#d96a6a}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.55 system-ui,Segoe UI,Roboto,sans-serif;padding:20px}
 .wrap{max-width:860px;margin:0 auto}
 h1{font-size:21px;margin:0 0 2px}
 .sub{color:var(--mut);font-size:13.5px;margin:0 0 16px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
 .card h2{font-size:16px;margin:0 0 10px;display:flex;gap:8px;align-items:center}
 .code{font:700 40px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:3px;background:#0b0e13;border:1px dashed var(--line);border-radius:12px;padding:16px;text-align:center;user-select:all;margin:10px 0}
 .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
 button,a.btn{background:var(--blu);color:#fff;border:0;border-radius:10px;padding:13px 18px;font-size:15px;cursor:pointer;min-height:48px;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
 button.gh,a.gh{background:#222b35}
 button:disabled{opacity:.55;cursor:default}
 .pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:600}
 .p-wait{background:#3a2f14;color:var(--amb)} .p-ok{background:#123324;color:#66d19e}
 .p-bad{background:#3a1b1b;color:#f09191} .p-run{background:#12263a;color:#7cb8ff}
 .mono{font-family:ui-monospace,Menlo,monospace;font-size:13px}
 .log{background:#0b0e13;border:1px solid var(--line);border-radius:10px;padding:10px;max-height:230px;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#b7c3cf;white-space:pre-wrap}
 .drop{background:#111722;border:2px dashed var(--line);border-radius:12px;padding:28px 16px;text-align:center;cursor:pointer}
 .drop.hot{border-color:var(--grn);background:#12211b}
 ul{list-style:none;padding:0;margin:12px 0 0}
 li{background:#111722;border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin-bottom:7px;display:flex;justify-content:space-between;gap:10px;font-size:14px}
 li.ok{border-color:#2a6b4d} li.bad{border-color:#8a3b3b}
 .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .sz{color:var(--mut);font-size:12.5px;flex:none}
 .filelist{max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px;background:#0b0e13;font-size:13px;color:var(--mut)}
 .filelist div{padding:5px 7px;border-bottom:1px solid #1c222a}
 .filelist div:last-child{border:0}
 .kv{display:flex;gap:8px;flex-wrap:wrap;font-size:13.5px;color:var(--mut);margin-top:8px}
 .kv b{color:var(--tx);font-weight:600}
</style></head><body><div class="wrap">
 <h1>Haseeb Autos — Connect &amp; Upload</h1>
 <p class="sub">Ye page sandbox ke andar se chal raha hai. (1) GitHub approve karein → push khud ho jayega. (2) Files drag karein → seedha workspace uploads/ mein.</p>

 <div class="card">
   <h2>🔑 GitHub Push <span id="pill" class="pill p-run">…</span></h2>
   <div id="msg" class="sub" style="margin:0 0 6px">…</div>
   <div id="codebox" style="display:none">
     <div class="code" id="code">----</div>
     <div class="row">
       <a class="btn" id="verify" href="https://github.com/login/device" target="_blank" rel="noopener">Open github.com/login/device ↗</a>
       <button class="gh" id="copy">Code copy karein</button>
       <span class="kv" id="ttl"></span>
     </div>
     <div class="kv">Is page ko apne normal browser mein khol kar, ooper wala code GitHub page par daalein → <b>Authorize</b>. Code expire ho jaye to naya khud aa jayega.</div>
   </div>
   <div id="donebox" style="display:none">
     <div class="kv"><span>Remote refs:</span><b id="refs">—</b></div>
     <div class="kv"><span>Commit:</span><b id="commit">—</b></div>
     <div class="kv"><span>Tracked files:</span><b id="files">—</b></div>
   </div>
   <div class="log" id="log" style="margin-top:12px">…</div>
 </div>

 <div class="card">
   <h2>📎 Upload Inbox <span class="pill p-ok" id="ucount">—</span></h2>
   <div class="drop" id="drop"><b>📁 Files yahan chhorein / Drop files here</b><br><small style="color:var(--mut)">PDF · PNG · TXT · MD · DOCX · XLSX · CSV · ZIP — multiple OK</small></div>
   <input type="file" id="pick" multiple hidden>
   <ul id="ulog"></ul>
   <div class="kv" style="margin-top:10px">uploads/ mein maujood files:</div>
   <div class="filelist" id="listing">…</div>
 </div>
</div>
<script>
const $=id=>document.getElementById(id);
let lastPhase='';
function human(b){if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(1)+' KB';return (b/1048576).toFixed(2)+' MB';}
function esc(s){return String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
const PILL={waiting:['p-wait','WAITING FOR YOU'],approved:['p-run','APPROVED'],pushing:['p-run','PUSHING…'],done:['p-ok','PUSHED ✔'],failed:['p-bad','FAILED'],starting:['p-run','STARTING…']};
function render(s){
 const p=PILL[s.phase]||['p-run',s.phase.toUpperCase()];
 $('pill').className='pill '+p[0]; $('pill').textContent=p[1];
 $('msg').textContent=s.message||'';
 const waiting=(s.phase==='waiting'||s.phase==='starting')&&s.user_code;
 $('codebox').style.display=waiting?'block':'none';
 if(waiting){
   $('code').textContent=s.user_code;
   $('verify').href=s.verify_uri||'https://github.com/login/device';
   const left=Math.max(0,(s.expires_at||0)-(s.now||0));
   $('ttl').textContent=left>0?('Code valid: '+Math.floor(left/60)+'m '+(left%60)+'s'):'naya code ban raha hai…';
 }
 if(s.phase==='done'||s.phase==='failed'){
   $('donebox').style.display='block';
   $('refs').textContent=(s.refs&&s.refs.length)?s.refs.join(' · '):'—';
   $('commit').textContent=s.commit||'—';
   $('files').textContent=s.files||'—';
 }
 $('log').textContent=(s.log||[]).join('\\n');
 $('log').scrollTop=$('log').scrollHeight;
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
 }catch(e){line(f.name,'bad','✖ '+e.message);} }
async function handle(files){for(const f of files){await send(f);}refreshList();}
$('drop').addEventListener('click',()=>$('pick').click());
$('pick').addEventListener('change',()=>{handle($('pick').files);$('pick').value='';});
['dragenter','dragover'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.add('hot');}));
['dragleave','drop'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.remove('hot');}));
$('drop').addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files)handle(e.dataTransfer.files);});
$('copy').addEventListener('click',async()=>{const t=$('code').textContent.trim();
 try{await navigator.clipboard.writeText(t);$('copy').textContent='✔ Copied';}
 catch(e){const r=document.createRange();r.selectNodeContents($('code'));const s=getSelection();s.removeAllRanges();s.addRange(r);$('copy').textContent='Select ho gaya — Ctrl+C';}
 setTimeout(()=>$('copy').textContent='Code copy karein',2500);});
setInterval(poll,2000); poll(); refreshList();
</script></body></html>
"""


def main():
    threading.Thread(target=device_worker, daemon=True).start()
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Connect Dashboard: http://0.0.0.0:{PORT}/  ({REPO})", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
