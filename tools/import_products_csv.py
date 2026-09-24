#!/usr/bin/env python3
"""
Haseeb Autos — real product master importer
================================================================================
Reads the shop's own product export (CSV) and normalises it into the canonical
catalogue file  tools/products.json  that feeds:

    • apps-script/Seed_Products.gs   (Apps Script one-click importer)
    • demo/products.js               (offline / demo catalogue)

The CSV is the customer's system export with these columns:

    Product Code | Line Item | Category | Sub Category | Conversion Factor |
    Supplier | Cost Type | Purchase Type | Made in | Product Group | Model |
    Brand | Product Name | Size | Color | Cost Price | Wholesale Price |
    Retail Price | Profit(%) | Difference | Barcode Customer SKU Code 1

Field mapping (loss-free — every column lands somewhere):

    Product Code .......... Items.code
    Product Name .......... Items.name
    Line Item ............. Items.lineItem          (new v2.5.2 column, level-1)
    Category .............. Items.category          (+ Categories master, level-2)
    Sub Category .......... Items.subCategory       (level-3, free text)
    Brand ................. Items.brand             (+ Brands master)
    Model ................. Items.model
    Made in ............... Items.origin
    Conversion Factor ..... Items.conversionFactor  (0 / blank -> 1)
    Size .................. Items.size              ("Default" -> "")
    Supplier .............. Suppliers master + Items.primarySupplierId
    Cost Price ............ Items.costPrice
    Wholesale Price ....... Items.wholesalePrice
    Retail Price .......... Items.retailPrice
    Barcode ............... Items.barcode           (blank -> product code)
    Product Group ......... Items.customFields -> cf_productGroup
    Color ................. Items.customFields -> cf_color
    Cost Type ............. Items.customFields -> cf_costType
    Purchase Type ......... Items.customFields -> cf_purchaseType
    Profit(%) / Difference  derived (Difference == WP - CP) -> kept in JSON only

Usage
--------------------------------------------------------------------------------
    python3 tools/import_products_csv.py                       # default CSV path
    python3 tools/import_products_csv.py path/to/export.csv
    python3 tools/import_products_csv.py --price-mode swap     # normalise prices
    python3 tools/import_products_csv.py --report-only

--price-mode
    as-is   (default) keep the file exactly as exported — nothing is invented.
    swap    where Wholesale > Retail, swap the two values.
    clamp   where Wholesale > Retail, pull Wholesale down to Retail.
"""
from __future__ import annotations

import argparse
import csv
import json
import pathlib
import re
import sys
from collections import Counter, OrderedDict

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_CSV = pathlib.Path("/home/user/uploads/product list2.csv")
OUT_JSON = ROOT / "tools" / "products.json"

# ----------------------------------------------------------------- helpers ---
NUM_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
SIZE_RE = re.compile(r"\b(\d+(?:\.\d+)?\s?(?:ML|LTR|L|GM|G|KG|MM|CM|INCH|\"|'))\b", re.I)
DEFAULT_TOKENS = {"", "default", "default color", "n/a", "na", "none", "-", "--", "nil"}


def clean(v) -> str:
    """Trim + collapse whitespace; None-safe."""
    return " ".join(str(v or "").replace("\u00a0", " ").split())


def num(v, dft=0.0) -> float:
    s = clean(v).replace(",", "")
    if not s:
        return dft
    try:
        return float(s)
    except ValueError:
        return dft


def money(v, dft=0.0) -> float:
    """Round to paisa-free rupees; the shop prices in whole rupees."""
    return round(num(v, dft) + 1e-9, 2)


def is_default(v: str) -> bool:
    return clean(v).lower() in DEFAULT_TOKENS


def title_word(v: str) -> str:
    """Brand fallback: leading token of the product name."""
    t = clean(v).split(" ")[0] if clean(v) else ""
    return t[:24]


def slug(v: str, n: int = 12) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", clean(v)).strip("-").upper()
    return s[:n] or "X"


