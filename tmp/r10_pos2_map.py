#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r10 slice-2: App_POS2 Roman literals → T.t (EN fallback) + mock dict"""
import io

# (raw_literal, key_or_None_for_reuse, en, ur) — reuse keys sirf wrap karte hain
M = [
 ("Sale shuru karne se pehle shop khulna zaroori hai — pehla action (item add) rok diya gaya.", "pos.shopGateToast", "Shop must be open before starting a sale — first action (item add) was blocked.", "سیل شروع کرنے سے پہلے دکان کا کھلا ہونا ضروری ہے — پہلا ایکشن (آئٹم شامل) روک دیا گیا۔"),
 ("Shop kholein", "pos.openShop", "Open the shop", "دکان کھولیں"),
 ("🗪 Shop kholein", "pos.openShopBtn", "🗪 Open the shop", "🗪 دکان کھولیں"),
 ("Shop band hai — sale ke kaam rok diye gaye. Pehle shop kholein.", "pos.shopClosedBanner", "Shop is closed — sale actions are blocked. Open the shop first.", "دکان بند ہے — سیل کے کام روک دیے گئے۔ پہلے دکان کھولیں۔"),
 ("Scan → Bulk List → Add All · ya search/📋 list se tick karein", "pos.bulkHint", "Scan → Bulk List → Add All · or tick from search/📋 list", "اسکین → بلک لسٹ → سب شامل کریں · یا تلاش/📋 فہرست سے ٹک کریں"),
 (" · band karein", "pos.bulkBadgeEnd", " · close", " · بند کریں"),
 ("Scan ya type karein — name / code / barcode / brand / model… (F2)", "pos.scanOrTypePh", "Scan or type — name / code / barcode / brand / model… (F2)", "اسکین یا ٹائپ کریں — نام / کوڈ / بارکوڈ / برانڈ / ماڈل… (F2)"),
 ("Camera se barcode/QR scan karein", "pos.cameraScan", "Scan barcode/QR with camera", "کیمرے سے بارکوڈ/کیو آر اسکین کریں"),
 ("Bulk session khatam karein", "pos.endBulkSession", "End bulk session", "بلک سیشن ختم کریں"),
 (" 🔁 Bulk ON · 0 · band karein", "pos.bulkBadgeInit", " 🔁 Bulk ON · 0 · close", " 🔁 بلک آن · 0 · بند کریں"),
 ("Checkbox list se multiple products ek saath add karein (GRN/PO jaisa) — BULK ADD", "pos.bulkAddHint", "Add multiple products at once from the checkbox list (like GRN/PO) — BULK ADD", "چیک باکس فہرست سے کئی پروڈکٹس ایک ساتھ شامل کریں (جی آر این/پی او جیسا) — بلک ایڈ"),
 ("Grid bulk — tiles par tick karke multiple add", "pos.gridBulkHint", "Grid bulk — tick tiles to add multiple", "گرڈ بلک — ٹائلوں پر ٹک کر کئی شامل کریں"),
 ("Grid select ON — tiles tick karein", "pos.gridSelectOn", "Grid select ON — tick tiles", "گرڈ سلیکٹ آن — ٹائلیں ٹک کریں"),
 ("Cart lines select karein — bulk delete / qty", "pos.cartLinesSelect", "Select cart lines — bulk delete / qty", "کارٹ لائنیں منتخب کریں — بلک ڈیلیٹ / qty"),
 ("Product nahi mila: ", None, None, None),
 ("Kuch nahi mila", "pos.noMatches", "No matches", "کچھ نہیں ملا"),
 ("ⓘ aur detail ke liye click karein", "pos.quickViewHint", "ⓘ click for more details", "ⓘ مزید تفصیل کے لیے کلک کریں"),
 ("Favourite banayein", "pos.makeFavourite", "Make favourite", "پسندیدہ بنائیں"),
 ("Koi select nahi", None, None, None),
 ("Koi held bill nahi", "pos.noHeldBills", "No held bills", "کوئی ہولڈ بل نہیں"),
 ("Item search kar ke tap karein, ya barcode scan karein", "pos.findItemHint", "Search and tap an item, or scan a barcode", "آئٹم تلاش کر کے ٹیپ کریں، یا بارکوڈ اسکین کریں"),
 ("Kam karein", "pos.decrease", "Decrease", "کم کریں"),
 ("Zyada karein", "pos.increase", "Increase", "زیادہ کریں"),
 ("📒 Udhaar", "pos.ledgerBtn", "📒 Credit ledger", "📒 ادھار"),
 (" se kam nahi", "pos.minPriceTail", " — cannot be lower", " سے کم نہیں"),
 ("Naam ya phone… (type karein, foran filter hoga)", "pos.custSearchPh", "Name or phone… (type to filter instantly)", "نام یا فون… (ٹائپ کریں، فوراً فلٹر ہو گا)"),
 ("Koi customer nahi mila", "pos.noCustomer", "No customer found", "کوئی کسٹمر نہیں ملا"),
 ("Customer select karein", "pos.selectCustomer", "Select a customer", "کسٹمر منتخب کریں"),
 ("Opening udhaar", "pos.openingUdhaar", "Opening credit", "افتتاحی ادھار"),
 ("Name zaroori hai", None, None, None),
 ("<span>Current Due (udhaar) — Closing</span><span>", "pos.dueClosingHtml", "<span>Current due (credit) — Closing</span><span>", "<span>موجودہ بقایا (ادھار) — اختتام</span><span>"),
 ("Customer select karein — points redeem ke liye", "pos.custForPoints", "Select a customer — to redeem points", "کسٹمر منتخب کریں — پوائنٹس ریڈیم کرنے کے لیے"),
 ("Koi fee nahi - settlement <date>", "pos.noFeeSettlement", "No fee - settlement <date>", "کوئی فیس نہیں - سیٹلمنٹ <date>"),
 ("Current Due (udhaar) ", "pos.currentDue", "Current due (credit) ", "موجودہ بقایا (ادھار) "),
 (", is bill ka udhaar ", "pos.billCreditTail", ", this bill credit ", ", اس بل کا ادھار "),
 (", udhaar ", "pos.creditTail", ", credit ", ", ادھار "),
 (" (Cash ya Card se pay karein, ya Udhaar select karein)", "pos.payOptionsTail", " (pay via Cash or Card, or select Credit)", " (کیش یا کارڈ سے ادا کریں، یا ادھار منتخب کریں)"),
 ("Cart clear karein? Ye bill ke saare items hata dega.", "pos.clearCartConfirm", "Clear cart? This removes all items from the bill.", "کارٹ خالی کریں؟ یہ بل کے تمام آئٹمز ہٹا دے گا۔"),
 (" — Add items me search karein", "pos.searchInAddItems", " — search in Add items", " — Add items میں تلاش کریں"),
 ("Barcode/QR code type karein", "pos.typeBarcode", "Type barcode/QR code", "بارکوڈ/کیو آر کوڈ ٹائپ کریں"),
 ("Sab shortcuts sirf POS screen par kaam karte hain. Typing ke dauran F-keys nahi chalte (except Esc/F9).", "pos.shortcutsNote", "All shortcuts work only on the POS screen. F-keys are ignored while typing (except Esc/F9).", "تمام شارٹ کٹس صرف پی او ایس اسکرین پر کام کرتے ہیں۔ ٹائپنگ کے دوران F-keys نہیں چلتے (except Esc/F9)۔"),
 ("F3 ya F4 — Customer chunein", "pos.scF3F4", "F3 or F4 — pick customer", "F3 یا F4 — کسٹمر چنیں"),
 ("F8 — Bill hold karein (pending)", "pos.scF8", "F8 — hold bill (pending)", "F8 — بل ہول کریں (زیرِ التوا)"),
 ("Ctrl+K — Command palette, Esc — Band karein", "pos.scCtrlK", "Ctrl+K — command palette, Esc — close", "Ctrl+K — کمانڈ پیلیٹ، Esc — بند کریں"),
]

