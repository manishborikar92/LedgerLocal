#!/usr/bin/env node
/** Tiny static file server for out/ (no dependencies). Applies out/_headers so you test the real CSP. Usage: node scripts/serve.mjs [port] */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };
const headersFile = path.join(root, '_headers');
/** Minimal Cloudflare/Netlify-style _headers parser: [{ pattern, headers }]. */
const rules = [];
if (fs.existsSync(headersFile)) {
  let cur = null;
  for (const line of fs.readFileSync(headersFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (/^\S/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); }
    else if (cur && line.includes(':')) { const i = line.indexOf(':'); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
}
const matches = (pat, p) => (pat.endsWith('/*') ? p.startsWith(pat.slice(0, -1)) : pat === p);
const headersFor = (p) => Object.assign({}, ...rules.filter((r) => matches(r.pattern, p)).map((r) => r.headers));
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { const nf = path.join(root, '404.html'); res.writeHead(404, { 'content-type': MIME['.html'] }); res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found'); return; }
  const type = MIME[path.extname(file)] ?? 'application/octet-stream';
  const compressible = /^(text\/|application\/(json|manifest\+json)|image\/svg|font\/)/.test(type) && !/woff/.test(type);
  const head = { 'content-type': type, ...headersFor(p) };
  if (compressible && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    res.writeHead(200, { ...head, 'content-encoding': 'gzip', vary: 'Accept-Encoding' });
    fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
  } else {
    res.writeHead(200, head);
    fs.createReadStream(file).pipe(res);
  }
}).listen(port, '127.0.0.1', () => console.log(`LedgerLocal static build served at http://127.0.0.1:${port}/ (CSP from out/_headers applied)`));
