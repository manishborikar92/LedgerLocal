// Standard Next.js server build: `npm run dev`, `npm run build`, `npm run start`.
// No separately hosted backend or database is used; the Next.js server renders pages and runs Server Actions.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Static security headers. The per-request Content-Security-Policy (with a nonce) is set in src/proxy.ts. */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // not 'no-referrer': that makes browsers send `Origin: null` on same-origin form posts, which Next.js rejects for Server Actions
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/**
 * Offline support needs the full list of files the browser bundle can ever request, including chunks that are only
 * loaded lazily (workbench, dialogs, export engine, parse worker, pdf.js renderer). Those are not referenced by the
 * page's HTML, so the build writes the list to `/_next/static/ll-precache.json` and public/sw.js caches it at install
 * (off the main thread). Client compilation only; nothing here runs in the browser or on the server at request time.
 */
class PrecacheListPlugin {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap('LedgerLocalPrecacheList', (compilation) => {
      compilation.hooks.processAssets.tap({ name: 'LedgerLocalPrecacheList', stage: Compilation.PROCESS_ASSETS_STAGE_REPORT }, () => {
        const files = compilation
          .getAssets()
          .map((asset) => asset.name)
          .filter((name) => /^static\/(chunks\/.+\.js|css\/.+\.css|media\/.+)$/.test(name))
          .sort();
        compilation.emitAsset('static/ll-precache.json', new sources.RawSource(JSON.stringify({ version: 1, files })));
      });
    });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config, { isServer }) {
    if (!isServer) config.plugins.push(new PrecacheListPlugin());
    return config;
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // A service worker inherits the CSP of its own script response, so it gets its own policy.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; connect-src 'self'" },
        ],
      },
    ];
  },
};
export default nextConfig;