fp = "apps-script/App_POS2.html"
s = io.open(fp, encoding="utf-8").read()
done, miss = [], []
for raw, key, en, ur in M:
    lit = "'" + raw.replace("'", "\\'") + "'"
    if s.count(lit) == 0:
        miss.append(raw[:40]); continue
    if key is None:
        continue  # reuse-case: sirf aage wrap (neeche alag se)
    rep = "T.t('" + key + "','" + en.replace("'", "\\'") + "')"
    s = s.replace(lit, rep)
    done.append((key, raw, en, ur))

# reuse: existing keys ke roman literals ko bhi T.t wrap karo (dict me pehle se)
REUSE = [
 ("Product nahi mila: ", "pos.productNotFound"),
 ("Koi select nahi", "pos.nothingSelected"),
 ("Name zaroori hai", "pos.nameReq"),
]
for raw, key in REUSE:
    lit = "'" + raw + "'"
    c = s.count(lit)
    if c == 0:
        miss.append("reuse:" + key); continue
    s = s.replace(lit, "T.t('" + key + "','" + raw + "')")
    done.append((key, raw, "__REUSE__", "__REUSE__"))
io.open(fp, "w", encoding="utf-8").write(s)

mock = io.open("demo/mock.js", encoding="utf-8").read()
anchor = "  'pos.codeNotFound': { key: 'pos.codeNotFound', en: 'Code not found', roman: 'Code nahi mila', ur: 'کوڈ نہیں ملا' },"
lines = []
for key, raw, en, ur in done:
    if en == "__REUSE__":
        continue
    roman = raw.replace("\\'", "'").replace("'", "\\'")
    lines.append("  '%s': { key: '%s', en: '%s', roman: '%s', ur: '%s' }," % (key, key, en.replace("'", "\\'"), roman, ur.replace("'", "\\'")))
assert mock.count(anchor) == 1
mock = mock.replace(anchor, anchor + "\n" + "\n".join(lines))
io.open("demo/mock.js", "w", encoding="utf-8").write(mock)

print("migrated:", len(done), "| missing:", miss)
