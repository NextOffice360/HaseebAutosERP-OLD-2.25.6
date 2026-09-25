#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r11 slice-3: Dashboards + Config + Accounting Roman literals → T.t (EN fallback) + mock dict"""
import io

ANCHOR = "  'pos.codeNotFound': { key: 'pos.codeNotFound', en: 'Code not found', roman: 'Code nahi mila', ur: 'کوڈ نہیں ملا')},"

DASH = [
 ("Udhaar (receivable)","dash.receivableKpi","Credit (receivable)","وصول کے لیے ادھار"),
 ("Is range me koi sale nahi","dash.noSalesRange","No sales in this range","اس رینج میں کوئی سیل نہیں"),
 ("Udhaar recovery","dash.recovery","Credit recovery","ادھار وصولی"),
 ("Is range me koi payment nahi","dash.noPaymentsRange","No payments in this range","اس رینج میں کوئی ادائیگی نہیں"),
 ("📒 Udhaar (receivables)","dash.receivablesCard","📒 Credit (receivables)","📒 وصولی (ادھار)"),
 ("Koi udhaar nahi 🎉","dash.noUdhaar","No credit outstanding 🎉","کوئی ادھار باقی نہیں 🎉"),
 ("💰 Receive udhaar","dash.receiveUdhaar","💰 Receive credit","💰 ادھار وصول کریں"),
 (" udhaar baqaya","dash.udhaarOutstanding"," credit outstanding"," ادھار باقی"),
 ("Customers se recovery ka plan banaayein; purani invoices pehle follow up karein.","dash.recoveryHint","Plan recoveries with customers; follow up on older invoices first.","کسٹمرز کے ساتھ وصولی کا منصوبہ بنائیں؛ پرانی انوائسز کا پیچھا پہلے کریں۔"),
 ("Payment terms ke mutabiq clearing se relationship aur discount terms behtar hoti hain.","dash.termsHint","Paying on terms improves relationships and discount terms.","ادائیگی شرائط کے مطابق ہو تو تعلقات اور ڈسکاؤنٹ شرائط بہتر ہوتے ہیں۔"),
 ("Low stock, expiry aur udhaar ki alerts abhi check karein.","dash.alertsHint","Check low-stock, expiry and credit alerts now.","کم اسٹاک، ایکسپائری اور ادھار کے الرٹس ابھی چیک کریں۔"),
 ("Udhaar customers","dash.udhaarCustomers","Credit customers","ادھار کسٹمرز"),
 ("Total udhaar","dash.totalUdhaar","Total credit","کل ادھار"),
 ("Sabse zyada udhaar","dash.maxUdhaar","Highest credit","سب سے زیادہ ادھار"),
 ("With udhaar","dash.withUdhaar","With credit","ادھار پر"),
 ("Pichhla udhaar (prev)","dash.prevUdhaarPrev","Previous credit (prev)","پچھلا ادھار (سابقہ)"),
 ("Naya udhaar","dash.newUdhaar","New credit","نیا ادھار"),
 ("Wasooli","dash.collections","Collections","وصولی"),
 ("Customer-wise udhaar","dash.customerUdhaar","Customer-wise credit","کسٹمر کے حساب ادھار"),
 ("Pichhla baqaya (prev)","dash.prevBalPrev","Previous balance (prev)","پچھلا بقایا (سابقہ)"),
 ("Pichhla baqaya","dash.prevBal","Previous balance","پچھلا بقایا"),
 ("Data nahi","dash.noData","No data","کوئی ڈیٹا نہیں"),
 ("Wizard nahi khula","dash.wizardFail","Wizard did not open","وزرڈ کھلا نہیں"),
 ("🧭 Setup wizard dobara chalayen · دوبارہ سیٹ اپ","dash.wizardRerun","🧭 Run setup wizard again","🧭 سیٹ اپ وزرڈ دوبارہ چلائیں"),
 ("Report nahi ban saki","dash.reportFail","Could not create report","رپورٹ نہیں بن سکی"),
 ("Reports load nahi ho sakeen","dash.reportsFail","Reports could not load","رپورٹس لوڈ نہیں ہو سکیں"),
 ("Abhi koi auto report nahi — shop open/close karte hi yahan aa jayegi","dash.noAutoReport","No auto report yet — it appears here after shop open/close","ابھی کوئی آٹو رپورٹ نہیں — دکان کھولنے/بند کرتے ہی یہاں آ جائے گی"),
 ("CSV nahi bana","dash.csvFail","Could not create CSV","سی ایس وی نہیں بنا"),
 ("Share nahi ho saka","dash.shareFail","Could not share","شیئر نہیں ہو سکا"),
 ("Din shuru karte waqt drawer ki opening cash (float) darj karein. Day-end par expected vs counted ka farq khud nikal aayega.","dash.openingFloatHint","Enter drawer opening cash (float) at day start. Expected vs counted variance is computed at day-end.","دن شروع کرتے وقت دراز کی اوپننگ کیش (فلوٹ) درج کریں۔ دن کے اختتام پر متوقع بمقابلہ گنی گئی کا فرق خود نکل آئے گا۔"),
 ("Abhi koi payment nahi","dash.noPaymentsYet","No payments yet","ابھی کوئی ادائیگی نہیں"),
 ("Koi cash movement nahi","dash.noCashMoves","No cash movements","کوئی کیش موومنٹ نہیں"),
 ("Udhaar (credit given)","dash.creditGiven","Credit (given)","ادھار (دیا گیا)"),
 ("Amount darj karein","dash.enterAmount","Enter the amount","رقم درج کریں"),
 ("Shop close karein? Counted ","dash.shopCloseConfirm","Close the shop? Counted ","دکان بند کریں؟ گنی گئی "),
 ("Popup blocked — browser se allow karein","dash.popupBlocked","Popup blocked — allow it in the browser","پاپ اپ بلاک — براؤزر میں اجازت دیں"),
 ("Report bhejein","dash.sendReport","Send report","رپورٹ بھیجیں"),
 ("Number nahi mila","dash.noNumber","Number not found","نمبر نہیں ملا"),
 ("CSV download ho gayi","dash.csvDone","CSV downloaded","سی ایس وی ڈاؤن لوڈ ہو گئی"),
 ("Report load nahi hua","dash.reportLoadFail","Report failed to load","رپورٹ لوڈ نہیں ہوا"),
 ("Koi purani session nahi","dash.noPrevSessions","No previous sessions","کوئی پچھلا سیشن نہیں"),
]

