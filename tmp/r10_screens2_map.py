#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r10 slice-2: App_Screens2 Roman literals → T.t (EN fallback) + mock dict"""
import io, sys

# (raw_literal_in_source, key, en_fallback, urdu)
M = [
 ("Koi PO nahi", "sc2.noPo", "No POs", "کوئی پی او نہیں"),
 ("Koi GRN nahi", "sc2.noGrn", "No GRNs", "کوئی جی آر این نہیں"),
 ("Code nahi mila: ", "sc2.codeNotFound", "Code not found: ", "کوڈ نہیں ملا: "),
 ("Pichhla baqaya (previous payable)", "sc2.prevPayable", "Previous balance (payable)", "پچھلا بقایا (ادائیگی کے لیے)"),
 ("Koi line item nahi", "sc2.noLineItems", "No line items", "کوئی لائن آئٹم نہیں"),
 ("Supplier record kholein", "sc2.openSupplier", "Open supplier record", "سپلائر ریکارڈ کھولیں"),
 ("Koi item nahi — scan ya search se add karein", "sc2.noItemsScan", "No items — add via scan or search", "کوئی آئٹم نہیں — اسکین یا تلاش سے شامل کریں"),
 ("Scan → line (qty merge) · qty badalne ke liye table mein edit karein", "sc2.scanLineHint", "Scan → line (qty merge) · edit qty in the table", "اسکین → لائن (qty ضم) · qty ٹیبل میں تبدیل کریں"),
 ("Kam az kam ek item add karein", "sc2.needOneItem", "Add at least one item", "کم از کم ایک آئٹم شامل کریں"),
 ("Supplier select karein", "sc2.selectSupplier", "Select a supplier", "سپلائر منتخب کریں"),
 ("Return save nahi hua", "sc2.returnSaveFail", "Return could not be saved", "واپسی محفوظ نہیں ہوئی"),
 ("Naya product jo catalog mein nahi — manual entry", "sc2.newProductCat", "New product not in catalog — manual entry", "نیا پروڈکٹ کیٹلاگ میں نہیں — دستی اندراج"),
 ("Pichhli rate: record nahi", "sc2.prevRateNone", "Previous rate: no record", "پچھلی ریٹ: ریکارڈ نہیں"),
 ("Items add karein", "sc2.addItems", "Add items", "آئٹمز شامل کریں"),
 ("On credit (supplier udhaar)", "sc2.onCredit", "On credit (supplier credit)", "ادھار (سپلائر کریڈٹ)"),
 ("Off = cash purchase (supplier ka balance nahi barhega)", "sc2.offCashPurchase", "Off = cash purchase (supplier balance will not increase)", "آف = کیش خریداری (سپلائر بیلنس نہیں بڑھے گا)"),
 ("Kisi bhi open PO ki pending lines yahan load karein", "sc2.loadPendingLines", "Load pending lines of any open PO here", "کسی بھی کھلے پی او کی زیرِ التوا لائنیں یہاں لوڈ کریں"),
 ("Koi open PO nahi", "sc2.noOpenPo", "No open POs", "کوئی کھلا پی او نہیں"),
 ("Naya product jo store mein nahi — manual entry", "sc2.newProductStore", "New product not in store — manual entry", "نیا پروڈکٹ اسٹور میں نہیں — دستی اندراج"),
 ("Total mein jud jayega (supplier bill ke mutabiq)", "sc2.addToTotal", "Will be added to total (per supplier bill)", "ٹوٹل میں شامل ہو گا (سپلائر بل کے مطابق)"),
 ("Abhi koi line nahi", "sc2.noLinesYet", "No lines yet", "ابھی کوئی لائن نہیں"),
 ("PO load hone ka intezar… ya scan/search se items add karein", "sc2.waitingPo", "Waiting for PO to load… or add items via scan/search", "پی او لوڈ ہونے کا انتظار… یا اسکین/تلاش سے آئٹمز شامل کریں"),
 ("Scan karein ya 📋 poori list se items add karein", "sc2.scanOrList", "Scan, or add items from the 📋 full list", "اسکین کریں یا 📋 مکمل فہرست سے آئٹمز شامل کریں"),
 ("Pehle items add karein (scan ya poori list se)", "sc2.addItemsFirst", "Add items first (scan or full list)", "پہلے آئٹمز شامل کریں (اسکین یا مکمل فہرست سے)"),
 (" line(s) ki qty 0 hai — theek karein", "sc2.qtyZero", " line(s) have qty 0 — fix them", " لائن(وں) کی qty 0 ہے — درست کریں"),
 ("Credit purchase ke liye supplier chunein", "sc2.creditNeedsSupplier", "Select a supplier for credit purchase", "کریڈٹ خریداری کے لیے سپلائر منتخب کریں"),
 ("PO chunein to uski pending lines khud aa jayengi. Bina PO = direct purchase.", "sc2.poHint", "Pick a PO and its pending lines load automatically. No PO = direct purchase.", "پی او منتخب کریں تو اس کی زیرِ التوا لائنیں خود آ جائیں گی۔ بغیر پی او = براہِ راست خریداری۔"),
 ("Scanner se scan karein (POS jaisa): Found → Added → field khali. Ya 📋 list se multi-select.", "sc2.scannerHint", "Scan with a scanner (like POS): Found → Added → field cleared. Or multi-select from the 📋 list.", "اسکینر سے اسکین کریں (پی او ایس جیسا): مل گیا → شامل → فیلڈ خالی۔ یا 📋 فہرست سے ملٹی سلیکٹ۔"),
 ("Koi entry nahi", "sc2.noEntries", "No entries", "کوئی انٹری نہیں"),
 ("Opening udhaar", "sc2.openingUdhaar", "Opening credit", "افتتاحی ادھار"),
 ("Koi payment nahi", "sc2.noPayments", "No payments", "کوئی ادائیگی نہیں"),
 ("Koi kharcha nahi", "sc2.noExpenses", "No expenses", "کوئی خرچ نہیں"),
 ("Koi open cash session nahi", "sc2.noCashSession", "No open cash session", "کوئی کھلا کیش سیشن نہیں"),
 ("Closing ke waqt count karein", "sc2.countAtClose", "Count at closing time", "بند کرنے کے وقت گنتی کریں"),
 ("Print nahi ho saka", "sc2.printFail", "Could not print", "پرنٹ نہیں ہو سکا"),
 ("PDF nahi ban saki", "sc2.pdfFail", "Could not create PDF", "پی ڈی ایف نہیں بن سکی"),
 ("Copy nahi ban saki", "sc2.copyFail", "Could not copy", "کاپی نہیں بن سکی"),
 ("Share nahi ho saka", "sc2.shareFail", "Could not share", "شیئر نہیں ہو سکا"),
 ("Sales, profit, stock, udhaar — sab kuch", "sc2.dashAll", "Sales, profit, stock, credit — everything", "سیل، منافع، اسٹاک، ادھار — سب کچھ"),
 ("Receivables (udhaar)", "sc2.receivables", "Receivables (credit)", "وصولی (ادھار)"),
 ("Offline — report data maujood nahi", "sc2.offlineReport", "Offline — report data unavailable", "آف لائن — رپورٹ ڈیٹا موجود نہیں"),
 ("Report catalog load nahi hua", "sc2.reportCatFail", "Report catalog failed to load", "رپورٹ کیٹلاگ لوڈ نہیں ہوا"),
 ("Pichhla baqaya (prev)", "sc2.prevBalPrev", "Previous balance (prev)", "پچھلا بقایا (سابقہ)"),
 ("Naya udhaar", "sc2.newUdhaar", "New credit", "نیا ادھار"),
 ("Wasooli", "sc2.collections", "Collections", "وصولی"),
 ("Total udhaar (closing)", "sc2.totalUdhaarClose", "Total credit (closing)", "کل ادھار (اختتام)"),
 ("Customer-wise udhaar", "sc2.customerUdhaar", "Customer-wise credit", "کسٹمر کے حساب ادھار"),
 ("Pichhla baqaya", "sc2.prevBal", "Previous balance", "پچھلا بقایا"),
 ("Kisi user/group ko extra ya denied fields dene ke liye Users / Groups tab ke extra & denied permissions istemal karein. ", "sc2.permHint", "To grant or deny extra fields to a user/group, use the extra & denied permissions in the Users / Groups tab. ", "کسی یوزر/گروپ کو اضافی یا مسترد فیلڈز دینے کے لیے یوزرز / گروپس ٹیب کی extra & denied اجازتیں استعمال کریں۔ "),
 ("⚠ Permissions load nahi hui", "sc2.permsLoadFail", "⚠ Permissions failed to load", "⚠ اجازتیں لوڈ نہیں ہوئیں"),
 ("Koi log nahi", "sc2.noLogs", "No logs", "کوئی لاگ نہیں"),
 ("Saare roles ko default permissions par wapas karein?", "sc2.resetPermsConfirm", "Reset all roles to default permissions?", "تمام رولز ڈیفالٹ اجازتوں پر واپس کریں؟"),
 (" role save nahi ho sake — ", "sc2.roleSaveFail", " role could not be saved — ", " رول محفوظ نہیں ہو سکا — "),
 ("Permission catalog load nahi hua", "sc2.permCatFail", "Permission catalog failed to load", "اجازت کیٹلاگ لوڈ نہیں ہوا"),
 ("Koi branch defined nahi", "sc2.noBranches", "No branches defined", "کوئی برانچ متعین نہیں"),
 ("Role ke baad “Allow” extra permission deta hai, “Deny” usay block kar deta hai. Har row par click karke Inherit → Allow → Deny badal dein.", "sc2.permMatrixHint", "Beyond the role, “Allow” grants an extra permission, “Deny” blocks it. Click a row to cycle Inherit → Allow → Deny.", "رول کے بعد “Allow” اضافی اجازت دیتا ہے، “Deny” اسے روکتا ہے۔ کسی قطار پر کلک کر کے Inherit → Allow → Deny بدلیں۔"),
]

