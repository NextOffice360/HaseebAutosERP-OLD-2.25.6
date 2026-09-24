#!/usr/bin/env python3
"""
Parse the customer's real product master (list.pdf + barcode.pdf) into a
structured JSON catalog used to seed the ERP (apps-script/Seed_Products.gs)
and the offline demo (demo/products.js).

  list.pdf     → Product Code | Line Item | Category | Sub Category | Conversion Factor | Supplier
  barcode.pdf  → Product Code | Product Name (with size) | Combination | Customer SKU 1 | SKU 2/EAN

Usage:  python3 tools/parse_products.py
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
UP = pathlib.Path("/home/user/uploads")

CODE = re.compile(r"(FL\d{5})")
FACTOR = re.compile(r"\d+\.\d{3,4}")
SIZE = re.compile(r"\b(\d+(?:\.\d+)?\s?(?:ML|LTR|L|GM|G|KG|MM|INCH))\b", re.I)
EAN = re.compile(r"\b(\d{13})\b")
LINE_ITEMS = ["Car Care", "Car Cleaning", "Auto Parts", "Bike", "Accessories",
              "Electrical", "Lubricants", "Interior", "Exterior", "Tools", "Tyre", "General"]


def pdf_text(name: str) -> str:
    import pypdf
    r = pypdf.PdfReader(str(UP / name))
    return "\n".join((p.extract_text() or "") for p in r.pages)


def parse_list(text: str) -> dict:
    out = {}
    parts = CODE.split(text)
    for i in range(1, len(parts) - 1, 2):
        code = parts[i]
        body = " ".join(parts[i + 1].split())
        m = FACTOR.search(body)
        if m:
            supplier = body[m.end():].strip()
            mid = body[:m.start()].strip()
        else:
            supplier, mid = "", body
        line_item = ""
        for k in LINE_ITEMS:
            if mid.lower().startswith(k.lower()):
                line_item = k
                break
        if not line_item:
            toks = mid.split()
            line_item = " ".join(toks[:2]) or "General"
            mid = " ".join(toks[2:])
        else:
            mid = mid[len(line_item):].strip()
        out[code] = {
            "lineItem": line_item.strip() or "General",
            "subCategory": mid.strip(),
            "supplier": " ".join(supplier.split()[:4]),
        }
    return out


def parse_barcodes(text: str) -> dict:
    out = {}
    parts = CODE.split(text)
    for i in range(1, len(parts) - 1, 2):
        code = parts[i]
        body = " ".join(parts[i + 1].split())
        ean = ""
        m = EAN.search(body)
        if m:
            ean = m.group(1)
            body = body[:m.start()]
        toks = body.split()
        while toks and toks[-1].lower() in ("default", "n/a", "-", "none", ""):
            toks.pop()
        sku = ""
        if toks and re.fullmatch(r"[A-Z0-9\-]{6,}", toks[-1]) and not SIZE.search(toks[-1]):
            sku = toks.pop()
        raw = " ".join(toks).strip()
        size = ""
        ms = SIZE.search(raw)
        if ms:
            size = ms.group(1).strip().upper()
        out[code] = {"name": re.sub(r"\s+", " ", raw).upper(), "size": size, "ean": ean, "sku": sku}
    return out


def main() -> int:
    items = parse_list(pdf_text("list.pdf"))
    bar = parse_barcodes(pdf_text("barcode.pdf"))
    print(f"list rows: {len(items)}   barcode rows: {len(bar)}")

    merged = []
    for code in sorted(set(items) | set(bar)):
        meta = items.get(code, {})
        b = bar.get(code, {})
        name = (b.get("name") or "").strip()
        if len(name) < 4:
            name = f"{meta.get('lineItem','')} {meta.get('subCategory','')}".strip()
        if len(name) < 3:
            continue
        merged.append({
            "code": code,
            "name": name[:80],
            "category": meta.get("lineItem", "Car Care") or "Car Care",
            "subCategory": (meta.get("subCategory", "") or "")[:60],
            "supplier": meta.get("supplier", "") or "Ahsan Traders",
            "size": b.get("size", ""),
            "barcode": b.get("ean", "") or code,
            "sku": b.get("sku", ""),
            "uom": "PCS",
        })

    out = ROOT / "tools" / "products.json"
    out.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ wrote {out.relative_to(ROOT)} ({len(merged)} products)")
    cats = {}
    for m in merged:
        cats[m["category"]] = cats.get(m["category"], 0) + 1
    print("categories:", sorted(cats.items(), key=lambda x: -x[1])[:10])
    for x in merged[:6]:
        print(" ", x["code"], "|", x["name"][:44], "|", x["category"], "|", x["barcode"], "|", x["size"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