CONF = [
 ("Koi unsaved tabdeeli nahi — sab mehfooz hai","cfg.noUnsaved","No unsaved changes — everything is saved","کوئی غیر محفوظ تبدیلی نہیں — سب محفوظ ہے"),
 ("Logo upload ho gaya ✅","cfg.logoDone","Logo uploaded ✅","لوگو اپ لوڈ ہو گیا ✅"),
 ("🖼 Koi logo nahi","cfg.noLogo","🖼 No logo","🖼 کوئی لوگو نہیں"),
 ("(poori app aise hi dikhaye gi — save ki zaroorat nahi)","cfg.livePreviewHint","(the whole app will look like this — no save needed)","(پوری ایپ ایسے ہی دکھے گی — محفوظ کرنے کی ضرورت نہیں)"),
 ("Schema load nahi hua — backend deploy check karein","cfg.schemaFail","Schema failed to load — check the backend deploy","اسکیما لوڈ نہیں ہوئی — بیک اینڈ ڈیپلائے چیک کریں"),
 ("Koi tabdeeli nahi — sab pehle se save hai","cfg.noChanges","No changes — everything is already saved","کوئی تبدیلی نہیں — سب پہلے سے محفوظ ہے"),
 (" setting save ho gayi ✅","cfg.savedCount"," setting(s) saved ✅"," سیٹنگ محفوظ ہو گئی ✅"),
 ("Save nahi hua: ","cfg.saveFail","Could not save: ","محفوظ نہیں ہوا: "),
 ("Save nahi hua","cfg.saveFailShort","Could not save","محفوظ نہیں ہوا"),
 ("Is tab ke defaults restore karein?","cfg.restoreDefaults","Restore defaults for this tab?","اس ٹیب کے ڈیفالٹس بحال کریں؟"),
 ("Plan copy ho gaya","cfg.planCopied","Plan copied","پلان کاپی ہو گیا"),
 ("Free mode (LINK): koi API key nahi — wa.me link se WhatsApp khul jata hai. ","cfg.freeModeHint","Free mode (LINK): no API key — WhatsApp opens via a wa.me link. ","فری موڈ (LINK): کوئی API key نہیں — wa.me لنک سے واٹس ایپ کھلتا ہے۔ "),
 ("Abhi koi import nahi hua","cfg.noImports","No imports yet","ابھی کوئی امپورٹ نہیں ہوا"),
 ("Koi points nahi mile","cfg.noPoints","No points earned","کوئی پوائنٹس نہیں ملے"),
 ("Koi job install nahi hai","cfg.noJobs","No jobs installed","کوئی جاب انسٹال نہیں"),
 ("“Install jobs” dabayein — phir Google authorization allow karein.","cfg.installJobsHint","Tap “Install jobs” — then allow Google authorization.","“Install jobs” دبائیں — پھر گوگل اجازت دیں۔"),
 ("Label zaroori hai","cfg.labelReq","Label is required","لیبل ضروری ہے"),
 ("Default menu restore karein? Custom menu delete ho jayega.","cfg.menuRestore","Restore the default menu? The custom menu will be deleted.","ڈیفالٹ مینو بحال کریں؟ کسٹم مینو ڈیلیٹ ہو جائے گا۔"),
 ("Screen id aur label zaroori hain","cfg.screenReq","Screen id and label are required","اسکرین آئی ڈی اور لیبل ضروری ہیں"),
 ("Koi template nahi — upar button se banayein","cfg.noTemplates","No templates — create one with the button above","کوئی ٹیمپلیٹ نہیں — اوپر کے بٹن سے بنائیں"),
 ("Template delete karein?","cfg.templateDeleteConfirm","Delete this template?","ٹیمپلیٹ ڈیلیٹ کریں؟"),
 ("Template delete ho gaya","cfg.templateDeleted","Template deleted","ٹیمپلیٹ ڈیلیٹ ہو گیا"),
 ("dobara koshish karein","cfg.retryTail",", please try again","دوبارہ کوشش کریں"),
 ("JSON ghalat hai: ","cfg.jsonBad","Invalid JSON: ","جے سون غلط ہے: "),
 ("Name zaroori hai","cfg.nameReq","Name is required","نام ضروری ہے"),
 ("Yeh idempotent hai — dobara chalane se duplicate nahi banta, koi row delete nahi hoti.","cfg.idempotentNote","This is idempotent — re-running creates no duplicates and deletes no rows.","یہ idempotent ہے — دوبارہ چلانے سے ڈپلیکیٹ نہیں بنتا، کوئی قطار ڈیلیٹ نہیں ہوتی۔"),
 ("Maujuda items ka stock chera nahi jata","cfg.stockUntouched","Existing item stock is not touched","موجودہ آئٹمز کا اسٹاک نہیں چھیڑا جاتا"),
 (" update (koi write nahi hua)","cfg.noWriteTail"," update (no writes)"," اپ ڈیٹ (کوئی رائٹ نہیں ہوا)"),
 (" price farq","cfg.priceDiffTail"," price difference"," قیمت فرق"),
 ("Rate farq: ","cfg.rateDiff","Rate difference: ","ریٹ فرق: "),
 ("Items, customers ya suppliers — Sheet/Excel se paste karein.","cfg.pasteHint","Items, customers or suppliers — paste from Sheet/Excel.","آئٹمز، کسٹمرز یا سپلائرز — شیٹ/ایکسل سے پیسٹ کریں۔"),
 ("Yahan config JSON paste karein","cfg.pasteJson","Paste config JSON here","یہاں کنفیگ JSON پیسٹ کریں"),
 ("JSON ghalat hai","cfg.jsonBadShort","Invalid JSON","جے سون غلط ہے"),
 ("mukammal","cfg.complete","complete","مکمل"),
 ("Ye columns code likhta hai par sheet mein nahi — data silently drop ho sakta hai. Repair se data delete nahi hota, sirf columns judte hain.","cfg.repairNote","These columns are written by code but missing in the sheet — data may drop silently. Repair never deletes data; it only adds columns.","یہ کالم کوڈ لکھتا ہے مگر شیٹ میں نہیں — ڈیٹا خاموشی سے گر سکتا ہے۔ ریپئر سے ڈیٹا ڈیلیٹ نہیں ہوتا، صرف کالم جڑتے ہیں۔"),
 ("Repair ho gaya: ","cfg.repaired","Repaired: ","ریپئر ہو گیا: "),
]

