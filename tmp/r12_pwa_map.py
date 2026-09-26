#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r12: Pwa_Shell + Pwa_Warehouse Roman literals → T.t (EN fallback) + mock dict"""
import io

SHELL = [
 ('Jawab nahi aaya \\u2014 dobara koshish kar sakte hain', 'pwa.noAnswerRetry', 'No response \\u2014 you can try again', 'جواب نہیں آیا — دوبارہ کوشش کر سکتے ہیں'),
 ('Dobara koshish karein', 'pwa.retry', 'Try again', 'دوبارہ کوشش کریں'),
 ('Internet nahi hai', 'pwa.noInternet', 'No internet', 'انٹرنیٹ نہیں ہے'),
 ('Connection wapas aane par dobara koshish karein; offline queue khud istemal hogi.', 'pwa.connBackHint', 'Try again when the connection returns; the offline queue will be used automatically.', 'کنکشن واپس آئے تو دوبارہ کوشش کریں؛ آف لائن قطار خود استعمال ہو گی۔'),
 ('Jawab nahi aaya', 'pwa.noAnswer', 'No response', 'جواب نہیں آیا'),
 ('Server se jawab waqt par nahi mila \\u2014 dobara koshish karein.', 'pwa.serverTimeout', 'No timely response from the server \\u2014 try again.', 'سرور سے جواب وقت پر نہیں ملا — دوبارہ کوشش کریں۔'),
 ('Session / ijazat ka masla', 'pwa.sessionIssue', 'Session / permission issue', 'سیشن / اجازت کا مسئلہ'),
 ('Dobara login karein ya admin se poochein.', 'pwa.reloginHint', 'Log in again or ask the admin.', 'دوبارہ لاگ ان کریں یا ایڈمن سے پوچھیں۔'),
 ('Maloomat theek karein', 'pwa.fixInput', 'Fix the input', 'معلومات درست کریں'),
 ('Retry se hal nahi hoga \\u2014 fields durust karein.', 'pwa.retryWontHelp', 'Retrying will not help \\u2014 correct the fields.', 'دوبارہ کوشش سے حل نہیں ہوگا — فیلڈز درست کریں۔'),
 ('2\\u20133 second ruk kar dobara koshish karein.', 'pwa.wait2sRetry', 'Wait 2\\u20133 seconds and try again.', '2–3 سیکنڈ رک کر دوبارہ کوشش کریں۔'),
 ('Dobara koshish karein; masla rahe to system log dekhein.', 'pwa.retryCheckLog', 'Try again; if it persists, check the system log.', 'دوبارہ کوشش کریں؛ مسئلہ رہے تو سسٹم لاگ دیکھیں۔'),
 ('Kaam mukammal nahi hua', 'pwa.opIncomplete', 'The operation did not complete', 'کام مکمل نہیں ہوا'),
 ('Dobara koshish karein; masla rahe to support ko batayein.', 'pwa.retrySupport', 'Try again; if it persists, contact support.', 'دوبارہ کوشش کریں؛ مسئلہ رہے تو سپورٹ کو بتائیں۔'),
 (' ka kaam tha \\u2014 pehle list refresh kar ke dekhein ke kaam ho chuka hai ya nahi, phir dobara karein.', 'pwa.writeStaleTail', ' was done \\u2014 refresh the list first to check whether it already went through, then retry.', ' کا کام تھا — پہلے فہرست ریفرش کر کے دیکھیں کہ کام ہو چکا ہے یا نہیں، پھر دوبارہ کریں۔'),
 ('\\u21BB Dobara koshish karein', 'pwa.retryBtn', '\\u21BB Try again', '↻ دوبارہ کوشش کریں'),
 ('Band karein', 'pwa.close', 'Close', 'بند کریں'),
 ('Offline queue bhar gayi — pehle sync karein', 'pwa.queueFull', 'Offline queue is full — sync first', 'آف لائن قطار بھر گئی — پہلے سنک کریں'),
 ('Sync ke liye kuch nahi', 'pwa.nothingToSync', 'Nothing to sync', 'سنک کے لیے کچھ نہیں'),
 ('Abhi net nahi hai', 'pwa.noNetYet', 'No network right now', 'ابھی نیٹ نہیں ہے'),
 ('Offline — net aane par dobara koshish karein (', 'pwa.offlineRetry', 'Offline — try again when the network returns (', 'آف لائن — نیٹ آنے پر دوبارہ کوشش کریں ('),
 ('Backend not reachable — Settings → Backend URL check karein / offline queue use karein', 'pwa.backendUnreachable', 'Backend not reachable — check Settings → Backend URL / use the offline queue', 'بیک اینڈ تک رسائی نہیں — سیٹنگز → بیک اینڈ یو آر ایل چیک کریں / آف لائن قطار استعمال کریں'),
 ('Network error — backend URL ya net check karein', 'pwa.networkError', 'Network error — check the backend URL or your connection', 'نیٹ ورک ایرر — بیک اینڈ یو آر ایل یا نیٹ چیک کریں'),
 ('Home screen par add karein — tez aur offline', 'pwa.installHint', 'Add to home screen — faster and offline', 'ہوم اسکرین پر شامل کریں — تیز اور آف لائن'),
 ('Notifications supported nahi', 'pwa.noNotifSupport', 'Notifications not supported', 'نوٹیفکیشنز سپورٹڈ نہیں'),
 ('Camera se barcode scan karein', 'pwa.cameraScan', 'Scan barcode with camera', 'کیمرے سے بارکوڈ اسکین کریں'),
 ('📷 Scan — Code enter karein', 'pwa.scanEnterCode', '📷 Scan — enter code', '📷 اسکین — کوڈ درج کریں'),
 ('Is device par camera scan available nahi — neeche code type karein ya photo upload karein.', 'pwa.noCamScan', 'Camera scan is not available on this device — type the code below or upload a photo.', 'اس ڈیوائس پر کیمرہ اسکین دستیاب نہیں — نیچے کوڈ ٹائپ کریں یا تصویر اپ لوڈ کریں۔'),
 ('Camera permission blocked ya available nahi — manual code ya photo se scan karein.', 'pwa.camBlocked', 'Camera permission is blocked or unavailable — use a manual code or a photo.', 'کیمرہ اجازت بلاک یا غیر دستیاب — دستی کوڈ یا تصویر سے اسکین کریں۔'),
 ('↗ External scanner kholein', 'pwa.openExtScanner', '↗ Open external scanner', '↗ بیرونی اسکینر کھولیں'),
 ('Photo se code nahi mila — neeche manual likhein', 'pwa.noCodeInPhoto', 'No code found in the photo — type it manually below', 'تصویر میں کوڈ نہیں ملا — نیچے دستی لکھیں'),
 ('Photo load nahi hui', 'pwa.photoFail', 'Photo failed to load', 'تصویر لوڈ نہیں ہوئی'),
 ('Is browser me photo decode nahi — manual code likhein', 'pwa.photoDecodeFail', 'This browser cannot decode the photo — type the code manually', 'اس براؤزر میں تصویر ڈی کوڈ نہیں — دستی کوڈ لکھیں'),
 ('Tip: Same scanner UI har PWA me — camera permission dena ho to browser Settings → Site → Camera Allow karein.', 'pwa.scannerTip', 'Tip: the same scanner UI in every PWA — to grant camera access, browser Settings → Site → Camera → Allow.', 'ٹپ: ہر PWA میں ایک ہی اسکینر UI — کیمرہ اجازت کے لیے براؤزر Settings → Site → Camera → Allow کریں۔'),
 (' matches — list se chunein', 'pwa.multiMatchesTail', ' matches — pick from the list', ' میدیں — فہرست سے چنیں'),
 ('Code nahi mila: ', 'pwa.codeNotFound', 'Code not found: ', 'کوڈ نہیں ملا: '),
 ('Koi item nahi mila — search badlein', 'pwa.noItemFound', 'No item found — change the search', 'کوئی آئٹم نہیں ملا — تلاش بدلیں'),
 ('Koi item select nahi — scan ya tick karein', 'pwa.noItemSelected', 'No item selected — scan or tick', 'کوئی آئٹم منتخب نہیں — اسکین یا ٹک کریں'),
 ('Koi customer nahi', 'pwa.noCustomer', 'No customer', 'کوئی کسٹمر نہیں'),
]

