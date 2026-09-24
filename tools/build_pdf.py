#!/usr/bin/env python3
"""Haseeb Autos — Markdown → print-ready PDF guide (README + DEPLOYMENT).

    python3 tools/build_pdf.py            # dist/Haseeb-Autos-Guide.pdf
"""
import pathlib, sys
import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "release" / "Haseeb-Autos-Guide.pdf"

CSS = """
@page { size: A4; margin: 16mm 14mm 18mm 14mm;
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 9px; color: #888; } }
body { font-family: "Noto Sans", "Segoe UI", system-ui, sans-serif; font-size: 10.6pt;
  line-height: 1.55; color: #16202b; }
h1 { font-size: 21pt; color: #c2410c; border-bottom: 3px solid #ff6a00; padding-bottom: 6px; margin-top: 0; }
h2 { font-size: 15pt; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;
  margin-top: 20px; page-break-after: avoid; }
h3 { font-size: 12.4pt; color: #c2410c; margin-top: 15px; }
p, li { orphans: 2; widows: 2; }
code { background: #f1f5f9; padding: 1px 4px; border-radius: 4px; font-size: 9.4pt; color: #b91c1c; }
pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 8px; font-size: 8.8pt;
  overflow-wrap: break-word; white-space: pre-wrap; page-break-inside: avoid; }
pre code { background: transparent; color: inherit; padding: 0; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 8px 0; }
th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
th { background: #fff1e6; color: #7c2d12; }
blockquote { border-left: 4px solid #ff6a00; background: #fff7ed; margin: 8px 0; padding: 6px 12px; color: #7c2d12; }
hr { border: 0; border-top: 1px solid #e2e8f0; margin: 18px 0; }
a { color: #c2410c; }
.doc-break { page-break-before: always; }
"""

def build() -> int:
    try:
        from weasyprint import HTML
    except ImportError:
        print("pip install weasyprint markdown"); return 2
    parts = []
    for name, title in [("README.md", None), ("release/CHANGELOG-v2.5.2.md", None),
                        ("APPS_SCRIPT_DEPLOY_GUIDE.md", None), ("DEPLOYMENT.md", None),
                        ("FEATURES_V25_GUIDE.md", None)]:
        f = ROOT / name
        if not f.exists():
            continue
        md = f.read_text(encoding="utf-8")
        if name == "README.md":
            md = md.replace("# 🚗 Haseeb Autos", "# Haseeb Autos", 1)
        body = markdown.markdown(md, extensions=["tables", "fenced_code", "toc", "sane_lists"])
        parts.append(body if not parts else '<div class="doc-break"></div>' + body)
    if not parts:
        print("koi markdown nahi mila"); return 1
    html = ("<!doctype html><html><head><meta charset='utf-8'><style>" + CSS +
            "</style></head><body>" + "".join(parts) + "</body></html>")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=html).write_pdf(str(OUT))
    print(f"✔ {OUT.relative_to(ROOT)}  ({OUT.stat().st_size/1024:.0f} KB)")
    return 0

if __name__ == "__main__":
    sys.exit(build())
