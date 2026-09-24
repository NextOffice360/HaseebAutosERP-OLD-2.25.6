#!/usr/bin/env python3
"""
Haseeb Autos — STATIC build (Netlify / Vercel / GitHub Pages / Firebase)
--------------------------------------------------------------------------
`demo/index.html` mein mock data hota hai (sirf dekhne ke liye).
Ye script **asli backend** se judne wali static site banati hai:

    * Frontend  → Netlify (ya koi bhi static host) — fast, custom domain, PWA
    * Backend   → Google Apps Script (`.../exec`) — database (Google Sheets)
    * Raasta    → JSONP bridge (Code.gs `?t=jsonp`, App_Core.html `API.jsonp`)

    python3 tools/build_static.py "https://script.google.com/macros/s/AKfycb.../exec"
    python3 tools/build_static.py                 # config file se padhe ga

Output: dist-static/   (index.html + manifest + sw.js + icons)

NOTE: JSONP sirf GET hai — is liye payload chhota rakha jata hai. Bade
      payload (CSV import waghera) ke liye gas-web-app par hi jayein.
"""
import os
import re
import sys
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "apps-script"
OUT = ROOT / "dist-static"
CONFIG_FILE = ROOT / "static-config.json"

INCLUDE_RE = re.compile(r"<\?!=\s*include\('([^']+)'\)\s*;?\s*\?>")
PRINT_RE = re.compile(r"<\?=\s*([A-Za-z0-9_]+)\s*\?>")


def backend_version() -> str:
    """Utils.gs → CONFIG.VERSION (single source of truth)."""
    try:
        src = (ROOT / "apps-script" / "Utils.gs").read_text(encoding="utf-8")
        m = re.search(r"VERSION\s*:\s*'([^']+)'", src)
        if m:
            return m.group(1)
    except Exception:
        pass
    return "2.6.0"


def gen_config_defs() -> str:
    """Config.gs ka asli Settings schema (mock_gs runtime ke zariye)."""
    import subprocess
    script = ROOT / "tools" / "gen_defs.js"
    if not script.exists():
        return ""
    try:
        out = subprocess.run(["node", str(script)], cwd=str(ROOT),
                             capture_output=True, text=True, timeout=180)
        if out.returncode == 0 and out.stdout.strip().startswith("["):
            return out.stdout.strip()
        print("  (settings schema: gen_defs failed — " +
              (out.stderr or "").strip()[:120] + ")")
    except Exception as e:
        print("  (settings schema: " + str(e)[:120] + ")")
    return ""


def render(text: str, values: dict, depth: int = 0) -> str:
    if depth > 5:
        return text

    def repl(m):
        name = m.group(1)
        f = SRC / f"{name}.html"
        if not f.exists():
            return f"<!-- MISSING INCLUDE: {name} -->"
        return render(f.read_text(encoding="utf-8"), values, depth + 1)

    text = INCLUDE_RE.sub(repl, text)
    text = PRINT_RE.sub(lambda m: str(values.get(m.group(1), "")), text)
    return text


def resolve_api_url(argv_url=None) -> str:
    """CLI > static-config.json > env > error."""
    if argv_url:
        return argv_url.strip()
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if cfg.get("apiUrl"):
                return str(cfg["apiUrl"]).strip()
        except Exception as e:
            print("  (static-config.json padh nahi saka: %s)" % e)
    env = os.environ.get("API_URL", "").strip()
    if env:
        return env
    return ""


def main() -> int:
    url = resolve_api_url(sys.argv[1] if len(sys.argv) > 1 else None)
    if not url:
        print("✖ Apps Script ka /exec URL chahiye.\n")
        print('  Misal:')
        print('    python3 tools/build_static.py "https://script.google.com/macros/s/AKfycb.../exec"\n')
        print('  Ya phir static-config.json banayein:')
        print('    {"apiUrl": "https://script.google.com/macros/s/AKfycb.../exec"}\n')
        return 1

    if not re.match(r"^https://script\.google\.com/macros/s/[^/]+/exec", url):
        print("⚠  Chetavni: URL Apps Script /exec jaisa nahi lag raha.")
        print("    Mil gaya:", url)
        print("    (Phir bhi banata hoon — par JSONP isi shape ke sath tested hai.)")

    # query string alag kar lein (agar user ne ?app= waghera laga diya ho)
    url = url.split("?")[0]

    values = {
        "title": "Haseeb Autos — ERP & POS",
        "appVersion": backend_version() + "-static",
        "serveMode": "static",
        "apiUrl": url,
    }

    index = (SRC / "Index.html").read_text(encoding="utf-8")
    html = render(index, values)

    anchor = '<script>\n    /* Injected by server template */'

    # real Settings schema — taake Settings tab source se alag na ho
    defs = gen_config_defs()
    if defs:
        dinject = ("<!-- ===== REAL SETTINGS SCHEMA (apps-script/Config.gs) ===== -->\n"
                   f"<script>\nwindow.CONFIG_DEFS_DEMO = {defs};\n</script>\n\n")
        html = html.replace(anchor, dinject + anchor, 1) if anchor in html \
            else html.replace("</head>", dinject + "</head>", 1)

    # NOTE: mock backend inject NAHI hota — ye ASLI backend se baat karega
    banner = ("<!--\n"
              "  HASEEB AUTOS — STATIC build (real data via JSONP).\n"
              "  Generated by tools/build_static.py — DO NOT EDIT.\n"
              f"  Backend: {url}?t=jsonp&cb=...&a=<action>&p=<payload>\n"
              "-->")
    html = banner + "\n" + html

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(html, encoding="utf-8")
    print(f"✔ Built {OUT.relative_to(ROOT)}/index.html  ({len(html)/1024:.1f} KB)")

    # ---- PWA assets (demo build ke sath shared, taake dono ek jaise hon) ----
    try:
        sys.path.insert(0, str(ROOT / "tools"))
        import build_demo as bd
        (OUT / "manifest.webmanifest").write_text(bd.MANIFEST, encoding="utf-8")
        (OUT / "sw.js").write_text(
            bd.SERVICE_WORKER.replace("__VERSION__", backend_version()), encoding="utf-8")
        for n in (192, 512):
            p = ROOT / "tools" / f"icon-{n}.png"
            if p.exists():
                (OUT / f"icon-{n}.png").write_bytes(p.read_bytes())
        print("✔ Built dist-static/manifest.webmanifest + sw.js + icons  (PWA)")
    except Exception as e:
        print("  (PWA assets copy nahi ho sake: %s)" % e)

    missing = re.findall(r"MISSING INCLUDE: (\w+)", html)
    if missing:
        print("✖ Missing includes:", ", ".join(sorted(set(missing))))
        return 1

    # sanity: API_URL sach mein html mein gaya?
    if url not in html:
        print("✖ API_URL html mein nahi mila — template variable ghalat ho sakta hai.")
        return 1

    # config yaad rakhein (agli dafa sirf: python3 tools/build_static.py)
    CONFIG_FILE.write_text(
        json.dumps({"apiUrl": url, "note": "Generated by tools/build_static.py"}, indent=2),
        encoding="utf-8")
    print(f"✔ Saved {CONFIG_FILE.relative_to(ROOT)}  (agli dafa bina URL ke chalayein)")

    print("\n  Ab is folder ko Netlify par kheench kar chhor dein:")
    print(f"    {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
