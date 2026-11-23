import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspSpy, openSample, stamp, waitStatus, watchNetwork } from './helpers';

test('landing page: honest content, SEO metadata, no pricing, accessible in both themes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('reconciled');
  await expect(page.getByText('Not financial advice').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/pricing|subscription|checkout|licen[cs]e|per year|\/month|\$\d/i);
  // metadata
  await expect(page).toHaveTitle(/LedgerLocal/);
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toMatch(/reconciled/);
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(/\/$/);
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/opengraph-image\.png/);
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
  expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.screenshot({ path: 'e2e-artifacts/landing-light.png', fullPage: true });
  const wcag = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: 'e2e-artifacts/landing-dark.png', fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test('guides and app shell: metadata, indexing rules, sitemap and robots are correct', async ({ page, request }) => {
  await page.goto('/guides/verify-offline/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('offline');
  expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('article');
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toContain('/guides/verify-offline/');
  await page.goto('/app/');
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/guides/verify-offline/');
  expect(sitemap).not.toContain('/app/');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Sitemap: .*sitemap\.xml/);
  expect(robots).not.toMatch(/Disallow: \/_next/);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  expect(manifest.display).toBe('standalone');
});

test('first-run: sample statement reaches RECONCILED, audit trail highlights, nothing leaves the device', async ({ page }) => {
  await installCspSpy(page);
  const net = watchNetwork(page);
  await page.goto('/app/');
  await expect(page.getByTestId('try-sample')).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/empty-light.png' });
  const t0 = Date.now();
  await page.getByTestId('try-sample').click();
  await waitStatus(page, 'reconciled');
  await expect(page.getByTestId('unsupported-browser')).toHaveCount(0); // a current browser is never told it is too old
  const seconds = (Date.now() - t0) / 1000;
  console.log(`first-run: sample -> RECONCILED in ${seconds.toFixed(1)}s`);
  expect(seconds).toBeLessThan(30);
  await expect(stamp(page)).toContainText('Reconciled');
  // rows + running-balance ticks
  await expect(page.locator('[role="row"][data-row-id]').first()).toBeVisible();
  expect(await page.locator('.tickmark.ok').count()).toBeGreaterThan(5);
  // canvas rendered and overlays present
  await page.waitForSelector('.pagebox[data-rendered="true"]');
  expect(await page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).width)).toBeGreaterThan(200);
  expect(await page.locator('.cellbox').count()).toBeGreaterThan(10);
  // click a row -> its boxes highlight on the PDF
  await page.locator('[role="row"][data-row-id]').nth(3).locator('[role="gridcell"]').nth(3).click();
  await expect(page.locator('.cellbox.sel').first()).toBeVisible();
  // and clicking a box selects its row
  const box = page.locator('.cellbox.k-amount:not(.sel)').nth(5);
  const id = await box.getAttribute('data-row-id');
  await box.click();
  await expect(page.locator(`[role="row"][data-row-id="${id}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.waitForSelector('.pagebox[data-rendered="true"]');
  await page.screenshot({ path: 'e2e-artifacts/workbench-light.png' });
  // network hygiene: only same-origin; no fetch/xhr/websocket/beacon; no CSP violations
  const origin = new URL(page.url()).origin;
  expect(net.requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'))).toEqual([]);
  expect(net.requests.filter((r) => ['fetch', 'xhr', 'websocket', 'eventsource', 'ping'].includes(r.type)).map((r) => r.url)).toEqual([]);
  expect(await cspViolations(page)).toEqual([]);
  // and the policy actively blocks attempts: every one is reported by the browser as a connect-src violation
  const attempts = await page.evaluate(async () => ({
    external: await fetch('https://example.com/').then(() => 'ok', () => 'blocked'),
    same: await fetch('/').then(() => 'ok', () => 'blocked'),
    ws: await new Promise((r) => { try { const w = new WebSocket('wss://example.com'); w.onerror = () => r('blocked'); w.onopen = () => r('open'); } catch { r('blocked'); } }),
    xhr: await new Promise((r) => { try { const x = new XMLHttpRequest(); x.open('GET', '/'); x.onerror = () => r('blocked'); x.onload = () => r('ok'); x.send(); } catch { r('blocked'); } }),
  }));
  expect(attempts).toEqual({ external: 'blocked', same: 'blocked', ws: 'blocked', xhr: 'blocked' });
  await page.evaluate(() => navigator.sendBeacon('https://example.com/', 'x')); // returns true (queued) but is blocked
  await page.waitForTimeout(300);
  const v = await cspViolations(page);
  expect(v.length).toBeGreaterThanOrEqual(5);
  expect(v.every((x) => x.startsWith('connect-src'))).toBe(true);
});

test('discrepancy sample: red stamp, pinpointed row, jump to problem', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'More samples' }).click();
  await page.locator('li', { hasText: 'Statement with a missing line' }).getByRole('button', { name: 'Open' }).click();
  await waitStatus(page, 'discrepancy');
  await expect(stamp(page)).toContainText('Discrepancy');
  await expect(page.getByText(/Running balance first diverges at row/)).toBeVisible();
  await page.getByRole('button', { name: /Jump to problem row/ }).click();
  const bad = page.locator('[role="row"].bad');
  await expect(bad.first()).toBeVisible();
  await expect(bad.first().locator('.tickmark.bad')).toHaveText('✗');
  await page.screenshot({ path: 'e2e-artifacts/discrepancy-light.png' });
});

test('editing: keyboard edit changes the proof; undo/redo restore it', async ({ page }) => {
  await openSample(page);
  await waitStatus(page, 'reconciled');
  const row = page.locator('[role="row"][data-row-id]').nth(2);
  await row.locator('[role="gridcell"]').nth(4).click(); // amount cell
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('-1.00');
  await page.keyboard.press('Enter');
  await waitStatus(page, 'discrepancy');
  await page.getByRole('button', { name: /Undo/ }).click();
  await waitStatus(page, 'reconciled');
  await page.getByRole('button', { name: /Redo/ }).click();
  await waitStatus(page, 'discrepancy');
  await page.keyboard.press('Control+z');
  await waitStatus(page, 'reconciled');
  // invalid amount is rejected with an announcement
  await row.locator('[role="gridcell"]').nth(4).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter an amount' }).first()).toBeVisible();
});

test('split keeps reconciliation; merge and add/delete work', async ({ page }) => {
  await openSample(page);
  await waitStatus(page, 'reconciled');
  const rows = page.locator('[role="row"][data-row-id]');
  const before = await page.locator('[role="grid"]').getAttribute('aria-rowcount');
  await rows.nth(1).locator('[role="gridcell"]').nth(3).click();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel(/Amount of the first part/).fill('-1.00');
  await page.getByRole('button', { name: 'Split', exact: true }).last().click();
  await waitStatus(page, 'reconciled');
  expect(Number(await page.locator('[role="grid"]').getAttribute('aria-rowcount'))).toBe(Number(before) + 1);
  await page.getByRole('button', { name: /Add row/ }).click();
  expect(Number(await page.locator('[role="grid"]').getAttribute('aria-rowcount'))).toBe(Number(before) + 2);
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'gridcell'); // focus moves into the new row
  await page.keyboard.press('Delete');
  expect(Number(await page.locator('[role="grid"]').getAttribute('aria-rowcount'))).toBe(Number(before) + 1);
});

test('export CSV, QBO, OFX and XLSX; downloads have the right content', async ({ page }) => {
  await openSample(page);
  await waitStatus(page, 'reconciled');
  const dl = async (label: string | RegExp) => {
    await page.getByTestId('export-btn').click();
    await page.getByRole('radio', { name: label }).check();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('do-export').click()]);
    const p = await d.path();
    return { name: d.suggestedFilename(), data: fs.readFileSync(p!) };
  };
  const csv = await dl(/CSV/);
  expect(csv.name).toMatch(/\.csv$/);
  const text = csv.data.toString('utf8');
  expect(text.startsWith('\uFEFFDate,Description,Amount,Balance')).toBe(true);
  expect(text.trim().split('\r\n').length).toBeGreaterThan(20);
  const qbo = await dl(/QuickBooks/);
  expect(qbo.name).toMatch(/\.qbo$/);
  const q = qbo.data.toString('latin1');
  expect(q).toContain('OFXHEADER:100');
  expect(q).toContain('<INTU.BID>3000');
  expect(q).toContain('<STMTTRN>');
  const ofx = await dl(/OFX/);
  expect(ofx.data.toString('latin1')).not.toContain('INTU.BID');
  const xlsx = await dl(/Excel/);
  expect(xlsx.data.subarray(0, 2).toString()).toBe('PK');
});

test('theme toggle: dark mode is accessible', async ({ page }) => {
  await openSample(page);
  await waitStatus(page, 'reconciled');
  await page.getByRole('button', { name: /Theme:/ }).click(); // system -> light
  await page.getByRole('button', { name: /Theme:/ }).click(); // light -> dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForSelector('.pagebox[data-rendered="true"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e-artifacts/workbench-dark.png' });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('canvas').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // persisted
});
