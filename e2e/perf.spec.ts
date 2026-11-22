import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { pdfFile, waitStatus } from './helpers';

test('100-page statement: parsed in a worker while the UI stays responsive; bundle sizes reported', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ['longtask'] });
  });
  const loadStart = Date.now();
  await page.goto('/app/');
  await page.getByTestId('try-sample').waitFor();
  const loadMs = Date.now() - loadStart;
  const big = await pdfFile('bank-multipage', 5, { rows: 4300 }, 'hundred-pages.pdf');
  const t0 = Date.now();
  await page.getByTestId('file-input').setInputFiles(big.file);
  // while the worker runs, the main thread must stay interactive: poll round-trip latency
  const lat: number[] = [];
  while (!(await page.locator('[data-testid="status-stamp"]').count())) {
    const s = Date.now();
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    lat.push(Date.now() - s);
    await page.waitForTimeout(50);
    if (Date.now() - t0 > 80_000) break;
  }
  await waitStatus(page, 'reconciled');
  const parseMs = Date.now() - t0;
  const long: number[] = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const res = {
    pages: big.truth.pageCount, rows: big.truth.rows.length, pdfKB: Math.round(big.file.buffer.length / 1024),
    workerParseToReconciledMs: parseMs, appLoadToInteractiveMs: loadMs,
    maxMainThreadFrameLatencyMsDuringParse: Math.max(0, ...lat), longTasksOver50ms: long.filter((d) => d > 50).length, maxLongTaskMs: Math.round(Math.max(0, ...long)),
    browser: `Chromium ${page.context().browser()?.version() ?? 'unknown'} (Playwright), 1 CPU sandbox`,
  };
  fs.writeFileSync('docs/perf-browser.json', JSON.stringify(res, null, 2));
  console.log(res);
  expect(big.truth.pageCount).toBeGreaterThanOrEqual(95);
  expect(res.maxMainThreadFrameLatencyMsDuringParse).toBeLessThan(1000);
});