ACC = [
 ("Wallet component load nahi hua","acc.walletFail","Wallet component failed to load","والٹ کمپوننٹ لوڈ نہیں ہوا"),
 ("Koi data nahi","acc.noData","No data","کوئی ڈیٹا نہیں"),
 ("Accounting dashboard load nahi hua","acc.dashFail","Accounting dashboard failed to load","اکاؤنٹنگ ڈیش بورڈ لوڈ نہیں ہوا"),
 ("Receivables (udhaar)","acc.receivables","Receivables (credit)","وصولی (ادھار)"),
 ("Vouchers load nahi hue","acc.vouchersFail","Vouchers failed to load","واؤچرز لوڈ نہیں ہوئے"),
 ("Is range mein koi voucher nahi","acc.noVouchers","No vouchers in this range","اس رینج میں کوئی واؤچر نہیں"),
 ("Voucher load nahi hua","acc.voucherFail","Voucher failed to load","واؤچر لوڈ نہیں ہوا"),
 ("Ye voucher void karein? Balance se hat jayega.","acc.voidConfirm","Void this voucher? It will be removed from the balance.","یہ واؤچر void کریں؟ بیلنس سے ہٹ جائے گا۔"),
 ("Line add karein","acc.addLine","Add a line","لائن شامل کریں"),
 ("Debit aur credit barabar nahi (farq ","acc.unbalanced","Debit and credit are not equal (difference ","ڈیبٹ اور کریڈٹ برابر نہیں (فرق "),
 ("Amount darj karein","acc.enterAmount","Enter the amount","رقم درج کریں"),
 ("Ledger load nahi hua","acc.ledgerFail","Ledger failed to load","لیجر لوڈ نہیں ہوا"),
 ("Is range mein koi entry nahi","acc.noEntries","No entries in this range","اس رینج میں کوئی انٹری نہیں"),
 ("Sab approve karein","acc.approveAll","Approve all","سب منظور کریں"),
 ("Is range mein koi expense nahi","acc.noExpenses","No expenses in this range","اس رینج میں کوئی خرچ نہیں"),
 ("📎 Attachment kholein","acc.openAttachment","📎 Open attachment","📎 اٹیچمنٹ کھولیں"),
 ("Naam zaroori hai","acc.nameReq","Name is required","نام ضروری ہے"),
 ("Koi bank account nahi — Chart of accounts mein banayein","acc.noBank","No bank account — create one in Chart of accounts","کوئی بینک اکاؤنٹ نہیں — چارٹ آف اکاؤنٹس میں بنائیں"),
 ("Bank book load nahi hua","acc.bankBookFail","Bank book failed to load","بینک بک لوڈ نہیں ہوا"),
 ("Is range mein koi bank entry nahi","acc.noBankEntries","No bank entries in this range","اس رینج میں کوئی بینک انٹری نہیں"),
 ("CSV paste karein: date, reference, amount, direction (IN/OUT). Negative amount = OUT.","acc.csvPasteHint","Paste CSV: date, reference, amount, direction (IN/OUT). Negative amount = OUT.","سی ایس وی پیسٹ کریں: تاریخ، حوالہ، رقم، سمت (IN/OUT)۔ منفی رقم = OUT۔"),
 ("Koi valid line nahi","acc.noValidLines","No valid lines","کوئی درست لائن نہیں"),
 ("Trial balance load nahi hui","acc.tbFail","Trial balance failed to load","ٹرائل بیلنس لوڈ نہیں ہوئی"),
 ("Koi balance nahi","acc.noBalances","No balances","کوئی بیلنس نہیں"),
 ("P&L load nahi hua","acc.plFail","P&L failed to load","پی اینڈ ایل لوڈ نہیں ہوا"),
 ("Koi entry nahi","acc.noEntriesShort","No entries","کوئی انٹری نہیں"),
 ("Balance sheet load nahi hui","acc.bsFail","Balance sheet failed to load","بیلنس شیٹ لوڈ نہیں ہوئی"),
 ("Cash book load nahi hua","acc.cashBookFail","Cash book failed to load","کیش بک لوڈ نہیں ہوا"),
 ("Is range mein koi cash movement nahi","acc.noCashMoves","No cash movements in this range","اس رینج میں کوئی کیش موومنٹ نہیں"),
 ("Koi bhi account chunein — uska ledger (opening → entries → closing) popup mein khulega.","acc.ledgerHint","Pick any account — its ledger (opening → entries → closing) opens in a popup.","کوئی بھی اکاؤنٹ چنیں — اس کا لیجر (اوپننگ → انٹریز → کلوزنگ) پاپ اپ میں کھلے گا۔"),
 ("🧮 Purane documents se vouchers banayein","acc.vouchersFromDocs","🧮 Create vouchers from old documents","🧮 پرانے دستاویزات سے واؤچر بنائیں"),
 ("Jo sales, GRN, payments aur expenses pehle banaye gaye the aur unka voucher nahi bana, ","acc.vfdIntro","Sales, GRNs, payments and expenses created earlier that have no voucher yet — ","وہ سیلز، جی آر این، ادائیگیاں اور اخراجات جو پہلے بنائے گئے تھے اور ان کا واؤچر نہیں بنا — "),
 ("un sab ke liye abhi vouchers ban jayenge. Ye ek baar ka kaam hai — dobara chalane par ","acc.vfdMid","vouchers will now be created for all of them. This is a one-time job — re-running it ","ان سب کے لیے ابھی واؤچر بن جائیں گے۔ یہ ایک بار کا کام ہے — دوبارہ چلانے پر "),
 ("kuch nahi badlega (har document ka sirf ek voucher banta hai).","acc.vfdEnd","changes nothing (each document gets only one voucher).","کچھ نہیں بدلتا (ہر دستاویز کا صرف ایک واؤچر بنتا ہے)۔"),
 ("Sale → Dr Cash/Bank + Dr Udhaar, Cr Sales · GRN → Dr Purchase, Cr Supplier · ","acc.vfdRule","Sale → Dr Cash/Bank + Dr Credit, Cr Sales · GRN → Dr Purchase, Cr Supplier · ","سیل → ڈی کیش/بینک + ڈی ادھار، کریڈٹ سیل · جی آر این → ڈی خریداری، کریڈٹ سپلائر · "),
]

