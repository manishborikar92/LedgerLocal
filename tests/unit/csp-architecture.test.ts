import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { buildCsp } from '../../scripts/csp.mjs';

describe('Content-Security-Policy builder', () => {
  it('connect-src none, no unsafe-inline/eval for scripts, hashes sorted and unique', () => {
    const csp: string = buildCsp({ scriptHashes: ['sha256-b', 'sha256-a', 'sha256-a'] });
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'self' 'sha256-a' 'sha256-b'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('frame-ancestors'); // not allowed in <meta>
    expect(buildCsp({ forHeader: true })).toContain("frame-ancestors 'none'");
  });
});

const out = path.resolve('out');
describe.skipIf(!fs.existsSync(path.join(out, 'app/index.html')))('built static export (run `npm run build` first)', () => {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const htmls = fs.existsSync(out) ? walk(out).filter((f) => f.endsWith('.html')) : [];
  it('every page carries a strict CSP and every inline script is covered by a hash', () => {
    expect(htmls.length).toBeGreaterThanOrEqual(8);
    for (const f of htmls) {
      const html = fs.readFileSync(f, 'utf8');
      const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
      expect(m, f).not.toBeNull();
      const csp = m![1]!.replace(/&quot;/g, '"');
      expect(csp, f).toContain("connect-src 'none'");
      expect(csp, f).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
      for (const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc=/.test(s[1]!) || /type="application\/(ld\+)?json"/.test(s[1]!) || !s[2]!.trim()) continue;
        const h = 'sha256-' + crypto.createHash('sha256').update(s[2]!, 'utf8').digest('base64');
        expect(csp, `${f}: inline script not hashed`).toContain(h);
      }
      expect(html, f).not.toMatch(/<(script|img|iframe)[^>]+src="https?:\/\//);
      // resource-loading links must be same-origin (canonical/alternate legitimately carry absolute URLs)
      for (const l of html.matchAll(/<link\b[^>]*>/g)) if (/rel="(stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|manifest)/.test(l[0])) expect(l[0], f).not.toMatch(/href="(https?:)?\/\//);
    }
  });
  it('the service worker is not subject to the document CSP and has no leftover placeholders', () => {
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    const swBlock = headers.split('\n\n').find((b) => b.startsWith('/sw.js'))!;
    expect(swBlock).toContain("connect-src 'self'");
    const rules = headers.split('\n\n').filter((b) => b.includes('connect-src \'none\''));
    expect(rules.some((b) => b.startsWith('/sw.js') || b.startsWith('/*'))).toBe(false);
    const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
    expect(sw).not.toMatch(/__PRECACHE__|__VERSION__/);
    expect(sw).toMatch(/const PRECACHE = \[/);
  });
  it('ships no third-party hosts: fonts, worker and wasm-free assets are all self-hosted', () => {
    const js = walk(path.join(out, '_next')).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
    const bad: string[] = [];
    for (const f of js) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(/(?:src|href|url)\s*[=(:]\s*["']?(https?:\/\/(?!www\.w3\.org|react\.dev|nextjs\.org|schemas\.openxmlformats)[^"')\s]+)/g)) bad.push(`${path.basename(f)}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
    expect(fs.existsSync(path.join(out, 'pdfjs/pdf.worker.min.mjs'))).toBe(true);
  });
});

describe.skipIf(!fs.existsSync(path.join(out, 'index.html')))('SEO and content guards on the built export', () => {
  const read = (f: string) => fs.readFileSync(path.join(out, f), 'utf8');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const pages = () => walk(out).filter((f) => f.endsWith('.html') && !/404|_not-found/.test(f));
  it('every indexable page has one h1, a unique title, a sane description, canonical and social tags', () => {
    const titles = new Set<string>();
    for (const f of pages().filter((x) => !x.includes(`${path.sep}app${path.sep}`))) {
      const h = fs.readFileSync(f, 'utf8');
      expect(h.match(/<h1[ >]/g)?.length, f).toBe(1);
      const title = /<title>(.*?)<\/title>/.exec(h)?.[1] ?? '';
      expect(title.length, f).toBeGreaterThan(10);
      titles.add(title);
      const desc = /<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? '';
      expect(desc.length, f).toBeGreaterThan(50);
      expect(desc.length, f).toBeLessThanOrEqual(200);
      for (const re of [/<link rel="canonical"/, /<meta property="og:title"/, /<meta property="og:image"/, /<meta name="twitter:card"/, /<meta name="viewport"/, /<html lang="en"/]) expect(h, `${f} ${re}`).toMatch(re);
    }
    expect(titles.size).toBe(pages().filter((x) => !x.includes(`${path.sep}app${path.sep}`)).length);
  });
  it('the app shell is noindex and the sitemap lists every guide', () => {
    expect(read('app/index.html')).toMatch(/<meta name="robots" content="noindex/);
    const sm = read('sitemap.xml');
    expect((sm.match(/<loc>/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(sm).not.toContain('/app/');
  });
  it('social images exist with the documented 1200x630 size', () => {
    for (const f of ['opengraph-image.png', 'twitter-image.png']) {
      const b = fs.readFileSync(path.join(out, f));
      expect(b.readUInt32BE(16)).toBe(1200);
      expect(b.readUInt32BE(20)).toBe(630);
    }
  });
  it('contains no pricing, payment, subscription, licence-key or backend vocabulary in any page', () => {
    const bad = /\b(pricing|subscription|checkout|merchant of record|paddle|lemon squeezy|polar\.sh|licen[cs]e key|per year|per month|api origin|control plane|backend)\b/i;
    for (const f of pages()) expect(fs.readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, ''), f).not.toMatch(bad);
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
