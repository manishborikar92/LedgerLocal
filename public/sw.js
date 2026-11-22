/* LedgerLocal service worker (workbench only).
 *
 * The app is server-rendered, so there is no static file list. What gets cached, and why it is complete:
 *  - the /app/ document, together with the Content-Security-Policy header it was served with (the nonce in the HTML
 *    and in the header always belong together);
 *  - every file the build can request, from /_next/static/ll-precache.json (written by next.config.mjs). That list
 *    includes the lazily loaded chunks (workbench, dialogs, export engine, parse worker, pdf.js renderer) that the
 *    HTML never mentions, so nothing has to be executed on the main thread to warm the cache;
 *  - the HTML's own asset references, the pdf.js worker, icons and the web manifest.
 * Install fails (so the app is never reported as offline-ready) unless every one of those files was cached.
 *
 * Strategy: /_next/static, /pdfjs, /icons are cache-first (hashed, immutable); navigations to /app/ are
 * network-first with the cached document as fallback. This file never changes between deploys, so the browser will
 * not re-run `install` for a new release; instead every successful online visit to /app/ checks whether the shell's
 * asset set changed and, if so, precaches the new build before swapping the cached document.
 * Same-origin GET only. Marketing pages are never cached. */
const CACHE = 'ledgerlocal-v3';
const SCOPE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const APP = `${SCOPE}/app/`;
const NEXT = `${SCOPE}/_next/`;
const PRECACHE_LIST = `${NEXT}static/ll-precache.json`;
const META = `${SCOPE}/__precache-meta__`;
const CORE = [`${SCOPE}/pdfjs/pdf.worker.min.mjs`, `${SCOPE}/icons/icon-192.png`, `${SCOPE}/icons/icon-512.png`, `${SCOPE}/manifest.webmanifest`];
const isHashed = (path) => path.startsWith(`${NEXT}static/`);
const cacheable = (path) => isHashed(path) || path.startsWith(`${SCOPE}/pdfjs/`) || path.startsWith(`${SCOPE}/icons/`);
const isAppNavigation = (url) => url.pathname === APP || url.pathname === APP.slice(0, -1);

/** Assets the shell document references, normalised without query strings (hashed files are immutable). */
const referencedAssets = (html) => [...new Set([...html.matchAll(/\/_next\/static\/[^"'\\\s)<>?]+/g)].map((m) => `${SCOPE}${m[0]}`))];
/** What identifies a build of the shell: its asset set (the per-request nonce is deliberately not part of it). */
const signature = (html) => referencedAssets(html).sort().join('\n');

const readMeta = async (cache) => {
  const hit = await cache.match(META);
  return hit ? hit.json() : null;
};

/** Downloads every file the build can request. Rejects if any single file cannot be cached. */
async function precache(cache, html) {
  const res = await fetch(`${PRECACHE_LIST}?v=${Date.now()}`, { cache: 'reload', credentials: 'same-origin' });
  if (!res.ok) throw new Error(`precache list unavailable (${res.status})`);
  const { files } = await res.json();
  if (!Array.isArray(files) || files.length === 0) throw new Error('precache list is empty');
  const keep = [...new Set([...referencedAssets(html), ...files.map((f) => `${NEXT}${f}`), ...CORE])];
  await Promise.all(
    keep.map(async (u) => {
      // hashed files never change, so one that is already cached is skipped; the few unhashed files are refreshed
      if (isHashed(new URL(u, self.location.origin).pathname) && (await cache.match(u))) return;
      await cache.add(new Request(u, { credentials: 'same-origin' }));
    }),
  );
  return keep;
}

/** Swap in the new document and metadata, then drop hashed files that neither this nor the previous build uses. */
async function commit(cache, res, html, keep) {
  const meta = await readMeta(cache);
  await cache.put(APP, res.clone());
  const retained = new Set([...keep, ...(meta ? meta.keep : [])]); // two generations, so an already-open tab keeps working
  await cache.put(META, new Response(JSON.stringify({ shell: signature(html), keep, previous: meta ? meta.keep : [] }), { headers: { 'content-type': 'application/json' } }));
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (isHashed(path) && !retained.has(path)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(APP, { cache: 'reload', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`app shell unavailable (${res.status})`);
    const html = await res.clone().text();
    await commit(cache, res, html, await precache(cache, html));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('ledgerlocal-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/** After a successful online load of /app/: if a new build changed the shell, precache it fully before using it offline. */
async function refreshShell(res) {
  const cache = await caches.open(CACHE);
  const html = await res.clone().text();
  const meta = await readMeta(cache);
  if (meta && meta.shell === signature(html)) return;
  await commit(cache, res, html, await precache(cache, html));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' && isAppNavigation(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) event.waitUntil(refreshShell(res.clone()).catch((e) => console.warn('Offline update failed:', e instanceof Error ? e.message : e)));
        return res;
      } catch {
        return (await caches.match(APP)) || Response.error();
      }
    })());
    return;
  }
  if (cacheable(url.pathname)) {
    // ignoreSearch: hashed files are immutable, so a deployment-id query string (?dpl=…) must not cause a cache miss
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
