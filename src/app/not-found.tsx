import { withBase } from '@/config/paths';
import { SiteFooter, SiteHeader } from '@/ui/marketing/SiteChrome';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="site-container grid gap-3 py-20">
        <h1 className="display text-4xl">Page not found</h1>
        <p className="lede m-0">There is nothing at this address.</p>
        <p className="m-0"><a href={withBase('/')}>Back to LedgerLocal</a> or <a href={withBase('/app/')}>open the workbench</a>.</p>
      </main>
      <SiteFooter />
    </>
  );
}
