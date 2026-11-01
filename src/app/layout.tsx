import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { absoluteUrl, SITE } from '@/config/site';
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

// Runs before first paint so a saved theme never flashes. Hashed into the CSP by scripts/postbuild.mjs.
const THEME_INIT = "try{var t=localStorage.getItem('ll.theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
