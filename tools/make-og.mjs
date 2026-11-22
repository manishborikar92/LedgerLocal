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
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Geist;src:url("${pathToFileURL(font).href}");font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:Geist,sans-serif;color:#0e1320;background:#f6f7f9;position:relative;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(60% 70% at 85% 0%,rgba(67,56,202,.16),transparent 70%),linear-gradient(#e1e5ec 1px,transparent 1px) 0 0/100% 42px;opacity:.7}
.wrap{position:relative;display:grid;grid-template-columns:1.1fr 1fr;gap:48px;padding:64px 72px;height:100%;align-items:center}
.brand{display:flex;align-items:center;gap:14px;font-weight:650;font-size:30px;letter-spacing:-.02em;margin-bottom:28px}
h1{font-size:64px;line-height:1.04;letter-spacing:-.035em;font-weight:680;text-wrap:balance}
p{margin-top:26px;font-size:28px;line-height:1.35;color:#525c70;max-width:560px}
.pill{display:inline-flex;gap:10px;align-items:center;margin-top:26px;padding:10px 18px;border-radius:999px;background:#e6f6ef;color:#047857;font-weight:600;font-size:22px;border:1px solid rgba(4,120,87,.3)}
.card{background:#fff;border:1px solid #e1e5ec;border-radius:22px;box-shadow:0 30px 70px -28px rgba(14,19,32,.4);overflow:hidden}
.top{display:flex;align-items:center;gap:22px;padding:22px 26px;border-bottom:1px solid #e1e5ec}
.stamp{display:inline-flex;flex-direction:column;align-items:center;gap:2px;padding:8px 18px;border:4px double #047857;border-radius:8px;color:#047857;background:#e6f6ef;font-weight:750;font-size:22px;letter-spacing:.14em;text-transform:uppercase}
.stamp small{font-weight:500;font-size:17px;letter-spacing:0;text-transform:none}
.sum{font-variant-numeric:tabular-nums;font-size:19px;color:#525c70;line-height:1.5}.sum b{color:#0e1320;font-weight:600}
.row{display:grid;grid-template-columns:30px 1fr 110px;gap:10px;align-items:center;padding:13px 26px;border-bottom:1px solid #e1e5ec;font-size:21px;font-variant-numeric:tabular-nums}
.row i{color:#047857;font-style:normal;font-weight:700}.row .n{text-align:right}.row .neg{color:#b91c1c}
</style><div class="bg"></div><div class="wrap"><div>
<div class="brand"><svg width="46" height="46" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#4338ca"/><path d="M8 11h16M8 16h16M8 21h8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".45"/><path d="M16 21.5l3.5 3.5 6.5-8.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>LedgerLocal</div>
<h1>Statement PDFs, reconciled and ready for your books.</h1>
<p>Convert to QBO, OFX, Excel and CSV, entirely in your browser.</p>
<div class="pill">✓ Nothing is uploaded</div></div>
<div class="card"><div class="top"><div class="stamp"><span>✓ Reconciled</span><small>Δ 0.00</small></div><div class="sum">Opening <b>7,290.43</b><br>Closing <b>6,869.18</b></div></div>
<div class="row"><i>✓</i><span>Transfer from savings</span><span class="n">1,079.58</span></div>
<div class="row"><i>✓</i><span>Summit Fitness Club</span><span class="n neg">−419.74</span></div>
<div class="row"><i>✓</i><span>Harbor Fuel #7042</span><span class="n neg">−399.14</span></div>
<div class="row"><i>✓</i><span>Cedar &amp; Oak Hardware</span><span class="n neg">−255.56</span></div>
<div class="row" style="border:0"><i>✓</i><span>Quartz Cloud Hosting</span><span class="n neg">−19.14</span></div></div></div>`;
const tmp = path.join(os.tmpdir(), 'll-og.html');
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'src/app/opengraph-image.png' });
await browser.close();
fs.copyFileSync('src/app/opengraph-image.png', 'src/app/twitter-image.png');
const alt = 'LedgerLocal: statement PDFs, reconciled and ready for your books. A RECONCILED stamp with a short ledger of verified rows; nothing is uploaded.';
fs.writeFileSync('src/app/opengraph-image.alt.txt', alt + '\n');
fs.writeFileSync('src/app/twitter-image.alt.txt', alt + '\n');
console.log('og image written', fs.statSync('src/app/opengraph-image.png').size, 'bytes');