fp = "apps-script/App_Screens2.html"
s = io.open(fp, encoding="utf-8").read()
done, miss = [], []
for raw, key, en, ur in M:
    lit = "'" + raw.replace("'", "\\'") + "'"
    if s.count(lit) == 0:
        miss.append(key); continue
    rep = "T.t('" + key + "','" + en.replace("'", "\\'") + "')"
    s = s.replace(lit, rep)
    done.append((key, raw, en, ur))
io.open(fp, "w", encoding="utf-8").write(s)

# dict entries (roman = asli roman literal)
mock = io.open("demo/mock.js", encoding="utf-8").read()
anchor = "  'pos.codeNotFound': { key: 'pos.codeNotFound', en: 'Code not found', roman: 'Code nahi mila', ur: 'کوڈ نہیں ملا' },"
lines = []
for key, raw, en, ur in done:
    roman = raw.replace("\\'", "'").replace("'", "\\'")
    en_e = en.replace("'", "\\'")
    ur_e = ur.replace("'", "\\'")
    lines.append("  '%s': { key: '%s', en: '%s', roman: '%s', ur: '%s' }," % (key, key, en_e, roman, ur_e))
assert mock.count(anchor) == 1
mock = mock.replace(anchor, anchor + "\n" + "\n".join(lines))
io.open("demo/mock.js", "w", encoding="utf-8").write(mock)

print("migrated:", len(done), "| missing:", miss)
