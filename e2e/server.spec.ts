import { expect, test } from '@playwright/test';
import { cspViolations, installCspSpy } from './helpers';

const PAGES = ['/', '/guides/', '/guides/signed-vs-debit-credit/', '/guides/credit-card-vs-bank/', '/guides/qbo-ofx-explained/', '/guides/verify-offline/'];

test('every page gets its own nonce; scripts carry it; no inline script lacks one', async ({ request }) => {
  const nonces = new Set<string>();
  for (const url of ['/', '/', '/guides/', '/app/']) {
    const res = await request.get(url);
    const csp = res.headers()['content-security-policy']!;
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
    nonces.add(nonce);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    const html = await res.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!).filter((a) => !/application\/(ld\+)?json/.test(a));
    expect(scripts.length).toBeGreaterThan(0);
    for (const attrs of scripts) expect(attrs, `${url} script without matching nonce`).toContain(`nonce="${nonce}"`);
  }
  expect(nonces.size).toBe(4); // a fresh nonce per request
});

test('CSP differs per route: the workbench cannot reach the network at all; other pages only their own origin', async ({ request }) => {
  const app = (await request.get('/app/')).headers()['content-security-policy']!;
  expect(app).toContain("connect-src 'none'");
  expect(app).toContain("form-action 'none'");
  const home = (await request.get('/')).headers()['content-security-policy']!;
  expect(home).toContain("connect-src 'self'");
  expect(home).toContain("form-action 'self'");
  for (const csp of [app, home]) {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'none'");
  }
  const sw = await request.get('/sw.js');
  expect(sw.headers()['content-security-policy']).toContain("connect-src 'self'");
  const h = (await request.get('/')).headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('same-origin');
  expect(h['strict-transport-security']).toContain('max-age=');
});

test('navigating from a marketing page into the workbench is a full page load, so the strict policy really applies', async ({ page }) => {
  await installCspSpy(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the app' }).first().click();
  await page.waitForURL('**/app/');
  await page.getByTestId('try-sample').waitFor();
  const attempt = await page.evaluate(() => fetch('/api/health/').then(() => 'ok', () => 'blocked'));
  expect(attempt).toBe('blocked'); // would be 'ok' if /app had inherited the marketing page's connect-src 'self'
  const v = await cspViolations(page);
  expect(v.some((x) => x.startsWith('connect-src'))).toBe(true);
});

test('theme: the server renders the cookie, and the Server Action toggle works with and without JavaScript', async ({ page, browser, baseURL, request }) => {
  const ctx0 = await browser.newContext({ baseURL: baseURL!, storageState: { cookies: [{ name: 'll-theme', value: 'dark', domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] } });
  const html = await (await ctx0.request.get('/')).text();
  expect(html).toMatch(/<html[^>]*data-theme="dark"/);
  await ctx0.close();
  expect(await (await request.get('/')).text()).not.toMatch(/<html[^>]*data-theme=/);

  await page.goto('/');
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // progressive enhancement: the same Server Action as a plain form post
  const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
  const p2 = await noJs.newPage();
  await p2.goto('/');
  await p2.getByRole('button', { name: /^Theme:/ }).click();
  await expect(p2.locator('html')).toHaveAttribute('data-theme', 'light');
  await noJs.close();

  // the workbench toggle is client-only (its CSP forbids Server Actions) but shares the cookie
  await page.goto('/app/');
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await page.context().cookies()).find((c) => c.name === 'll-theme')?.value).toBe('dark');
});

test('SEO on the server-rendered HTML: titles, descriptions, canonical, social tags, one h1, noindex app', async ({ request }) => {
  const titles = new Set<string>();
  for (const url of PAGES) {
    const h = await (await request.get(url)).text();
    expect(h.match(/<h1[ >]/g)?.length, url).toBe(1);
    const title = /<title>(.*?)<\/title>/.exec(h)?.[1] ?? '';
    expect(title.length, url).toBeGreaterThan(10);
    titles.add(title);
    const desc = /<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? '';
    expect(desc.length, url).toBeGreaterThan(50);
    expect(desc.length, url).toBeLessThanOrEqual(200);
    for (const re of [/<link rel="canonical"/, /<meta property="og:title"/, /<meta property="og:image"/, /<meta property="og:image:alt"/, /<meta name="twitter:card" content="summary_large_image"/, /<meta name="viewport"/, /<html lang="en"/]) expect(h, `${url} ${re}`).toMatch(re);
    expect(h.replace(/<script[\s\S]*?<\/script>/g, ''), url).not.toMatch(/\b(pricing|subscription|checkout|licen[cs]e key|merchant of record|control plane)\b/i);
  }
  expect(titles.size).toBe(PAGES.length);
  expect(await (await request.get('/app/')).text()).toMatch(/<meta name="robots" content="noindex/);
  const sm = await (await request.get('/sitemap.xml')).text();
  expect((sm.match(/<loc>/g) ?? []).length).toBeGreaterThanOrEqual(6);
  expect(sm).not.toContain('/app/');
  for (const f of ['/opengraph-image.png', '/twitter-image.png']) {
    const b = await (await request.get(f)).body();
    expect(b.readUInt32BE(16)).toBe(1200);
    expect(b.readUInt32BE(20)).toBe(630);
  }
});

test('health endpoint and unknown routes', async ({ request }) => {
  const r = await request.get('/api/health/');
  expect(r.status()).toBe(200);
  expect(await r.json()).toMatchObject({ status: 'ok', app: 'ledgerlocal' });
  expect(r.headers()['cache-control']).toContain('no-store');
  expect((await request.get('/guides/not-a-guide/')).status()).toBe(404);
  expect((await request.get('/definitely-missing/')).status()).toBe(404);
});
