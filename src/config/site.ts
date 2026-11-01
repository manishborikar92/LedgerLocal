/** Single source of truth for site-wide metadata (used by layout, sitemap, robots, manifest, JSON-LD). */
import { BASE_PATH } from './app-config';

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  // Vercel sets this at build time (host only, no protocol) for the production domain.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:4173';
}

export const SITE = {
  name: 'LedgerLocal',
  url: resolveSiteUrl(),
  title: 'LedgerLocal: bank statement PDF to QBO, OFX, Excel and CSV, offline',
  description: 'Convert bank and credit-card statement PDFs to QuickBooks QBO, OFX, Excel and CSV entirely in your browser. Every file is reconciled against its printed balances and nothing is uploaded.',
  shortDescription: 'Offline bank-statement PDF converter with balance reconciliation.',
  keywords: ['bank statement converter', 'PDF to QBO', 'PDF to OFX', 'bank statement to Excel', 'bank statement to CSV', 'offline', 'privacy', 'reconciliation', 'QuickBooks import', 'bookkeeping'],
  themeColor: { light: '#f6f7f9', dark: '#0a0c11' },
} as const;

/** Social card (src/app/opengraph-image.png). Pages that set their own openGraph must repeat it: Next replaces, not merges, the parent's images. */
export const SOCIAL_IMAGE = {
  url: `${BASE_PATH}/opengraph-image.png`,
  width: 1200,
  height: 630,
  alt: 'LedgerLocal: statement PDFs, reconciled and ready for your books. A RECONCILED stamp with a short ledger of verified rows; nothing is uploaded.',
} as const;

/** Absolute URL for a site path such as "/guides/" (includes the optional base path). */
export const absoluteUrl = (path = '/'): string => `${SITE.url}${BASE_PATH}${path}`;
