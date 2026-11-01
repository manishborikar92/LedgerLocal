/** Build-time constants. The app is client-side only: there is no mode switch and no remote origin. */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const APP_VERSION = '2.0.0';
