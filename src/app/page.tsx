import type { Metadata } from 'next';
import { absoluteUrl, SITE, SOCIAL_IMAGE } from '@/config/site';
import { withBase } from '@/config/paths';
import { ProductMock } from '@/ui/marketing/ProductMock';
import { SiteFooter, SiteHeader } from '@/ui/marketing/SiteChrome';
import { GUIDES } from './guides/data';

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl('/') },
  openGraph: { url: absoluteUrl('/'), title: SITE.title, description: SITE.description, images: [SOCIAL_IMAGE] },
};

const CHECKS: [string, string][] = [
  ['Private by construction', 'Statements are read in a Web Worker on your device. The workbench page’s security policy forbids every network request, so uploading is not just avoided but impossible. Nothing is saved unless you say so: saving a project is opt-in, PDFs are kept only if you tick the box, and one click wipes everything.'],
  ['Reconciliation you can see', 'Opening balance + movements = closing balance, plus a row-by-row check of the printed running balance. A mismatch shows the difference and jumps to the first bad row.'],
  ['Audit trail on the PDF', 'Click a row to see exactly where its date, description, amount and balance were read; click a box on the page to select its row.'],
  ['The formats you need', 'QuickBooks .QBO, OFX, Excel with a live reconciliation sheet, and CSV with configurable columns, dates and decimal marks.'],
  ['Fix it in place', 'Keyboard-first editing, split and merge rows, undo and redo, and column guides you can drag when a layout is unusual.'],
  ['Many months, one ledger', 'Merge statements chronologically with continuity, gap, overlap and duplicate checks. Payee and category rules apply in bulk.'],
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
          <div className="site-container hero-grid">
            <div className="grid gap-6">
              <h1 className="display">Statement PDFs, reconciled and ready for your books.</h1>
              <p className="lede m-0">Convert bank and credit-card statements to <strong className="text-fg">QBO, OFX, Excel and CSV</strong> on your own device. Every file is proven against its printed balances, and works offline.</p>
              <div className="flex flex-wrap gap-3">
                <a className="btn btn-primary btn-lg" href={app}>Open the app</a>
                <a className="btn btn-lg" href={`${app}#sample`}>Try a sample statement</a>
              </div>
              <ul className="facts-inline">
                {['Nothing is uploaded', 'No account or sign-in', 'Installable and offline'].map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <ProductMock />
          </div>
        </section>

        <section id="how" className="band">
          <div className="site-container">
            <div className="band-head"><h2 className="display">From PDF to proof in three steps</h2></div>
            <ol className="steps">
              {[['Drop in your PDFs', 'Several at once. Password-protected files ask for the password; scans, corrupt and non-PDF files get a clear message.'], ['Check the proof strip', 'A green RECONCILED stamp means the arithmetic holds. Red shows the difference and the first row that disagrees with the statement.'], ['Fix and export', 'Edit anything, then export QBO, OFX, Excel or CSV, or print a reconciliation report for your workpapers.']].map(([h, p], i) => (
                <li key={h}>
                  <span className="n">Step {i + 1}</span>
                  <h3 className="text-lg">{h}</h3>
                  <p className="muted m-0 text-[15px]">{p}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band" aria-labelledby="why">
          <div className="site-container">
            <div className="band-head"><h2 id="why" className="display">Built for people who must be able to trust the numbers</h2></div>
            <ul className="checks">
              {CHECKS.map(([t, b]) => <li key={t}><h3>{t}</h3><p>{b}</p></li>)}
            </ul>
          </div>
        </section>

        <section id="verify" className="band">
          <div className="site-container split-2">
            <div className="grid content-start gap-4">
              <h2 className="display">Verify it yourself</h2>
              <p className="muted m-0">A privacy claim should be checkable. Do not take ours on trust:</p>
              <ol className="m-0 grid list-decimal gap-2 pl-5">
                <li>Open developer tools → <strong>Network</strong>, clear it, and import a statement. No request appears.</li>
                <li>Tick <strong>Offline</strong> (or use airplane mode) and import another. It still works.</li>
                <li>Read the workbench page’s Content-Security-Policy, excerpted here.</li>
              </ol>
              <p className="m-0"><a href={withBase('/guides/verify-offline/')}>Read the full guide</a></p>
            </div>
            <pre className="code-block" aria-label="Content-Security-Policy excerpt"><code>
              <span className="c">{'// response header of /app/ (the workbench), production build'}</span>{'\n'}
              <span className="k">default-src</span> <span className="v">&apos;none&apos;</span>;{'\n'}
              <span className="k">script-src</span> <span className="v">&apos;self&apos; &apos;nonce-…&apos; &apos;strict-dynamic&apos;</span>;{'\n'}
              <span className="k">connect-src</span> <span className="v">&apos;none&apos;</span>;{'  '}<span className="c">{'// no fetch / XHR / WebSocket'}</span>{'\n'}
              <span className="k">worker-src</span> <span className="v">&apos;self&apos;</span>;{'\n'}
              <span className="k">form-action</span> <span className="v">&apos;none&apos;</span>;
            </code></pre>
          </div>
        </section>

        <section id="formats" className="band">
          <div className="site-container">
            <div className="band-head"><h2 className="display">What it reads, and what it does not</h2></div>
            <div className="cols-2">
              <div>
                <h3 className="text-lg">Reads</h3>
                <ul className="plain-list">
                  <li>Bank and credit-card statements as text PDFs</li><li>Signed or separate debit/credit columns; CR/DR; parentheses; trailing minus</li>
                  <li>Running balances, brought-forward rows, summary boxes and daily-balance tables (ignored as decoys)</li><li>US, UK, European and Indian number and date formats; Dec→Jan year rollover</li><li>Multi-line descriptions and multi-page tables</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg">Does not (yet)</h3>
                <ul className="plain-list">
                  <li><strong>Scanned or image-only PDFs.</strong> Offline OCR is on the roadmap</li><li>Rotated pages and tables drawn as images</li><li>Statements with several currencies in one table</li><li>Preview shows system fonts for non-embedded fonts, because the strict policy blocks font downloads</li>
                </ul>
              </div>
            </div>
            <p className="muted mt-5 max-w-3xl text-sm">Tested on 200 synthetic statements (fictional banks), 6,717 of 6,717 rows recovered and 200 of 200 reconciled. The test statements were written by the same team as the parser, so treat this as a ceiling. See <code>docs/ACCURACY.md</code> in the source for the method.</p>
          </div>
        </section>

        <section id="faq" className="band" style={{ borderBottom: 0 }}>
          <div className="site-container split-2">
            <div className="grid content-start gap-4">
              <h2 className="display">Questions</h2>
              <p className="flex flex-wrap items-center gap-3"><a className="btn btn-primary" href={app}>Open the app</a><span className="muted text-sm">or read the <a href={withBase('/guides/')}>guides</a>: {GUIDES.length} short explainers.</span></p>
            </div>
            <div className="faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
