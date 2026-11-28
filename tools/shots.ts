/**
 * Screenshot matrix for visual review: every screen and state, light and dark, at 1440 / 768 / 390 px wide.
 * Needs a running production server (npm run build && npm run start) and a Chromium.
 *
 *   LL_CHROMIUM_PATH=/path/to/chrome npx tsx tools/shots.ts --base http://localhost:3000 --out e2e-artifacts/shots/after
 *   npx tsx tools/shots.ts --only wb-reconciled,dlg-export-qbo --vp 390     (a subset)
 *
 * Resumable: scenarios whose PNGs already exist are skipped (--force to redo).
 * Output: <out>/<viewport>/<theme>/<scenario>.png. Light and dark are taken from the same page state (the theme
 * attribute is flipped in place, exactly what the toggle does), so each state is built once per viewport.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { chromium, type Browser, type Page } from '@playwright/test';
import { generate, type LayoutId } from './synth/generate';

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1]! : fallback; };
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const OUT = arg('out', 'e2e-artifacts/shots/run');
const ONLY = arg('only', '').split(',').filter(Boolean);
const VPS: Record<string, { width: number; height: number }> = { '1440': { width: 1440, height: 900 }, '768': { width: 768, height: 1024 }, '390': { width: 390, height: 844 } };
const VP_LIST = arg('vp', '1440,768,390').split(',').filter((v) => VPS[v]);

type Ctx = { page: Page; vp: number };
interface Scenario { name: string; site?: boolean; dialog?: boolean; vps?: number[]; init?: (page: Page) => Promise<void>; run: (c: Ctx) => Promise<void> }

const pdf = async (layout: LayoutId, seed: number, opts: Parameters<typeof generate>[2] = {}, name?: string) => {
  const g = await generate(layout, seed, opts);
  return { name: name ?? `${layout}-${seed}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(g.pdf) };
};
const textOnlyPdf = () => new Promise<Buffer>((resolve) => {
  const doc = new PDFDocument({ size: 'LETTER' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.fontSize(14).text('Harbor Credit Union member newsletter', 72, 72);
  doc.fontSize(11).text('Branch hours change over the holidays. Our online banking will be unavailable for a short maintenance window.', 72, 110, { width: 460 });
  doc.end();
});

const waitStatus = (page: Page, status: string) => page.waitForSelector(`[data-testid="status-stamp"][data-status="${status}"]`, { timeout: 30_000 });
const waitRendered = (page: Page) => page.waitForSelector('.pagebox[data-rendered="true"]', { timeout: 30_000 });
/** At <= 860 px the PDF pane sits behind a Rows/PDF tab switch and is not drawn until selected. */
const split = (page: Page) => (page.viewportSize()?.width ?? 0) > 860;
const rendered = async (page: Page) => { if (split(page)) await waitRendered(page); };
const sample = async (page: Page) => { await page.goto(`${BASE}/app/#sample`); await waitStatus(page, 'reconciled'); await rendered(page); };
const moreSample = async (page: Page, title: string) => {
  await page.goto(`${BASE}/app/`);
  await page.getByRole('button', { name: 'More samples' }).click();
  await page.locator('li', { hasText: title }).getByRole('button', { name: 'Open' }).click();
};
const files = (page: Page) => page.getByTestId('file-input');
const rowCell = (page: Page, row: number, cell: number) => page.locator('[role="row"][data-row-id]').nth(row).locator('[role="gridcell"]').nth(cell);

