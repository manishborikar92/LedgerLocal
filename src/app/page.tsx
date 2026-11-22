import type { Metadata } from 'next';
import { absoluteUrl, SITE, SOCIAL_IMAGE } from '@/config/site';
import { withBase } from '@/config/paths';
import { ProductMock } from '@/ui/marketing/ProductMock';
import { SiteFooter, SiteHeader } from '@/ui/marketing/SiteChrome';
import { Check, File, Lock, Shield, Split, Download, Columns } from '@/ui/primitives/icons';
import { GUIDES } from './guides/data';

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl('/') },
  openGraph: { url: absoluteUrl('/'), title: SITE.title, description: SITE.description, images: [SOCIAL_IMAGE] },
};

const FEATURES: { icon: React.ReactNode; title: string; body: string; cls?: string }[] = [
  { icon: <Shield />, title: 'Private by construction', body: 'Statements are read in a Web Worker on your device. The workbench page’s security policy forbids every network request, so uploading is not just avoided but impossible.', cls: 'wide' },
  { icon: <Check />, title: 'Reconciliation you can see', body: 'Opening balance + movements = closing balance, plus a row-by-row check of the printed running balance. A mismatch shows the difference and jumps to the first bad row.', cls: 'wide' },
  { icon: <File />, title: 'Audit trail on the PDF', body: 'Click a row to see exactly where its date, description, amount and balance were read; click a box on the page to select its row.' },
  { icon: <Download />, title: 'The formats you need', body: 'QuickBooks .QBO, OFX, Excel with a live reconciliation sheet, and CSV with configurable columns, dates and decimal marks.' },
  { icon: <Split />, title: 'Fix it in place', body: 'Keyboard-first editing, split and merge rows, undo and redo, and column guides you can drag when a layout is unusual.' },
  { icon: <Columns />, title: 'Many months, one ledger', body: 'Merge statements chronologically with continuity, gap, overlap and duplicate checks. Payee and category rules apply in bulk.', cls: 'wide' },
  { icon: <Lock />, title: 'Nothing stored unless you say so', body: 'Sessions are ephemeral. Saving a project is opt-in, PDFs are kept only if you tick the box, and one click wipes everything.', cls: 'wide' },
];

const FAQ: [string, string][] = [
  ['Does anything leave my device?', 'No. Parsing, reconciliation and export all run in your browser. Production pages declare a Content-Security-Policy with connect-src \u0027none\u0027, which blocks fetch, XHR, WebSocket and beacons. You can confirm it in your browser’s developer tools (see “Verify it yourself”).'],
  ['Which statements work?', 'Text-based PDFs from banks and card issuers: signed or debit/credit columns, running balances, multi-line descriptions, multi-page tables, and US, UK, European and Indian number and date formats. Scanned (image-only) PDFs are rejected with a clear message; offline OCR is on the roadmap.'],
  ['How accurate is it?', 'On 200 synthetic statements across 20 layouts, every row was recovered and every statement reconciled. That is a ceiling, not a forecast: the same people wrote the test generator and the parser. Real statements vary more, which is why every file shows a reconciliation proof and a clickable audit trail.'],
  ['Will the export import into QuickBooks or Xero?', 'The QBO and OFX files are validated with an independent OFX parser, but they have not been tested in real QuickBooks or Xero. Import one small statement first; the README lists steps and the one setting (INTU.BID) that may need attention.'],
  ['Do I need an account?', 'No. There are no accounts or sign-ins, and nothing about your statements ever reaches a server. Open the app, drop in a PDF.'],
  ['Does it work offline?', 'Yes. After the first visit the app is cached by a service worker and can be installed like an app; the whole workflow runs without a connection.'],
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE.name,
  url: absoluteUrl('/'),
  description: SITE.description,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any (modern web browser)',
  browserRequirements: 'Requires JavaScript and a current Chromium, Firefox or Safari browser',
  isAccessibleForFree: true,
  featureList: ['Bank and credit-card statement PDF to QBO, OFX, Excel and CSV', 'Automatic balance reconciliation', 'Runs entirely in the browser; nothing is uploaded', 'Works offline'],
};

