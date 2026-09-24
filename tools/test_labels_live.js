/**
 * tools/test_labels_live.js — v2.25.0 — Label designer: TRUE LIVE PREVIEW gate.
 *
 * User ki shikayat (requirement 5):
 *   "Implement a true live preview: every change made in the label designer must
 *    immediately and accurately appear in the preview without requiring
 *    refresh/reload. Ensure generated output matches the designer preview."
 *   "Prevent text, barcodes, QR codes and other elements from overflowing
 *    outside the label/frame boundaries."
 *
 * Ye test asli Chromium mein designer kholta hai aur har control badal kar
 * render ki hui DOM naapta hai (koi static text match nahi — asli pixels).
 *
 *   node tools/test_labels_live.js [file|http]      (default demo/index.html)
 */
'use strict';
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = require('fs').readFileSync(path.join(__dirname, '..', 'apps-script', 'App_Barcode.html'), 'utf8');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));

let pass = 0, fail = 0; const ERR = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, ERR.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

/* koi bhi element label frame se bahar? (aur text clip bhi na ho) */
const OVERFLOW_PROBE = `(() => {
  const labs = [...document.querySelectorAll('.print-preview .label')];
  return labs.map(l => {
    const lr = l.getBoundingClientRect();
    let outside = 0, worst = '';
    l.querySelectorAll('*').forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return;
      if (r.left < lr.left - 1 || r.right > lr.right + 1 || r.top < lr.top - 1 || r.bottom > lr.bottom + 1) {
        outside++; if (!worst) worst = String(c.getAttribute('class') || c.tagName);
      }
    });
    return { w: Math.round(lr.width), h: Math.round(lr.height), outside, worst,
      clipped: (l.scrollWidth > l.clientWidth + 1) || (l.scrollHeight > l.clientHeight + 1),
      bars: l.querySelectorAll('svg rect').length, hr: !!l.querySelector('.lhr') };
  });
})()`;