const SCENARIOS: Scenario[] = [
  { name: 'landing', site: true, run: async ({ page }) => { await page.goto(`${BASE}/`); } },
  { name: 'guides', site: true, run: async ({ page }) => { await page.goto(`${BASE}/guides/`); } },
  { name: 'guide', site: true, run: async ({ page }) => { await page.goto(`${BASE}/guides/verify-offline/`); } },
  { name: 'notfound', site: true, run: async ({ page }) => { await page.goto(`${BASE}/nothing-here/`); } },
  { name: 'empty', run: async ({ page }) => { await page.goto(`${BASE}/app/`); await page.getByTestId('try-sample').waitFor(); } },
  { name: 'queue-errors', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    await files(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await files(page).setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf at all') });
    await files(page).setInputFiles(await pdf('scan-image-only', 1, {}, 'scan.pdf'));
    await page.getByTestId('queue').getByText('no readable text').waitFor();
  } },
  { name: 'queue-password', run: async ({ page }) => {
    await moreSample(page, 'Password-protected');
    await page.getByLabel(/Password for this PDF/).fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByRole('alert').filter({ hasText: 'not correct' }).waitFor();
  } },
  { name: 'queue-parsing', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    await files(page).setInputFiles(await pdf('bank-multipage', 21, { rows: 900 }, 'big-statement.pdf'));
    await page.waitForSelector('[role="progressbar"]', { timeout: 8000 }).catch(() => undefined);
  } },
  { name: 'wb-reconciled', run: async ({ page }) => { await sample(page); await rowCell(page, 3, 3).click(); await rendered(page); } },
  { name: 'wb-discrepancy', run: async ({ page }) => {
    await moreSample(page, 'Statement with a missing line');
    await waitStatus(page, 'discrepancy');
    await page.getByRole('button', { name: /Jump to problem row/ }).click();
    await rendered(page);
  } },
  { name: 'wb-editing-error', run: async ({ page }) => {
    await sample(page);
    await rowCell(page, 2, 4).click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await page.getByRole('alert').filter({ hasText: 'Enter an amount' }).first().waitFor();
  } },
  { name: 'wb-payee', run: async ({ page }) => { await sample(page); await page.getByLabel('Payee & category').check(); await rowCell(page, 4, 3).click(); } },
  { name: 'wb-tabs-notes', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    await files(page).setInputFiles([await pdf('bank-signed', 31, {}, 'march-checking.pdf'), await pdf('cc-two-date', 32, {}, 'visa-march.pdf'), await pdf('bank-european', 33, {}, 'konto-maerz.pdf')]);
    await page.getByRole('tab', { name: /konto-maerz\.pdf/ }).waitFor();
    await page.getByRole('tab', { name: /konto-maerz\.pdf/ }).click();
    await waitStatus(page, 'reconciled');
    await page.locator('summary', { hasText: /note\(s\)/ }).click();
    await rendered(page);
  } },
  { name: 'wb-columns', run: async ({ page }) => {
    await moreSample(page, 'Multi-page');
    await waitStatus(page, 'reconciled');
    if (!split(page)) await page.getByRole('tab', { name: 'PDF', exact: true }).click();
    await waitRendered(page);
    await page.getByRole('button', { name: 'Column guides' }).click();
    await page.getByRole('separator', { name: /Border between column 2 and 3/ }).waitFor();
  } },
  { name: 'wb-pdf-tab', vps: [768, 390], run: async ({ page }) => { await sample(page); await page.getByRole('tab', { name: 'PDF', exact: true }).click(); await waitRendered(page); } },
  { name: 'wb-no-pdf', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    await files(page).setInputFiles(await pdf('bank-signed', 11, {}, 'saved.pdf'));
    await waitStatus(page, 'reconciled');
    await page.getByRole('button', { name: /Untitled client/ }).click();
    await page.getByLabel('Client / project name').fill('Acme Bakery');
    await page.getByRole('button', { name: 'Save on this device' }).click();
    await page.getByText('Saved on this device').first().waitFor();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByRole('button', { name: /Untitled client/ }).click();
    await page.locator('li', { hasText: 'Acme Bakery' }).getByRole('button', { name: 'Open' }).click();
    await waitStatus(page, 'reconciled');
    if (!split(page)) await page.getByRole('tab', { name: 'PDF', exact: true }).click();
    await page.getByText('Source PDF not on this device').waitFor();
  } },
  { name: 'wb-no-rows', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    await files(page).setInputFiles({ name: 'newsletter.pdf', mimeType: 'application/pdf', buffer: await textOnlyPdf() });
    await page.waitForSelector('[data-testid="status-stamp"], [data-testid="queue"] [role="alert"]', { timeout: 30_000 });
  } },
  { name: 'wb-no-balance', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    await files(page).setInputFiles(await pdf('bank-no-balance', 7, {}, 'no-running-balance.pdf'));
    await page.waitForSelector('[data-testid="status-stamp"]', { timeout: 30_000 });
    await rendered(page);
  } },
  { name: 'dlg-export-qbo', dialog: true, run: async ({ page }) => { await sample(page); await page.getByTestId('export-btn').click(); await page.getByRole('radio', { name: /QuickBooks/ }).check(); } },
  { name: 'dlg-export-csv', dialog: true, run: async ({ page }) => { await sample(page); await page.getByTestId('export-btn').click(); await page.getByRole('radio', { name: /CSV/ }).check(); } },
  { name: 'dlg-export-unreconciled', dialog: true, run: async ({ page }) => {
    await moreSample(page, 'Statement with a missing line');
    await waitStatus(page, 'discrepancy');
    await page.getByTestId('export-btn').click();
    await page.getByRole('radio', { name: /OFX/ }).check();
  } },
  { name: 'dlg-projects', dialog: true, run: async ({ page }) => { await sample(page); await page.getByRole('button', { name: /Untitled client/ }).click(); } },
  { name: 'dlg-wipe', dialog: true, run: async ({ page }) => { await sample(page); await page.getByRole('button', { name: /Untitled client/ }).click(); await page.getByRole('button', { name: 'Wipe all local data…' }).click(); } },
  { name: 'dlg-privacy', dialog: true, run: async ({ page }) => { await sample(page); await page.getByTestId('privacy-chip').click(); } },
  { name: 'dlg-split', dialog: true, run: async ({ page }) => { await sample(page); await rowCell(page, 1, 3).click(); await page.getByRole('button', { name: 'Split', exact: true }).click(); } },
  { name: 'dlg-shortcuts', dialog: true, run: async ({ page }) => { await sample(page); await page.getByRole('button', { name: 'Help and keyboard shortcuts' }).click(); } },
  { name: 'dlg-samples', dialog: true, run: async ({ page }) => { await page.goto(`${BASE}/app/`); await page.getByRole('button', { name: 'More samples' }).click(); } },
  { name: 'dlg-balances', dialog: true, run: async ({ page }) => { await sample(page); await page.getByRole('button', { name: 'Edit balances' }).click(); } },
  { name: 'report', dialog: true, run: async ({ page }) => { await moreSample(page, 'Statement with a missing line'); await waitStatus(page, 'discrepancy'); await page.getByRole('button', { name: /Report/ }).click(); await page.getByTestId('report').waitFor(); } },
  { name: 'view-ledger', run: async ({ page }) => {
    await page.goto(`${BASE}/app/`);
    const jan = await generate('bank-signed', 41, { last4: '7777', month: 1, opening: 500000 });
    const feb = await generate('bank-signed', 42, { last4: '7777', month: 2, opening: jan.truth.closingBalanceMinor });
    const apr = await generate('bank-signed', 43, { last4: '7777', month: 4, opening: 1234500 });
    const f = (g: typeof jan, name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(g.pdf) });
    await files(page).setInputFiles([f(jan, 'jan.pdf'), f(feb, 'feb.pdf'), f(apr, 'apr.pdf')]);
    await page.getByRole('tab', { name: /apr\.pdf/ }).waitFor();
    await page.getByRole('tab', { name: 'Merged ledger' }).click();
    await page.getByText('Balance mismatch').waitFor();
  } },
  { name: 'view-rules', run: async ({ page }) => {
    await sample(page);
    await page.getByRole('tab', { name: 'Payees & rules' }).click();
    await page.getByLabel('Pattern').fill('ach debit');
    await page.getByLabel('Set payee').fill('Bank ACH');
    await page.getByLabel('Set category').fill('Bank charges');
    await page.getByRole('button', { name: 'Save rule' }).click();
    await page.getByLabel('Pattern').fill('harbor');
  } },
  { name: 'toast', run: async ({ page }) => {
    await sample(page);
    await page.getByRole('tab', { name: 'Payees & rules' }).click();
    await page.getByTestId('apply-rules').click();
    await page.getByText(/Updated \d+ row/).waitFor();
  } },
  { name: 'unsupported', init: async (page) => { await page.addInitScript(() => { delete (Map.prototype as unknown as Record<string, unknown>).getOrInsert; delete (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed; }); }, run: async ({ page }) => { await page.goto(`${BASE}/app/`); await page.getByTestId('unsupported-browser').waitFor(); } },
  { name: 'offline', run: async ({ page }) => { await sample(page); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.getByText('Offline · everything still works').waitFor(); } },
  { name: 'ready-offline', vps: [1440], run: async ({ page }) => { await page.goto(`${BASE}/app/`); await page.getByTestId('offline-ready').waitFor({ timeout: 60_000 }); } },
];

