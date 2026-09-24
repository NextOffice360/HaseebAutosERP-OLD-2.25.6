#!/usr/bin/env python3
"""
Haseeb Autos — PWA demo builder
------------------------------------------------------------------
apps-script/Pwa_{Warehouse,Field,Salesman}.html ko resolve kar ke teen
self-contained demo pages banata hai:

    python3 tools/build_pwa_demo.py

Output:
    demo/pwa-wh.html   — Warehouse PWA
    demo/pwa-fo.html   — Field Orders PWA
    demo/pwa-sm.html   — Salesman PWA

Data ASLI backend se aata hai (tools/gen_pwa_data.js → Pwa.bootstrap()),
to preview aur production mein koi farq nahi.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "apps-script"
OUT = ROOT / "demo"
DATA = ROOT / "tools" / "pwa-demo-data.json"

APPS = [
    ("wh", "Pwa_Warehouse", "pwa-wh.html"),
    ("fo", "Pwa_Field", "pwa-fo.html"),
    ("sm", "Pwa_Salesman", "pwa-sm.html"),
    ("pos", "Pwa_POS", "pwa-pos.html"),
]

INCLUDE_RE = re.compile(r"<\?!=\s*include\('([^']+)'\)\s*;?\s*\?>")
PRINT_RE = re.compile(r"<\?=\s*([A-Za-z0-9_]+)\s*\?\>")
SCRIPTLET_RE = re.compile(r"<\?[\s\S]*?\?>")
# <?!= expr ?> — force print (include ke ilawa). v2.8.1 mein extraMetaJson aaya;
# isay resolve karna zaroori hai warna test_pwa_ui.js "unresolved template tags"
# par fail hota hai aur page ki JS toot jati hai.
FORCE_RE = re.compile(r"<\?!=\s*([^?]*?)\s*\?>")


def backend_version() -> str:
    try:
        src = (SRC / "Utils.gs").read_text(encoding="utf-8")
        m = re.search(r"VERSION\s*:\s*['\"]([^'\"]+)['\"]", src)
        if m:
            return m.group(1)
    except Exception:
        pass
    return "0.0.0"


def icons() -> dict:
    """Pwa_Icons.gs se base64 icons nikal kar data URI banao."""
    out = {}
    try:
        txt = (SRC / "Pwa_Icons.gs").read_text(encoding="utf-8")
        for key in ("i192", "i512"):
            m = re.search(r"%s:\s*'([^']+)'" % key, txt)
            if m:
                out[key] = m.group(1)
    except Exception:
        pass
    return out


def render(text: str, values: dict, depth: int = 0, icons_map: dict = None) -> str:
    if depth > 5:
        return text

    def repl(m):
        f = SRC / f"{m.group(1)}.html"
        if not f.exists():
            return f"<!-- MISSING INCLUDE: {m.group(1)} -->"
        return render(f.read_text(encoding="utf-8"), values, depth + 1, icons_map)

    text = INCLUDE_RE.sub(repl, text)
    # <?!= PWA_ICONS.i192 ?>  (data URI, already quoted in template)
    if icons_map:
        for k, v in icons_map.items():
            text = text.replace("<?!= PWA_ICONS.%s ?>" % k, v)
    text = PRINT_RE.sub(lambda m: values.get(m.group(1), ""), text)

    # <?!= expr ?> → values se; jo na mile uski jagah khaali JS string
    def frepl(m):
        expr = m.group(1).strip()
        v = values.get(expr)
        if v is None:
            return "''"
        return v

    text = FORCE_RE.sub(frepl, text)
    return text


MOCK_BRIDGE = r"""
<!-- =========================================================================
     PWA DEMO BRIDGE (preview only)
     Asli deployment mein ye nahi hota — wahan google.script.run asli backend
     se baat karta hai. Yahan hum wahi Pwa.bootstrap() ka data de rahe hain jo
     ASLI backend se nikala gaya hai (tools/gen_pwa_data.js), aur mutations
     memory mein simulate karte hain taake UI asli tarah chale.
     ========================================================================= -->
<script>
window.__PWA_DEMO__ = true;
window.__PWA_BOOTSTRAP__ = __BOOTSTRAP_JSON__;

