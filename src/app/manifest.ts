import type { MetadataRoute } from 'next';
import { SITE } from '@/config/site';

// Relative URLs resolve against the manifest's own URL, so this works under any base path.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.shortDescription,
    id: './app/',
    start_url: './app/',
    scope: './',
    display: 'standalone',
    background_color: SITE.themeColor.light,
    theme_color: '#4338ca',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
