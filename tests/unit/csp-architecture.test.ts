import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { buildCsp, isWorkbenchPath, makeNonce } from '@/lib/csp';

describe('Content-Security-Policy builder', () => {
  const nonce = 'abc123==';
  it('workbench policy: no network at all (connect-src and form-action none), nonce-only scripts', () => {
    const csp = buildCsp({ nonce, workbench: true });
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it('other pages may talk to their own origin only (navigation payloads, Server Actions)', () => {
    const csp = buildCsp({ nonce, workbench: false });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*(https?:|\*)/);
  });
  it('development relaxes only what React and HMR need', () => {
    const csp = buildCsp({ nonce, workbench: true, dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(buildCsp({ nonce, workbench: true })).not.toContain('unsafe-eval');
  });
  it('nonces are random, base64 and unique per call', () => {
    const set = new Set(Array.from({ length: 50 }, makeNonce));
    expect(set.size).toBe(50);
    expect([...set].every((n) => /^[A-Za-z0-9+/]+=*$/.test(n) && n.length >= 22)).toBe(true);
  });
  it('only /app is the workbench', () => {
    for (const p of ['/app', '/app/']) expect(isWorkbenchPath(p)).toBe(true);
    for (const p of ['/', '/guides/', '/application', '/api/health/']) expect(isWorkbenchPath(p)).toBe(false);
  });
});

describe('architecture and privacy lint rules actually bite', () => {
  const eslint = new ESLint({ cwd: path.resolve('.') });
  const lint = async (file: string, code: string) => (await eslint.lintText(code, { filePath: path.resolve(file) }))[0]!.messages.map((m) => `${m.ruleId}`);
  it('core cannot import React/DOM/other layers or touch browser globals', async () => {
    expect(await lint('src/core/x.ts', "import React from 'react';\nexport const a = React;")).toContain('no-restricted-imports');
    expect(await lint('src/core/x.ts', "import { x } from '@/adapters/pdf/extract';\nexport const a = x;")).toContain('no-restricted-imports');
    expect(await lint('src/core/x.ts', 'export const a = document.title;')).toContain('no-restricted-globals');
  });
  it('the UI may not import adapters directly; adapters may not import the UI', async () => {
    expect(await lint('src/ui/x.tsx', "import { openForRender } from '@/adapters/pdf/render';\nexport const a = openForRender;")).toContain('no-restricted-imports');
    expect(await lint('src/adapters/x.ts', "import { store } from '@/ui/state';\nexport const a = store;")).toContain('no-restricted-imports');
  });
  it('no network APIs or eval anywhere in src', async () => {
    expect(await lint('src/ui/x.ts', "export const a = () => fetch('/x');")).toContain('no-restricted-globals');
    expect(await lint('src/adapters/x.ts', "export const a = new WebSocket('wss://x');")).toContain('no-restricted-globals');
    expect(await lint('src/ui/x.ts', "export const a = () => navigator.sendBeacon('/x');")).toContain('no-restricted-properties');
    expect(await lint('src/ui/x.ts', "export const a = () => eval('1');")).toContain('no-eval');
    expect(await lint('src/ui/x.ts', "export const a = new Function('return 1');")).toContain('no-new-func');
  });
  it('the real source tree is clean', async () => {
    const res = await eslint.lintFiles(['src/**/*.{ts,tsx}']);
    expect(res.flatMap((r) => r.messages).filter((m) => m.severity === 2).map((m) => `${m.ruleId}`)).toEqual([]);
  }, 120_000);
});
