# Haseeb Autos ERP — Live camera QR/barcode scanning, the right way (v2.14.0)

Complete guide: why in-app camera scanning broke on phones, how the new
architecture works, QR-code fundamentals, exact hosting steps (GitHub Pages /
your own domain / Firebase), integration wiring, security model, device test
matrix, troubleshooting, and long-term maintenance.

Researched against: Google's own Apps Script HTMLService sandbox/permissions
guidance, the February-2026 Google Developer Forums thread "Camera Permission
in web app" (apps that worked before suddenly get `Permissions policy
violation: camera is not allowed in this document`), MDN `getUserMedia`
(secure-context + permissions-policy rules), and the html5-qrcode project
(MIT, v2.3.8 pinned). The method in this guide is the one Google itself
recommends: run the camera on a separate HTTPS origin and return the decoded
value to Apps Script with `postMessage`.

---

## 1. The root cause (read this before touching any library)

Your ERP page is served from `https://script.google.com/.../exec`, but the HTML
you write actually runs inside an **iframe hosted on a Google
`*.googleusercontent.com` sandbox**. That iframe's *Permissions Policy* does not
include `camera`. Consequences:

- `navigator.mediaDevices.getUserMedia({video})` throws `NotAllowedError` /
  logs `Permissions policy violation: camera …` — inside the sandbox,
  **regardless of which scanner library you use**. Swapping BarcodeDetector →
  jsQR → ZXing → html5-qrcode changes nothing: every one of them eventually
  calls `getUserMedia`.
- An `allow="camera"` attribute cannot be set on Google's iframe (you don't
  own it), and a parent policy that forbids a feature can never be re-granted
  by a child (MDN, Permissions Policy).
- Since Feb-2026 this affects **all** Apps Script HTMLService apps, even ones
  that used to work (multiple developer reports + open bug threads).

Two things that still work inside the sandbox:
1. **USB/Bluetooth scanner guns** — they act as keyboards (no camera involved).
2. **Decoding a photo the user picks** — `<input type="file" accept="image/*"
   capture="environment">` uses the OS camera app, not `getUserMedia`. The
   image is decoded locally (this is the fallback kept in the ERP).

**Conclusion — the best-of-all options:** host a tiny static scanner page on
its own HTTPS origin (free GitHub Pages = easiest; own domain = cleanest),
open it from the POS button, scan there with full-screen camera + torch +
front/back flip, and hand the decoded string back with a single
`postMessage`. Camera stream never touches Apps Script, never touches Sheets,
never leaves the device. One string comes back. That is fast, reliable,
secure, and free — and it is literally Google's recommended pattern.

```
   ┌────────────── Apps Script tab (sandboxed iframe) ─────────────┐
   │  POS "📷 Scan" click (user gesture)                            │
   │        │ window.open('https://YOUR-scanner.host/?ret=…&n=…')   │
   │        ▼                                                       │
   │  message listener ── {type:'HASEEB_QR_RESULT', value, nonce} ◄─┼──── scanner page
   │        │ onDetect(value) → item added to cart                  │  (own HTTPS origin:
   │        ▼                                                       │   live camera ✔,
   │  google.script.run('items.search') → Sheets                    │   torch ✔, flip ✔,
   └────────────────────────────────────────────────────────────────┘   photo ✔, manual ✔)
```

## 2. QR code fundamentals (what a scanner is actually doing)

* **Structure:** finder patterns (3 corner squares) → orientation → timing
  grid → data codewords interleaved with Reed–Solomon error correction.
* **Versions 1–40** (21×21 to 177×177 modules). The ERP's built-in encoder
  (`apps-script/App_QR.html`, pure JS, offline, no CDN) supports byte-mode
  versions 1–6 at ECC L/M — enough for ~100–170 characters. Labels/invoices
  stay well inside that.
* **ECC levels** L 7 %, M 15 %, Q 25 %, H 30 % repair capacity — H survives
  ~30 % damage (prints, dirt); L/M for screens.
* **Payloads:** keep them short and machine-meaningful. The ERP prints/scans:
  invoice barcode lines (Code128 via `Barcode.svg`) and QR payloads such as
  product codes and wallet links. A QR is just text — any scanner (camera
  phone, USB gun) returns the same string.
