/**
 * The PDF engine is pdf.js's modern build, which ships no polyfills and uses recent JavaScript. This lists the features
 * it was observed to need (by removing each one in a real browser and reading a statement), so a browser that lacks one
 * gets a clear message instead of a misleading "this file could not be read".
 *  - main thread (page preview):  Map.prototype.getOrInsertComputed, Promise.withResolvers
 *  - workers (parsing, rendering): Promise.try, Uint8Array.prototype.toHex
 * The newest of these is getOrInsertComputed (ECMAScript 2026): Chrome/Edge 145, Firefox 144, Safari and iOS 26.2.
 */
const REQUIRED: ReadonlyArray<readonly [label: string, present: () => boolean]> = [
  ['Map.prototype.getOrInsertComputed', () => 'getOrInsertComputed' in Map.prototype],
  ['Promise.withResolvers', () => 'withResolvers' in Promise],
  ['Promise.try', () => 'try' in Promise],
  ['Uint8Array.prototype.toHex', () => 'toHex' in Uint8Array.prototype],
];

export const SUPPORTED_BROWSERS = 'Chrome or Edge 145, Firefox 144 or Safari 26.2 (or newer)';
export const UNSUPPORTED_BROWSER_MESSAGE = `This browser is too old for LedgerLocal's PDF engine. Update to ${SUPPORTED_BROWSERS} and try again. Your files were not uploaded or changed.`;

/** Labels of the required features this browser lacks; empty when it is supported. */
export function missingBrowserFeatures(): string[] {
  return REQUIRED.filter(([, present]) => !present()).map(([label]) => label);
}
