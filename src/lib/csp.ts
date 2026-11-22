/**
 * Content-Security-Policy builder (pure; used by src/proxy.ts and the tests).
 *
 * Two shapes, chosen per route:
 *  - workbench (/app): connect-src 'none' and form-action 'none'. The page that handles statement data can make NO
 *    network request at all (no fetch, XHR, WebSocket, beacon, Server Action or form post).
 *  - everything else: connect-src 'self' / form-action 'self' (needed for Next.js navigation payloads and Server Actions).
 * Scripts are allowed only with the per-request nonce (+ 'strict-dynamic' for the chunks those scripts load).
 */
export interface CspOptions {
  nonce: string;
  /** true for the workbench route */
  workbench: boolean;
  /** development server: React needs eval; HMR uses a WebSocket */
  dev?: boolean;
}

export function buildCsp({ nonce, workbench, dev = false }: CspOptions): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])];
  const connect = dev ? "'self' ws: wss:" : workbench ? "'none'" : "'self'";
  return [
    "default-src 'none'",
    `script-src ${script.join(' ')}`,
    `worker-src 'self'${dev ? ' blob:' : ''}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    `form-action ${workbench ? "'none'" : "'self'"}`,
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Cryptographically random, base64 nonce (Web Crypto: works in the proxy's runtime). */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export const isWorkbenchPath = (pathname: string): boolean => pathname === '/app' || pathname.startsWith('/app/');
