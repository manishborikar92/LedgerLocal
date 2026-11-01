# Production-quality audit (v2)

Scope: Next.js/Vercel best practices, SEO and social sharing, performance, accessibility, security, content accuracy for a **client-side-only** app, a full visual redesign, and a code-quality pass. Date: 24 October 2026. Evidence tags as in [RESEARCH.md](RESEARCH.md): **[verified]** = measured or run here; **[source]** = taken from a cited page; **[unverified]** = not confirmed.

## 1. Method
Research first (web search), then a baseline review of the v1 code, then changes, each verified with tests, the production build, real-Chromium E2E and Lighthouse. Visual review used screenshots of every key screen in both themes and a phone viewport; it found three layout bugs no test had (§4).

## 2. Research and what was taken from it
| Topic | Finding | Applied |
|---|---|---|
| **Next.js metadata** ([file conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata), [metadata & OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [SEO guide](https://webkul.com/blog/next-js-16-seo-best-practices/amp/)) [source] | `metadataBase` is required for absolute social URLs; `title.template` for per-page titles; static `opengraph-image.png`/`twitter-image.png` (+ `.alt.txt`) are the zero-runtime way to ship share cards; `sitemap.ts`/`robots.ts` are first-class; one `<h1>` per page; never block `/_next/static`. | `src/config/site.ts`, `app/layout.tsx`, per-page `generateMetadata`, `sitemap.ts`, `robots.ts`, `manifest.ts`, icon conventions, JSON-LD. Under `output: 'export'` the route files are `force-static`. |
| **Vercel + static export** ([Next security-headers doc](https://github.com/vercel/next.js/blob/e3284af4690e3a204e2f80b56a8a04fabd094690/docs/advanced-features/security-headers.md), [Vercel header defaults](https://www.unpwned.io/qa/vercel/does-vercel-add-security-headers)) [source/secondary] | Vercel auto-detects Next.js and serves `out/`; it adds HSTS and `nosniff` itself but not CSP/Permissions-Policy/X-Frame-Options; `headers()` in `next.config` does not apply to static exports, so headers belong in `vercel.json`. Common guidance says a hash/nonce CSP is impractical for static exports. | `vercel.json` (security + cache headers). A **hash-based CSP is generated after the build** for every page (proving the "impractical" claim wrong for this app), with `frame-ancestors` sent as a header because `<meta>` cannot carry it. |
| **Performance** (Core Web Vitals: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; font and bundle guidance) [source + general knowledge] | Self-host and size-adjust fonts, limit preloads, split non-critical JS, avoid layout shift and costly paint effects. Some 2026 articles claim *stricter* thresholds; I could not find an official source and kept the established thresholds. | `next/font/local`, lazy mono font, SSR'd app shell, dynamic workbench/dialogs/export engine, SW only in the app after idle, removal of blur/mask effects (§5). |
| **Accessibility, WCAG 2.2 AA** ([Deque](https://dequeuniversity.com/resources/wcag-2.2), [WebAIM](https://webaim.org/standards/wcag/wcag22), [TetraLogical](https://tetralogical.com/blog/2023/10/05/whats-new-wcag-2.2)) [source] | New AA criteria: 2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements (needs a non-drag alternative), 2.5.8 Target Size ≥ 24 px, 3.2.6 Consistent Help, 3.3.7 Redundant Entry. | Column guides are now focusable separators moved with arrow keys (Shift = ×10); grid/page `scroll-padding` so sticky headers never hide focus; controls ≥ 28–32 px; Help in the same header position everywhere; `forced-colors` and reduced-motion rules; axe checks in both themes. |
| **Design** ([SaaS dashboard patterns 2026](https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns), [dashboard examples](https://adminlte.io/blog/25-best-dashboard-design-examples-for-2026-real-products-principles/), [fintech UI trends](https://www.kindgeek.com/blog/?p=6446)) [source, mixed quality] | Data-dense tools converge on one workhorse sans with tabular figures, neutral surfaces with a single brand colour, tables as the primary object, calm motion, first-class dark mode, semantic (not decorative) colour. Comparison with products such as Stripe/Linear/Vercel/Mercury is from general familiarity with their public UIs, not a systematic survey. | The "calm precision" system in DESIGN.md §8. |

## 3. Content audit (client-side-only accuracy)
Removed everywhere (code, UI, docs, tests): pricing and plans, trial limit and page counter, licence keys and Ed25519 verification, licence CLI and demo private key, checkout URL, "cloud mode"/API-origin build switch, Merchant-of-Record and "control plane" material, competitor price table, `EXTENDING.md`, the `@noble/curves` dependency. A build-time test now fails if any page contains pricing/payment/licence/backend vocabulary. Rewritten: landing copy (no unverified third-party claims; only measured numbers, with the synthetic-data caveat), FAQ ("Do I need an account?" "Does it work offline?"), privacy dialog, wipe dialog, README, DECISIONS, DESIGN, RESEARCH. LICENSE changed to MIT (D-19).

## 4. Findings and fixes
| # | Area | Finding | Fix | Evidence |
|---|---|---|---|---|
| 1 | Layout | **Three component class names collided with Tailwind utilities** (`.grid` → `min-width: 560px` on every `grid` element, `.grow`, `.container`): overlapping step cards, stretched badges, an uncentred page. Only a screenshot showed it. | Renamed to `.data-grid`, `.grid-row`, `.site-container`; rule documented in DESIGN §2. | screenshots before/after; 19 E2E tests |
| 2 | SEO | Guide pages had **no Open Graph image**: a page-level `openGraph` replaces the parent's file-convention image. | Pages that set `openGraph` repeat the image (`SOCIAL_IMAGE`). | built-HTML test for `og:image` on every page |
| 3 | Performance | Landing mobile Lighthouse **53** (FCP 3.7 s, LCP 6.7 s): uncompressed preview, two 70 KB preloaded fonts, SW precaching 5 MB on marketing pages, blur/mask paint cost. | gzip in the preview server, lazy mono font, SW moved to the app shell after idle, effects removed. | **96** (FCP 1.2 s, LCP 2.5 s, TBT ≤ 160 ms) |
| 4 | Performance | App shell mobile **63** (LCP 3.8 s, TBT 1.3 s): `ssr:false`, workbench and dialogs in the first load. | Pre-rendered shell; workbench, views, dialogs, export engine split. | **91–94** (LCP 2.1–2.4 s, TBT ≈ 0.3 s) |
| 5 | Accessibility | Column guides were drag-only (WCAG 2.5.7); sticky headers could hide focus (2.4.11). | Keyboard-operable guides, scroll padding. | keyboard E2E + axe |
| 6 | Security | `frame-ancestors` cannot be set by `<meta>`; `/sw.js` must not inherit the document CSP. | Header-only `frame-ancestors` in `vercel.json`; separate `/sw.js` policy. | built-export tests |
| 7 | Security/Privacy | zod JIT used `new Function` (CSP violation). | `jitless`. | E2E CSP listener, 0 violations |
| 8 | Code quality | 430-line `state.ts` mixing queue, editing, rules, export, projects; 270-line `Dialogs.tsx`; 85 inline styles; flat `ui/` folder. | Feature modules under `ui/state/`, folders by area, one file per dialog, utilities/semantic classes instead of inline styles (only dynamic values remain), lint-enforced boundaries kept. | tsc, ESLint, 156 unit tests, 19 E2E |
| 9 | Code quality | Old design tokens referenced from TSX. | Token migration; one token file. | grep, build |
| 10 | Robustness | Build gate rejected the (legitimate) absolute `<link rel="canonical">`. | Gate now inspects only resource-loading links. | build + test |

## 5. Measurements (production build, Chromium 141, single-core sandbox) [verified]
**Lighthouse 12** ([docs/lighthouse.json](lighthouse.json)):
| Page | Perf | A11y | Best practices | FCP / LCP / TBT / CLS |
|---|---:|---:|---:|---|
| Landing, desktop | 100 | 100 | 100 | 0.4 s / 0.6 s / 20 ms / 0 |
| Landing, mobile (slow 4G, 4× CPU) | 96 | 100 | 100 | 1.2 s / 2.5 s / 160 ms / 0 |
| Guide, mobile | 95 | 100 | 100 | 0.8 s / 2.2 s / 220 ms / 0 |
| App shell `/app/`, mobile | 91–94 | 100 | 100 | 0.8 s / 2.1–2.4 s / 270–310 ms / 0 |
SEO shows 92 on indexable pages: the only failing audit is `robots.txt`, which Lighthouse fetches *from inside the page*, where our own `connect-src 'none'` blocks it (a tool artifact; `robots.txt` is checked directly by tests). The app shell's SEO audit is omitted because it is intentionally `noindex`.
**Bundles (gzip)** ([docs/bundle-report.json](bundle-report.json)): landing ≈ 169 KB JS + 9 KB CSS; app shell ≈ 212 KB JS; loaded on use: parse worker ≈ 370 KB, PDF renderer ≈ 144 KB, pdf.js render worker ≈ 383 KB.
**100-page, 4,300-row statement:** file → RECONCILED in ≈ 3.4 s in the browser worker including the first on-demand load of the workbench; max main-thread frame latency 93 ms ([docs/perf-browser.json](perf-browser.json)).
**Tests:** 156 Vitest (unit, contract, integration incl. `ofxparse`/`openpyxl`/LibreOffice, architecture/SEO/CSP guards) + 19 Playwright, all passing from a clean unzip.

## 6. Not verified
* No real Vercel deployment was made (no account access); `vercel.json` follows the documented schema and the static export was served with equivalent headers locally.
* Share cards were not previewed on real platforms (Facebook/LinkedIn/X validators); tags, dimensions and alt text are checked in the built HTML.
* Accessibility is verified with axe-core and keyboard E2E only; no screen-reader session.
* Lighthouse numbers vary run to run on this sandbox (±5 points); the ranges above are from repeated runs. INP field data does not exist yet.
* Firefox/Safari and non-Linux platforms untested.