(async () => {
  console.log('\n\x1b[1mLABEL DESIGNER — LIVE PREVIEW + FRAME FIT\x1b[0m\n');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'load', timeout: 40000 });
  await login(page);            /* poll + login (shared harness) */
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
  await sleep(1200);

  /* ---------------- designer kholें (LABEL) ---------------- */
  const opened = await page.evaluate(() => {
    if (!window.Print2 || !Print2.designer) return false;
    Print2.designer('LABEL', { json: JSON.stringify({ paper: '50x30', title: 'MY SHOP', footer: 'THANK YOU', fontSize: 12 }) }, () => { });
    return true;
  });
  ok('designer khula (LABEL type)', opened, String(opened));
  await sleep(2600);

  const setField = async (labelRe, value) => page.evaluate((re, val) => {
    const cols = [...document.querySelectorAll('.design-left .f-col, .f-col')]
      .filter(c => new RegExp(re, 'i').test((c.textContent || '').trim()));
    const inp = cols[0] && cols[0].querySelector('input,select,textarea');
    if (!inp) return false;
    inp.value = val;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, labelRe, value);

  /* 1) Title → live */
  let r = await setField('^Title', 'LIVE TITLE 42');
  await sleep(1200);
  const hasTitle = await page.evaluate(() => /LIVE TITLE 42/.test((document.querySelector('.print-preview') || {}).innerText || ''));
  ok('Title badalne par preview FORAN update (refresh ke baghair)', r && hasTitle, String(hasTitle));

  /* 2) Font size → scale var (12 se 18 — preview foran bada ho) */
  const readLfs = () => page.evaluate(() => {
    const l = document.querySelector('.print-preview .label');
    return l ? (parseFloat(getComputedStyle(l).getPropertyValue('--lfs')) || 0) : 0;
  });
  await setField('Font size', '12');
  await sleep(900);
  const lfs12 = await readLfs();
  r = await setField('Font size', '18');
  await sleep(1100);
  const lfs18 = await readLfs();
  ok('Font size badalne par label font-scale FORAN change', r && lfs18 > lfs12 && lfs18 > 1.05,
    'font 12 → ' + lfs12 + ' ;  font 18 → ' + lfs18);

  /* 3) Footer / Terms → live */
  await setField('^Footer', 'FOOTER-XYZ');
  await sleep(900);
  await setField('Terms', 'TERMS-ABC');
  await sleep(900);
  const footOk = await page.evaluate(() => /FOOTER-XYZ/.test(document.querySelector('.print-preview').innerText)
    && /TERMS-ABC/.test(document.querySelector('.print-preview').innerText));
  ok('Footer + Terms live preview mein nazar aate hain', footOk, String(footOk));

  /* 4) Show title OFF → gayab */
  r = await setField('Show title', '');
  await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.f-col, label')].filter(c => /Show title/i.test(c.textContent || ''));
    const cb = cols[0] && cols[0].querySelector('input[type=checkbox]');
    if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); cb.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(1200);
  const titleGone = await page.evaluate(() => !/LIVE TITLE 42/.test(document.querySelector('.print-preview').innerText));
  ok('"Show title" off karne par title preview se hat jata hai', titleGone, String(titleGone));

  /* 5) frame-fit: har preset (6) + har size par kuch bhi bahar nahi */
  const presets = await page.evaluate(() => window.Print.LABEL_TEMPLATES.map(t => t.id));
  ok('6 label templates maujood (single source)', presets.length === 6, presets.join(','));

  let allFit = true, fitDetail = [];
  for (let i = 0; i < presets.length; i++) {
    await page.evaluate(idx => {
      const chips = [...document.querySelectorAll('.design-left .chip2')];
      if (chips[idx]) chips[idx].click();
    }, i);
    await sleep(1500);
    const res = await page.evaluate(OVERFLOW_PROBE);
    const bad = res.filter(x => x.outside > 0 || x.clipped);
    if (bad.length) { allFit = false; fitDetail.push(presets[i] + ':' + JSON.stringify(bad[0])); }
    if (i === 0) ok('har label mein barcode symbol + human-readable line',
      res.every(x => x.bars > 20 || x.hr), JSON.stringify(res.map(x => ({ bars: x.bars, hr: x.hr }))));
  }
  ok('saare 6 presets: koi element label frame se bahar nahi / kuch clip nahi',
    allFit, allFit ? '0 overflow' : fitDetail.join(' | '));

  /* 6) preview == print output.
     Design ka faisla: designer ka preview aur asli print output EK hi HTML +
     EK hi CSS se bante hain. Isliye hum preview ka .label clone karke ASLI print
     CSS (Print.baseCss) ke saath ek alag frame mein render karte hain aur
     geometry (font-size, --lfs, bars, human-readable) match karte hain —
     aur ye bhi check karte hain ke print copy mein kuch bahar/clip na ho. */
  const fidelity = await page.evaluate(async () => {
    const prevLabel = document.querySelector('.print-preview .label');
    if (!prevLabel) return { err: 'preview label nahi mila' };
    const css = window.Print.baseCss('A4');
    const clone = prevLabel.outerHTML;
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:700px;border:0';
    document.body.appendChild(ifr);
    const d = ifr.contentDocument;
    d.open();
    d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + clone + '</body></html>');
    d.close();
    await new Promise(r => setTimeout(r, 300));
    const pl = d.querySelector('.label');
    const cs = (el, prop) => el ? getComputedStyle(el).getPropertyValue(prop).trim() : '';
    const lr = pl.getBoundingClientRect();
    let outside = 0;
    pl.querySelectorAll('*').forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return;
      if (r.left < lr.left - 1 || r.right > lr.right + 1 || r.top < lr.top - 1 || r.bottom > lr.bottom + 1) outside++;
    });
    /* asli print pipeline dobara: labelsHtml → print CSS */
    const html = await window.Print.labelsHtml(
      [{ id: 'SMP1', name: 'FLAMINGO 450ML', code: 'FL00000', barcode: '6959375198888', price: 338, currency: 'Rs', unit: 'PCS' }],
      { json: JSON.stringify({ style: 'retail', title: 'MY SHOP', footer: 'THANK YOU', fontSize: 12 }), width: 50, height: 30 });
    const ifr2 = document.createElement('iframe');
    ifr2.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:700px;border:0';
    document.body.appendChild(ifr2);
    const d2 = ifr2.contentDocument;
    d2.open();
    d2.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + html + '</body></html>');
    d2.close();
    await new Promise(r => setTimeout(r, 300));
    const p2 = d2.querySelector('.label');
    const lr2 = p2.getBoundingClientRect();
    let outside2 = 0;
    p2.querySelectorAll('*').forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return;
      if (r.left < lr2.left - 1 || r.right > lr2.right + 1 || r.top < lr2.top - 1 || r.bottom > lr2.bottom + 1) outside2++;
    });
    const out = {
      cssUsedByBoth: window.Print.baseCss('A4').indexOf('.label .lhr') > -1 && window.Print.LABEL_CSS.indexOf('.label .lbc') > -1,
      prevLfs: cs(prevLabel, '--lfs'), printLfs: cs(pl, '--lfs'),
      prevNameFs: cs(prevLabel.querySelector('.lname'), 'font-size'), printNameFs: cs(pl.querySelector('.lname'), 'font-size'),
      prevBars: prevLabel.querySelectorAll('.lbc svg rect').length, printBars: pl.querySelectorAll('.lbc svg rect').length,
      prevHR: !!prevLabel.querySelector('.lhr'), printHR: !!pl.querySelector('.lhr'),
      printOutside: outside, printClipped: (pl.scrollWidth > pl.clientWidth + 1) || (pl.scrollHeight > pl.clientHeight + 1),
      directTitle: /MY SHOP/.test(p2.innerText), directHR: !!p2.querySelector('.lhr'),
      directOutside: outside2, directClipped: (p2.scrollWidth > p2.clientWidth + 1) || (p2.scrollHeight > p2.clientHeight + 1),
      mm: p2.style.width + 'x' + p2.style.height
    };
    ifr.remove(); ifr2.remove();
    return out;
  });
  const fid = fidelity || {};
  ok('print output aur preview EK hi label CSS + config use karte hain',
    !!fid.cssUsedByBoth && fid.prevLfs === fid.printLfs && fid.prevNameFs === fid.printNameFs &&
    fid.prevBars === fid.printBars && fid.prevHR === fid.printHR,
    JSON.stringify(fid).slice(0, 260));
  ok('print output mein bhi kuch label frame se bahar / clip nahi',
    fid.printOutside === 0 && fid.printClipped === false && fid.directOutside === 0 && fid.directClipped === false &&
    fid.directTitle === true && fid.directHR === true,
    'clone: outside=' + fid.printOutside + ' clipped=' + fid.printClipped +
    '  |  50x30 direct: outside=' + fid.directOutside + ' clipped=' + fid.directClipped +
    ' title=' + fid.directTitle + ' human-readable=' + fid.directHR);

  /* 7) SHEET CASES (A4 / A5) + edge items — req 5:
     "labels must not overflow outside the label/frame" + "output matches preview".
     Sheet mode (A4/A5) par labels apne mm size par rehte hain, ek doosre par nahi
     chadhte, aur page CSS (@page) bhi sahi hoti hai — yahi asli print output hai. */
  const sheets = await page.evaluate(async () => {
    const rows = n => Array.from({ length: n }, (_, i) => ({
      id: 'S' + i, name: 'FLAMINGO 450ML', code: 'FL0000' + i,
      barcode: '69593751988' + (80 + i), price: 338, currency: 'Rs', unit: 'PCS'
    }));
    const render = async (labels, cfg, paper) => {
      const html = await window.Print.labelsHtml(labels, { json: JSON.stringify(cfg), width: 50, height: 30 });
      const css = window.Print.baseCss(paper);
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:800px;border:0';
      document.body.appendChild(ifr);
      const d = ifr.contentDocument;
      d.open();
      d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + html + '</body></html>');
      d.close();
      await new Promise(r => setTimeout(r, 320));
      const ls = [...d.querySelectorAll('.label')];
      const rects = ls.map(l => l.getBoundingClientRect());
      let outside = 0, clipped = 0, hr = 0; const uniqW = {};
      ls.forEach((l, i) => {
        const lr = rects[i];
        l.querySelectorAll('*').forEach(c => {
          const r = c.getBoundingClientRect();
          if (r.width <= 0 && r.height <= 0) return;
          if (r.left < lr.left - 1 || r.right > lr.right + 1 || r.top < lr.top - 1 || r.bottom > lr.bottom + 1) outside++;
        });
        if ((l.scrollWidth > l.clientWidth + 1) || (l.scrollHeight > l.clientHeight + 1)) clipped++;
        if (l.querySelector('.lhr')) hr++;
        uniqW[Math.round(lr.width)] = 1;
      });
      let overlap = 0;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
        }
      }
      const txt = (d.body.innerText || '').replace(/\s+/g, ' ').slice(0, 140);
      ifr.remove();
      return { n: ls.length, outside: outside, clipped: clipped, hr: hr, overlap: overlap,
        widths: Object.keys(uniqW).map(Number), txt: txt,
        page: /@page\{size:A4 portrait;margin:8mm\}/.test(css) ? 'A4'
          : (/@page\{size:A5 portrait;margin:8mm\}/.test(css) ? 'A5' : '?') };
    };
    const cfg = { style: 'retail', title: 'MY SHOP', footer: 'THANK YOU', fontSize: 12 };
    const a4 = await render(rows(24), cfg, 'A4');
    const a5 = await render(rows(12), cfg, 'A5');
    const nobar = await render([{ id: 'NB', name: 'NO BARCODE ITEM', code: 'SKU-1', barcode: '', price: 100, currency: 'Rs', unit: 'PCS' }], cfg, 'A4');
    const longname = await render([{ id: 'LN', name: 'FLAMINGO SUPER EXTRA LONG PRODUCT NAME 450ML PREMIUM QUALITY EDITION SPECIAL', code: 'FL99999', barcode: '6959375198888', price: 12345, currency: 'Rs', unit: 'PCS' }], cfg, 'A4');
    return { a4: a4, a5: a5, nobar: nobar, longname: longname };
  });
  ok('A4 sheet: 24 labels — koi element apne frame se bahar/clip nahi, labels overlap nahi karte',
    sheets.a4.n === 24 && sheets.a4.outside === 0 && sheets.a4.clipped === 0 && sheets.a4.overlap === 0 && sheets.a4.page === 'A4',
    JSON.stringify({ n: sheets.a4.n, outside: sheets.a4.outside, clipped: sheets.a4.clipped, overlap: sheets.a4.overlap, page: sheets.a4.page, hr: sheets.a4.hr }));
  ok('A5 sheet: 12 labels — wahi 0 overflow + sahi @page CSS',
    sheets.a5.n === 12 && sheets.a5.outside === 0 && sheets.a5.clipped === 0 && sheets.a5.overlap === 0 && sheets.a5.page === 'A5',
    JSON.stringify({ n: sheets.a5.n, outside: sheets.a5.outside, clipped: sheets.a5.clipped, overlap: sheets.a5.overlap, page: sheets.a5.page }));
  ok('sheet par label apna mm size hi rakhta hai (preview jaisa — stretch nahi hota)',
    sheets.a4.widths.length === 1 && Math.abs(sheets.a4.widths[0] - 189) <= 4,
    'A4 label width px = ' + JSON.stringify(sheets.a4.widths) + ' (50mm ~ 189px)');
  ok('barcode ke bagair item: label phir bhi banta hai (code human-readable) + 0 overflow',
    sheets.nobar.n === 1 && sheets.nobar.outside === 0 && sheets.nobar.clipped === 0 && /SKU-1/.test(sheets.nobar.txt),
    JSON.stringify({ n: sheets.nobar.n, outside: sheets.nobar.outside, clipped: sheets.nobar.clipped, txt: sheets.nobar.txt.slice(0, 60) }));
  ok('bohat lamba product naam: text frame ke andar rehta hai (0 overflow / 0 clip)',
    sheets.longname.n === 1 && sheets.longname.outside === 0 && sheets.longname.clipped === 0,
    JSON.stringify({ outside: sheets.longname.outside, clipped: sheets.longname.clipped, txt: sheets.longname.txt.slice(0, 60) }));

  /* ══════════════════════════════════════════════════════════════════════
     8) v2.25.7 — 300dpi PRINT SIMULATION + ZXing RASTER DECODE.
     Ye "chhapa hua label wapas scanner se padha jata hai" ka machine proxy hai:
     label ko 300dpi (aur 203dpi thermal) par rasterize karte hain, PNG screenshot
     lete hain, aur usi ZXing decoder se padhte hain jo asli scanner apps use
     karti hain. Isi test ne asli bug pakra tha: 50x30 label + QR + 13-digit
     barcode par module width 0.066mm reh jati thi (bars mil jate thay) aur
     203dpi par long codes decode hi nahi hote thay.
     ══════════════════════════════════════════════════════════════════════ */
  await page.addScriptTag({ path: path.join(__dirname, 'vendor', 'zxing.min.js') });
  ok('raster harness: ZXing decoder page mein load hua',
    await page.evaluate(() => !!(window.ZXing && window.ZXing.MultiFormatReader)));

  function rasterBuild(c) {
    const host = (function () {
      const old = document.getElementById('rasterHost'); if (old) old.remove();
      const h = document.createElement('div'); h.id = 'rasterHost';
      h.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;background:#fff';
      document.body.appendChild(h); return h;
    })();
    return window.Print.labelsHtml([c.row], { json: JSON.stringify(c.cfg), width: c.wmm, height: c.hmm })
      .then(function (html) {
        host.innerHTML = '<style>' + window.Print.LABEL_CSS + '</style>' + html;
        return new Promise(function (r) { setTimeout(r, 220); });
      })
      .then(function () {
        const imgs = [].slice.call(host.querySelectorAll('img'));
        return Promise.all(imgs.map(function (i) { return i.complete ? 1 : new Promise(function (r) { i.onload = r; i.onerror = r; }); }));
      })
      .then(function () {
        const lab = host.querySelector('.label');
        const box = lab.querySelector('.lbc');
        const svg = lab.querySelector('.lbc svg');
        const qrImg = lab.querySelector('.lqr img');
        const val = c.row.barcode || c.row.code || '';
        let nMod = 0; try { nMod = window.Barcode.modules(val).length + 12; } catch (e) { nMod = 0; }
        const sw = svg ? parseFloat(svg.getAttribute('width')) : 0;
        const modWpx = nMod ? sw / nMod : 0;
        const lb = lab.getBoundingClientRect();
        const bb = box ? box.getBoundingClientRect() : null;
        const qb = qrImg ? qrImg.getBoundingClientRect() : null;
        const out = function (r) { return (!r) ? 0 : ((r.left < lb.left - 1 || r.right > lb.right + 1 || r.top < lb.top - 1 || r.bottom > lb.bottom + 1) ? 1 : 0); };
        return { svgW: +sw.toFixed(2), nMod: nMod, modWpx: +modWpx.toFixed(4), narrowMm: +(modWpx / 96 * 25.4).toFixed(3),
          warn: lab.getAttribute('data-lw') === '1', stacked: !!lab.querySelector('.lsym'),
          outsideBars: out(bb), outsideQR: out(qb), hasQR: !!qrImg,
          stackGap: (bb && qb && qb.top >= bb.bottom - 1) ? +(qb.top - bb.bottom).toFixed(1) : null };
      });
  }

  function rasterZoom(dpi) { document.getElementById('rasterHost').style.zoom = String(dpi / 96); }

  function rasterDecode(b64, dpi, wantQR) {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64;
    return img.decode().then(function () {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, cv.width, cv.height);
      const isBlack = function (x, y) { const i = (y * cv.width + x) * 4; return (px.data[i] * 0.299 + px.data[i + 1] * 0.587 + px.data[i + 2] * 0.114) < 128; };
      let y0 = 0, best = -1, runs = 0;
      for (let y = 0; y < cv.height; y++) { let n = 0; for (let x = 0; x < cv.width; x++) if (isBlack(x, y)) n++; if (n > best) { best = n; y0 = y; } }
      if (!wantQR) { let prev = null; for (let x = 0; x < cv.width; x++) { const b = isBlack(x, y0); if (b !== prev) { if (b) runs++; prev = b; } } }
      const gray = new Uint8ClampedArray(cv.width * cv.height);
      for (let i = 0, j = 0; i < px.data.length; i += 4, j++) gray[j] = Math.round(px.data[i] * 0.299 + px.data[i + 1] * 0.587 + px.data[i + 2] * 0.114);
      const lum = new ZXing.RGBLuminanceSource(gray, cv.width, cv.height);
      const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
      const rd = new ZXing.MultiFormatReader(); const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, wantQR ? [ZXing.BarcodeFormat.QR_CODE] : [ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.EAN_13]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      rd.setHints(hints);
      try { const r = rd.decode(bmp); return { text: r.getText(), fmt: String(r.getBarcodeFormat()), runs: runs, w: cv.width, h: cv.height, err: '' }; }
      catch (e) { return { text: '', fmt: '', runs: runs, w: cv.width, h: cv.height, err: String((e && e.message) || e).slice(0, 48) }; }
    });
  }

  const CASES = [
    { id: 'short-50x30', dpi300: true, wmm: 50, hmm: 30, cfg: { style: 'retail', humanReadable: true },
      row: { id: 'Z1', name: 'FLAMINGO 450ML', code: 'FL00000', barcode: 'FL00000', price: 338, currency: 'Rs', unit: 'PCS' } },
    { id: 'ean13-50x30', dpi300: true, wmm: 50, hmm: 30, cfg: { style: 'retail', humanReadable: true },
      row: { id: 'Z2', name: 'FLAMINGO 450ML', code: 'FL00000', barcode: '6959375198888', price: 338, currency: 'Rs', unit: 'PCS' } },
    { id: 'ean13+qr-50x30', qr: true, wmm: 50, hmm: 30, cfg: { style: 'retail', humanReadable: true, qr: true },
      row: { id: 'Z3', name: 'FLAMINGO 450ML', code: 'FL00000', barcode: '6959375198888', price: 338, currency: 'Rs', unit: 'PCS' } },
    { id: 'price-40x25', dpi300: true, wmm: 40, hmm: 25, cfg: { style: 'price', humanReadable: true },
      row: { id: 'Z4', name: 'OIL 1L', code: 'OIL1', barcode: 'OIL1', price: 1250, currency: 'Rs', unit: 'PCS' } },
    { id: 'long18-60x40', dpi300: true, wmm: 60, hmm: 40, cfg: { style: 'retail', humanReadable: true },
      row: { id: 'Z5', name: 'BIG ITEM', code: 'AB-1234567890123', barcode: 'AB-1234567890123', price: 99, currency: 'Rs', unit: 'PCS' } },
    { id: 'wh+qr-70x50', qr: true, wmm: 70, hmm: 50, cfg: { style: 'warehouse', humanReadable: true, qr: true },
      row: { id: 'Z6', name: 'BIG ITEM', code: 'FL00000', barcode: '6959375198888', price: 5, currency: 'Rs', unit: 'PCS' } },
    /* asli preset sizes (v2.25.7 stress): compact 30x20 · price 50x25 · inventory 60x40 */
    { id: 'compact-30x20', dpi300: true, wmm: 30, hmm: 20, cfg: { style: 'compact', showName: false, showPrice: false, humanReadable: true },
      row: { id: 'Z8', name: 'SHELF TAG', code: 'FL00000', barcode: 'FL00000', price: 338, currency: 'Rs', unit: 'PCS' } },
    { id: 'price-50x25-ean13', dpi300: true, wmm: 50, hmm: 25, cfg: { style: 'price', humanReadable: true },
      row: { id: 'Z9', name: 'OIL 1L', code: 'FL00000', barcode: '6959375198888', price: 1250, currency: 'Rs', unit: 'PCS' } },
    { id: 'inv-60x40-ean13', dpi300: true, wmm: 60, hmm: 40, cfg: { style: 'inventory', showPrice: false, showStock: true, humanReadable: true },
      row: { id: 'ZA', name: 'RACK ITEM', code: 'FL00000', barcode: '6959375198888', price: 99, currency: 'Rs', unit: 'PCS', stock: 12 } },
    /* tiny labels: 5-char code fit hota hai, 7-char floor se neeche (warning lazmi) */
    { id: 'tiny-25x15-short', wmm: 25, hmm: 15, cfg: { style: 'compact', showName: false, showPrice: false, humanReadable: true },
      row: { id: 'ZB', name: 'TINY', code: 'FL123', barcode: 'FL123', price: 9, currency: 'Rs', unit: 'PCS' } },
    { id: 'tiny-25x15-long', sub: true, wmm: 25, hmm: 15, cfg: { style: 'compact', showName: false, showPrice: false, humanReadable: true },
      row: { id: 'ZC', name: 'TINY', code: 'FL00000', barcode: 'FL00000', price: 9, currency: 'Rs', unit: 'PCS' } },
    { id: 'too-long-30x15', warnOnly: true, wmm: 30, hmm: 15, cfg: { style: 'retail', humanReadable: true },
      row: { id: 'Z7', name: 'TINY', code: 'AB-1234567890123456789012345', barcode: 'AB-1234567890123456789012345', price: 9, currency: 'Rs', unit: 'PCS' } }
  ];
  const geo = {}, dec300 = {}, dec203 = {}, decQR = {};
  for (const c of CASES) {
    geo[c.id] = await page.evaluate(rasterBuild, c);
    await page.evaluate(rasterZoom, 300);
    await sleep(220);
    const el = c.qr ? await page.$('#rasterHost .lbc') : await page.$('#rasterHost .lbc');
    const buf = await el.screenshot({ type: 'png' });
    if (!c.warnOnly) dec300[c.id] = await page.evaluate(rasterDecode, buf.toString('base64'), 300, false);
    if (c.dpi300) {
      await page.evaluate(rasterZoom, 203);
      await sleep(220);
      const b2 = await (await page.$('#rasterHost .lbc')).screenshot({ type: 'png' });
      dec203[c.id] = await page.evaluate(rasterDecode, b2.toString('base64'), 203, false);
    }
    if (c.qr) {
      const q = await page.$('#rasterHost .lqr img');
      if (q) { const qb = await q.screenshot({ type: 'png' }); decQR[c.id] = await page.evaluate(rasterDecode, qb.toString('base64'), 300, true); }
    }
    await page.evaluate(() => { const h = document.getElementById('rasterHost'); if (h) h.remove(); });
  }
  const want = c => String(c.row.barcode || c.row.code);
  const real = CASES.filter(c => !c.warnOnly);
  const bad300 = real.filter(c => !(dec300[c.id] && dec300[c.id].text === want(c))).map(c => c.id + '→' + (dec300[c.id] ? (dec300[c.id].text || dec300[c.id].err) : 'n/a'));
  ok('300dpi print simulation: saare 6 real-world cases ZXing se DECODE hote hain (exact code wapas)',
    bad300.length === 0, bad300.join(' · '));
  const bad203 = CASES.filter(c => c.dpi300).filter(c => !(dec203[c.id] && dec203[c.id].text === want(c))).map(c => c.id + '→' + (dec203[c.id] ? (dec203[c.id].text || dec203[c.id].err) : 'n/a'));
  ok('203dpi thermal printer simulation: bhi saare DECODE hote hain (pehle long codes FAIL hote thay)',
    bad203.length === 0, bad203.join(' · '));
  const floorBad = real.filter(c => !c.sub).filter(c => geo[c.id].narrowMm < 0.185).map(c => c.id + '=' + geo[c.id].narrowMm + 'mm');
  ok('printable floor: har label ka designed narrow module >= 0.19mm — asli preset sizes (30x20 · 50x25 · 60x40) bhi',
    floorBad.length === 0, floorBad.join(' · ') + ' · sab: ' + real.map(c => c.id + '=' + geo[c.id].narrowMm).join(','));
  ok('13-digit + QR (bug case pehle): bars merge nahi hue — 75 bars (15 chars x 5) alag alag padhe gaye',
    dec300['ean13+qr-50x30'] && dec300['ean13+qr-50x30'].runs >= 75,
    'runs=' + (dec300['ean13+qr-50x30'] ? dec300['ean13+qr-50x30'].runs : 'n/a') + ' · modW=' + geo['ean13+qr-50x30'].modWpx + 'px');
  ok('QR code bhi scannable: raster se decode ho kar wahi payload deta hai (offline encoder)',
    !!(decQR['ean13+qr-50x30'] && decQR['ean13+qr-50x30'].text === 'CODE:FL00000;SKU:Z3')
    && !!(decQR['wh+qr-70x50'] && decQR['wh+qr-70x50'].text === 'CODE:FL00000;SKU:Z6'),
    JSON.stringify({ a: decQR['ean13+qr-50x30'] && (decQR['ean13+qr-50x30'].text || decQR['ean13+qr-50x30'].err), b: decQR['wh+qr-70x50'] && (decQR['wh+qr-70x50'].text || decQR['wh+qr-70x50'].err) }));
  ok('jab bars ko poori chaurai chahiye ho: QR apni ROW mein (bars ke neeche), overlap nahi, frame ke andar',
    geo['ean13+qr-50x30'].stacked && geo['ean13+qr-50x30'].qrOk !== false && geo['ean13+qr-50x30'].outsideQR === 0
    && geo['ean13+qr-50x30'].outsideBars === 0 && geo['ean13+qr-50x30'].hasQR,
    JSON.stringify(geo['ean13+qr-50x30']));
  ok('chhote code par layout purana hi rehta hai (koi zabardasti stacking/warning nahi)',
    !geo['short-50x30'].stacked && !geo['short-50x30'].warn && !geo['price-40x25'].stacked && !geo['price-40x25'].warn,
    JSON.stringify({ short: geo['short-50x30'], price: geo['price-40x25'] }));
  ok('jitna fit na ho (30x15 + 25-char code): label data-lw marker set karta hai — chup-chaap unscannable nahi',
    geo['too-long-30x15'].warn === true, JSON.stringify(geo['too-long-30x15']));
  ok('us warning ko designer preview dikhata hai (marker → #lblWarn chip wiring)',
    /label\[data-lw\]/.test(src) && /lblWarn/.test(src), 'src check');
  /* ANTI-SILENT invariant: jahan designed module floor se neeche ho, wahan warning LAZMI ho */
  const silent = CASES.filter(c => {
    const sub = geo[c.id].narrowMm < 0.185;
    return sub && geo[c.id].warn !== true;
  }).map(c => c.id + '=' + geo[c.id].narrowMm + 'mm(warn=' + geo[c.id].warn + ')');
  const falseWarn = CASES.filter(c => geo[c.id].narrowMm >= 0.19 && geo[c.id].warn === true).map(c => c.id);
  ok('khamoshi se unscannable label NAHI: module floor se neeche ho to data-lw warning lazmi (aur ulta bhi)',
    silent.length === 0 && falseWarn.length === 0, 'silent=' + silent.join(',') + ' · falseWarn=' + falseWarn.join(','));
  ok('chhota label (25x15mm) + chhota code (5-char): floor par fit hota hai, warning nahi, 300dpi par DECODE',
    !geo['tiny-25x15-short'].warn && geo['tiny-25x15-short'].narrowMm >= 0.185
    && !!(dec300['tiny-25x15-short'] && dec300['tiny-25x15-short'].text === 'FL123'),
    JSON.stringify({ narrowMm: geo['tiny-25x15-short'].narrowMm, warn: geo['tiny-25x15-short'].warn, dec: dec300['tiny-25x15-short'] && (dec300['tiny-25x15-short'].text || dec300['tiny-25x15-short'].err) }));
  ok('chhota label + lamba code (7-char): system CHUPA nahi — warning deta hai (aur 300dpi par phir bhi decode)',
    geo['tiny-25x15-long'].warn === true && geo['tiny-25x15-long'].narrowMm < 0.185
    && !!(dec300['tiny-25x15-long'] && dec300['tiny-25x15-long'].text === 'FL00000'),
    JSON.stringify({ narrowMm: geo['tiny-25x15-long'].narrowMm, warn: geo['tiny-25x15-long'].warn, dec: dec300['tiny-25x15-long'] && (dec300['tiny-25x15-long'].text || dec300['tiny-25x15-long'].err) }));
  ok('raster cases: koi element frame se bahar nahi (bars + QR dono, 0 overflow)',
    real.every(c => geo[c.id].outsideBars === 0 && geo[c.id].outsideQR === 0),
    JSON.stringify(real.map(c => c.id + ':' + geo[c.id].outsideBars + '/' + geo[c.id].outsideQR)));

  ok('designer run mein zero page errors', errs.length === 0, JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  LABELS (live preview)   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
