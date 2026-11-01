# Design

## 1. Principles
1. **Nothing leaves the device.** Parsing, reconciliation, export and storage are client-side; production pages forbid network requests (CSP `connect-src 'none'`). There is no server, backend, account or remote database.
2. **Prove, don't promise.** Every statement shows an arithmetic proof; every row links back to the PDF region it came from; accuracy numbers are measured and labelled "on synthetic layouts".
3. **Integers only.** Money is integer minor units end to end.
4. **Seams, not speculation.** One port (`ProjectRepository`), one composition root, a pure `core` that can run in Node or move to a shared package.

## 2. Architecture and folder structure
```
src/
  core/        pure TypeScript: money, numbers, dates, geometry, parse/, reconcile, edit, merge, rules,
               migrate, hash, base64, export/{csv,ofx,xlsx}. No React, DOM, Next or other layers (lint-enforced).
  ports/       ProjectRepository (where saved projects live), ParseFailure.  Imports core only.
  adapters/    idb/ (IndexedDB repository), memory/ (test adapter), pdf/ (pdf.js extraction, parse worker,
               worker client, page renderer), samples/ (bundled base64 sample PDFs)
  composition.ts   THE composition root: binds ports to adapters, lazily, in the browser only
  config/      site.ts (metadata, URLs, social image), paths.ts, app-config.ts
  styles/      tokens.css · base.css · components.css · workbench.css · marketing.css  (cascade layers)
  ui/
    state/       store.ts (app store) · types.ts · ui.ts (dialogs/notices) · queue.ts (import) · editing.ts
                 rules.ts · exporting.ts · projects.ts · exporter.ts (lazy export engine) · index.ts (public API)
    primitives/  Dialog, icons
    shell/       AppShell, ViewRouter (lazy views), Toast, ServiceWorker, theme
    import/      DropZone, QueueList, SampleList, EmptyState
    workbench/   Workbench, Grid (ARIA data grid), PdfPane (audit trail + column guides), StatusBar (proof strip)
    dialogs/     one file per dialog + a switch
    views/       LedgerView, RulesView, Report
    marketing/   SiteChrome (header/footer), ProductMock
  app/         Next.js App Router (static export): / · /app · /guides/[slug] · sitemap · robots · manifest · icons · OG image
```
Lint rules (`eslint.config.mjs`) forbid: React/DOM/Next in `core`; any layer import from `core`; the UI importing adapters (only `@/composition`); adapters importing the UI; and, everywhere in `src/`, `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`sendBeacon`/`eval`/`new Function`. A test feeds deliberately bad code to ESLint to prove each rule fires.

**Naming.** Components `PascalCase.tsx`; modules `camelCase`/`kebab-case.ts`; one feature folder per UI area; state modules named by feature, re-exported from `ui/state/index.ts` so components import `@/ui/state`. CSS component classes are short semantic names (`btn`, `chip`, `card`, `stamp`, `data-grid`, `grid-row`, `site-container`) living in the `components` cascade layer so Tailwind utilities always win; none may share a name with a Tailwind utility (three did and caused layout bugs; see AUDIT.md).

## 3. Data model (zod, `src/core/model.ts`)
* **Row**: `id (uuid)`, `date (ISO)`, `postDate?`, `description`, `sourceDescription` (as extracted; keeps transaction ids stable when users clean descriptions), `amountMinor` (**money into the account is positive, out is negative, for banks and cards**, matching OFX `TRNAMT`), `balanceMinor?` (printed running balance), `payee?`, `category?`, `memo?`, `source` (bounding boxes `{page, x, y, w, h}` in PDF points, top-left origin), `flags`.
* **Statement**: file name + SHA-256, page count, account type, last-4, currency, period, opening/closing balances **as printed** (bank: funds; card: amount owed), `balanceSource` (`label` | `label-search` | `running-balance` | `manual` | `none`), rows, detected column zones, `warnings`, `assumptions`, `pagesWithRows`.
* **Project** (= one client): statements, rules, export settings, `pdfsStored`. `schemaVersion: 1` is the first public version.
* **Migrations** (`core/migrate.ts`): a registry of `{from, to, up}` steps run in order; newer-than-known files are rejected with a clear error; the registry is empty by design at v1 and the *mechanism* is tested with a synthetic registry. **Project file** = `{kind: "ledgerlocal-project", schemaVersion, exportedAt, project}` JSON, no PDFs.
* Stable UUIDs everywhere; all models are serialisable (IndexedDB structured clone, JSON file). zod runs in `jitless` mode because its JIT uses `new Function`, which the CSP forbids.

## 4. Parsing algorithm (`src/core/geometry.ts`, `src/core/parse/*`)
Input: per page, positioned text items from pdf.js (`x, y(top), w, h` in points).
### 4.1 Geometry
Drop blank/zero-height items (pdf.js spacer runs) → cluster items into **lines** by vertical centre within 0.5 × median text height → within a line merge items separated by < 0.45 × text height into one **segment** (a "cell").
### 4.2 Table detection (`table.ts`, `headers.ts`)
* A **header line** has ≥ 2 recognisable column titles (Date, Posting Date, Description/Details/Particulars, Debit/Withdrawals/Paid out/Money out/Charges, Credit/Deposits/Paid in/Money in/Payments, Amount, Balance…) including a date and an amount-type column, and contains no date- or amount-like cell.
* A header opens a **region** that runs to an *end marker* (Totals, Ending balance, Daily balance summary, interest/fee summaries…) or the next header; a page without a header **carries** the region over. A header with date+balance only closes the region and starts nothing, so decoy tables are never read as transactions.
* **Column zones** start as gutter midpoints between header cells, then are **fitted to the data** (numeric cells matched to numeric header columns by the smaller of right-edge/left-edge/centre distance, so left-, right- and centre-aligned headers all work); user-dragged zones replace them wholesale.
* **Rows**: a line whose date cell parses starts a row. Date-less lines are *continuations* (tight vertical spacing, text only), *amount completions*, or *same-date rows* (grouped-date layouts, flagged). Checkpoint lines ("Balance brought forward", "Ending balance"…) become balance candidates, never rows; page furniture is ignored.
### 4.3 Amounts and dates
* Amount tokens: US `1,234.56`, Indian `1,23,456.78`, European `1.234,56`, Swiss/space groupings, currency symbols/codes, parentheses, leading/trailing minus, `CR`/`DR`. Decimals are *required* for 2-decimal currencies so reference numbers are never amounts. Number format is detected from all numeric cells.
* **Sign normalisation**: separate debit/credit columns → direction from the column. Single amount column: bank = as printed; card = flipped. If the result does not reconcile **and flipping every sign does**, the signs are flipped and an *assumption* is recorded (single-amount-column layouts only, never silently).
* Dates: ISO, `MM/DD/YYYY`, `DD.MM.YYYY`, `Mon DD, YYYY`, `DD Mon YYYY`, `DD-Mon-YY`, year-less `MM/DD` or `Mon DD`. **DD/MM vs MM/DD** is decided by evidence (a value > 12 in either position), else dotted dates/European numbers imply DMY, else chronology, else MDY with a visible assumption. **Years** come from the statement period (Dec→Jan rollover handled), else the latest year in the document with sequence-based rollover.
### 4.4 Metadata and balances (`summary.ts`)
Account type scored from vocabulary; last-4 from "Account/Card … ending/XXXX1234"; period from a line with two dates and a period cue; currency from codes/symbols. **Balances**: labelled candidates in priority order; if the first pair does not reconcile, the first candidate pair that does is used and marked `label-search` with a visible assumption; missing endpoints are derived from the first/last printed running balance; otherwise the user enters them.
### 4.5 Reconciliation (`reconcile.ts`)
* Totals: bank `opening + in − out = closing`; card `previous + charges − payments = new balance`. `delta = computed − printed`; 0 ⇒ **RECONCILED**.
* **Chain**: for rows with a printed balance, `expected = previous + step`; a mismatch marks the row ✗, remembers the first one ("jump to problem row"), then **re-syncs** so later rows are judged independently.
* Suggestions (never auto-applied outside §4.3): flip all signs, flip one row, swap balances, missing/extra transaction near the first divergence.

## 5. Exports
CSV (configurable columns, date format, signed vs debit/credit, delimiter, decimal mark, BOM, formula-injection guard) · XLSX (Transactions + Reconciliation sheets with live `SUMIFS`/`IF` formulas and cached values) · OFX 1.0.2 SGML and QBO (bank and card, deterministic FITIDs, overlapping statements de-duplicated) · printable reconciliation report. The export engine is loaded on demand.

## 6. Persistence and privacy
Sessions are ephemeral. *Save* writes the project to IndexedDB through `ProjectRepository`; PDFs only if the user ticks the box; reopening without PDFs offers re-attachment verified by SHA-256. *Wipe all local data* deletes projects, PDFs and `ll.*` preferences.

## 7. Screen map and states
`/` landing · `/guides`, `/guides/[slug]` · `/app`: **empty state** → **import queue** (queued, parsing with progress and cancel, password prompt, errors) → **Workbench** (doc tabs, proof strip, PDF pane ↔ grid, toolbar, column guides, notes) · **Merged ledger** · **Payees & rules** · dialogs (Export, Projects, Privacy/verify-offline, Balances, Split, Shortcuts, Samples, Wipe) · **Report** overlay. Offline state: header chip + full function. Phone: Rows/PDF tab switch.

## 8. Visual design system ("calm precision")
* **Evidence-based direction** (AUDIT.md §2): data-dense tools (Stripe, Linear, Vercel, Mercury) use one workhorse sans with tabular figures, a neutral surface scale, brand colour on a tiny share of pixels, tables as the primary UI, and first-class dark mode. Colour carries meaning, not decoration.
* **Type**: Geist (variable, self-hosted via `next/font/local`, OFL), `tnum` for every figure; tight tracking on headings (-0.025em), 15 px base in the app, 17–18 px on marketing pages. Geist Mono loads lazily for code and identifiers.
* **Colour**: neutral cool-grey scale; one indigo accent (`#4338ca` light / `#9aa2ff` dark); semantic success/danger/warning with soft backgrounds. Every text pair ≥ 4.5:1, control borders ≥ 3:1 (axe-verified in both themes).
* **Shape/depth**: 10 px controls, 16 px cards, hairline borders, two soft shadows; no blur effects (they cost ~20 Lighthouse points under throttling).
* **Signature**: the *proof strip*: a double-border stamp, a footing with a double-underlined total, ✓/✗ ticks in a ruled margin, and outline styles (solid/dotted/dashed) on the PDF so status never relies on colour alone.
* **Tokens** in `styles/tokens.css`, exposed to Tailwind via `@theme inline`; component CSS in `@layer components`; layout in utilities.

## 9. Test plan (what runs, where)
| Layer | What | Where |
|---|---|---|
| Unit | money, amount/date parsing, geometry, header detection, reconcile, edit, merge, rules, migrations, exporters, CSP builder | `tests/unit` |
| Contract | `ProjectRepository` against in-memory and IndexedDB (fake-indexeddb) | `tests/contract` |
| Integration | real parser over every synthetic layout × seeds vs ground truth; password/corrupt/scan errors; OFX via python `ofxparse`; XLSX via `openpyxl` and LibreOffice | `tests/integration` |
| Architecture / privacy / SEO | ESLint boundary rules bite; built pages carry CSP + hashes, titles, descriptions, canonical, OG/Twitter tags, noindex on the app shell, sitemap, social image size; no pricing/licence/backend vocabulary in any page | `tests/unit/csp-architecture.test.ts` |
| E2E (real Chromium, production build) | full flow, audit trail, blocked network attempts, edit/undo, split/merge, exports, large statement, password, errors, projects/wipe, merged ledger, rules, column guides, offline reload, phone, axe WCAG (both themes), metadata, 100-page perf | `e2e/` |

## 10. Extension points
| You want to… | Touch |
|---|---|
| Support a new statement quirk | `src/core/parse/*` + add a layout to `tools/synth/generate.ts`; the test-suite compares to ground truth |
| Add an export format | `src/core/export/*` + `src/ui/state/exporter.ts` |
| Store projects somewhere else | implement `ProjectRepository`; run `tests/contract/repository.contract.ts` against it; bind it in `src/composition.ts` |
| Add OCR (roadmap) | an adapter producing the `PageText[]` the parser already consumes (e.g. tesseract.js with self-hosted data in a worker); needs `'wasm-unsafe-eval'` in `script-src` and verification on a *scanned* synthetic PDF before shipping |
