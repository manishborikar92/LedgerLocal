import { withBase } from '@/config/paths';
import { cycleTheme } from '@/server/actions';
import { readTheme } from '@/server/preferences';
import { Logo, Monitor, Moon, Sun } from '@/ui/primitives/icons';

const NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/#verify', label: 'Verify it' },
  { href: '/#formats', label: 'Formats' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/guides/', label: 'Guides' },
];

export async function SiteHeader() {
  const theme = await readTheme();
  return (
    <header className="site-header">
      <div className="site-container">
        <a href={withBase('/')} className="brand" aria-label="LedgerLocal home"><Logo /> LedgerLocal</a>
        <nav className="site-nav ml-auto" aria-label="Primary">
          <span className="hidden items-center gap-0.5 md:flex">
            {NAV.map((n) => <a key={n.href} href={withBase(n.href)}>{n.label}</a>)}
          </span>
          {/* Server Action form: works with JavaScript disabled. */}
          <form action={cycleTheme} className="ml-1">
            <button type="submit" className="btn btn-quiet btn-icon" aria-label={`Theme: ${theme}. Click to change`} title={`Theme: ${theme}`}>
              {theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <Monitor />}
            </button>
          </form>
          <a className="btn btn-primary btn-sm ml-1" href={withBase('/app/')}>Open the app</a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container grid gap-8 py-10 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="grid content-start gap-2">
          <a href={withBase('/')} className="brand"><Logo size={24} /> LedgerLocal</a>
          <p className="muted m-0 max-w-sm text-sm">Statement PDFs to QBO, OFX, Excel and CSV. Reconciled, private, and entirely in your browser.</p>
        </div>
        <nav aria-label="Product" className="grid content-start gap-2 text-sm">
          <strong>Product</strong>
          <a href={withBase('/app/')}>Open the app</a>
          <a href={withBase('/app/#sample')}>Try a sample statement</a>
          <a href={withBase('/#verify')}>Verify it is offline</a>
        </nav>
        <nav aria-label="Learn" className="grid content-start gap-2 text-sm">
          <strong>Learn</strong>
          <a href={withBase('/guides/')}>Guides</a>
          <a href={withBase('/#faq')}>FAQ</a>
        </nav>
      </div>
      <div className="site-container muted border-t border-line py-5 text-[13px]">
        Not financial advice. Verify exports before filing or importing. Sample statements use fictional banks. Other product names belong to their owners.
      </div>
    </footer>
  );
}