export default function Landing() {
  const app = withBase('/app/');
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <SiteHeader />
      <main id="main">
        <section className="hero">
          <div className="site-container grid items-center gap-10 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr]">
            <div className="grid gap-6">
              <span className="eyebrow"><span className="chip chip-success"><Shield /> Nothing is uploaded</span></span>
              <h1 className="display text-[clamp(36px,5vw,58px)]">Statement PDFs, reconciled and ready for your books.</h1>
              <p className="muted m-0 max-w-xl text-lg">Convert bank and credit-card statements to <strong className="text-fg">QBO, OFX, Excel and CSV</strong> on your own device. Every file is proven against its printed balances, and works offline.</p>
              <div className="flex flex-wrap gap-3">
                <a className="btn btn-primary btn-lg" href={app}>Open the app</a>
                <a className="btn btn-lg" href={`${app}#sample`}>Try a sample statement</a>
              </div>
              <ul className="muted m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm">
                {['No account or sign-in', '0 bytes uploaded', 'Installable and offline'].map((t) => <li key={t} className="flex items-center gap-1.5"><span className="text-success" aria-hidden="true">✓</span> {t}</li>)}
              </ul>
            </div>
            <ProductMock />
          </div>
        </section>

        <section id="how" className="site-container py-16">
          <h2 className="display text-[clamp(28px,3.4vw,40px)]">From PDF to proof in three steps</h2>
          <ol className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-3">
            {[['Drop in your PDFs', 'Several at once. Password-protected files ask for the password; scans, corrupt and non-PDF files get a clear message.'], ['Check the proof strip', 'A green RECONCILED stamp means the arithmetic holds. Red shows the difference and the first row that disagrees with the statement.'], ['Fix and export', 'Edit anything, then export QBO, OFX, Excel or CSV, or print a reconciliation report for your workpapers.']].map(([h, p], i) => (
              <li key={h} className="card grid content-start gap-2 p-6">
                <span className="num grid h-8 w-8 place-items-center rounded-full border border-line-strong bg-surface text-sm font-semibold">{i + 1}</span>
                <h3 className="text-xl">{h}</h3>
                <p className="muted m-0">{p}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="site-container pb-16" aria-labelledby="why">
          <h2 id="why" className="display mb-8 text-[clamp(28px,3.4vw,40px)]">Built for people who must be able to trust the numbers</h2>
          <div className="bento">
            {FEATURES.map((f) => (
              <article key={f.title} className={`card feature ${f.cls ?? ''}`}>
                <span className="icon">{f.icon}</span>
                <h3 className="text-lg">{f.title}</h3>
                <p className="muted m-0 text-[15px]">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="verify" className="site-container pb-16">
          <div className="card grid gap-8 p-6 md:p-10 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <h2 className="display text-[clamp(26px,3vw,36px)]">Verify it yourself</h2>
              <p className="muted m-0">A privacy claim should be checkable. Do not take ours on trust:</p>
              <ol className="m-0 grid gap-2 pl-5">
                <li>Open developer tools → <strong>Network</strong>, clear it, and import a statement. No request appears.</li>
                <li>Tick <strong>Offline</strong> (or use airplane mode) and import another. It still works.</li>
                <li>Read the page’s Content-Security-Policy, shown here.</li>
              </ol>
              <p className="m-0"><a href={withBase('/guides/verify-offline/')}>Read the full guide →</a></p>
            </div>
            <pre className="code-block m-0" aria-label="Content-Security-Policy excerpt"><code>
              <span className="c">{'// every page, production build'}</span>{'\n'}
              <span className="k">default-src</span> <span className="v">&apos;none&apos;</span>;{'\n'}
              <span className="k">script-src</span> <span className="v">&apos;self&apos;</span> <span className="v">&apos;sha256-…&apos;</span>;{'\n'}
              <span className="k">connect-src</span> <span className="v">&apos;none&apos;</span>;{'  '}<span className="c">{'// no fetch / XHR / WebSocket'}</span>{'\n'}
              <span className="k">worker-src</span> <span className="v">&apos;self&apos;</span>;{'\n'}
              <span className="k">form-action</span> <span className="v">&apos;none&apos;</span>;
            </code></pre>
          </div>
        </section>

        <section id="formats" className="site-container pb-16">
          <h2 className="display mb-8 text-[clamp(28px,3.4vw,40px)]">What it reads, and what it does not</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-6">
              <h3 className="mb-3 text-lg">Reads</h3>
              <ul className="m-0 grid gap-1.5 text-[15px]">
                <li>Bank and credit-card statements as text PDFs</li><li>Signed or separate debit/credit columns; CR/DR; parentheses; trailing minus</li>
                <li>Running balances, brought-forward rows, summary boxes and daily-balance tables (ignored as decoys)</li><li>US, UK, European and Indian number and date formats; Dec→Jan year rollover</li><li>Multi-line descriptions and multi-page tables</li>
              </ul>
            </div>
            <div className="card p-6">
              <h3 className="mb-3 text-lg">Does not (yet)</h3>
              <ul className="m-0 grid gap-1.5 text-[15px]">
                <li><strong>Scanned or image-only PDFs.</strong> Offline OCR is on the roadmap</li><li>Rotated pages and tables drawn as images</li><li>Statements with several currencies in one table</li><li>Preview shows system fonts for non-embedded fonts, because the strict policy blocks font downloads</li>
              </ul>
            </div>
          </div>
          <p className="muted mt-4 max-w-3xl text-sm">Tested on 200 synthetic statements (fictional banks), 6,717 of 6,717 rows recovered and 200 of 200 reconciled. The test statements were written by the same team as the parser, so treat this as a ceiling. See <code>docs/ACCURACY.md</code> in the source for the method.</p>
        </section>

        <section id="faq" className="site-container pb-20">
          <h2 className="display mb-6 text-[clamp(28px,3.4vw,40px)]">Questions</h2>
          <div className="faq max-w-3xl">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
          <p className="mt-10 flex flex-wrap items-center gap-3"><a className="btn btn-primary btn-lg" href={app}>Open the app</a><span className="muted text-sm">or read the <a href={withBase('/guides/')}>guides</a>: {GUIDES.length} short explainers.</span></p>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
