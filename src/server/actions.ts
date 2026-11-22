'use server';
import { cookies } from 'next/headers';
import { nextTheme, parseTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '@/lib/theme';

/**
 * Server Action: cycle the theme preference (system → light → dark). Works as a plain form post when JavaScript is
 * off. The cookie holds only the words "light"/"dark"/"system"; no statement data ever reaches a Server Action.
 */
export async function cycleTheme(): Promise<void> {
  const jar = await cookies();
  const next = nextTheme(parseTheme(jar.get(THEME_COOKIE)?.value));
  jar.set(THEME_COOKIE, next, { path: '/', maxAge: THEME_COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: false });
}
