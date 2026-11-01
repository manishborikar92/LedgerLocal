import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { absoluteUrl, SITE, SOCIAL_IMAGE } from '@/config/site';
import { withBase } from '@/config/paths';
import { SiteFooter, SiteHeader } from '@/ui/marketing/SiteChrome';
import { GUIDES } from '../data';

export const dynamicParams = false;
export function generateStaticParams() { return GUIDES.map((g) => ({ slug: g.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) return {};
  const url = absoluteUrl(`/guides/${g.slug}/`);
  return { title: g.title, description: g.lede, alternates: { canonical: url }, openGraph: { type: 'article', url, title: `${g.title} · ${SITE.name}`, description: g.lede, images: [SOCIAL_IMAGE] }, twitter: { card: 'summary_large_image', title: `${g.title} · ${SITE.name}`, description: g.lede, images: [SOCIAL_IMAGE.url] } };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) notFound();
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'TechArticle', headline: g.title, description: g.lede, mainEntityOfPage: absoluteUrl(`/guides/${g.slug}/`), publisher: { '@type': 'Organization', name: SITE.name } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE.name, item: absoluteUrl('/') }, { '@type': 'ListItem', position: 2, name: 'Guides', item: absoluteUrl('/guides/') }, { '@type': 'ListItem', position: 3, name: g.title, item: absoluteUrl(`/guides/${g.slug}/`) }] },
    ],
  };
  return (
    <>
      <SiteHeader />
      <main id="main" className="site-container py-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm"><a href={withBase('/guides/')}>← All guides</a></nav>
        <article className="prose">
          <h1 className="display text-[clamp(32px,4.2vw,46px)]">{g.title}</h1>
          <p className="muted text-xl">{g.lede}</p>
          {g.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p.map((t, i) => <p key={i}>{t}</p>)}
            </section>
          ))}
        </article>
        <p className="mt-10"><a className="btn btn-primary" href={withBase('/app/#sample')}>Try it with a sample statement</a></p>
        <p className="muted mt-4 text-sm">Not financial advice. Verify exports before filing or importing.</p>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\u003c') }} />
    </>
  );
}
