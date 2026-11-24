#!/usr/bin/env node
/**
 * Checks that the browser-support gate (src/adapters/pdf/browserSupport.ts) still matches what pdf.js needs.
 * Re-run it whenever pdfjs-dist is upgraded: which newer JavaScript features pdf.js uses, and in which realm (page or
 * worker), can change between versions.
 *
 * It loads the sample statement in a real Chromium with features deleted, in the page and, by patching the worker scripts
 * in flight, in the worker realms, and checks that parsing and the page preview both still work. Pass criteria:
 *   1. with nothing removed it works;
 *   2. removing every candidate that is NOT in the gate, in both realms, still works (so the gate is complete for what was tried);
 *   3. removing the gated features breaks it (so the gate is not vacuous).
 * `--detail` also prints each gated feature on its own in each realm.
 *
 *   npm run build && npm run start         # one terminal
 *   node tools/check-browser-support.mjs --chromium <path to chrome> [--base http://127.0.0.1:3000] [--detail]
 *
 * Only the bundled sample is exercised; other PDF content might use more. Candidates are listed below: extend them when
 * a newer ECMAScript feature ships in browsers.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'package.json'))('playwright-core');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
const chromiumPath = arg('chromium', process.env.LL_CHROMIUM_PATH);
const detail = process.argv.includes('--detail');

// features the gate checks (keep in sync with REQUIRED in browserSupport.ts)
const GATED = {
  'Map/WeakMap getOrInsert*': 'for (const C of [Map, WeakMap]) { delete C.prototype.getOrInsert; delete C.prototype.getOrInsertComputed; }',
  'Promise.withResolvers': 'delete Promise.withResolvers;',
  'Promise.try': 'delete Promise.try;',
  'Uint8Array toHex/fromHex': 'delete Uint8Array.prototype.toHex; delete Uint8Array.fromHex;',
};
// other recent features pdf.js might plausibly use, not in the gate
const OTHERS = {
  'Uint8Array base64': 'delete Uint8Array.fromBase64; delete Uint8Array.prototype.toBase64; delete Uint8Array.prototype.setFromBase64;',
  'Math.sumPrecise': 'delete Math.sumPrecise;',
  'URL.parse': 'delete URL.parse;',
  'Array.fromAsync': 'delete Array.fromAsync;',
  'Iterator helpers': 'if (globalThis.Iterator) for (const k of ["map","filter","take","drop","flatMap","reduce","toArray","forEach","some","every","find"]) delete Iterator.prototype[k];',
  'Set methods': 'for (const k of ["union","intersection","difference","symmetricDifference","isSubsetOf","isSupersetOf","isDisjointFrom"]) delete Set.prototype[k];',
  'Error.isError': 'delete Error.isError;',
  'RegExp.escape': 'delete RegExp.escape;',
  'Float16': 'delete globalThis.Float16Array; delete Math.f16round; delete DataView.prototype.getFloat16; delete DataView.prototype.setFloat16;',
};
const join = (o) => Object.values(o).join('\n');

if (!chromiumPath) { console.error('usage: node tools/check-browser-support.mjs --chromium <path to chrome> [--base URL] [--detail]'); process.exit(2); }
const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });

async function sampleWorks(realm, script, workerUrls) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (realm === 'page') await page.addInitScript(script);
  else await ctx.route((u) => workerUrls.includes(u.toString()), async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: `${script}\n${await r.text()}` }); });
  await page.goto(`${base}/app/#sample`);
  let parsed = true;
  try { await page.waitForSelector('[data-testid="status-stamp"][data-status="reconciled"]', { timeout: 11_000 }); } catch { parsed = false; }
  await page.waitForTimeout(1200);
  const painted = await page.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) return true; return false; });
  await ctx.close();
  return parsed && painted;
}

const discover = await browser.newContext();
const dp = await discover.newPage();
const workerUrls = new Set();
dp.on('worker', (w) => workerUrls.add(w.url()));
await dp.goto(`${base}/app/#sample`);
await dp.waitForSelector('[data-testid="status-stamp"][data-status="reconciled"]', { timeout: 30_000 });
await dp.waitForTimeout(1500);
await discover.close();
const urls = [...workerUrls];
console.log(`worker scripts patched in the worker realm: ${urls.map((u) => u.replace(base, '')).join(', ')}`);

let failed = false;
const check = async (label, realm, script, expectWorks) => {
  const works = await sampleWorks(realm, script, urls);
  const ok = works === expectWorks;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${realm.padEnd(7)} ${label.padEnd(44)} -> ${works ? 'works' : 'breaks'} (expected ${expectWorks ? 'works' : 'breaks'})`);
};
await check('nothing removed', 'page', '', true);
await check('all non-gated candidates removed', 'page', join(OTHERS), true);
await check('all non-gated candidates removed', 'worker', join(OTHERS), true);
await check('all gated features removed', 'page', join(GATED), false);
if (detail) for (const [name, script] of Object.entries(GATED)) for (const realm of ['page', 'worker']) {
  const works = await sampleWorks(realm, script, urls);
  console.log(`info ${realm.padEnd(7)} ${name.padEnd(44)} alone -> ${works ? 'not needed here' : 'REQUIRED here'}`);
}
await browser.close();
console.log(failed ? '\nThe gate no longer matches what pdf.js needs: update GATED/REQUIRED and the docs.' : '\nThe gate matches (for the sample statement and the candidates listed).');
process.exit(failed ? 1 : 0);