(function () {
  /* Sandboxed iframe (preview) mein localStorage block hota hai —
     tab PWA boot na ho sake to preview bekaar. Is liye memory fallback. */
  try {
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
  } catch (e) {
    var mem = {};
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
          setItem: function (k, v) { mem[k] = String(v); },
          removeItem: function (k) { delete mem[k]; },
          clear: function () { mem = {}; }
        }
      });
    } catch (e2) { }
  }

  /* token pehle hi set kar do — warna login screen aayegi */
  try {
    if (!localStorage.getItem('ha_token')) {
      localStorage.setItem('ha_token', 'demo-token');
      localStorage.setItem('ha_user', JSON.stringify({ id: 'demo', name: 'Demo User', role: 'OWNER' }));
    }
  } catch (e) { }

  var SEQ = 1000;
  function ok(data) { return { ok: true, data: data }; }
  function fail(msg) { return { ok: false, error: { message: msg } }; }

  var HANDLERS = {
    'pwa.bootstrap': function (p) {
      var d = window.__PWA_BOOTSTRAP__[(p && p.app) || 'wh'];
      if (!d) return fail('Demo data nahi mila');
      return ok(JSON.parse(JSON.stringify(d)));
    },
    'pwa.wh.receive': function (p) { return ok({ ok: true, grnNo: 'GRN-SDQ-0' + (++SEQ), id: 'GRN-DEMO', poId: p&&p.poId||'' }); },
    'pwa.wh.putaway': function () { return ok({ ok: true, result: { moved: 1 } }); },
    'pwa.wh.transfer': function () { return ok({ ok: true, result: { moved: 1 } }); },
    'pwa.wh.count': function (p) { return ok({ ok: true, result: { qty: p.qty }, lineId: 'CNT-L', code: 'DEMO' }); },
    'pwa.wh.po.get': function(p){ var id=(p&&p.id)||(p&&p.poId)||''; var map=window.__PWA_BOOTSTRAP__.wh && window.__PWA_BOOTSTRAP__.wh.poMap; var r=map&&map[id]; if(r) return ok(JSON.parse(JSON.stringify(r))); var items=(window.__PWA_BOOTSTRAP__.wh && window.__PWA_BOOTSTRAP__.wh.items||[]).slice(0,3); if(!items.length) return fail('PO not found'); return ok({id:id, poNo:'PO-DEMO-'+String(id).slice(-4), date:new Date().toISOString().slice(0,10), status:'APPROVED', supplier:{name:'Demo Supplier'}, supplierName:'Demo Supplier', items: items.map(function(it){return {itemId:it.id, code:it.code, name:it.name, qty:10, rate:Number(it.cost||100), cost:Number(it.cost||100), receivedQty:0, pendingQty:10, discount:0};}), subtotal:0, total:0}); },
    'pwa.wh.count.get': function(p){ var id=(p&&p.id)||(p&&p.sheetId)||''; var map=window.__PWA_BOOTSTRAP__.wh && window.__PWA_BOOTSTRAP__.wh.countMap; var r=map&&map[id]; if(r) return ok(JSON.parse(JSON.stringify(r))); var items=(window.__PWA_BOOTSTRAP__.wh && window.__PWA_BOOTSTRAP__.wh.items||[]).slice(0,6); var lines=items.map(function(it,i){return {id:'CL-'+i, sheetId:id, itemId:it.id, code:it.code, name:it.name, binId:'', binCode:'A-0'+(i+1), systemQty:18+ (i*2), countedQty:'', diff:0, avgCost:Number(it.cost||0), varianceValue:0};}); return ok({sheet:{id:id, sheetNo:'CNT-DEMO-'+String(id).slice(-4), date:new Date().toISOString().slice(0,10), status:'DRAFT', scope:'demo — all stock', locationId:'LOC-SDQ', lines:lines.length}, lines:lines, progress:{total:lines.length,counted:0,pending:lines.length, diffLines:0, over:0, short:0, varianceValue:0, pct:0}}); },
    'pwa.wh.audit': function(){ var wh=window.__PWA_BOOTSTRAP__.wh; return ok(wh.audit || {sheets:1, posted:0, open:1, lines:6, counted:0, matched:0, diffLines:0, accuracy:0, varianceValue:0}); },
    'pwa.fo.order': function (p) {
      return ok({ ok: true, id: 'ORD-DEMO-' + (++SEQ), orderNo: 'ORD-SDQ-0' + (++SEQ),
                  total: (p.items || []).reduce(function (a, l) { return a + l.qty * l.price; }, 0) });
    },
    'pwa.sm.sell': function () { return ok({ ok: true, id: 'SAL-DEMO', invoiceNo: 'INV-SDQ-0' + (++SEQ) }); },
    'pwa.sm.collect': function (p) { return ok({ ok: true, result: { voucherNo: 'RV-0' + (++SEQ), amount: p.amount } }); },
    'pwa.pos.sell': function (p) { return ok({ ok: true, id: 'SAL-POS-' + (++SEQ), invoiceNo: 'POS-0' + (++SEQ), total: (p.items||[]).reduce(function(a,l){return a+l.qty*l.price;},0) }); },
    /* v2.27.0 — asli backend ke routes (Code.gs: parties.balance / parties.customerHistory)
       demo mein bhi mojood, warna PWA ki balance/history lines chup chaap gayab rehti thin. */
    'parties.balance': function (p) {
      var id = (p && (p.id || p.partyId)) || '';
      var list = (window.__PWA_BOOTSTRAP__ && window.__PWA_BOOTSTRAP__.customers) || [];
      var c = list.filter(function (x) { return x.id === id; })[0] || {};
      return ok({ balance: Number(c.bal || 0), creditLimit: Number(c.creditLimit || 0) });
    },
    'parties.customerHistory': function (p) {
      var id = (p && p.customerId) || '';
      var list = (window.__PWA_BOOTSTRAP__ && window.__PWA_BOOTSTRAP__.customers) || [];
      var c = list.filter(function (x) { return x.id === id; })[0] || {};
      return ok({ recentSales: [], credit: { rating: 4, limit: Number(c.creditLimit || 0) }, balance: Number(c.bal || 0) });
    },
    'pwa.sync': function (p) {
      var q = (p && p.queue) || [];
      return ok({ ok: true, synced: q.length, failed: 0,
                  results: q.map(function (i) { return { clientId: i.clientId, ok: true }; }) });
    }
  };

  function api(req) {
    window.__API_CALLS__ = (window.__API_CALLS__ || 0) + 1;
    window.__LAST_REQ__ = req;
    var h = HANDLERS[req.action];
    if (!h) return fail('Demo mein ye action nahi hai: ' + req.action);
    try { return h(req.payload || {}); } catch (e) { return fail(e.message); }
  }

  /* PWA.call() google.script.run dhoondhta hai — wahi faraham karte hain */
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  /* handlers closure mein — `this` par depend nahi (apply/call se bhi chalega) */
  var _ok = null, _err = null;
  var runner = {
    withSuccessHandler: function (fn) { _ok = fn; return runner; },
    withFailureHandler: function (fn) { _err = fn; return runner; },
    api: function (req) {
      setTimeout(function () {
        var r = api(req);
        if (r.ok && _ok) _ok(r);
        else if (!r.ok && _err) _err(new Error(r.error.message));
      }, 120);
    }
  };
  window.google.script.run = runner;
})();
</script>
"""


def main() -> int:
    if not DATA.exists():
        print("  (pwa-demo-data.json nahi mila — generate kar raha hoon)")
        r = subprocess.run([sys.executable and "node", str(ROOT / "tools" / "gen_pwa_data.js")],
                           cwd=str(ROOT), capture_output=True, text=True)
        if r.returncode != 0:
            print("  ✖ gen_pwa_data.js failed:", (r.stderr or "")[:200])
            return 1
        DATA.write_text(r.stdout, encoding="utf-8")

    data = json.loads(DATA.read_text(encoding="utf-8"))
    # slim for srcdoc preview — 422 items → 725KB breaks workspace file-viewer (srcdoc limit)
    # Senior POS at 20 items → 165KB still breaks preview (limit ~120KB) — slim POS more
    try:
        for _app_id, _app in list(data.get("apps", {}).items()):
            if isinstance(_app, dict) and isinstance(_app.get("items"), list):
                # POS gets 10 items for preview (saves ~10KB), others 15
                keep = 10 if _app_id == 'pos' else 15
                if len(_app["items"]) > keep:
                    _app["items"] = _app["items"][:keep]
                if isinstance(_app.get("cats"), list) and len(_app["cats"]) > 12:
                    _app["cats"] = _app["cats"][:12]
                # recent sales is heavy (40) — slim to 5 for POS preview
                if _app_id == 'pos' and isinstance(_app.get("recent"), list) and len(_app["recent"]) > 5:
                    _app["recent"] = _app["recent"][:5]
    except Exception:
        pass
    icons_map = icons()
    ver = backend_version()
    OUT.mkdir(parents=True, exist_ok=True)

    banner = ("<!--\n  HASEEB AUTOS — PWA demo build (preview).\n"
              "  Generated by tools/build_pwa_demo.py — DO NOT EDIT (edit apps-script/Pwa_*.html).\n-->")

    for app_id, tpl, out_name in APPS:
        src = SRC / f"{tpl}.html"
        if not src.exists():
            print(f"  ✖ missing {src.name}")
            return 1

        cfg = data["apps"].get(app_id) or {}
        meta = {
            "wh": ("Haseeb Autos — Warehouse", "🏬"),
            "fo": ("Haseeb Autos — Field Orders", "🧾"),
            "sm": ("Haseeb Autos — Salesman", "🚚"),
            "pos": ("Haseeb Autos — POS", "🧾"),
        }[app_id]

        # wahi meta tags jo Pwa.serve() server se bhejta hai (v2.8.1)
        extra_meta = {
            "theme-color": cfg.get("theme") or "#f59e0b",
            "apple-mobile-web-app-title": cfg.get("shortName") or meta[0],
            "apple-mobile-web-app-status-bar-style": "black-translucent",
            "description": cfg.get("desc") or meta[0],
        }

        html = render(src.read_text(encoding="utf-8"),
                      {"title": meta[0] + " (Demo)", "appVersion": ver + "-demo",
                       "appId": app_id, "appName": meta[0], "serveMode": "demo", "apiUrl": "",
                       "extraMetaJson": json.dumps(extra_meta).replace("<", "\\u003c")},
                      icons_map=icons_map)

        # embed only this app (plus tiny wh stub for handlers that touch wh) — keeps file <250KB for preview srcdoc
        single = {app_id: data["apps"].get(app_id)}
        if app_id != "wh" and "wh" in data["apps"]:
            wh_slim = dict(data["apps"]["wh"])
            # keep minimal wh for pwa.wh.* mock handlers
            if isinstance(wh_slim.get("items"), list):
                wh_slim["items"] = wh_slim["items"][:8]
            # drop heavy maps if present
            wh_slim.pop("poMap", None)
            wh_slim.pop("countMap", None)
            single["wh"] = wh_slim
        bridge_json = json.dumps(single).replace("<", "\\u003c").replace("</script", "<\\/script")
        bridge = MOCK_BRIDGE.replace("__BOOTSTRAP_JSON__", bridge_json)

        # bridge ko app scripts se PEHLE inject karo
        anchor = "<?!= include('Pwa_Shell'); ?>"
        if anchor in html:
            html = html.replace(anchor, bridge + "\n  " + anchor, 1)
        else:
            html = html.replace("</head>", bridge + "</head>", 1)

        # koi bhi bacha hua scriptlet (<? ?>) — templates theek hain to nahi bachna chahiye
        leftovers = SCRIPTLET_RE.findall(html)
        if leftovers:
            print(f"  ✖ {tpl}: unresolved template tags: {leftovers[:3]}")
            return 1

        html = banner + "\n" + html
        # Minify for POS demo to stay under file-viewer srcdoc ~120KB limit
        # Senior POS at 165KB breaks preview (shows raw JS) — minify saves ~15KB
        if app_id == 'pos':
            try:
                # Remove HTML comments (keep banner already stripped? banner is comment, keep it)
                html = re.sub(r'<!--(?!\n  HASEEB).*?-->', '', html, flags=re.S)
                # Collapse whitespace between tags
                html = re.sub(r'>\s+<', '><', html)
                # Collapse multiple spaces/newlines
                html = re.sub(r'\n\s*\n', '\n', html)
                # Minify CSS inside <style> (remove comments, extra spaces)
                def min_css(m):
                    css = m.group(1)
                    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
                    css = re.sub(r'\s+', ' ', css)
                    css = re.sub(r'\s*([{}:;,>])\s*', r'\1', css)
                    return '<style>' + css.strip() + '</style>'
                html = re.sub(r'<style>(.*?)</style>', min_css, html, flags=re.S)
                # Minify JS for POS (saves ~12KB) — use terser if available
                try:
                    import subprocess, tempfile, os
                    def min_js_block(m):
                        js = m.group(1)
                        if len(js) < 3000:
                            return m.group(0)
                        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                            f.write(js)
                            fname = f.name
                        try:
                            result = subprocess.run(['npx', 'terser', fname, '--compress', '--mangle'], capture_output=True, text=True, cwd=str(ROOT))
                            if result.returncode == 0 and result.stdout.strip():
                                minified = result.stdout.strip()
                                minified = minified.replace('</script', '<\\/script')
                                return '<script>' + minified + '</script>'
                        except Exception as e:
                            print(f"  ! terser failed: {e}")
                        finally:
                            try: os.unlink(fname)
                            except: pass
                        return m.group(0)
                    html = re.sub(r'<script>(.*?)</script>', min_js_block, html, flags=re.S)
                except Exception as e:
                    print(f"  ! JS minify failed: {e}")
            except Exception as e:
                print(f"  ! minify failed for {app_id}: {e}")
        out = OUT / out_name
        out.write_text(html, encoding="utf-8")
        print(f"✔ Built demo/{out_name}  ({len(html)/1024:.1f} KB)  "
              f"items={len(cfg.get('items') or [])} tasks={len(cfg.get('tasks') or [])}")

    missing = re.findall(r"MISSING INCLUDE: (\w+)", "".join(
        (OUT / n).read_text(encoding="utf-8") for _, _, n in APPS))
    if missing:
        print("✖ Missing includes:", ", ".join(sorted(set(missing))))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