JOB = [("apps-script/App_Dashboards.html", DASH), ("apps-script/App_Config.html", CONF), ("apps-script/App_Accounting.html", ACC)]

mock = io.open("demo/mock.js", encoding="utf-8").read()
anchor = "  'sc2.pendingLoaded': { key: 'sc2.pendingLoaded', en: ' pending lines loaded', roman: ' pending lines load ho gayin', ur: ' زیرِ التوا لائنیں لوڈ ہو گئیں' },"
assert mock.count(anchor) == 1
lines = []
total, miss = 0, []
for fp, M in JOB:
    s = io.open(fp, encoding="utf-8").read()
    # lambe literals pehle (takee chhota substring pehle na match ho)
    for raw, key, en, ur in sorted(M, key=lambda x: -len(x[0])):
        lit = "'" + raw.replace("'", "\\'") + "'"
        if s.count(lit) == 0:
            miss.append(key); continue
        s = s.replace(lit, "T.t('" + key + "','" + en.replace("'", "\\'") + "')")
        lines.append("  '%s': { key: '%s', en: '%s', roman: '%s', ur: '%s' }," % (key, key, en.replace("'", "\\'"), raw.replace("\\'", "'").replace("'", "\\'"), ur))
        total += 1
    io.open(fp, "w", encoding="utf-8").write(s)

mock = mock.replace(anchor, anchor + "\n" + "\n".join(lines))
io.open("demo/mock.js", "w", encoding="utf-8").write(mock)
print("migrated:", total, "| missing:", miss)
