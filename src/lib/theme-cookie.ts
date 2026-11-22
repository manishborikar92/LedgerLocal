/** Browser-side access to the theme cookie (the server reads the same cookie in the root layout). */
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemePreference } from './theme';

/** Writes the same cookie the server reads. Done in the browser because the workbench page may not contact the server. */
export function writeThemeCookie(t: ThemePreference): void {
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
export function clearThemeCookie(): void {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
