import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/config/site';
import { GUIDES } from './guides/data';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const built = new Date();
  return [
    { url: absoluteUrl('/'), lastModified: built, changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/guides/'), lastModified: built, changeFrequency: 'monthly', priority: 0.7 },
    ...GUIDES.map((g) => ({ url: absoluteUrl(`/guides/${g.slug}/`), lastModified: built, changeFrequency: 'yearly' as const, priority: 0.6 })),
  ];
}
