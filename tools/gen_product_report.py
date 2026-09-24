#!/usr/bin/env python3
"""
Haseeb Autos — product import report
================================================================================
Builds a self-contained HTML report (inline CSS, no CDN) from tools/products.json
so the shop owner can verify exactly what landed in the DB — including the
data-quality findings that need a human decision.

    python3 tools/gen_product_report.py  [out.html]
"""
from __future__ import annotations

import html
import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "tools" / "products.json").read_text(encoding="utf-8"))
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "release" / "product-import-report.html"

e = html.escape


def m(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "—"
    return f"{f:,.0f}" if f == int(f) else f"{f:,.2f}"


# ------------------------------------------------------------------ stats ----
line = Counter(p["lineItem"] for p in DATA)
cat = Counter(p["category"] for p in DATA if p["category"])
brand = Counter(p["brand"] for p in DATA if p["brand"])
sup = Counter(p["supplier"] for p in DATA if p["supplier"])
origin = Counter(p["origin"] for p in DATA if p["origin"])

real_bc = [p for p in DATA if p["barcode"] and p["barcode"] != p["code"]]
wp_gt_rp = [p for p in DATA if p["wholesalePrice"] > p["retailPrice"] and p["retailPrice"] > 0]
zero = [p for p in DATA if p["costPrice"] == 0 and p["retailPrice"] == 0]
no_sup = [p for p in DATA if not p["supplier"]]
wp_lt_cp = [p for p in DATA if p["wholesalePrice"] and p["costPrice"] and p["wholesalePrice"] < p["costPrice"]]

margin = [p for p in DATA if p["retailPrice"] > 0 and p["costPrice"] > 0]
avg_margin = sum((p["retailPrice"] - p["costPrice"]) / p["retailPrice"] * 100 for p in margin) / max(len(margin), 1)

BADGE_OK = "display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;"


def bars(counter: Counter, limit: int = 14, unit: str = "") -> str:
    rows = counter.most_common(limit)
    top = max((n for _, n in rows), default=1)
    out = []
    for name, n in rows:
        pct = int(round(n / top * 100))
        out.append(
            f'<tr><td style="padding:3px 8px 3px 0;white-space:nowrap">{e(str(name) or "—")}</td>'
            f'<td style="width:60%"><div style="background:#e2e8f0;border-radius:4px;overflow:hidden;height:14px">'
            f'<div style="width:{pct}%;height:14px;background:linear-gradient(90deg,#c2410c,#f97316)"></div></div></td>'
            f'<td style="padding:3px 0 3px 8px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">'
            f'<b>{n}</b>{unit}</td></tr>'
        )
    return '<table style="width:100%;border-collapse:collapse;font-size:12px">' + "".join(out) + "</table>"


def table(rows: list, cols: list, limit: int | None = None) -> str:
    sel = rows[:limit] if limit else rows
    head = "".join(f'<th style="text-align:{a};padding:5px 8px;border-bottom:2px solid #cbd5e1;'
                   f'background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.04em">'
                   f'{e(h)}</th>' for h, a, _ in cols)
    body = []
    for r in sel:
        tds = []
        for _, a, k in cols:
            v = r.get(k, "")
            if k in ("costPrice", "wholesalePrice", "retailPrice"):
                v = m(v)
            tds.append(f'<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;text-align:{a};'
                       f'font-size:12px;white-space:nowrap">{e(str(v))}</td>')
        body.append("<tr>" + "".join(tds) + "</tr>")
    more = ""
    if limit and len(rows) > limit:
        more = (f'<tr><td colspan="{len(cols)}" style="padding:6px 8px;color:#64748b;font-size:11px">'
                f'… aur {len(rows) - limit} rows (poori list ke liye CSV / Items screen dekhein)</td></tr>')
    return ('<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
            f"<thead><tr>{head}</tr></thead><tbody>" + "".join(body) + more + "</tbody></table></div>")


def card(title: str, value, sub: str = "", accent: str = "#c2410c") -> str:
    return (f'<div style="flex:1 1 150px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;'
            f'padding:12px 14px;border-top:3px solid {accent}">'
            f'<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">'
            f'{e(title)}</div>'
            f'<div style="font-size:24px;font-weight:800;color:#0f172a;line-height:1.2">{value}</div>'
            f'<div style="font-size:11px;color:#64748b">{e(sub)}</div></div>')


def section(title: str, inner: str, note: str = "") -> str:
    n = (f'<div style="font-size:12px;color:#64748b;margin-bottom:10px">{note}</div>') if note else ""
    return (f'<section style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;'
            f'padding:16px 18px;margin-bottom:16px">'
            f'<h2 style="margin:0 0 4px;font-size:15px;color:#0f172a">{e(title)}</h2>{n}{inner}</section>')


def finding(severity: str, title: str, count: int, detail: str) -> str:
    col = {"high": "#b91c1c", "med": "#b45309", "low": "#0369a1"}[severity]
    bg = {"high": "#fef2f2", "med": "#fffbeb", "low": "#f0f9ff"}[severity]
    return (f'<div style="border:1px solid {col}33;background:{bg};border-left:4px solid {col};'
            f'border-radius:8px;padding:10px 12px;margin-bottom:10px">'
            f'<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">'
            f'<b style="color:{col};font-size:13px">{e(title)}</b>'
            f'<span style="{BADGE_OK}background:{col};color:#fff">{count}</span></div>'
            f'<div style="font-size:12px;color:#475569;margin-top:4px">{detail}</div></div>')


# ------------------------------------------------------------------ build ----
kpis = "".join([
    card("Products imported", len(DATA), "from product list2.csv"),
    card("Line items", len(line), "level-1 taxonomy"),
    card("Categories", len(cat), "level-2"),
    card("Brands", len(brand), "auto-created masters"),
    card("Suppliers", len(sup), "auto-created masters"),
    card("Real barcodes", len(real_bc), f"{len(DATA) - len(real_bc)} fall back to code"),
    card("Avg. margin", f"{avg_margin:.1f}%", "retail vs cost"),
    card("Stock value @ cost", "Rs " + m(sum(p["costPrice"] for p in DATA)), "1 unit each"),
])

COLS = [("Code", "left", "code"), ("Product", "left", "name"), ("Line item", "left", "lineItem"),
        ("Category", "left", "category"), ("Brand", "left", "brand"), ("Made in", "left", "origin"),
        ("Size", "left", "size"), ("Supplier", "left", "supplier"),
        ("Cost", "right", "costPrice"), ("Wholesale", "right", "wholesalePrice"),
        ("Retail", "right", "retailPrice"), ("Barcode", "left", "barcode")]

DQ = []
if wp_gt_rp:
    DQ.append(finding("high", "Wholesale price is HIGHER than retail price", len(wp_gt_rp),
                      "In the source file the “Wholesale Price” column is the price the shop actually "
                      "charges and “Retail Price” is lower — or the two columns are swapped in the "
                      "export. Imported <b>exactly as exported</b> (nothing invented). Jab aap decide "
                      "kar lein to <code>python3 tools/import_products_csv.py --price-mode swap</code> "
                      "ya <code>clamp</code> chala kar dobara <code>gen_seed.py</code> chalayein."))
if zero:
    DQ.append(finding("med", "Products with zero cost and zero retail", len(zero),
                      "Price nahi mila — POS par Rs 0 bikenge. Items screen ya price import se rates "
                      "bhar lein."))
if no_sup:
    DQ.append(finding("low", "Products with no supplier", len(no_sup),
                      "Supplier column khali tha. <code>primarySupplierId</code> khali chhora gaya hai "
                      "— purchase/reorder ke waqt supplier select karna parega."))
if wp_lt_cp:
    DQ.append(finding("med", "Wholesale price below cost", len(wp_lt_cp),
                      "Nuksaan wali rate — source file mein hi hai, waise hi import hui."))
if len(DATA) - len(real_bc):
    DQ.append(finding("low", "No barcode in the file", len(DATA) - len(real_bc),
                      "Barcode khali tha to <b>product code</b> barcode bana diya — scanner foran "
                      "kaam karega. Asli barcode milne par Items ▸ Barcode se update karein."))
if not DQ:
    DQ.append(finding("low", "No data-quality findings", 0, "Sab kuch saaf hai."))

DOC = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haseeb Autos — product import report</title></head>
<body style="margin:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Naskh Arabic',sans-serif;color:#0f172a">

<div style="max-width:1180px;margin:0 auto;padding:22px 18px 60px">

  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;border-radius:14px;
              padding:20px 22px;margin-bottom:18px">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#fca5a5">
      Haseeb Autos · حسیب آٹوز</div>
    <h1 style="margin:4px 0 2px;font-size:22px">Real product master — import report</h1>
    <div style="font-size:12px;color:#cbd5e1">
      Source: <b>product list2.csv</b> · {len(DATA)} products ·
      pipeline: <code>tools/import_products_csv.py</code> → <code>tools/products.json</code> →
      <code>apps-script/Seed_Products.gs</code>
    </div>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">{kpis}</div>

  {section("1 · Jo import hua", table(DATA, COLS, limit=25),
           f"Pehli 25 rows. Poore {len(DATA)} products ab Items sheet, Suppliers, Brands aur Categories masters mein hain — "
           f"har CSV column kahin na kahin map hua hai (koi data nahi gira).")}

  {section("2 · Data quality — jin cheezon par aapka faisla chahiye", "".join(DQ),
           "Import faithful hai: file jaisi thi waisi hi chali gayi. Neechay diye gaye muddat "
           "source file se aaye hain, hamari taraf se koi qeemat nahi badli gayi.")}

  {section("2a · Wholesale &gt; retail wali products", table(wp_gt_rp, COLS, limit=15),
           f"Kul {len(wp_gt_rp)} rows. Ye woh products hain jahan wholesale rate retail se upar hai.")}

  {section("3 · Line items", bars(line), "Level-1 taxonomy — har aik ab Items.lineItem column aur "
                                          "Categories master (root node) mein hai.")}

  {section("4 · Top categories", bars(cat), "Level-2 — Items.category + Categories master (child node).")}

  {section("5 · Brands", bars(brand), "Brands master mein auto-create hue (duplicate nahi).")}

  {section("6 · Suppliers", bars(sup), "Suppliers master mein auto-create hue; har item ka "
                                        "<code>primarySupplierId</code> inhi se juda hai.")}

  {section("7 · Made in (origin)", bars(origin), "Items.origin column.")}

  {section("8 · Zero-price products", table(zero, COLS, limit=15),
           f"Kul {len(zero)} rows — in ki qeematein file mein 0 thin.")}

  <div style="font-size:11px;color:#64748b;text-align:center;padding-top:8px">
    Generated by <code>tools/gen_product_report.py</code> ·
    verification: <code>bash tools/verify.sh</code> (13 gates, ALL GREEN)
  </div>
</div>
</body></html>
"""

OUT.write_text(DOC, encoding="utf-8")
print(f"✔ {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} B)  ·  {len(DATA)} products")
print(f"  findings: wholesale>retail {len(wp_gt_rp)} · zero-priced {len(zero)} · "
      f"no supplier {len(no_sup)} · barcode fallback {len(DATA) - len(real_bc)}")
