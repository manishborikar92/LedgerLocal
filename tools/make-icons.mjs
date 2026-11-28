// Generates the app icons (pure Node PNG encoder, anti-aliased). Run once: node tools/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x + 0.5, y + 0.5); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; }
  }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const seg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };
function icon(size, maskable) {
  const u = size / 32, pad = maskable ? 0 : 2 * u, rad = maskable ? 0 : 7 * u;
  return png(size, (x, y) => {
    const qx = Math.abs(x - size / 2) - (size / 2 - pad - rad), qy = Math.abs(y - size / 2) - (size / 2 - pad - rad);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
    const cov = Math.max(0, Math.min(1, 0.5 - d));
    if (cov <= 0) return [0, 0, 0, 0];
    let c = [34, 83, 181];
    for (const [ax, ay, bx, by] of [[8, 11, 24, 11], [8, 16, 24, 16], [8, 21, 16, 21]].map((l) => l.map((v) => v * u))) { const k = Math.max(0, Math.min(1, 0.5 - (seg(x, y, ax, ay, bx, by) - 0.8 * u))); c = c.map((v) => v + (255 - v) * 0.45 * k); }
    let k = 0;
    for (const [ax, ay, bx, by] of [[16, 21.5, 19.5, 25], [19.5, 25, 26, 16.5]].map((l) => l.map((v) => v * u))) k = Math.max(k, 0.5 - (seg(x, y, ax, ay, bx, by) - 1.5 * u));
    k = Math.max(0, Math.min(1, k)); c = c.map((v) => v + (255 - v) * k);
    return [...c.map(Math.round), Math.round(cov * 255)];
  });
}
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', icon(192, false));
fs.writeFileSync('public/icons/icon-512.png', icon(512, false));
fs.writeFileSync('public/icons/icon-maskable-512.png', icon(512, true));
fs.writeFileSync('src/app/apple-icon.png', icon(180, true));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#2253b5"/><path d="M8 11h16M8 16h16M8 21h8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".45"/><path d="M16 21.5l3.5 3.5 6.5-8.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
fs.writeFileSync('src/app/icon.svg', svg);
console.log('icons written');
