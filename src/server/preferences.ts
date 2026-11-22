import 'server-only';
import { cookies } from 'next/headers';
import { parseTheme, THEME_COOKIE, type ThemePreference } from '@/lib/theme';

/** Server-side read of the theme cookie, so the very first HTML already has the right theme (no flash, no inline script). */
export async function readTheme(): Promise<ThemePreference> {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}
