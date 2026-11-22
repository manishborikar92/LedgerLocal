/** Build-time constants. Statement processing is client-side only; the Next.js server renders pages and runs one Server Action (the theme cookie). */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const APP_VERSION = '2.1.0';
