import { afterEach, describe, expect, it } from 'vitest';
import { missingBrowserFeatures, SUPPORTED_BROWSERS, UNSUPPORTED_BROWSER_MESSAGE } from '@/adapters/pdf/browserSupport';

type Target = { obj: object; name: string };
const TARGETS: Target[] = [
  { obj: Map.prototype, name: 'getOrInsertComputed' },
  { obj: Promise, name: 'withResolvers' },
  { obj: Promise, name: 'try' },
  { obj: Uint8Array.prototype, name: 'toHex' },
];
const saved = TARGETS.map((t) => ({ ...t, desc: Object.getOwnPropertyDescriptor(t.obj, t.name) }));
const provide = () => { for (const t of TARGETS) if (!(t.name in t.obj)) Object.defineProperty(t.obj, t.name, { value: () => undefined, configurable: true, writable: true }); };
afterEach(() => { for (const s of saved) { if (s.desc) Object.defineProperty(s.obj, s.name, s.desc); else delete (s.obj as Record<string, unknown>)[s.name]; } });

describe('browser support check for the modern pdf.js build', () => {
  it('reports nothing when every required feature exists', () => {
    provide();
    expect(missingBrowserFeatures()).toEqual([]);
  });
  it('names each missing feature, one at a time', () => {
    for (const t of TARGETS) {
      provide();
      delete (t.obj as Record<string, unknown>)[t.name];
      expect(missingBrowserFeatures()).toHaveLength(1);
      expect(missingBrowserFeatures()[0]).toContain(t.name);
    }
  });
  it('the user-facing message names the browser versions and promises nothing was uploaded', () => {
    expect(SUPPORTED_BROWSERS).toMatch(/Chrome or Edge 145.*Firefox 144.*Safari 26\.2/);
    expect(UNSUPPORTED_BROWSER_MESSAGE).toMatch(/too old/);
    expect(UNSUPPORTED_BROWSER_MESSAGE).toMatch(/not uploaded/);
  });
});
