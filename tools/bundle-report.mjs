#!/usr/bin/env node
/**
 * Reports gzip sizes of what the production build ships, and writes docs/bundle-report.json.
 * Pages are rendered per request, so the first-load files of each page are read from a running server:
 *
 *   npm run build && npm run start          # in one terminal
 *   node tools/bundle-report.mjs [--base http://127.0.0.1:3000]
 *
 * "First load" = the scripts and styles the page's HTML references. "Offline install" = every file the service worker
 * caches for the workbench (the build's precache list plus the pdf.js worker), i.e. the one-time download for offline use.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--base');
const base = (i > 0 ? process.argv[i + 1] : 'http://127.0.0.1:3000').replace(/\/$/, '');
const staticDir = path.join(root, '.next/static');
if (!fs.existsSync(staticDir)) { console.error('No .next build found: run `npm run build` first.'); process.exit(1); }

const kb = (n) => Math.round((n / 1024) * 10) / 10;
const sizes = new Map(); // "static/chunks/x.js" -> { raw, gzip }
function size(rel) {
  if (!sizes.has(rel)) {
    const buf = fs.readFileSync(path.join(root, '.next', rel));
    sizes.set(rel, { raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length });
  }
  return sizes.get(rel);
}

async function firstLoad(route) {
  const res = await fetch(`${base}${route}`);
  if (!res.ok) throw new Error(`${route} -> ${res.status}; is the production server running at ${base}?`);
  const html = await res.text();
  const files = [...new Set([...html.matchAll(/\/_next\/(static\/[^"'\\\s)<>?]+)/g)].map((m) => m[1]))];
  const js = files.filter((f) => f.endsWith('.js')), css = files.filter((f) => f.endsWith('.css'));
  const sum = (list, k) => list.reduce((a, f) => a + size(f)[k], 0);
  return { route, jsGzipKB: kb(sum(js, 'gzip')), cssGzipKB: kb(sum(css, 'gzip')), jsFiles: js.length, _js: js };
}

const pages = [];
for (const route of ['/', '/guides/verify-offline/', '/app/']) pages.push(await firstLoad(route));
const appJs = new Set(pages.at(-1)._js);

const list = JSON.parse(fs.readFileSync(path.join(staticDir, 'll-precache.json'), 'utf8')).files;
const all = list.map((f) => ({ file: f, ...size(f) }));
const worker = path.join(root, 'public/pdfjs/pdf.worker.min.mjs');
const wbuf = fs.readFileSync(worker);
const workerSize = { raw: wbuf.length, gzip: zlib.gzipSync(wbuf, { level: 9 }).length };
const lazy = all.filter((x) => x.file.endsWith('.js') && !appJs.has(x.file)).sort((a, b) => b.gzip - a.gzip);

const report = {
  note: 'gzip level 9 sizes from the production build in .next; a host may compress slightly differently. First load = files referenced by the page HTML.',
  firstLoad: pages.map(({ _js, ...p }) => p),
  workbenchLazyJs: { files: lazy.length, gzipKB: kb(lazy.reduce((a, x) => a + x.gzip, 0)), largestGzipKB: lazy.slice(0, 4).map((x) => kb(x.gzip)) },
  pdfjsWorkerFile: { rawKB: kb(workerSize.raw), gzipKB: kb(workerSize.gzip), note: 'public/pdfjs/pdf.worker.min.mjs, loaded when a page is rendered' },
  offlineInstall: { files: all.length + 1, rawKB: kb(all.reduce((a, x) => a + x.raw, workerSize.raw)), gzipKB: kb(all.reduce((a, x) => a + x.gzip, workerSize.gzip)), note: 'every build file plus the pdf.js worker; icons and the manifest add a few KB' },
};
fs.writeFileSync(path.join(root, 'docs/bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
