'use client';
import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'll.theme';
export function applyTheme(m: ThemeMode): void {
  const r = document.documentElement;
  if (m === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', m);
}
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('system');
  useEffect(() => { try { const v = localStorage.getItem(KEY) as ThemeMode | null; if (v === 'light' || v === 'dark') setMode(v); } catch { /* storage unavailable */ } }, []);
  const cycle = useCallback(() => {
    setMode((m) => {
      const n: ThemeMode = m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system';
      applyTheme(n);
      try { if (n === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, n); } catch { /* ignore */ }
      return n;
    });
  }, []);
  return { mode, cycle };
}