async function shoot(page: Page, file: string, full: boolean) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage: full });
}

async function main() {
  const browser: Browser = await chromium.launch(process.env.LL_CHROMIUM_PATH ? { executablePath: process.env.LL_CHROMIUM_PATH } : {});
  const list = SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.name));
  const failures: string[] = [];
  for (const vpKey of VP_LIST) {
    const vp = Number(vpKey);
    for (const s of list) {
      if (s.vps && !s.vps.includes(vp)) continue;
      if (!process.argv.includes('--force') && ['light', 'dark'].every((t) => fs.existsSync(path.join(OUT, vpKey, t, `${s.name}.png`)))) continue; // resume
      const ctx = await browser.newContext({ viewport: VPS[vpKey]!, deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: 'no-preference' });
      await ctx.addCookies([{ name: 'll-theme', value: 'light', url: BASE }]);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      try {
        await s.init?.(page);
        await s.run({ page, vp });
        const full = !!s.site; // app screens are viewport shots: that is what a person sees without scrolling
        await page.evaluate(() => window.scrollTo(0, 0));
        for (const theme of ['light', 'dark'] as const) {
          await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
          await shoot(page, path.join(OUT, vpKey, theme, `${s.name}.png`), full);
        }
        console.log(`ok   ${vpKey} ${s.name}`);
      } catch (e) {
        failures.push(`${vpKey} ${s.name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        console.log(`FAIL ${vpKey} ${s.name}: ${failures[failures.length - 1]}`);
        try { await shoot(page, path.join(OUT, vpKey, 'light', `${s.name}.FAILED.png`), false); } catch { /* ignore */ }
      } finally { await ctx.close(); }
    }
  }
  await browser.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'failures.txt'), failures.join('\n'));
  console.log(failures.length ? `${failures.length} scenario(s) failed` : 'all scenarios captured');
}
void main();