# Line Item -> the app's coarse part-type facet (documented, never guessed per row)
PART_TYPE = {
    "CAR CARE": "CAR_CARE",
    "CAR CLEANING": "CAR_CARE",
    "SPRAY PAINT": "CAR_CARE",
    "PAINT": "CAR_CARE",
    "PERFUMES / FRAGRANCES": "DECOR",
    "CAR GADGETS": "DECOR",
    "LED LIGHTS": "LIGHTING",
    "ELECTRIC WIRE DC": "ELECTRICAL",
    "GENERAL ELECTRICAL": "ELECTRICAL",
    "IGNITION": "ENGINE",
    "GENERAL": "OTHER",
}


def part_type(line_item: str) -> str:
    return PART_TYPE.get(clean(line_item).upper(), "OTHER")


# ------------------------------------------------------------------ parsing ---
def read_rows(path: pathlib.Path):
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rdr = csv.DictReader(fh)
        missing = [c for c in REQUIRED if c not in (rdr.fieldnames or [])]
        if missing:
            sys.exit("CSV missing required column(s): " + ", ".join(missing))
        return list(rdr)


REQUIRED = ["Product Code", "Product Name"]


def convert(rows, price_mode: str):
    """CSV rows -> catalogue records + data-quality counters."""
    products, dq = [], Counter()
    seen_codes, seen_barcodes = {}, {}

    for idx, r in enumerate(rows):
        line_no = idx + 2  # +1 header, +1 1-based
        code = clean(r.get("Product Code"))
        name = clean(r.get("Product Name"))
        if not code and not name:
            dq["blank_rows_skipped"] += 1
            continue
        if not code or not name:
            dq["incomplete_rows_skipped"] += 1
            continue

        # ---- identity / duplicates
        ck = code.upper()
        if ck in seen_codes:
            dq["duplicate_code"] += 1
            continue
        seen_codes[ck] = line_no

        # ---- prices
        cp = money(r.get("Cost Price"))
        wp = money(r.get("Wholesale Price"))
        rp = money(r.get("Retail Price"))
        if wp > rp and wp > 0 and rp > 0:
            dq["wholesale_above_retail"] += 1
            if price_mode == "swap":
                wp, rp = rp, wp
                dq["price_swapped"] += 1
            elif price_mode == "clamp":
                wp = rp
                dq["price_clamped"] += 1
        if wp and cp and wp < cp:
            dq["wholesale_below_cost"] += 1
        if cp == 0 and rp == 0:
            dq["zero_priced"] += 1
        if rp == 0 and cp > 0:
            dq["missing_retail"] += 1

        # ---- barcode
        bc = clean(r.get("Barcode Customer SKU Code 1"))
        if bc:
            if bc in seen_barcodes:
                dq["duplicate_barcode"] += 1
                bc = ""
            else:
                seen_barcodes[bc] = code
        if not bc:
            bc = code
            dq["barcode_fallback_to_code"] += 1

        # ---- descriptive fields
        line_item = clean(r.get("Line Item")) or "General"
        category = clean(r.get("Category"))
        sub_category = clean(r.get("Sub Category"))
        brand = clean(r.get("Brand")) or title_word(name)
        model = clean(r.get("Model"))
        origin = clean(r.get("Made in"))
        size = "" if is_default(r.get("Size")) else clean(r.get("Size"))
        color = "" if is_default(r.get("Color")) else clean(r.get("Color"))
        product_group = clean(r.get("Product Group"))
        cost_type = clean(r.get("Cost Type"))
        purchase_type = clean(r.get("Purchase Type"))
        supplier = clean(r.get("Supplier"))

        # conversion factor: 0 / blank means "no conversion" -> 1
        raw_cf = num(r.get("Conversion Factor"), 0)
        cf = int(raw_cf) if raw_cf >= 1 else 1
        if raw_cf and raw_cf < 1:
            dq["fractional_conversion_factor"] += 1

        if not supplier:
            dq["no_supplier"] += 1
        if not brand:
            dq["no_brand"] += 1
        if not category:
            dq["no_category"] += 1

        # size fallback: pull the volume/weight out of the product name
        if not size:
            m = SIZE_RE.search(name)
            if m:
                size = m.group(1).upper().replace(" ", "")

        custom = OrderedDict()
        if product_group:
            custom["cf_productGroup"] = product_group
        if color:
            custom["cf_color"] = color
        if cost_type:
            custom["cf_costType"] = cost_type
        if purchase_type:
            custom["cf_purchaseType"] = purchase_type

        products.append(OrderedDict([
            ("code", code),
            ("name", name),
            ("lineItem", line_item),
            ("category", category),
            ("subCategory", sub_category),
            ("brand", brand),
            ("model", model),
            ("origin", origin),
            ("productGroup", product_group),
            ("color", color),
            ("costType", cost_type),
            ("purchaseType", purchase_type),
            ("size", size),
            ("unit", "PCS"),
            ("conversionFactor", cf),
            ("supplier", supplier),
            ("costPrice", cp),
            ("wholesalePrice", wp),
            ("retailPrice", rp),
            ("profitPct", money(r.get("Profit(%)"))),
            ("difference", money(r.get("Difference"))),
            ("barcode", bc),
            ("partType", part_type(line_item)),
            ("customFields", custom),
        ]))

    return products, dq


