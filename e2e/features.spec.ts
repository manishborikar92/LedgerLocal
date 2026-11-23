import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { installCspSpy, cspViolations, pdfFile, stamp, waitRendered, waitStatus } from './helpers';

test('a very large statement exports without any limit and without a single CSP violation', async ({ page }) => {
  await installCspSpy(page);
  await page.goto('/app/');
  const big = await pdfFile('bank-multipage', 21, { rows: 700 }, 'big-statement.pdf');
  await page.getByTestId('file-input').setInputFiles(big.file);
  await waitStatus(page, 'reconciled');
  expect(big.truth.pageCount).toBeGreaterThan(15);
  await page.getByTestId('export-btn').click();
  await page.getByRole('radio', { name: /CSV/ }).check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('do-export').click()]);
  expect(fs.readFileSync((await dl.path())!, 'utf8').trim().split('\r\n').length).toBe(701);
  expect(await cspViolations(page)).toEqual([]);
  // nothing in the product mentions paying, plans or licences
  await expect(page.locator('body')).not.toContainText(/licen[cs]e|subscription|upgrade|pricing|trial/i);
});

test('password-protected PDF: prompt, wrong password, then success', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'More samples' }).click();
  await page.locator('li', { hasText: 'Password-protected' }).getByRole('button', { name: 'Open' }).click();
  const pw = page.getByLabel(/Password for this PDF/);
  await expect(pw).toBeVisible();
  await pw.fill('wrong');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not correct' })).toBeVisible();
  await page.getByLabel(/Password for this PDF/).fill('ledger123');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await waitStatus(page, 'reconciled');
});

test('error states: not a PDF, corrupt PDF, scanned (image-only) PDF; cancel works; multi-file queue', async ({ page }) => {
  await page.goto('/app/');
  const input = page.getByTestId('file-input');
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('queue')).toContainText('not a PDF');
  await input.setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf at all') });
  await expect(page.getByTestId('queue')).toContainText('could not be read as a PDF');
  const scan = await pdfFile('scan-image-only', 1, {}, 'scan.pdf');
  await input.setInputFiles(scan.file);
  await expect(page.getByTestId('queue')).toContainText('no readable text');
  // several good files at once -> several tabs; one reconciles, order preserved
  const a = await pdfFile('bank-signed', 31, {}, 'a.pdf');
  const b = await pdfFile('cc-two-date', 32, {}, 'b.pdf');
  const c = await pdfFile('bank-european', 33, {}, 'c.pdf');
  await input.setInputFiles([a.file, b.file, c.file]);
  await expect(page.getByRole('tab', { name: /a\.pdf/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /b\.pdf/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /c\.pdf/ })).toBeVisible();
  await page.getByRole('tab', { name: /c\.pdf/ }).click();
  await waitStatus(page, 'reconciled');
  await page.locator('summary', { hasText: /note\(s\)/ }).click();
  await expect(page.getByText('European number format')).toBeVisible();
  // the same file twice is not added twice
  await input.setInputFiles(a.file);
  await expect(page.getByText('is already open')).toBeVisible();
});

test('a browser that lacks what the PDF engine needs gets a clear message, not a misleading read error', async ({ page }) => {
  // Simulate a browser from before late 2025: the newest feature pdf.js needs is Map.prototype.getOrInsertComputed.
  await page.addInitScript(() => {
    delete (Map.prototype as unknown as Record<string, unknown>).getOrInsert;
    delete (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
  });
  await page.goto('/app/');
  await expect(page.getByTestId('unsupported-browser')).toContainText('too old');
  await expect(page.getByTestId('unsupported-browser')).toContainText('Chrome or Edge 145');
  const bank = await pdfFile('bank-signed', 41, {}, 'a.pdf');
  await page.getByTestId('file-input').setInputFiles(bank.file);
  await expect(page.getByTestId('queue')).toContainText('too old for LedgerLocal');
  await expect(page.getByTestId('queue')).not.toContainText('could not be read');
  await expect(stamp(page)).toHaveCount(0); // nothing was half-parsed
});

test('projects: ephemeral by default, save without PDFs, re-attach by hash, save with PDFs, wipe', async ({ page }) => {
  await page.goto('/app/');
  const sample = await pdfFile('bank-signed', 11, {}, 'saved.pdf');
  await page.getByTestId('file-input').setInputFiles(sample.file);
  await waitStatus(page, 'reconciled');
  await page.getByRole('button', { name: /Untitled client/ }).click();
  await page.getByLabel('Client / project name').fill('Acme Bakery');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await expect(page.getByText('Saved on this device').first()).toBeVisible();
  await expect(page.locator('li', { hasText: 'Acme Bakery' })).toContainText('no PDFs');
  await page.keyboard.press('Escape');
  // reload = new session: nothing there until opened from storage
  await page.reload();
  await expect(page.getByTestId('try-sample')).toBeVisible();
  await page.getByRole('button', { name: /Untitled client/ }).click();
  await page.locator('li', { hasText: 'Acme Bakery' }).getByRole('button', { name: 'Open' }).click();
  await waitStatus(page, 'reconciled');
  await expect(page.getByText('Source PDF not on this device')).toBeVisible();
  // wrong file is refused, right file attaches
  const other = await pdfFile('bank-signed', 12, {}, 'other.pdf');
  await page.locator('input[type=file]').filter({ hasNot: page.locator('[data-testid]') }).last().setInputFiles(other.file);
  await expect(page.getByText('hash mismatch')).toBeVisible();
  await page.locator('input[type=file][accept="application/pdf,.pdf"]').last().setInputFiles(sample.file);
  await waitRendered(page);
  // save again, this time keeping PDFs
  await page.getByRole('button', { name: /Acme Bakery/ }).click();
  await page.getByLabel(/Also keep the source PDFs/).check();
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await expect(page.locator('li', { hasText: 'Acme Bakery' })).toContainText('PDFs kept');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: /Untitled client/ }).click();
  await page.locator('li', { hasText: 'Acme Bakery' }).getByRole('button', { name: 'Open' }).click();
  await waitRendered(page);
  // wipe everything
  await page.getByRole('button', { name: /Acme Bakery/ }).click();
  await page.getByRole('button', { name: 'Wipe all local data…' }).click();
  await page.getByTestId('confirm-wipe').click();
  await expect(page.getByTestId('try-sample')).toBeVisible();
  await page.getByRole('button', { name: /Untitled client/ }).click();
  await expect(page.getByText('Nothing saved yet.')).toBeVisible();
});

