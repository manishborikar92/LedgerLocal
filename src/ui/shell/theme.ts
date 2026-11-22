'use client';
import { useCallback, useState } from 'react';
import { nextTheme, type ThemePreference } from '@/lib/theme';
import { writeThemeCookie } from '@/lib/theme-cookie';

export function applyTheme(t: ThemePreference): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

/** Client-side theme toggle for the workbench (no Server Action: that page's CSP forbids all network requests). */
export function useTheme(initial: ThemePreference) {
  const [mode, setMode] = useState<ThemePreference>(initial);
  const cycle = useCallback(() => {
    const next = nextTheme(mode);
    applyTheme(next);
    writeThemeCookie(next);
    setMode(next);
  }, [mode]);
  return { mode, cycle };
}
