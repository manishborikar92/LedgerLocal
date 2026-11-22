/** Theme preference shared by the server (cookie read in the root layout, Server Action) and the client toggle. */
export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_COOKIE = 'll-theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseTheme(value: string | undefined | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export const nextTheme = (t: ThemePreference): ThemePreference => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');