* **1D barcodes** (EAN-13/UPC/Code-128) matter in auto-parts trade; the
  scanner page decodes those too when `fmt=all` (POS bridge passes this when
  calling from search). The camera page prefers formats: QR only by default
  for speed.

## 3. Hosting the scanner page (choose ONE)

Files to ship: `pwa/qr-scanner/index.html` + `pwa/qr-scanner/vendor/html5-qrcode.min.js`
(the ERP ZIP has them). No build step.

### Option A — GitHub Pages (recommended: free, 2FA-grade HTTPS, ~5 min)
1. GitHub → **New repository** → `haseeb-autos-scanner` → Public → Create.
2. **Add file ▸ Upload files** → drag `index.html` (root) and `vendor` folder
   → Commit.
3. **Settings ▸ Pages** ▸ Source *Deploy from a branch*, branch `main` /
   `/ (root)` ▸ Save. Wait ~1–2 min.
4. URL: `https://<you>.github.io/haseeb-autos-scanner/` — test it on the phone
   (Allow camera → scan any QR → value shows + Copy works).
5. Paste that URL into the ERP: **Settings ▸ Mobile apps (PWA) ▸ scanner
   liveUrl ▸ Save**.

### Option B — your own domain (cleanest for shops)
Any static host + **HTTPS is mandatory** (browsers block cameras on http).
- Cloudflare Pages / Netlify: drag-and-drop the folder, done (auto-HTTPS).
- Firebase Hosting: `firebase init hosting` (public dir = the folder),
  `firebase deploy`.
- Own VPS + nginx: serve the folder on 443 with a Let's Encrypt cert;
  headers below are already embedded in index.html (CSP). `try_files` → the
  single index.html is enough (query string is ignored by static hosts).

### Option C — Apps Script HTML service *as* the scanner — **do not**
It would re-enter the same sandbox that blocks the camera. This is the trap
the guide you supplied warned about; confirmed by Google's own docs and the
Feb-2026 developer reports. Skip.

## 4. How the ERP side is wired (already implemented in v2.14.0)

| Piece | Where | What it does |
|---|---|---|
| Bridge | `apps-script/App_QR.html` → `window.HaScan` | `HaScan.scan({onDetect})` — reads `scanner.liveUrl` from settings, builds popup URL with `ret` (own origin) + fresh random `n` (nonce) + `fmt=all` when needed, `window.open`s it **inside the click gesture**, adds a one-time `message` listener, and returns |
| Validation | same | ignores any message whose `event.origin !== scanner origin` or whose `nonce` mismatch; 120 s timeout → toast + manual entry; popup blocked → manual entry |
| Fallback chain | `HaScan.scan` | external URL → in-app `BarcodeDetector` attempt (settings `scanner.inApp`, works on desktop) → **photo decode** (`capture="environment"` file input, decoded locally) → manual type box |
| POS button | `App_POS2.html` ▸ `scanBarcode` | unchanged UX: value flows straight into the existing catalog matcher |
| Settings | `Config.gs` ▸ pwa tab ▸ scanner | `scanner.liveUrl` (text), `scanner.inApp` (switch, default on) |

No new Apps Script services, no secret in client source, no data path through
the scanner (it is fully static — there is literally no backend to breach).

## 5. Security model — what is checked and why

1. **Origin pinning, both directions.** The page only `postMessage`s when the
   `ret` parameter matches `^https://(script.google.com|[a-z0-9-]+.googleusercontent.com)$`
   — the ERP panel origins; and the ERP accepts messages ONLY from the exact
   configured scanner origin (`new URL(liveUrl).origin`). A random site
   embedding your scanner can't talk to your app, and a hostile origin can't
   inject into the scanner tab.
2. **Per-scan nonce.** `crypto.getRandomValues(16 bytes)`, echoed back in the
   reply; kills cross-window spoofing/replays.
3. **Camera frames never leave the device.** Decoding is 100 % local
   (`BarcodeDetector` natively; html5-qrcode's WASM/ZXing fallback locally
   bundled). Only the decoded string is returned once.
4. **Duplicate-scan prevention.** 1500 ms cooldown per value in continuous
   mode (`?once=0`), and one-shot mode by default — the same physical code
   can't fire twice into the cart.
