# LedgerLocal

**Convert bank-statement and credit-card PDFs to QuickBooks (.QBO), OFX, Excel and CSV on your own device, with a balance reconciliation that shows whether anything was missed.**

> **Not financial advice. Verify exports before filing or importing.** LedgerLocal reads PDFs heuristically; every file shows a reconciliation proof so you can see when it did not read one correctly. Sample statements use fictional banks.

* **Your statements never leave your device.** LedgerLocal is a standard Next.js 16 application: the server renders pages, and that is all it does with them. PDFs and extracted data are processed in a Web Worker in your browser and are never uploaded. The workbench page (`/app/`) is served with a Content-Security-Policy of `connect-src 'none'` and `form-action 'none'`: that page *cannot* make any network request (no fetch, XHR, WebSocket, beacon or form post), and no Server Action ever receives statement data. There is no account, no database and no telemetry. The only state the server touches is a theme cookie (`ll-theme`: `system`, `light` or `dark`). Nothing is saved unless you click *Save* (in your browser's IndexedDB); PDFs are stored only if you tick a box. Verify it yourself: the in-app *Privacy* chip, [`docs/RESEARCH.md`](docs/RESEARCH.md) §6, and the automated tests below.
* **Angle.** Other tools also process locally and check printed balances ([research](docs/RESEARCH.md) §2). LedgerLocal's differences: processing that is *enforced and tested*, a **clickable PDF ↔ row audit trail**, a row-by-row running-balance check that pinpoints the first divergence, native QBO/OFX, no page limits, and it keeps working offline.
* Audit of this version (SEO, performance, accessibility, security, redesign, server migration): [`docs/AUDIT.md`](docs/AUDIT.md). Screenshots: [landing](docs/screenshots/landing-light.png) · [first run](docs/screenshots/empty-light.png) · [workbench](docs/screenshots/workbench-light.png) · [dark](docs/screenshots/workbench-dark.png) · [discrepancy](docs/screenshots/discrepancy-light.png) · [merged ledger](docs/screenshots/ledger-light.png) · [phone](docs/screenshots/phone-rows.png).

## Quick start
Requirements: **Node.js ≥ 22.13** (pdfjs-dist 6 requires it; tested on 22.23), npm ≥ 10. To *use* the app, a current browser: **Chrome or Edge 145, Firefox 144, Safari or iOS 26.2, or newer** (the PDF engine is pdf.js's modern build and relies on ECMAScript 2026 features; an older browser is told so instead of failing mysteriously). For the full test suite also: Python 3 with `ofxparse` and `openpyxl` (`pip install ofxparse openpyxl`), LibreOffice (`soffice`), and a Chromium for Playwright (`npx playwright install chromium`); the Python and LibreOffice tests skip when those are absent.
```bash
npm ci
npm run dev      # development server on http://localhost:3000 (open it as "localhost", not 127.0.0.1)
npm run build    # production build
npm run start    # serve the production build on http://localhost:3000 (set PORT to change it)
```
| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with webpack (the same bundler as production). No service worker in dev. |
| `npm run build` | `next build --webpack`. The bundler emits the pdf.js worker as a hashed file and the offline precache list; there is no copy step. |
| `npm run start` | `next start`: the production server. |
| `npm test` | Unit, contract and integration tests (Vitest). |
| `npm run test:e2e` | Playwright against the production build: run `npm run build` first; the config starts `next start` on port 4173 (`LL_PORT` to change; `LL_CHROMIUM_PATH` to use an existing Chromium). |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint including the architecture and no-network rules. |
| `npm run accuracy` / `npm run perf` | Regenerate [`docs/ACCURACY.md`](docs/ACCURACY.md) on fresh synthetic seeds / the 100-page parse benchmark. |
| `npm run samples` | Rebuild the bundled sample statements. |
| `node tools/bundle-report.mjs` | gzip sizes from the production build (needs `npm run start` running) → `docs/bundle-report.json`. |
| `node tools/lighthouse.mjs …` | Lighthouse runs against a running production server → `docs/lighthouse.json` (usage in the file header; Lighthouse is not a dependency). |
| `node tools/make-og.mjs`, `node tools/make-icons.mjs`, `node tools/notices.mjs` | Regenerate the social card, the app icons, and `THIRD_PARTY_NOTICES.md`. |

The bundler is pinned to webpack for both `dev` and `build` on purpose (see [`docs/DECISIONS.md`](docs/DECISIONS.md) D-03). Running a bare `next dev` or `next build` makes Next.js 16 stop with a message about Turbopack and the webpack configuration; use the npm scripts.

## Deploying
LedgerLocal needs a Node.js server (Next.js renders every page per request so each response can carry its own nonce-based security policy). There is no separate backend and no database to provision.
* **Vercel:** import the repository as a normal Next.js project; no `vercel.json` is needed and the default build command (`npm run build`) is correct. Canonical URLs, Open Graph, the sitemap and robots use `VERCEL_PROJECT_PRODUCTION_URL` automatically; set `NEXT_PUBLIC_SITE_URL` for a custom domain.
* **Any Node host (Render, Coolify, a VPS, a container):** `npm ci && npm run build`, then `npm run start`. The listening port comes from `PORT`. Use `GET /api/health/` for liveness checks; it returns `{"status":"ok",…}` and nothing about users. Serve over HTTPS (service workers and WebCrypto need a secure context), and make sure a reverse proxy passes the original `Host` header through, because Next.js checks the request origin on Server Actions (the theme toggle).
* **Sub-path hosting:** set `NEXT_PUBLIC_BASE_PATH` before building. The setting exists, but sub-path hosting has not been tested.
Build-time configuration is in [`.env.example`](.env.example): `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_BASE_PATH`. That is all.

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
* **Needs a current browser** (see Quick start). An older one gets a clear "too old" message before and instead of any parse; this was verified by simulating the missing features in Chromium, not on real older browsers.
* Heuristic parser: unusual layouts can fail or mis-assign columns; the proof strip and column guides are the safety net. Rotated pages, tables drawn as images and multi-currency tables are not supported.
* Preview fidelity: non-embedded standard fonts render with system fonts and JPEG 2000/ICC images do not render, because the workbench's policy blocks the font/WASM fetches pdf.js would make. Extraction is unaffected.
* Real bank layouts were **not** available for testing. Importing into real QuickBooks/Xero was **not** tested; XLSX was not opened in Microsoft Excel.

## Accuracy (on synthetic layouts)
`tools/synth` generates 21 layouts (fictional banks) with ground-truth JSON covering signed/debit-credit columns, running balances, cards (two sections, two dates, CR suffix, charges-as-negative), parentheses, trailing minus, European, Indian (lakh grouping, `Dr/Cr`), multi-line descriptions, page-break continuation, header carry-over, year rollover, decoy boxes, grouped dates, UK brought-forward rows, left-aligned numbers, a check-number column, a password-protected file and an image-only scan.
**Fresh seeds 201–210, 20 text layouts, 200 statements: 6,717 / 6,717 rows recovered, 200 / 200 reconciled, all metadata correct; 10 / 10 scans rejected correctly** ([`docs/ACCURACY.md`](docs/ACCURACY.md); re-run for this version). **Trust it little as a forecast:** the same authors wrote the generator and the parser, so it is a ceiling; 4 layouts written after tuning initially failed 2 of 4 (fixed; DECISIONS D-12). Reconcile every real file.

## Performance, accessibility, SEO (production build; details in [`docs/AUDIT.md`](docs/AUDIT.md))
* **Lighthouse 13.6** (Chrome 153, one-CPU sandbox, `next start`, median of 3 runs; [`docs/lighthouse.json`](docs/lighthouse.json)): desktop performance **100** on the landing page, a guide and the workbench; **mobile (simulated slow 4G, 4× CPU): landing 86, guide 83, workbench 85**. Accessibility 100 and Best Practices 100 everywhere; SEO 100 on indexable pages (the workbench is intentionally `noindex`). Mobile scores here are limited by main-thread time in the React/Next.js runtime (TBT about 0.5–0.7 s; the landing page is no faster than the workbench) and vary by several points between runs, hosts and Lighthouse versions: Lighthouse 12 on the same build gave lower mobile scores. Treat them as a range, not a promise, and re-measure on your own host. (The Lighthouse runs predate the move to pdf.js's modern build; they were not repeated because that code loads only on use and the first-load bundles are unchanged in size.)
* **Parsing:** a 101-page, 4,300-row statement goes from file to RECONCILED in ≈ 3.5 s in the browser worker with ≤ 97 ms main-thread frame latency (Chromium 153, one CPU, a single run; the previous build's single run was 4.1 s, which is within this sandbox's noise, so no speedup is claimed. Node: 2.1 s extract + 0.38 s parse). [`docs/perf-browser.json`](docs/perf-browser.json), [`docs/perf-node.json`](docs/perf-node.json).
* **Size (gzip, [`docs/bundle-report.json`](docs/bundle-report.json)):** landing ≈ 169 KB JS + 9 KB CSS; workbench shell ≈ 212 KB JS; loaded on use: parse worker ≈ 355 KB, PDF renderer ≈ 126 KB, pdf.js worker ≈ 355 KB (about 5% less than with the legacy build). The one-time offline install (44 files) is ≈ 1.4 MB gzip (4.2 MB raw), fetched by the service worker after the workbench has loaded.
* **SEO/social:** `metadataBase`, per-page titles/descriptions/canonicals, Open Graph + Twitter cards with a designed 1200×630 image, JSON-LD, sitemap, robots, web manifest, all in the server-rendered HTML; the workbench is `noindex`.
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
* **Code layers.** `core` (pure TS) → `ports` (`ProjectRepository`) → `adapters` (IndexedDB, in-memory, pdf.js worker/renderer) → `ui` (React, feature folders, state modules), wired once in `src/composition.ts`. Boundaries and the no-network/no-eval rules are enforced by ESLint and tested.
* **Server vs browser.** Server Components render the landing page, guides and metadata, and the workbench *shell*; the workbench itself is a small Client Component because it needs Web Workers, canvas, IndexedDB and drag-and-drop. `src/proxy.ts` (Next.js 16's middleware) gives every page request its own nonce and a per-route Content-Security-Policy: `/app` gets `connect-src 'none'` and `form-action 'none'`, other pages only their own origin. The one Server Action (`cycleTheme`) switches the theme cookie and works without JavaScript; the workbench writes the same cookie from the browser. Offline use (workbench only) is a hand-written service worker, `public/sw.js`.
See [`docs/DESIGN.md`](docs/DESIGN.md) (structure, request flow, algorithms, design system, test plan, extension points) and [`docs/DECISIONS.md`](docs/DECISIONS.md).

## What was verified, and how
| Claim | How | Status |
|---|---|---|
| Parser exact on 20 synthetic layouts; 200/200 fresh-seed statements reconcile | Vitest integration vs ground truth + `npm run accuracy` | ✅ (synthetic only) |
| Nothing leaves the device from the workbench | Production-server E2E records every request, listens for CSP violations, fires fetch/XHR/WebSocket/beacon attempts that must be blocked; the workbench response carries `connect-src 'none'`; entry into `/app` is a full page load so that policy really applies | ✅ |
| Per-request nonces; per-route CSP; theme Server Action with and without JavaScript; health endpoint; 404s | `e2e/server.spec.ts` against `next start` | ✅ |
| An older browser gets a clear message, not a misleading read error | E2E removes the newest required API (`Map.getOrInsertComputed`) before the page loads; unit tests cover each required feature; the support floor comes from a compatibility table, and the list of required features from removing each in Chromium for the sample statement only | ✅ simulated (no real older browsers; Firefox/Safari never run) |
| Works offline / installable | E2E: Cache Storage holds every file in the build's precache list, then a reload with the network disabled still reconciles a statement | ✅ |
| Offline cache refreshes after a new deploy | Checked once by hand across three consecutive builds with one browser profile (cache updated, previous generation kept, older one pruned, new lazy chunk served offline with the server stopped); that script is not in the suite | ✅ manual, one-off |
| `npm run dev` works | Smoke-tested once by hand: workbench reaches RECONCILED with no CSP violations and no console errors; not in the suite | ✅ manual, one-off |
| SEO metadata, social image, sitemap, robots, noindex on the workbench | E2E on server-rendered HTML; Lighthouse | ✅ (share previews not checked on real platforms) |
| App copy is accurate for a free, client-first tool (no commerce or separate-backend language) | Test over the app source and every rendered page | ✅ |
| QBO/OFX well-formed; XLSX correct | `ofxparse`; `openpyxl` + LibreOffice | ✅ (not QuickBooks/Xero/Excel) |
| Accessibility | axe-core (WCAG 2.0–2.2 A/AA tags) + keyboard E2E; Lighthouse 100 | ✅ (automated only; no screen-reader session) |
| Dependencies | `npm audit` reports 0 vulnerabilities | ✅ (at the time of the last install) |
| Vercel, Render or Coolify deployment; sub-path hosting | — | ❌ no real deploy made |
| Windows / PowerShell, macOS | Scripts are plain Node and a test forbids machine-specific paths, but nothing was run there | ❌ not tested |
| Real bank statements, scans/OCR, Firefox/Safari | — | ❌ not tested / not built |
Counts: 162 Vitest tests + 26 Playwright tests.

## Troubleshooting
* **"No transaction table was detected" / wrong columns** → *Column guides* on the PDF side (drag or arrow keys), or add rows by hand.
* **DISCREPANCY** → *Jump to problem row*; compare the highlighted PDF region; the message gives the difference at the first divergence. Common causes: a missed or duplicated line, a wrong sign (*Flip sign*), wrong balances (*Edit balances*).
* **"This browser is too old for LedgerLocal's PDF engine"** → update to Chrome or Edge 145, Firefox 144, Safari 26.2 or newer; nothing was uploaded or changed.
* **Scanned PDF** → get the text PDF from the bank's portal; OCR is on the roadmap.
* **QuickBooks Desktop can't verify the institution** → edit INTU.BID / ORG / FID in the Export dialog.
* **Excel shows odd characters in CSV** → keep the UTF-8 BOM option on; for European Excel use `;` and decimal comma.
* **"This build is using Turbopack, with a `webpack` config"** → you ran `next dev` or `next build` directly; use `npm run dev` / `npm run build`.
* **Dev page is blank or hot reload fails** → open `http://localhost:3000`; Next.js blocks dev resources requested via `127.0.0.1`.
* **Old version after an update** → the service worker re-caches the workbench the next time you open `/app/` while online; if something still looks stale, reload once, or use *Application → Service Workers → Unregister* in devtools.

## Roadmap
Offline OCR for scanned statements (tesseract.js with self-hosted data, verified on scanned samples) · passphrase lock for saved projects (WebCrypto AES-GCM + KDF) · more layout guides once bank-specific claims can be verified · an accuracy suite built from consented real statements.

## Licence
[MIT](LICENSE); third-party notices in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