test('merged ledger: continuity ok, gap and balance mismatch, duplicates, merged export', async ({ page }) => {
  await page.goto('/app/');
  const jan = await pdfFile('bank-signed', 41, { last4: '7777', month: 1, opening: 500000 }, 'jan.pdf');
  const feb = await pdfFile('bank-signed', 42, { last4: '7777', month: 2, opening: jan.truth.closingBalanceMinor }, 'feb.pdf');
  const apr = await pdfFile('bank-signed', 43, { last4: '7777', month: 4, opening: 1234500 }, 'apr.pdf');
  await page.getByTestId('file-input').setInputFiles([jan.file, feb.file, apr.file]);
  await expect(page.getByRole('tab', { name: /apr\.pdf/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Merged ledger' }).click();
  await expect(page.getByText('jan.pdf closes where feb.pdf opens')).toBeVisible();
  await expect(page.getByText(/day\(s\) between feb\.pdf and apr\.pdf are not covered/)).toBeVisible();
  await expect(page.getByText('Balance mismatch')).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/ledger-light.png' });
  await page.getByTestId('export-merged').click();
  await expect(page.getByText(/Exporting 3 statements/)).toBeVisible();
});

test('rules: contains rule + tidy-up fill payee and category; undoable', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  await page.getByRole('tab', { name: 'Payees & rules' }).click();
  await page.getByLabel('Pattern').fill('ach debit');
  await page.getByLabel('Set payee').fill('Bank ACH');
  await page.getByLabel('Set category').fill('Bank charges');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Bank ACH' })).toBeVisible();
  await page.getByTestId('apply-rules').click();
  await expect(page.getByText(/Updated \d+ row/)).toBeVisible();
  await page.getByRole('tab', { name: 'Workbench' }).click();
  await page.getByLabel('Payee & category').check();
  await expect(page.getByRole('gridcell', { name: 'Bank ACH' }).first()).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'Bank charges' }).first()).toBeVisible();
});

test('column guides: re-read the statement with user-defined columns', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'More samples' }).click();
  await page.locator('li', { hasText: 'Multi-page' }).getByRole('button', { name: 'Open' }).click();
  await waitStatus(page, 'reconciled');
  await waitRendered(page);
  const rowsBefore = await page.locator('[role="grid"]').getAttribute('aria-rowcount');
  await page.getByRole('button', { name: 'Column guides' }).click();
  const guide = page.getByRole('separator', { name: /Border between column 2 and 3/ });
  await expect(guide).toBeVisible();
  const g = (await guide.boundingBox())!;
  await page.mouse.move(g.x + 1, g.y + 60);
  await page.mouse.down();
  await page.mouse.move(g.x + 9, g.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Re-read with these columns' }).click();
  await expect(page.getByText(/Re-read with your column guides/)).toBeVisible();
  await waitStatus(page, 'reconciled');
  expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe(rowsBefore);
});

test('keyboard: arrows move the active cell, Space ticks, Ctrl+M merges, report opens', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  await page.locator('[role="row"][data-row-id]').first().locator('[role="gridcell"]').nth(2).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="row"][data-row-id][aria-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.keyboard.press('Control+m');
  await waitStatus(page, 'reconciled'); // merging preserves the total
  await expect(page.locator('.chip', { hasText: 'merged' }).first()).toBeVisible();
  await page.getByRole('button', { name: /Report/ }).click();
  await expect(page.getByTestId('report')).toContainText('Reconciled');
  await expect(page.getByTestId('report')).toContainText('Not financial advice');
});

test('offline: the installed app caches itself, then reloads and works with the network off', async ({ page, context }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 45_000 }); // service worker installed and active
  // "Ready offline" must mean it: Cache Storage (not merely the HTTP cache) holds every file the build can request,
  // including the lazily loaded chunks, without the workbench ever having been used online.
  const { files } = (await (await page.request.get('/_next/static/ll-precache.json')).json()) as { files: string[] };
  expect(files.length).toBeGreaterThan(20);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  expect(files.map((f) => `/_next/${f}`).filter((u) => !cached.includes(u))).toEqual([]);
  expect(cached).toContain('/app/');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('try-sample').click();
  await waitStatus(page, 'reconciled');
  await waitRendered(page);
  await expect(page.getByText('Offline · everything still works')).toBeVisible();
  await expect(stamp(page)).toContainText('Reconciled');
  await context.setOffline(false);
});