5. **No CDN at runtime.** Vendor JS is a pinned copy:
   `html5-qrcode.min.js` v2.3.8, **375,364 bytes**,
   `SHA-256 660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e`
   — verify after upload: `certutil -hashfile html5-qrcode.min.js SHA256`
   (Windows) or `sha256sum` (Git-Bash/macOS). A tampered CDN would break
   silently at every shop; a static copy you host cannot change under you.
6. **CSP meta** in the page: `default-src 'self'` + inline script allowance
   for the single-file design; no `connect-src` targets at all — the page has
   no way to exfiltrate.
7. **What an attacker CAN'T do:** feed fake codes *through the camera path*
   (they'd need your pinned origin), or reach Sheets — the returned value is
   treated exactly like typed input and goes through the same server-side
   auth/permissions (`items.search`, `Auth.require`) as manual entry.

## 6. Device & browser test matrix (run before trusting it on the counter)

| Platform | Engine used | Expect | Notes |
|---|---|---|---|
| Android Chrome 121+ | native `BarcodeDetector` | live + torch + flip | grant Camera once per origin |
| Android Samsung Internet | native (supported) | live; torch via track constraint | known-good with html5-qrcode fallback too |
| iOS Safari 17+ | html5-qrcode (no BarcodeDetector) | live + photo | first prompt "Allow"; backgrounding stops camera (auto-restart on return) |
| iOS Chrome | html5-qrcode (WKWebView, no getUserMedia for some configs) | photo/manual if blocked | expected OS behavior |
| Desktop Chrome/Edge | native (in-app path works too) | live | sandbox in desktop Chrome now also allows? no — the popup path is used either way |
| Scanner gun | keyboard wedge | type+Enter | unaffected, still fastest at retail counter |

Fail-over at every layer: popup blocked → manual; camera denied → photo →
manual; nothing ever dead-ends in an error dialog.

## 7. Troubleshooting quick table

| Symptom | Cause | Fix |
|---|---|---|
| Console shows `Permissions policy violation: camera` **inside the ERP tab** | You are looking at the OLD in-iframe attempt | Set `scanner.liveUrl` — external page is the supported path |
| Scanner page says "camera busy" | WhatsApp/Zoom holding the camera | Close them, tap ↻ |
| Black preview on some Samsung/Android combos | Known OEM quirk | Flip once, or photo fallback; library mode also restarts |
| Popup never opens | Pop-up blocker for script.google.com | Allow popups once for the ERP |
| Result never reaches the app | `ret` origin check (page shows a warning banner for bad `ret`) | Ensure URL set in settings is the scanner page URL itself (ends with `/`) |
| iOS asks permission every visit | Not installed to Home Screen | Share ▸ Add to Home Screen (keeps permission + standalone) |
| Want continuous scanning (stock-taking mode) | default is one-shot | open scanner manually with `?once=0`; or keep app open and tap 📷 per item |

## 8. Maintenance

* Updating the lib = replace `vendor/html5-qrcode.min.js`, re-check SHA-256,
  re-open the page once on a phone. Nothing in Apps Script changes.
* html5-qrcode is in maintenance mode (author seeking owners, last release
  2.3.8 Apr-2023) — fine here: it is a *fallback*; the primary path is the
  browser-native `BarcodeDetector`, and both decode locally. If the day comes
  you want to drop it entirely, remove the `<script src="vendor/…">` line and
  unsupported browsers fall back to photo/manual automatically.
* Scanner page is stateless — no keys, no session, nothing personal. It can
  stay public; the security boundary is origin+nonce, not secrecy of the URL.

## 9. Receipt paper sizes — related fix in the same release

While testing printing on phones: the *quick print* window previously wrote
`@page{margin:2mm}` with **no size**, so Chrome offered only A4/A5 (your
"printer options have A4, A5" report) and thermal width was ignored. v2.14.0:
`Print.open`/`baseCss` set true `@page{size:58mm|80mm|110mm auto}` (continuous
roll) with a toolbar to switch paper (58/80/110/A4/A5), and the full Print
dialog gained **📥 Download PDF** which exports through the server at the
chosen paper size (`Exports.htmlToPdf` now honors a `paper` param and appends
the matching `@page` override — Drive's converter renders thermal PDFs at the
real 80 mm width instead of A4). Default quick-print paper is a setting:
`pos.receiptPaper` (default 80 mm).
