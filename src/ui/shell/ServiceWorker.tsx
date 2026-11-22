'use client';
import { useEffect } from 'react';
import { withBase } from '@/config/paths';
import { setOfflineReady } from '@/ui/state';

/**
 * Registers the offline service worker (production only). The worker caches the app shell and every file the build can request at
 * install (see public/sw.js); once it is active the workbench works without a connection. Mounted only by the workbench.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
    const start = async () => {
      try {
        await navigator.serviceWorker.register(withBase('/sw.js'), { scope: withBase('/') });
        await navigator.serviceWorker.ready; // resolves once install (all assets cached) and activation are done
        if (!cancelled) setOfflineReady(true);
      } catch (e) {
        console.warn('Offline install unavailable:', e instanceof Error ? e.message : e);
      }
    };
    const begin = () => idle(() => void start());
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
    return () => { cancelled = true; };
  }, []);
  return null;
}
