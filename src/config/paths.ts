import { BASE_PATH } from './app-config';
/** Prefix an absolute site path with the configured base path (e.g. when the app is hosted under a sub-path). */
export const withBase = (p: string): string => `${BASE_PATH}${p}`;
