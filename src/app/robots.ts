import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/config/site';

// Never block /_next/static: crawlers need the CSS/JS to render pages. The app shell is kept out of the
// index with a noindex meta tag (not a Disallow, which would stop crawlers from seeing that tag).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: absoluteUrl('/sitemap.xml') };
}
