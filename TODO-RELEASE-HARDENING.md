# TODO — RELEASE HARDENING (fresh-install + shop rules + reports)

**Banaya:** 2026-09-24 · **Base:** v2.29.2 (working tree) · **Target:** v2.30.0
**Aap ka brief:** analyze → root causes → targeted fixes → docs/ + reliable ZIP → fresh-install validation.

## ⚠️ Regression reference — honest note
**v2.13.6 ka source code is workspace mein MOJOOD NAHI hai.** Jo archives bache hain: v2.26.0, v2.27.0, v2.28.0, v2.29.0
(+ unke CHANGELOGs). v2.13.x ke sirf **CHANGELOG-v2.13.0/1/2** ka zikr README mein hai (file `release/` mein nahi).
Is liye: "v2.13.6 se compare kar ke" koi claim nahi karunga. Baseline = **mojooda behaviour + git commit 63b61a4/9b41980**
aur wo tamam gates jo v2.29.x tak green hain (67+1 gates). Jo bhi cheez tooti mile, uska asli root cause code se sabit karunga.

## Tasks (chhote, bounded — ek waqt mein ek)

- [x] **T1 Recon + baseline** ✔ — root causes sabit ho gaye (neeche "Findings").
- [x] **T2 Items/Inventory blank pages** ✔ — asli wajah `catch (e) { rows = []; }` (8 jagah) thi. Ab shared
      `Shared.fetchList/stateCard/paint` — loading → error (message + retry + Diagnostics copy) → empty.
      Items + Inventory wire ho gaye; demo mock sach banaya. **Gate: `tools/test_release_ui.js` 29/0.**
- [x] **T3 setupAll seeding completeness** ✔ — naya `Setup.seedDemoData` (demo customer `DEMO-WALKIN`/`DEMO-CASH`,
      demo supplier, 10 demo items + 30 stock rows, demo user `demo/demo123`) seed plan mein shaamil.
      **Safety:** step `freshOnly` hai — live DB (sales/payments mojood) par recovery demo rows NAHI ghusata.
      **Gates:** `tools/test_release_flow.js` 62/0 · `tools/test_seed_recovery.js` 36/0.
- [x] **T4 Shop OPEN enforcement** ✔ — naya `Shop.gs` (`status/open/close/requireOpen/lastReport/shareText/demoStats/
      removeDemoData`) + `Sales.create` par server-side gate. Band shop par sale `SHOP_CLOSED|` error se block hoti hai
      (Security sanitize is message ko har role ko dikhata hai, error par `e.shopClosed` flag). Har sale + receipt par
      `sessionId`/`cashierId`/`locationId` stamp (tracking). Settings: `shop.requireOpen` (kill-switch), `shop.openPromptOnLogin`,
      `shop.defaultOpeningCash`.
- [x] **T5 Shop Open/Close reports** ✔ — OPEN + CLOSE dono auto-report (pehle se mojood machinery + ab `reportKind`),
      print / PDF / WhatsApp / CSV mojood; `dayReportAutoOpen/Close/AutoPrint` settings se driven; opening report bhi
      open karte hi pesh hoti hai (pehle sirf closing).
- [x] **T6 Demo users/data visibility** ✔ — `Shop.demoVisible()/visibleRows()`, setting `data.showDemo`;
      `Reports.dashboard` demo rows (items/customers/low-stock/sales) filter karta hai + `demoHidden` flag;
      `admin.demoStats` / `admin.removeDemoData` (sirf `isDemo` rows). Schema: 6 tables mein `isDemo` column.
- [x] **T7 First-run Setup Wizard** ✔ — `system.setupStatus` / `system.wizardSave` / `system.wizardAdminPassword` +
      frontend wizard (business info → admin password → shop open → demo data) `App_Boot ▸ ShopUI.wizard`.
      Login par sirf BANNER (shell block nahi hota) + banner se "Setup Wizard" button.
- [ ] **T8 docs/ + ZIP process** — poora `docs/` folder build mein; package.sh hang/error-free. **(baqi)**
- [x] **T9 Fresh-install validation** ✔ — `bash tools/validate_release.sh` (checklist: setup→seed→login→shop open→
      customer→items→inventory→sale→close→reports→settings→demo visibility). `--fast` = logic only.
- [ ] **T10 Release** — full suite + package v2.30.0 + CHANGELOG/CHECKLIST. **(baqi)**

## Findings (root causes — sabit shuda)
1. **Blank Items/Inventory:** screen ka apna catch error nigal jata tha (`App_Masters` ~L78; 8 sites). Backend theek tha;
   demo bhi theek render karta tha — is liye bug sirf deployed app par nazar aata tha.
2. **Fresh install khaali:** `setupAll` 16 tables seed karta tha magar `Items/Customers/Suppliers/Stock = 0` aur koi
   demo customer nahi tha (`seedDemoItems` mojood tha magar seed plan mein shamil nahi).
3. **Shop band hone par bhi sale:** `Sales.gs` mein session ka koi gate nahi tha (sessionId sirf tab likhta tha jab client de).
4. **Reports/demo:** CashSessions + dayReport machinery pehle se mojood thi (auto OPEN/CLOSE + autoPrint default on);
   issue sirf visibility/wiring ka tha — ab kind-aware title + opening report bhi.
5. **Auto-modal ka khatra:** login par modal khud kholna mojooda screens ke scrim se takrata hai — is liye design
   banner-based hai (modal sirf user ke click ya asli block par).

## Standing rules (yaad rahe)
- Reproduce pehle, phir fix; shared logic (page-specific patch nahi); dawa sirf rendered-DOM/back-end saboot ke sath.
- Chhote tests har task ke saath; full suite sirf release par (ek foreground run, `env -u HOME`, log).
- Kabhi kuch delete hata na karo; layout/tap/text rules barqarar.
