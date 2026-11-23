import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, isWorkbenchPath, makeNonce } from '@/lib/csp';

/**
 * Next.js 16 "proxy" (formerly middleware): attaches a per-request nonce CSP to every page.
 * Because the nonce is per request, pages are rendered dynamically (see `await connection()` in the root layout).
 */
export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp({ nonce, workbench: isWorkbenchPath(request.nextUrl.pathname), dev: process.env.NODE_ENV !== 'production' });

  // Next.js reads the nonce from the CSP header on the *request* and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: skip static assets, metadata files, the service worker and API routes.
      source: '/((?!api|_next/static|_next/image|icons|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