# -------------------------------------------------------------------- main ---
def main() -> int:
    ap = argparse.ArgumentParser(description="Import the shop product CSV into tools/products.json")
    ap.add_argument("csv", nargs="?", default=str(DEFAULT_CSV), help="path to the product export CSV")
    ap.add_argument("--price-mode", choices=["as-is", "swap", "clamp"], default="as-is")
    ap.add_argument("--out", default=str(OUT_JSON))
    ap.add_argument("--report-only", action="store_true", help="analyse but do not write products.json")
    args = ap.parse_args()

    csv_path = pathlib.Path(args.csv)
    if not csv_path.exists():
        sys.exit("CSV not found: " + str(csv_path))

    rows = read_rows(csv_path)
    products, dq = convert(rows, args.price_mode)

    # ---------------------------------------------------------- DQ report ----
    print("=" * 78)
    print("  HASEEB AUTOS — product import  ·  source: " + csv_path.name)
    print("=" * 78)
    print(f"  CSV rows (excl. header) ......... {len(rows)}")
    print(f"  Products imported ............... {len(products)}")
    print(f"  Price mode ...................... {args.price_mode}")
    print("-" * 78)
    for k in sorted(dq):
        print(f"  {k:<32} {dq[k]}")
    if not dq:
        print("  (no data-quality findings)")
    print("-" * 78)

    li = Counter(p["lineItem"] for p in products)
    print(f"  Line items ...................... {len(li)}")
    for k, v in li.most_common():
        print(f"      {k:<28} {v}")
    print(f"  Categories ...................... {len(set(p['category'] for p in products))}")
    print(f"  Sub-categories .................. {len(set(p['subCategory'] for p in products if p['subCategory']))}")
    print(f"  Brands .......................... {len(set(p['brand'] for p in products))}")
    print(f"  Suppliers ....................... {len(set(p['supplier'] for p in products if p['supplier']))}")
    print(f"  Origins (Made in) ............... {len(set(p['origin'] for p in products if p['origin']))}")
    print(f"  Barcodes ........................ {sum(1 for p in products if p['barcode'] != p['code'])} real"
          f" / {sum(1 for p in products if p['barcode'] == p['code'])} fall back to code")
    print(f"  Stock value @ cost .............. Rs {sum(p['costPrice'] for p in products):,.0f}"
          f" (per unit, before opening qty)")
    print("=" * 78)

    if args.report_only:
        return 0

    out = pathlib.Path(args.out)
    out.write_text(json.dumps(products, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("  ✔ wrote " + str(out.relative_to(ROOT)) + f"  ({len(products)} products)")
    print("    next:  python3 tools/gen_seed.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
