# Design

## 1. Principles
1. **Nothing leaves the device.** Parsing, reconciliation, export and storage are client-side; the workbench page forbids every network request (CSP `connect-src 'none'`, `form-action 'none'`). The Next.js server renders pages and never receives statement data; there is no account, separately hosted backend or database.
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
  lib/         csp.ts (Content-Security-Policy builder, chosen per route) · theme.ts, theme-cookie.ts (theme preference shared by server and browser)
  server/      preferences.ts (server-only theme cookie read) · actions.ts (the one Server Action: cycleTheme)
  proxy.ts     Next.js 16 proxy (formerly middleware): per-request nonce + CSP header
  app/         Next.js App Router, rendered per request: / · /app · /guides/[slug] · api/health · sitemap · robots · manifest · icons · OG image
```
Outside `src/`: `public/sw.js` (offline service worker, workbench only), `next.config.mjs` (static security headers; the plugin that emits the offline precache list), `e2e/` (Playwright), `tools/` (synthetic generator, accuracy, perf, Lighthouse and bundle reports, icon/OG/notice generators). There is no build-time copying step: pdf.js's worker is resolved from `node_modules` by the bundler (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` in `src/adapters/pdf/render.ts`) and served as a hashed, immutable file on our own origin.
Lint rules (`eslint.config.mjs`) forbid: React/DOM/Next in `core`; any layer import from `core`; the UI importing adapters (only `@/composition`); adapters importing the UI; and, everywhere in `src/`, `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`sendBeacon`/`eval`/`new Function`. A test feeds deliberately bad code to ESLint to prove each rule fires.

**Naming.** Components `PascalCase.tsx`; modules `camelCase`/`kebab-case.ts`; one feature folder per UI area; state modules named by feature, re-exported from `ui/state/index.ts` so components import `@/ui/state`. CSS component classes are short semantic names (`btn`, `chip`, `card`, `stamp`, `data-grid`, `grid-row`, `site-container`) living in the `components` cascade layer so Tailwind utilities always win; none may share a name with a Tailwind utility (three did and caused layout bugs; see AUDIT.md).

### 2.1 Runtime architecture: request flow, rendering split, policies
**Rendering split.** Server Components render the landing page, guides, metadata and the workbench *shell* (`/app` is a Server Component that reads the theme cookie and renders the `AppShell` Client Component). The workbench is a Client Component tree because it needs Web Workers, canvas, IndexedDB and drag-and-drop. Statement data exists only in that browser tree.
**Per-request nonce CSP.** `src/proxy.ts` runs for page requests (not for `_next/static`, metadata files, icons, the service worker or API routes). It creates a random nonce, builds the policy with `buildCsp` (`src/lib/csp.ts`), puts it on the *request* (Next.js reads the nonce from there and stamps its own scripts) and on the *response*. Because every response differs, pages render dynamically: the root layout calls `await connection()`. Scripts are allowed only with the nonce, plus `'strict-dynamic'` for the chunks those scripts load.
| Directive | `/app` (workbench) | other pages |
|---|---|---|
| `connect-src` | `'none'` | `'self'` (navigation payloads, Server Actions) |
| `form-action` | `'none'` | `'self'` |
| `script-src` | `'self'` + nonce + `'strict-dynamic'` | same |
| `worker-src`, `img-src`, `font-src`, `manifest-src` | `'self'` (images also `data:`, `blob:`) | same |
| `style-src` | `'self'`; `style-src-attr 'unsafe-inline'` for dynamic positions | same |
| `default-src`, `base-uri`, `object-src`, `frame-src`, `frame-ancestors` | `'none'` | same |
The development server adds `'unsafe-eval'` (React), `blob:` workers and `ws:`/`wss:` (HMR), and so does not enforce `connect-src 'none'`; that guarantee is a production-server property, tested in E2E.
**Entering the workbench.** From a marketing page the link to `/app/` is a plain `<a>` (hard navigation). A `next/link` client navigation would keep the marketing page's weaker policy, so an E2E test asserts the stricter policy really applies after the click.
**Static headers** live in `next.config.mjs` `headers()`: `nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options`, `Permissions-Policy`, COOP, HSTS. `Referrer-Policy` is deliberately not `no-referrer`: that makes browsers send `Origin: null` on same-origin form posts, which Next.js rejects for Server Actions. `/sw.js` gets its own policy (`default-src 'none'; connect-src 'self'`) because a service worker inherits the CSP of its own script response.
**Theme.** One cookie, `ll-theme` (`system`/`light`/`dark`). The root layout reads it on the server and sets `data-theme` on `<html>`, so the first HTML is already correct (no flash, no inline script). The Server Action `cycleTheme` (`src/server/actions.ts`) advances it from a `<form>` in the site header and works with JavaScript disabled. Inside `/app` the toggle is client-only and writes the same cookie via `document.cookie`, since that page's policy forbids Server Actions. Server Actions never receive statement data.
**Offline (workbench only).** `public/sw.js`, registered by `ServiceWorker.tsx` (mounted only by `AppShell`) after load and idle, production only. At install it caches the `/app/` document together with its CSP header, then every file listed in `/_next/static/ll-precache.json` (emitted by the webpack plugin in `next.config.mjs`: all client chunks, CSS and fonts, including the lazily loaded workbench, dialogs, export engine, parse worker and pdf.js renderer), the pdf.js worker, icons and the web manifest. Install fails unless all of it was cached, so the "Ready offline" chip (tied to `navigator.serviceWorker.ready`) is never shown falsely. The worker file itself never changes between deploys, so each successful online navigation to `/app/` checks whether the shell's asset set changed and, if so, precaches the new build before swapping the cached document; hashed files of the previous build are kept for one generation, older ones are pruned. Navigations are network-first with the cached document as fallback; hashed assets are cache-first. Marketing pages are never cached.
**Health.** `GET /api/health/` (`force-dynamic`, `no-store`) for host liveness probes.

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

## 8. Visual design system ("workpaper")
Direction written after a first implementation pass, not before it (the tokens were tuned by measurement while the screens were being built); the decisions below are what shipped. Evidence: `docs/RESEARCH.md` §9, `docs/AUDIT.md` §7 (before/after screenshots from `tools/shots.ts`), `docs/DECISIONS.md` D-27 to D-34.

### 8.1 Decision: evolve, do not replace
The baseline ("calm precision": Geist, cool neutrals, indigo accent) was sound on typography and architecture, and wrong in five places visible in the screenshots: (1) about 300 of 900 px were chrome before the first grid row at 1440×900, and about 600 of 844 at 390; (2) red meant two things (every outflow *and* a discrepancy), and the PDF overlay used green and purple for field kinds, so semantic colours did decorative work; (3) the landing page was the generic SaaS kit (eyebrow chip, gradient wash, window-frame mock, numbered cards, a bento of identical icon tiles) and did not show the audit trail; (4) phones got a four-column grid with a 64 px description column; (5) the dark palette was defined twice. Geist stays (tabular figures, already self-hosted and precached, zero extra bytes); a second display face was rejected (D-29). Everything else was rebuilt on one token set.

### 8.2 Principles
1. **The proof is the hero.** The verdict (stamp), its arithmetic (a footing: opening + in − out = computed, against printed) and its evidence (the tick margin, the outlined PDF row) appear together on the landing illustration and in the workbench. One form, two places.
2. **Colour is evidence.** Green = reconciled, red = discrepancy or mismatch, amber = incomplete/assumed, ink-blue = action, selection, focus, links. Nothing else is coloured. Ordinary outflows are ink with a true minus sign (U+2212).
3. **Figures first.** Tabular lining figures everywhere a number is compared; right-aligned; muted dates and running balances so the amount leads.
4. **Dense but calm.** 32 px rows for a fine pointer, hairline rules, hover on every row (Carbon), no shadows inside the working surface. Chrome is 48 + 40 px plus a proof bar; panes carry their own toolbars.
5. **Never colour alone.** Every status has a glyph, a word or a line style as well (✓ ✗ – in the margin, the stamp wording, solid/dotted/heavy/dashed outlines, a 3 px bar on bad rows).
6. **No decoration that costs.** No blur, no raster images, no gradients; motion only answers an action.

### 8.3 Colour roles (`src/styles/tokens.css`; one `light-dark()` pair per role)
| Role | Light | Dark | Used for |
|---|---|---|---|
| `--bg` / `--surface` / `--bg-subtle` / `--sunken` | #f1f3f5 / #fff / #f6f8fa / #e5e8ed | #0b0e14 / #14171e / #1a1e25 / #07090e | desk, paper (panels, grid), bands and hover, wells and PDF stage |
| `--text` / `--text-muted` | #111620 / #4d5664 | #e8ebf1 / #a0a8b6 | body, secondary |
| `--border` / `--border-strong` | #dbdee3 / #707b8d | #292e36 / #6b7587 | decorative hairlines / control outlines |
| `--accent` (+ hover, fg, soft) | #2253b5 (#144097, #fff, #e7f1ff) | #84b6ff (#a2cdff, #0a0d13, #182846) | primary action, selection, focus, links |
| `--success` / `--danger` / `--warning` (+ soft) | #00673f / #b7191c / #784900 | #56d298 / #ff847d / #ebc166 | status only |
| `--paper-ink` / `--paper-grey` / `--paper-danger` | #2253b5 / #4d5664 / #b7191c | same (the PDF page is always white) | outlines drawn on the PDF |
Authored in OKLCH, shipped as hex. **Measured** (WCAG 2 ratios, `npx tsx tools/check-contrast.ts`, guarded by `tests/unit/design-tokens.test.ts`, 80/80 pairs pass), light / dark: text on surface 18.11 / 15.02; muted on surface 7.42 / 7.49; muted on sunken 6.04 / 8.32 (the tightest text pair); accent on surface 7.06 / 8.64; accent-fg on accent 7.06 / 9.37; success on success-soft 6.20 / 7.77; danger on danger-soft 5.81 / 6.27; warning on warning-soft 6.80 / 8.32; control border on surface 4.28 / 3.86 and on sunken 3.48 / 4.29 (≥ 3 required); paper-ink on paper 7.06, paper-danger 6.63.

### 8.4 Type
Geist Sans (variable, self-hosted, preloaded) for everything, Geist Mono (lazy) for code, identifiers and the CSP excerpt. Scale: 12 (labels, notes) · 13 (secondary, buttons) · 14 (app body, grid) · 15 (marketing body, dialogs) · 16–17 (stamp figures, dialog titles) · 24–32 (view and start headings) · `clamp(32px, 3.9vw, 50px)` (hero). Headings 640 weight, −0.02em tracking, `text-wrap: balance`. Column headers are sentence case (no letter-spaced capitals); the only uppercase label is the stamp, because it is a stamp. `font-variant-numeric: tabular-nums lining-nums` on every figure.

### 8.5 Space, shape, elevation, density
4 px base grid (4 8 12 16 24 32 48 64). Radius: 4 (marks), 6 (controls), 10 (panels, dialogs), pill (status chips only), 3 (stamp). Elevation: 0 flat (rules only), 1 raised control, 2 popover/toast/PDF page, 3 modal; there are no shadows in the grid. Density by pointer, not by setting: `--row-h: 32px` for a fine pointer, 44 px for a coarse one (`@media (pointer: coarse)`), 52 px (76 with payee/category) for the two-line layout in a pane narrower than 560 px. The virtual list reads `--row-h` from the stylesheet so rows never overlap or gap (the baseline placed 36 px rows at 34 px intervals).

### 8.6 Iconography
One in-repo set (`ui/primitives/icons.tsx`): 24-px grid, 1.75 stroke, round caps, `currentColor`, decorative (`aria-hidden`) beside a text label and named by `aria-label` when alone. The mark is an ink-blue tile with ledger rules and a tick. ✓ ✗ – in the audit margin are text glyphs on purpose (tests and screen readers read them).

### 8.7 Motion
Hover and press feedback 100 ms (colour only). Things that open: dialog and toast 180 ms fade plus 8 px rise via `@starting-style`; the stamp settles once (180 ms scale 1.07→1) when the verdict changes. Nothing loops, scrolls on its own or animates layout. `prefers-reduced-motion` removes all of it. Same-document view transitions are supported at the floor but unused (RESEARCH §9.1).

### 8.8 Components and states
| Component | Default | Hover | Focus-visible | Active/pressed | Disabled | Error |
|---|---|---|---|---|---|---|
| Button (`.btn`, 28/32/44 px; primary, quiet, danger) | surface + strong border | band fill | 2 px accent ring, 2 px offset | sunken fill | 45 % opacity, `not-allowed` | n/a (danger variant is a choice, not a state) |
| Toggle (`aria-pressed`) | as button | band | ring | accent-soft + accent border | as button | n/a |
| Input / select | strong border | darker border | ring | n/a | as button | danger border + 3 px danger bar + message under it |
| Choice tile (radio, `:has(:checked)`) | strong border | band | ring on the tile | accent border + soft fill | n/a | n/a |
| Tab (underline) / segmented | muted text | text + band | ring | accent underline / soft fill | n/a | n/a |
| Chip / stamp | tinted by status | chips that are buttons: band | ring | n/a | n/a | the stamp *is* the error form (red, with Δ) |
| Grid row | surface, hairline | band | active cell: 2 px ring inside the cell | selected: accent-soft + 2 px accent bar; bad: danger tint + 3 px bar + ✗ | n/a | edit input keeps ring, message pinned below the rows |
| PDF outline | 1 px ink; description dotted, amount 2 px, balance dashed | n/a | n/a | selected: 2.5 px + 16 % fill | n/a | mismatch: danger outline + fill |
| Dialog | card, 10 px, shadow 3 | n/a | focus moves in, returns on close | n/a | n/a | inline `.note.bad` |
| Drop zone | dashed strong border | n/a | button inside takes focus | drag-over: solid accent border + soft fill | n/a | n/a |

### 8.9 Layout per breakpoint
* **≥ 861 px (desktop, landscape tablet).** Top bar 48 px (brand, project, view tabs, status chips, theme, help) → statement strip 40 px (tabs, close, add) → proof bar (stamp · footing · actions · one-line explanation) → split view (PDF left, rows right; the splitter is a focusable window-splitter, 25–75 %, arrows move 3 %, Home/End jump). Each pane is a container: below 760 px the row-tool labels fold into icons (names stay), below 560 px the grid becomes two-line rows.
* **≤ 860 px (portrait tablet and phone).** One pane at a time behind a Rows/PDF switch; the page scrolls and the 48 px top bar stays; the pane fills the screen below it (`100dvh − bar − switch`). Dialogs become bottom sheets. The proof bar stacks: stamp, footing (each operator stays with the term it leads), actions, note.
* **≤ 390 px.** Brand name and privacy-chip text collapse (accessible names stay), view tabs move to their own row, row tools fit one line with Export; no horizontal page scroll (E2E-enforced).
* **Landing.** Hero is text left, the proof illustration right (PDF sheet beside ruled rows, proof above both); below 960 px it stacks; below 640 px the PDF sheet is dropped and the ruled rows remain. Sections are type and hairlines, not cards.
* **Forced colours.** Selected row, bad row, tabs and controls get `Highlight`/`LinkText` outlines, borders become `CanvasText`.

### 8.10 What is deliberately not here
Remote fonts or images, blur, gradients, shadows in the data grid, icon tiles, numbered feature cards, testimonials or any metric not measured, a density setting, and any colour that is not one of the roles above.

## 9. Test plan (what runs, where)
| Layer | What | Where |
|---|---|---|
| Unit | money, amount/date parsing, geometry, header detection, reconcile, edit, merge, rules, migrations, exporters, CSP builder | `tests/unit` |
| Contract | `ProjectRepository` against in-memory and IndexedDB (fake-indexeddb) | `tests/contract` |
| Integration | real parser over every synthetic layout × seeds vs ground truth; password/corrupt/scan errors; OFX via python `ofxparse`; XLSX via `openpyxl` and LibreOffice | `tests/integration` |
| Architecture / privacy | ESLint boundary and no-network/no-eval rules bite on deliberately bad code; the CSP builder yields the right policy per route; the repository has no machine-specific paths or scratch files, uses the standard Next.js scripts with webpack for both `dev` and `build`, and the app source contains no commerce or separate-backend vocabulary | `tests/unit/csp-architecture.test.ts`, `tests/unit/repo-hygiene.test.ts` |
| E2E (real Chromium against `next start`) | full flow, audit trail, blocked network attempts, edit/undo, split/merge, exports, large statement, password, errors, projects/wipe, merged ledger, rules, column guides, offline (Cache Storage complete, reload with the network off), a browser lacking the PDF engine's required features gets a clear message, phone, axe WCAG (both themes), 100-page perf; **server behaviour**: per-request nonces, per-route CSP, hard navigation into the workbench, theme cookie and Server Action with and without JavaScript, SEO tags in the server-rendered HTML, health endpoint and 404 | `e2e/` (26 tests) |

## 10. Extension points
| You want to… | Touch |
|---|---|
| Support a new statement quirk | `src/core/parse/*` + add a layout to `tools/synth/generate.ts`; the test-suite compares to ground truth |
| Add an export format | `src/core/export/*` + `src/ui/state/exporter.ts` |
| Store projects somewhere else | implement `ProjectRepository`; run `tests/contract/repository.contract.ts` against it; bind it in `src/composition.ts` |
| Change the security policy | `src/lib/csp.ts` (and its tests); the policy is chosen per route in `src/proxy.ts` |
| Add OCR (roadmap) | an adapter producing the `PageText[]` the parser already consumes (e.g. tesseract.js with self-hosted data in a worker); needs `'wasm-unsafe-eval'` in `script-src` and verification on a *scanned* synthetic PDF before shipping |
