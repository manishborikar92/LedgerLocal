# LedgerLocal

**Convert bank-statement and credit-card PDFs to QuickBooks (.QBO), OFX, Excel and CSV, entirely in your browser, with a balance reconciliation that shows whether anything was missed.**

> **Not financial advice. Verify exports before filing or importing.** LedgerLocal reads PDFs heuristically; every file shows a reconciliation proof so you can see when it did not read one correctly. Sample statements use fictional banks.

* **Client-side only.** There is no server, backend, account or remote database. PDFs and extracted data are processed in a Web Worker on your device and are never uploaded. Production pages ship a Content-Security-Policy with `connect-src 'none'`: the page *cannot* make network requests (no fetch, XHR, WebSocket or beacon). Nothing is saved unless you click *Save*; PDFs are stored only if you tick a box. No telemetry. Verify it yourself: the in-app *Privacy* chip, [`docs/RESEARCH.md`](docs/RESEARCH.md) §6, and the automated tests below.
* **Angle.** Other tools also process locally and check printed balances ([research](docs/RESEARCH.md) §2). LedgerLocal's differences: processing that is *enforced and tested*, a **clickable PDF ↔ row audit trail**, a row-by-row running-balance check that pinpoints the first divergence, native QBO/OFX, no page limits, and works offline.
* Audit of this version (SEO, performance, accessibility, security, redesign): [`docs/AUDIT.md`](docs/AUDIT.md). Screenshots: [landing](docs/screenshots/landing-light.png) · [first run](docs/screenshots/empty-light.png) · [workbench](docs/screenshots/workbench-light.png) · [dark](docs/screenshots/workbench-dark.png) · [discrepancy](docs/screenshots/discrepancy-light.png) · [merged ledger](docs/screenshots/ledger-light.png) · [phone](docs/screenshots/phone-rows.png).

