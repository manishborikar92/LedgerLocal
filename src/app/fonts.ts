import localFont from 'next/font/local';

/**
 * Geist (SIL OFL), self-hosted through next/font so it is preloaded, size-adjusted against a system fallback
 * (no layout shift) and served from our own origin. Only the UI font is preloaded; the mono face is used for
 * code samples and identifiers, so it loads lazily when first needed (saves ~70 KB of critical bytes per page).
 */
export const sans = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
  weight: '100 900',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const mono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
  weight: '100 900',
  preload: false,
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
});
