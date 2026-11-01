// Reports gzip sizes of what the browser downloads for each route (from the static export). Writes docs/bundle-report.json.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const out = path.resolve('out');
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(out, f)), { level: 9 }).length;
const routes = { '/': 'index.html', '/app/': 'app/index.html', '/guides/': 'guides/index.html' };
const res = {};
for (const [r, f] of Object.entries(routes)) {
  const html = fs.readFileSync(path.join(out, f), 'utf8');
  const files = [...new Set([...html.matchAll(/(?:src|href)="\/(_next\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
  const js = files.filter((x) => x.endsWith('.js')).reduce((n, x) => n + gz(x), 0);
  const css = files.filter((x) => x.endsWith('.css')).reduce((n, x) => n + gz(x), 0);
  res[r] = { htmlKBgz: +(gz(f) / 1024).toFixed(1), jsKBgz: +(js / 1024).toFixed(1), cssKBgz: +(css / 1024).toFixed(1) };
}
const lazy = fs.readdirSync(path.join(out, '_next/static/chunks')).filter((f) => f.endsWith('.js')).map((f) => [f, fs.statSync(path.join(out, '_next/static/chunks', f)).size]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, s]) => ({ file: f, KB: +(s / 1024).toFixed(0), KBgz: +(gz('_next/static/chunks/' + f) / 1024).toFixed(0) }));
res.largestChunks = lazy;
res.pdfWorker = { KB: +(fs.statSync(path.join(out, 'pdfjs/pdf.worker.min.mjs')).size / 1024).toFixed(0), KBgz: +(gz('pdfjs/pdf.worker.min.mjs') / 1024).toFixed(0) };
const total = (function w(d) { return fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? w(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0); })(out);
res.totalOutMB = +(total / 1048576).toFixed(2);
fs.writeFileSync('docs/bundle-report.json', JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
