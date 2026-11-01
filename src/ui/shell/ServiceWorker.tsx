'use client';
import { useEffect } from 'react';
import { withBase } from '@/config/paths';

/**
 * Registers the offline service worker. It is mounted only by the app shell (not the marketing pages), and
 * registration waits for the page's load event plus an idle moment, so the ~5 MB precache never competes
 * with first paint. Production builds only.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register(withBase('/sw.js'), { scope: withBase('/') }).catch((e) => console.warn('Offline install unavailable:', e instanceof Error ? e.message : e));
    const whenIdle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(register, { timeout: 4000 }) : setTimeout(register, 1500));
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
  }, []);
  return null;
}
