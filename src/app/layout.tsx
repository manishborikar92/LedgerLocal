import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { absoluteUrl, SITE } from '@/config/site';
import { readTheme } from '@/server/preferences';
import { mono, sans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  category: 'finance',
  alternates: { canonical: absoluteUrl('/') },
  openGraph: { type: 'website', siteName: SITE.name, title: SITE.title, description: SITE.description, url: absoluteUrl('/'), locale: 'en_US' },
  twitter: { card: 'summary_large_image', title: SITE.title, description: SITE.description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: SITE.themeColor.light },
    { media: '(prefers-color-scheme: dark)', color: SITE.themeColor.dark },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page carries a per-request nonce CSP (src/proxy.ts), so pages render dynamically on each request.
  await connection();
  const theme = await readTheme();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-theme={theme === 'system' ? undefined : theme}>
      <body>{children}</body>
    </html>
  );
}
