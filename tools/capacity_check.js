#!/usr/bin/env node
/**
 * tools/capacity_check.js — v2.30.5 (QA-b) — python-walk ka node port.
 * Sandbox/workspace limit check (budget 755MB / ~10k files). Excludes
 * .cache/.npm/.local/.venv/node_modules (snapshot-excluded bhi).
 *   node tools/capacity_check.js [root]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || '/home/user';
const EXCL = new Set(['.cache', '.npm', '.local', '.venv', 'node_modules', '.arena', '.next', '.nuxt', '.output', '.turbo', 'dist', 'build', 'coverage', '__pycache__']);
let total = 0, files = 0;
(function walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!EXCL.has(e.name)) walk(p); }
    else { try { total += fs.statSync(p).size; files++; } catch (err) { } }
  }
})(ROOT);
const mb = total / 1e6;
console.log('capacity: ' + mb.toFixed(1) + 'MB / ' + files + ' files (budget 755MB) — ' + (mb < 700 ? 'SAFE' : 'OVER — cleanup zaroori'));
process.exit(mb < 700 ? 0 : 1);