WARE = [
 ('🔎 Scan karein ya naam / code likhein…', 'pwh.scanPh', '🔎 Scan or type name / code…', '🔎 اسکین کریں یا نام / کوڈ لکھیں…'),
 (' matches — list se chunein', 'pwh.multiMatchesTail', ' matches — pick from the list', ' میدیں — فہرست سے چنیں'),
 ('Barcode / code scan karein', 'pwh.scanBarcode', 'Scan barcode / code', 'بارکوڈ / کوڈ اسکین کریں'),
 ('Pehle bin chunein', 'pwh.pickBinFirst', 'Pick a bin first', 'پہلے بن چنیں'),
 ('Pehle dono bins chunein', 'pwh.pickBothBins', 'Pick both bins first', 'پہلے دونوں بنز چنیں'),
 ('Koi item nahi mila — code ya naam check karein', 'pwh.noItem', 'No item found — check the code or name', 'کوئی آئٹم نہیں ملا — کوڈ یا نام چیک کریں'),
 ('Abhi kuch nahi — PO load karein ya scan karein', 'pwh.emptyYet', 'Nothing yet — load a PO or scan', 'ابھی کچھ نہیں — پی او لوڈ کریں یا اسکین کریں'),
 ('Kam karein', 'pwh.decrease', 'Decrease', 'کم کریں'),
 ('Zyada karein', 'pwh.increase', 'Increase', 'زیادہ کریں'),
 ('PO select karein — auto-load for GRN', 'pwh.pickPoAuto', 'Select PO — auto-load for GRN', 'پی او منتخب کریں — جی آر این کے لیے آٹو لوڈ'),
 ('PO chunein → expected items GRN cart mein auto-load. Phir actual counted qty match karke GRN confirm karein.', 'pwh.poAutoHint', 'Pick a PO → expected items auto-load into the GRN cart. Then match actual counted qty and confirm the GRN.', 'پی او چنیں → متوقع آئٹمز جی آر این کارٹ میں آٹو لوڈ۔ پھر اصل گنی گئی qty ملا کر جی آر این کنفرم کریں۔'),
 ('Koi pending PO nahi', 'pwh.noPendingPo', 'No pending POs', 'کوئی زیرِ التوا پی او نہیں'),
 ('ERP ▸ Purchase ▸ PO se naya PO banayein', 'pwh.makePoHint', 'Create a new PO in ERP ▸ Purchase ▸ PO', 'ای آر پی ▸ خریداری ▸ پی او سے نیا پی او بنائیں'),
 ('Qty >0 karein', 'pwh.qtyPositive', 'Make qty >0', 'qty >0 کریں'),
 ('Ye item PO mein nahi — phir bhi add kar rahe hain', 'pwh.notInPo', 'This item is not in the PO — adding it anyway', 'یہ آئٹم پی او میں نہیں — پھر بھی شامل کر رہے ہیں'),
 ('Pehle PO load karein ya item scan karein', 'pwh.loadPoFirst', 'Load a PO first or scan an item', 'پہلے پی او لوڈ کریں یا آئٹم اسکین کریں'),
 (' item(s) PO mein nahi — phir bhi GRN karein?', 'pwh.notInPoConfirm', ' item(s) not in the PO — still post the GRN?', ' آئٹم(ز) پی او میں نہیں — پھر بھی جی آر این کریں؟'),
 ('Offline — GRN queue mein save ho gaya', 'pwh.grnQueued', 'Offline — GRN saved to the queue', 'آف لائن — جی آر این قطار میں محفوظ ہو گیا'),
 ('PO detail nahi mila', 'pwh.poDetailFail', 'PO details not found', 'پی او تفصیل نہیں ملی'),
 (' PO items cart mein — verify karke GRN save karein', 'pwh.poInCartTail', ' PO items in the cart — verify and save the GRN', ' پی او آئٹمز کارٹ میں — تصدیق کر کے جی آر این محفوظ کریں'),
 ('Bin chunein… (e.g. A-01)', 'pwh.binPh', 'Pick a bin… (e.g. A-01)', 'بن چنیں… (مثلاً A-01)'),
 ('Bin chunein', 'pwh.pickBin', 'Pick a bin', 'بن چنیں'),
 ('Item add karein', 'pwh.addItem', 'Add an item', 'آئٹم شامل کریں'),
 ('✅ Put-away ho gaya', 'pwh.putawayDone', '✅ Put-away complete', '✅ پٹ اوے مکمل'),
 ('Koi open count sheet nahi', 'pwh.noCountSheet', 'No open count sheet', 'کوئی کھلی کاؤنٹ شیٹ نہیں'),
 ('ERP ▸ Inventory ▸ Count sheet se sheet banayein', 'pwh.makeSheetHint', 'Create a sheet in ERP ▸ Inventory ▸ Count sheet', 'ای آر پی ▸ انوینٹری ▸ کاؤنٹ شیٹ سے شیٹ بنائیں'),
 ('Sheet chunein…', 'pwh.sheetPh', 'Pick a sheet…', 'شیٹ چنیں…'),
 ('Local counted values clear karein? (server values rahenge)', 'pwh.clearCounted', 'Clear locally counted values? (server values remain)', 'مقامی گنی گئی ویلیوز صاف کریں؟ (سرور ویلیوز رہیں گی)'),
 ('Scan se bhi line bhari ja sakti hai — neeche scanner use karein.', 'pwh.scanLineHint', 'Lines can also be filled by scanning — use the scanner below.', 'اسکین سے بھی لائن بھری جا سکتی ہے — نیچے اسکینر استعمال کریں۔'),
 ('Pehle sheet chunein', 'pwh.pickSheetFirst', 'Pick a sheet first', 'پہلے شیٹ چنیں'),
 ('Ye item is sheet mein nahi — filter check karein', 'pwh.notInSheet', 'This item is not in the sheet — check the filter', 'یہ آئٹم اس شیٹ میں نہیں — فلٹر چیک کریں'),
 ('Qty ghalat', 'pwh.qtyBad', 'Invalid qty', 'qty غلط'),
 ('Koi line nahi — search badlein', 'pwh.noLines', 'No lines — change the search', 'کوئی لائن نہیں — تلاش بدلیں'),
 ('Koi local counted nahi', 'pwh.noLocalCounted', 'No local counts', 'کوئی مقامی گنتھی نہیں'),
 ('Dono bins chunein', 'pwh.pickBothBins2', 'Pick both bins', 'دونوں بنز چنیں'),
 ('✅ Transfer ho gaya', 'pwh.transferDone', '✅ Transfer complete', '✅ ٹرانسفر ہو گیا'),
 ('🔄 Transfer karein', 'pwh.transferBtn', '🔄 Transfer', '🔄 ٹرانسفر کریں'),
]

MOCK_ANCHOR = "  'acc.noStmtImport':"
rows = []
total, miss = 0, []
for fp, M, pref in [('apps-script/Pwa_Shell.html', SHELL, 'pwa.'), ('apps-script/Pwa_Warehouse.html', WARE, 'pwh.')]:
    s = io.open(fp, encoding='utf-8').read()
    for raw, key, en, ur in sorted(M, key=lambda x: -len(x[0])):
        lit = "'" + raw + "'"
        if s.count(lit) == 0:
            miss.append(key); continue
        s = s.replace(lit, "T.t('" + key + "','" + en + "')")
        rows.append("  '%s': { key: '%s', en: '%s', roman: '%s', ur: '%s' }," % (key, key, en, raw, ur))
        total += 1
    io.open(fp, 'w', encoding='utf-8').write(s)

mock = io.open('demo/mock.js', encoding='utf-8').read()
idx = mock.find(MOCK_ANCHOR)
assert idx > 0
end = mock.find('\n', idx)
mock = mock[:end + 1] + "\n" + "\n".join(rows) + mock[end:]
io.open('demo/mock.js', 'w', encoding='utf-8').write(mock)
print('migrated:', total, '| missing:', miss)
