import type { Metadata } from 'next';
import { absoluteUrl, SOCIAL_IMAGE } from '@/config/site';
import { withBase } from '@/config/paths';
import { SiteFooter, SiteHeader } from '@/ui/marketing/SiteChrome';
import { GUIDES } from './data';

export const metadata: Metadata = {
  title: 'Guides',
  description: 'Short explainers on bank-statement formats, QBO and OFX files, credit-card sign conventions and how to verify that a converter really works offline.',
  alternates: { canonical: absoluteUrl('/guides/') },
  openGraph: { url: absoluteUrl('/guides/'), title: 'Guides · LedgerLocal', images: [SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', title: 'Guides · LedgerLocal', images: [SOCIAL_IMAGE.url] },
};

export default function GuidesIndex() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="site-container py-14">
        <h1 className="display text-[clamp(34px,4.6vw,52px)]">Guides</h1>
        <p className="muted mt-3 max-w-2xl text-lg">Short, practical explainers for people who move statement data into accounting software.</p>
        <ul className="m-0 mt-10 grid list-none gap-4 p-0 md:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.slug} className="card p-6">
              <h2 className="text-xl"><a href={withBase(`/guides/${g.slug}/`)}>{g.title}</a></h2>
              <p className="muted m-0 mt-2">{g.lede}</p>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