## Quick start
Requirements: **Node.js ≥ 22.13** (tested on 22.22), npm ≥ 10. For the full test-suite also: Python 3 with `ofxparse` and `openpyxl`, LibreOffice (`soffice`), and a Chromium for Playwright (all optional; dependent tests skip).
```bash
# A) Serve the prebuilt static export included in this ZIP (no install, no dependencies):
node scripts/serve.mjs            # http://127.0.0.1:4173/  (applies out/_headers, gzip; i.e. the real CSP)

# B) Build from source
npm ci
npm run build                     # prebuild -> next build --webpack -> postbuild (CSP hashes, _headers, SW precache)
npm run preview                   # serves out/
```
| Command | What it does |
|---|---|
| `npm run dev` | Next dev server (no CSP, no service worker) |
| `npm run build` | Static export to `out/` (fails on remote scripts/styles or inline handlers) |
| `npm run preview` | Serve `out/` with the real headers and gzip |
| `npm test` | Unit, contract and integration tests (Vitest) |
| `npm run test:e2e` | Playwright against the production build (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH`) |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint incl. architecture and no-network rules |
| `npm run accuracy` / `npm run perf` | Regenerate [`docs/ACCURACY.md`](docs/ACCURACY.md) on fresh synthetic seeds / 100-page parse benchmark |
| `npm run samples` | Rebuild the bundled sample statements |
| `node tools/make-og.mjs`, `node tools/make-icons.mjs` | Regenerate the social card and app icons |

## Deploying
**Vercel** (primary): import the repo; the framework preset is detected (`vercel.json` pins `npm ci`, `npm run build`, output `out`). `vercel.json` adds the static security headers (nosniff, Referrer-Policy, X-Frame-Options, `frame-ancestors 'none'`, Permissions-Policy, COOP) and cache rules; Vercel adds HSTS itself. The per-page script-hash CSP is already inside every HTML file as a `<meta>` tag, so it needs no header. Canonical URLs, Open Graph, sitemap and robots use `VERCEL_PROJECT_PRODUCTION_URL` automatically; set `NEXT_PUBLIC_SITE_URL` for a custom domain.
**Cloudflare Pages / Netlify**: publish `out/`; the generated `_headers` file applies the CSP to HTML documents (and a separate policy to `/sw.js`; do not put the document CSP on the service worker). **GitHub Pages / any static host**: works as is; build with `NEXT_PUBLIC_BASE_PATH=/repo-name` for a sub-path. Serve over HTTPS (service workers and WebCrypto need a secure context).
Build-time configuration is in [`.env.example`](.env.example): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_PATH`. That is all.

## Walkthrough
1. Open **/app/** (or *Open the app* on the landing page). Click **Try a sample statement**, or drop PDFs (several at once; password-protected files prompt; scanned/corrupt/non-PDF files give a clear message; each file has progress and **Cancel**).
2. Read the **proof strip**: a green **RECONCILED Δ 0.00** stamp (opening + money in − money out = closing; for cards previous + charges − payments = new balance), or a red **DISCREPANCY** with the exact difference and **Jump to problem row**. Each row shows ✓ (its printed running balance matches), ✗ (first divergence) or – (nothing printed to check).
3. **Click any row** to see its date, description, amount and balance outlined on the PDF page; **click a box** to select its row. Resize the panes by dragging or with ←/→ on the splitter.
4. **Fix** what is wrong, keyboard-first: arrows, Enter/F2/typing to edit, Space to tick, Insert/Ctrl+Enter add row, Delete, Ctrl+Shift+F flip sign, Ctrl+M merge, Ctrl+\ split, Ctrl+Z / Ctrl+Shift+Z undo/redo (full list: `?` button). *Column guides* lets you drag (or arrow-key) column borders on the PDF and re-read the statement. *Edit balances* enters opening/closing by hand.
5. **Several months?** The **Merged ledger** tab merges statements chronologically and checks continuity, gaps, overlaps and duplicates.
6. **Payees & rules**: contains / regex / fuzzy rules (first match wins), a built-in prefix-and-store-number cleanup, bulk apply, JSON import/export, saved with the client project.
7. **Export…**: CSV, Excel (data + live reconciliation sheet), OFX, QBO; or **Report** for a printable reconciliation report. No limits.
8. **Client projects** (folder button): *Save on this device* (rows/rules/settings; PDFs only if ticked), reopen, export/import a project file, **Wipe all local data**.

## Supported statements and known limitations
Supported (text-based PDFs): bank and credit-card statements; signed or separate debit/credit columns; running balances (every line or none); CR/DR, parentheses and trailing-minus negatives; US, UK, European and Indian number/date formats; multi-line descriptions; multi-page tables with repeated headers/footers; year-less dates across Dec→Jan; two-date card layouts; summary boxes and daily-balance tables (ignored as decoys); "balance brought/carried forward" rows; date-grouped layouts; password-protected files.
Limitations:
* **Scanned / image-only PDFs are rejected** ("no readable text"). Offline OCR is roadmap and the biggest real-world coverage gap.
* Heuristic parser: unusual layouts can fail or mis-assign columns; the proof strip and column guides are the safety net. Rotated pages, tables drawn as images and multi-currency tables are not supported.
* Preview fidelity: non-embedded standard fonts render with system fonts and JPEG 2000/ICC images do not render, because the strict CSP blocks the font/WASM fetches pdf.js would make. Extraction is unaffected.
* Real bank layouts were **not** available for testing. Importing into real QuickBooks/Xero was **not** tested; XLSX was not opened in Microsoft Excel.

## Accuracy (on synthetic layouts)
`tools/synth` generates 21 layouts (fictional banks) with ground-truth JSON covering signed/debit-credit columns, running balances, cards (two sections, two dates, CR suffix, charges-as-negative), parentheses, trailing minus, European, Indian (lakh grouping, `Dr/Cr`), multi-line descriptions, page-break continuation, header carry-over, year rollover, decoy boxes, grouped dates, UK brought-forward rows, left-aligned numbers, a check-number column, a password-protected file and an image-only scan.
**Fresh seeds 201–210, 20 text layouts, 200 statements: 6,717 / 6,717 rows recovered, 200 / 200 reconciled, all metadata correct; 10 / 10 scans rejected correctly** ([`docs/ACCURACY.md`](docs/ACCURACY.md)). **Trust it little as a forecast:** the same authors wrote the generator and the parser, so it is a ceiling; 4 layouts written after tuning initially failed 2 of 4 (fixed; DECISIONS D-12). Reconcile every real file.

## Performance, accessibility, SEO (production build; details in [`docs/AUDIT.md`](docs/AUDIT.md))
* **Lighthouse 12:** landing 100/100/100 desktop and **96/100/100 mobile** (slow 4G, 4× CPU; LCP 2.5 s, CLS 0); app shell 91–94 mobile; Accessibility 100 and Best Practices 100 everywhere. (SEO 92 on indexable pages: the robots.txt audit is blocked by our own CSP, a tool artifact.)
* **Parsing:** a 101-page, 4,300-row statement goes from file to RECONCILED in ≈ 3.4 s in the browser worker with ≤ 93 ms main-thread frame latency (Node: 2.4 s extract + 0.38 s parse).
* **Size (gzip):** landing ≈ 169 KB JS; app shell ≈ 212 KB; loaded on use: parse worker ≈ 370 KB, PDF renderer ≈ 144 KB, pdf.js worker ≈ 383 KB. Whole `out/` ≈ 5.1 MB, cached for offline use.
* **SEO/social:** `metadataBase`, per-page titles/descriptions/canonicals, Open Graph + Twitter cards with a designed 1200×630 image, JSON-LD, sitemap, robots, web manifest; the app shell is `noindex`.
* **Accessibility:** WCAG 2.2 AA targeted: ARIA data grid with roving tabindex, keyboard-operable column guides, focus never hidden by sticky bars, ≥ 4.5:1 text contrast in both themes, status never by colour alone, reduced-motion and forced-colors support; axe-core runs in E2E on landing, workbench (light + dark) and a phone viewport.

## Export formats and importing
| Format | Notes |
|---|---|
| **CSV** | Columns (date, post date, description, payee, category, amount or debit/credit, balance, account, page, FITID), date format, delimiter, decimal mark, UTF-8 BOM; spreadsheet-formula injection neutralised. |
| **XLSX** | `Transactions` (real dates and numbers, frozen header, filter) + `Reconciliation` (live `SUMIFS`/`IF` formulas: opening, in/out, computed vs printed closing, difference, status). |
| **OFX** (1.0.2 SGML) and **QBO** | Bank (`STMTRS`) and card (`CCSTMTRS`); deterministic **FITID** (same transaction ⇒ same id across overlapping statements); NAME ≤ 32 chars with the full text in MEMO; ASCII-safe; card ledger balance = −amount owed. QBO adds `INTU.BID`. |
Validation here: OFX/QBO parse with the independent Python `ofxparse` library (count, unique FITIDs, sum, balance, account id, currency); XLSX loads in `openpyxl` and **recalculates in LibreOffice** to the same status and difference; CSV matches ground truth.
**Import steps** (menu names change; check each vendor's help): *QuickBooks Desktop*: File → Utilities → Import → **Web Connect Files** → `.qbo` (if it cannot verify the institution, edit **INTU.BID / ORG / FID** in the Export dialog; the default `3000` is a generic placeholder **not verified against Intuit's directory**). *QuickBooks Online*: Transactions → **Upload transactions** → `.qbo`/`.ofx`/CSV. *Xero*: bank account → **Import a statement** → OFX or CSV. **Not tested here:** real imports; try one small statement first.

## Architecture
`core` (pure TS) → `ports` (`ProjectRepository`) → `adapters` (IndexedDB, in-memory, pdf.js worker/renderer) → `ui` (React, feature folders, state modules) wired once in `src/composition.ts`; boundaries and the no-network/no-eval rules are enforced by ESLint and tested. See [`docs/DESIGN.md`](docs/DESIGN.md) (structure, algorithms, design system, test plan, extension points) and [`docs/DECISIONS.md`](docs/DECISIONS.md).

## What was verified, and how
| Claim | How | Status |
|---|---|---|
| Parser exact on 20 synthetic layouts; 200/200 fresh-seed statements reconcile | Vitest integration vs ground truth + `npm run accuracy` | ✅ (synthetic only) |
| Nothing leaves the device | Production-build E2E records every request, listens for CSP violations, fires fetch/XHR/WebSocket/beacon attempts that must be blocked; built HTML has hash-only inline scripts and no remote hosts | ✅ |
| Works offline / installable | E2E reloads with the network disabled via the service worker and still reconciles a statement | ✅ |
| SEO metadata, social image, sitemap, robots, noindex on app shell | Built-HTML tests + E2E; Lighthouse | ✅ (share previews not checked on real platforms) |
| App copy is accurate for a client-only tool (no commerce or server language) | Test over every built page + E2E on the app | ✅ |
| QBO/OFX well-formed; XLSX correct | `ofxparse`; `openpyxl` + LibreOffice | ✅ (not QuickBooks/Xero/Excel) |
| Accessibility | axe-core (WCAG 2.0–2.2 A/AA tags) + keyboard E2E; Lighthouse 100 | ✅ (automated only; no screen-reader session) |
| Vercel deployment | Static export served locally with equivalent headers | ❌ no real deploy made |
| Real bank statements, scans/OCR, Firefox/Safari | — | ❌ not tested / not built |
Counts: 156 Vitest tests + 19 Playwright tests.

## Troubleshooting
* **"No transaction table was detected" / wrong columns** → *Column guides* on the PDF side (drag or arrow keys), or add rows by hand.
* **DISCREPANCY** → *Jump to problem row*; compare the highlighted PDF region; the message gives the difference at the first divergence. Common causes: a missed or duplicated line, a wrong sign (*Flip sign*), wrong balances (*Edit balances*).
* **Scanned PDF** → get the text PDF from the bank's portal; OCR is on the roadmap.
* **QuickBooks Desktop can't verify the institution** → edit INTU.BID / ORG / FID in the Export dialog.
* **Excel shows odd characters in CSV** → keep the UTF-8 BOM option on; for European Excel use `;` and decimal comma.
* **Old version after an update** → the service worker caches the app; reload twice or *Application → Service Workers → Unregister* in devtools.

## Roadmap
Offline OCR for scanned statements (tesseract.js with self-hosted data, verified on scanned samples) · passphrase lock for saved projects (WebCrypto AES-GCM + KDF) · more layout guides once bank-specific claims can be verified · an accuracy suite built from consented real statements.

## Licence
[MIT](LICENSE); third-party notices in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
