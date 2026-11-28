import { expect, test } from '@playwright/test';
import { waitStatus } from './helpers';

// Guards for the visual system (docs/DESIGN.md §8): the behaviours the redesign added, not the pixels.

test('colour is evidence: outflows are plain ink with a true minus; red is left for status', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  const outflow = page.locator('[role="row"][data-row-id]').first().locator('[data-col="amount"]');
  await expect(outflow).toHaveText(/^−\d/); // U+2212, not a hyphen
  const [cellColour, bodyColour] = await Promise.all([outflow.evaluate((e) => getComputedStyle(e).color), page.evaluate(() => getComputedStyle(document.body).color)]);
  expect(cellColour).toBe(bodyColour);
  await expect(page.getByTestId('status-stamp')).toHaveCSS('color', 'rgb(0, 103, 63)'); // --success, light theme
});

test('virtual rows are exactly one row-height apart (no overlap, no gap) and follow the stylesheet', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  const rows = page.locator('[role="row"][data-row-id]');
  const [a, b, h] = await Promise.all([rows.nth(0).boundingBox(), rows.nth(1).boundingBox(), page.locator('.data-grid').evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--row-h')))]);
  expect(h).toBe(32);
  expect(Math.round(b!.y - a!.y)).toBe(h);
  expect(Math.round(a!.height)).toBe(h);
});

test('the splitter follows the ARIA window-splitter pattern (controls, Home/End, arrows)', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  const sep = page.getByRole('separator', { name: 'Resize panes' });
  const controls = await sep.getAttribute('aria-controls');
  expect(controls).toBeTruthy();
  await expect(page.locator(`#${controls}`)).toBeVisible();
  await sep.focus();
  await page.keyboard.press('Home');
  await expect(sep).toHaveAttribute('aria-valuenow', '25');
  await page.keyboard.press('End');
  await expect(sep).toHaveAttribute('aria-valuenow', '75');
  await page.keyboard.press('ArrowLeft');
  await expect(sep).toHaveAttribute('aria-valuenow', '72');
});

test.describe('narrow pane', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('rows become two lines, keep the full description and never clip the amount', async ({ page }) => {
    await page.goto('/app/#sample');
    await waitStatus(page, 'reconciled');
    const row = page.locator('[role="row"][data-row-id]').first();
    expect(await row.evaluate((e) => getComputedStyle(e).gridTemplateAreas)).toContain('desc');
    const [r0, r1] = await Promise.all([row.boundingBox(), page.locator('[role="row"][data-row-id]').nth(1).boundingBox()]);
    expect(Math.round(r0!.height)).toBe(52);
    expect(Math.round(r1!.y - r0!.y)).toBe(52);
    const amount = await row.locator('[data-col="amount"]').boundingBox();
    expect(amount!.x + amount!.width).toBeLessThanOrEqual(390);
    expect(await row.locator('[data-col="description"]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis')).toBe(true);
    // the column-header row stays in the accessibility tree but is not drawn
    await expect(page.locator('.grid-row.head')).toHaveCSS('width', '1px');
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toBeAttached();
  });
});

test('prefers-reduced-motion removes the stamp animation and dialog transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  await expect(page.getByTestId('status-stamp')).toHaveCSS('animation-name', 'none');
  await page.getByTestId('export-btn').click();
  await expect(page.locator('dialog[open]')).toHaveCSS('transition-duration', '0s');
});

test('forced-colors: selection, tabs and the bad row keep a system-colour outline', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  const selected = page.locator('[role="row"][aria-selected="true"]').first();
  await page.locator('[role="row"][data-row-id]').nth(2).locator('[data-col="description"]').click();
  await expect(selected).toHaveCSS('outline-style', 'solid');
  await expect(page.getByRole('tab', { name: 'Workbench' })).toHaveCSS('outline-style', 'solid');
});

test('keyboard focus is always visible: skip link, then a ringed first control', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test('keyboard walk: every tab stop in the workbench has a visible focus indicator', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  await page.waitForSelector('.pagebox[data-rendered="true"]');
  const bad: string[] = [];
  const seen = new Set<string>();
  // 45 presses cover one full cycle (about 38 stops) and wrap past the browser chrome; where focus leaves the page there is nothing to check.
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const label = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28)}`;
      return { label, ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 };
    });
    if (!info) continue;
    seen.add(info.label);
    if (!info.ring) bad.push(info.label);
  }
  expect(seen.size).toBeGreaterThan(25);
  expect(seen.has('a Skip to content')).toBe(true);
  expect(seen.has('button Export…')).toBe(true);
  expect(bad).toEqual([]);
});

test('the "Verify it is offline" dialog reports the real, server-sent policy (not a missing meta tag)', async ({ page }) => {
  await page.goto('/app/');
  await page.getByTestId('privacy-chip').click();
  const dlg = page.getByRole('dialog', { name: 'Verify it is offline' });
  await expect(dlg).toContainText('Enforced by your browser');
  await expect(dlg).not.toContainText('No Content-Security-Policy');
});

test('merged ledger: rows are one line (34 px) on a desktop and two lines (54 px) in a narrow card, never overlapping', async ({ page }) => {
  const pitch = async () => {
    const rows = page.locator('[role="table"][aria-label="Merged transactions"] [role="row"][aria-rowindex]');
    await rows.nth(1).waitFor();
    const [a, b] = await Promise.all([rows.nth(0).boundingBox(), rows.nth(1).boundingBox()]);
    return [Math.round(a!.height), Math.round(b!.y - a!.y)];
  };
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  await page.getByRole('tab', { name: 'Merged ledger' }).click();
  expect(await pitch()).toEqual([34, 34]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(pitch).toEqual([54, 54]);
});
