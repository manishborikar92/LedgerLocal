// Renders the Open Graph / Twitter card (1200x630) from an HTML design with the real Geist font.
// Usage: node tools/make-og.mjs   (needs Chromium; see README "Regenerating the social image")
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const font = path.resolve('node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2');
const INK = '#2253b5', GREEN = '#00673f';
const row = (d, desc, amt, on) => `<div class="row${on ? ' on' : ''}"><i>✓</i><span class="d">${d}</span><span>${desc}</span><span class="n">${amt}</span></div>`;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Geist;src:url("${pathToFileURL(font).href}");font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:Geist,sans-serif;color:#111620;background:#f1f3f5;position:relative;overflow:hidden;font-variant-numeric:tabular-nums lining-nums}
.rules{position:absolute;inset:0;background:linear-gradient(#dbdee3 1px,transparent 1px) 0 0/100% 42px;opacity:.55}
.wrap{position:relative;display:grid;grid-template-columns:.92fr 1.18fr;gap:44px;padding:60px 64px;height:100%;align-items:center}
.brand{display:flex;align-items:center;gap:14px;font-weight:650;font-size:30px;letter-spacing:-.02em;margin-bottom:30px}
h1{font-size:60px;line-height:1.04;letter-spacing:-.035em;font-weight:680;text-wrap:balance}
p{margin-top:24px;font-size:26px;line-height:1.35;color:#4d5664;max-width:470px}
.fact{margin-top:26px;font-size:22px;font-weight:560;color:${GREEN}}
.card{background:#fff;border:1px solid #707b8d;border-radius:12px;box-shadow:0 26px 60px -26px rgba(17,22,32,.45);overflow:hidden}
.top{display:grid;gap:14px;justify-items:start;padding:20px 22px 18px;border-bottom:1px solid #dbdee3}
.cap{font-size:16px;color:#4d5664}
.stamp{display:inline-flex;flex-direction:column;align-items:center;gap:2px;padding:8px 16px;border:4px double ${GREEN};border-radius:4px;color:${GREEN};background:#ddf8e8;font-weight:750;font-size:19px;letter-spacing:.13em;text-transform:uppercase}
.stamp small{font-weight:560;font-size:16px;letter-spacing:0;text-transform:none}
.foot{display:flex;align-items:flex-end;gap:8px;font-size:22px;font-weight:560}
.t{display:grid;gap:1px;text-align:right}.t u{font-size:14px;font-weight:400;color:#4d5664;text-decoration:none}
.op{color:#4d5664;font-size:24px;padding-bottom:1px}
.tot{border-top:1px solid #111620;border-bottom:4px double #111620;padding:0 3px;font-weight:680}
.vr{width:1px;align-self:stretch;background:#707b8d;margin:0 6px}
.row{display:grid;grid-template-columns:44px 74px 1fr 104px;align-items:center;min-height:50px;padding-right:22px;border-bottom:1px solid #dbdee3;font-size:20px}
.row i{align-self:stretch;display:grid;place-items:center;color:${GREEN};font-style:normal;font-weight:700;border-right:1px solid rgba(34,83,181,.45)}
.row .d{color:#4d5664;padding-left:12px;font-size:18px}.row .n{text-align:right}
.row.on{background:#e7f1ff;box-shadow:inset 3px 0 0 ${INK}}
</style><div class="rules"></div><div class="wrap"><div>
<div class="brand"><svg width="46" height="46" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="${INK}"/><path d="M8 11h16M8 16h16M8 21h8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".45"/><path d="M16 21.5l3.5 3.5 6.5-8.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>LedgerLocal</div>
<h1>Statement PDFs, reconciled and ready for your books.</h1>
<p>Convert to QBO, OFX, Excel and CSV, entirely in your browser.</p>
<div class="fact">✓ Nothing is uploaded</div></div>
<div class="card"><div class="top"><div class="stamp"><span>✓ Reconciled</span><small>Δ 0.00</small></div>
<div class="foot"><div class="t"><u>Opening</u>7,290.43</div><span class="op">+</span><div class="t"><u>In</u>4,854.32</div><span class="op">−</span><div class="t"><u>Out</u>5,275.57</div><span class="op">=</span><div class="t"><u>Computed closing</u><span class="tot">6,869.18</span></div></div><div class="cap">Computed closing matches the printed closing, 6,869.18, on all 24 rows.</div></div>
${row('06/01', 'Saffron Table', '−440.09')}${row('06/03', 'Transfer from Savings', '1,079.58')}${row('06/06', 'Summit Fitness Club', '−419.74', true)}${row('06/07', 'Harbor Fuel #7042', '−399.14')}${row('06/10', 'Cedar &amp; Oak Hardware', '−255.56')}</div></div>`;
const tmp = path.join(os.tmpdir(), 'll-og.html');
fs.writeFileSync(tmp, html);
const browser = await chromium.launch(process.env.LL_CHROMIUM_PATH ? { executablePath: process.env.LL_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'src/app/opengraph-image.png' });
await browser.close();
fs.copyFileSync('src/app/opengraph-image.png', 'src/app/twitter-image.png');
const alt = 'LedgerLocal: statement PDFs, reconciled and ready for your books. A RECONCILED stamp above the arithmetic proof and a short ledger of ticked rows; nothing is uploaded.';
fs.writeFileSync('src/app/opengraph-image.alt.txt', alt + '\n');
fs.writeFileSync('src/app/twitter-image.alt.txt', alt + '\n');
console.log('og image written', fs.statSync('src/app/opengraph-image.png').size, 'bytes');
