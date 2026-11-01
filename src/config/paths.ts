import { BASE_PATH } from './app-config';
/** Prefix an absolute site path with the configured base path (e.g. GitHub Pages sub-folders). */
export const withBase = (p: string): string => `${BASE_PATH}${p}`;
