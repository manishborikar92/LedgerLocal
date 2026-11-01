#!/usr/bin/env node
/**
 * Post-build hardening of the static export (out/):
 *  1. hash every inline <script> and inject a strict Content-Security-Policy <meta> (hashes, not 'unsafe-inline');
 *  2. write out/_headers (Cloudflare Pages / Netlify) with the same policy plus frame-ancestors etc.;
 *  3. fill the service-worker precache list.
 * Fails the build if any page loads a remote script/style/font or contains an inline event handler.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsp } from './csp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
if (!fs.existsSync(out)) { console.error('out/ not found: run next build first'); process.exit(1); }

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(out);
const htmls = files.filter((f) => f.endsWith('.html'));
const allHashes = new Set();
const problems = [];

for (const f of htmls) {
  let html = fs.readFileSync(f, 'utf8');
  const hashes = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1]; const body = m[2];
    if (/\bsrc=/.test(attrs)) { const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1] ?? ''; if (/^(https?:)?\/\//.test(src)) problems.push(`${path.relative(out, f)}: remote script ${src}`); continue; }
    if (/type="application\/(json|ld\+json)"/.test(attrs)) continue;
    if (body.trim()) hashes.push('sha256-' + crypto.createHash('sha256').update(body, 'utf8').digest('base64'));
  }
  if (/\son[a-z]+="/i.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) problems.push(`${path.relative(out, f)}: inline event handler attribute`);
  // Resource-loading links must be same-origin. (rel=canonical / alternate legitimately carry absolute URLs.)
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const rel = /\brel="([^"]+)"/.exec(m[0])?.[1] ?? '';
    const href = /\bhref="([^"]+)"/.exec(m[0])?.[1] ?? '';
    if (/(stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|manifest)/.test(rel) && /^(https?:)?\/\//.test(href)) problems.push(`${path.relative(out, f)}: remote <link rel="${rel}"> ${href}`);
  }
  hashes.forEach((h) => allHashes.add(h));
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp({ scriptHashes: hashes }).replace(/"/g, '&quot;')}">`;
  html = html.replace(/<head>/, `<head>${meta}`);
  fs.writeFileSync(f, html);
}
if (problems.length) { console.error('Build rejected:\n - ' + problems.join('\n - ')); process.exit(1); }

const headerCsp = buildCsp({ scriptHashes: [...allHashes], forHeader: true });
// The strict policy goes on HTML DOCUMENTS only. It must NOT be applied to /sw.js: a service worker inherits the CSP of its own
// script response, and connect-src 'none' would block its precache fetches. Rules are path-specific and non-overlapping.
const doc = ['/', '/app/*', '/guides/*', '/404.html'];
const sec = 'X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()';
const headers = [
  ...doc.map((p) => `${p}\n  Content-Security-Policy: ${headerCsp}\n  Cross-Origin-Opener-Policy: same-origin\n  ${sec}`),
  `/sw.js\n  Cache-Control: no-cache\n  Content-Security-Policy: default-src 'none'; connect-src 'self'\n  X-Content-Type-Options: nosniff`,
  `/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff`,
].join('\n\n') + '\n';
fs.writeFileSync(path.join(out, '_headers'), headers);

// service worker precache
const skip = (rel) => rel === 'sw.js' || rel === '_headers' || rel.endsWith('.map') || rel.startsWith('pdfjs/cmaps') ;
const rels = files.map((f) => path.relative(out, f).split(path.sep).join('/')).filter((r) => !skip(r)).sort();
const urls = rels.flatMap((r) => (r.endsWith('index.html') ? [r.replace(/index\.html$/, '') || './'] : [r]));
const h = crypto.createHash('sha256');
for (const r of rels) h.update(r).update(fs.readFileSync(path.join(out, r)));
const version = h.digest('hex').slice(0, 12);
const swPath = path.join(out, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace("const VERSION = '__VERSION__';", `const VERSION = '${version}';`).replace('const PRECACHE = __PRECACHE__;', () => `const PRECACHE = ${JSON.stringify(urls)};`);
if (/__VERSION__|__PRECACHE__/.test(sw)) { console.error('service worker placeholders were not replaced'); process.exit(1); }
fs.writeFileSync(swPath, sw);
const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`postbuild ok: ${htmls.length} pages, ${allHashes.size} inline-script hashes, ${urls.length} precached files, out/ = ${(total / 1048576).toFixed(2)} MB`);
