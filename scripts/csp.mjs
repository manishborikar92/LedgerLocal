/**
 * Content-Security-Policy builder shared by the post-build step and the tests. Pure, no I/O.
 * LedgerLocal is client-side only, so the policy has exactly one shape: connect-src 'none'
 * (no fetch, XHR, WebSocket, EventSource or beacon from any script on the page).
 */
export function buildCsp({ scriptHashes = [], forHeader = false } = {}) {
  const hashes = [...new Set(scriptHashes)].sort().map((h) => `'${h}'`).join(' ');
  const d = [
    "default-src 'none'",
    `script-src 'self'${hashes ? ' ' + hashes : ''}`,
    "worker-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'none'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'",
  ];
  // frame-ancestors is ignored inside <meta>, so it is only added for the HTTP-header form.
  if (forHeader) d.push("frame-ancestors 'none'");
  return d.join('; ');
}
