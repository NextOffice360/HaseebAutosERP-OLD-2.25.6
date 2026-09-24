'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const TARGET = 'file://' + path.join(__dirname, '..', 'demo', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await p.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  await p.click('#lgUser'); await p.type('#lgUser', 'owner');
  await p.click('#lgPass'); await p.type('#lgPass', 'admin123');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1200);

  // Modules & Navigation group kholo
  const info = await p.evaluate(() => { App.go('settings', { tab: 'modules' }); return App.current; });
  console.log('route:', info);
  await sleep(1800);
  const before = await p.evaluate(() => {
    const st = App.state.settings || {};
    const keys = Object.keys(st).filter(k => /^mod\./.test(k));
    return { keys, vals: keys.map(k => st[k]) };
  });
  console.log('module switches BEFORE:', JSON.stringify(before));

  // pehla switch jo OFF hai usay ON karo (aur us ka key dekho)
  const toggled = await p.evaluate(() => {
    const sws = Array.from(document.querySelectorAll('#view input[type=checkbox]'));
    const off = sws.find(x => !x.checked);
    if (!off) return { ok: false, count: sws.length };
    const key = off.id || '';
    off.click();
    return { ok: true, key, count: sws.length, checked: off.checked };
  });
  console.log('toggled:', JSON.stringify(toggled));
  await sleep(300);
  // Save dabao
  const saved = await p.evaluate(async () => {
    const btn = Array.from(document.querySelectorAll('#view button')).find(x => /Save/.test(x.textContent));
    if (!btn) return { ok: false, buttons: Array.from(document.querySelectorAll('#view button')).map(x => x.textContent.trim()).slice(0, 12) };
    btn.click();
    return { ok: true, label: btn.textContent.trim() };
  });
  console.log('save click:', JSON.stringify(saved));
  await sleep(2500);
  const after = await p.evaluate(async () => {
    const st = App.state.settings || {};
    const keys = Object.keys(st).filter(k => /^mod\./.test(k));
    let server = null;
    try { server = await API.call('system.settings.get', {}); } catch (e) { server = { err: e.message }; }
    const sk = server ? Object.keys(server).filter(k => /^mod\./.test(k)) : [];
    return { uiVals: keys.map(k => k + '=' + st[k]), srvVals: sk.map(k => k + '=' + server[k]) };
  });
  console.log('AFTER ui  :', JSON.stringify(after.uiVals));
  console.log('AFTER srv :', JSON.stringify(after.srvVals));
  console.log('page errors:', JSON.stringify(errs.slice(0, 4)));
  await b.close();
})();
