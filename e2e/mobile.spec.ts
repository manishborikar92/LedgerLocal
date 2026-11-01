import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitStatus } from './helpers';

test('phone: read-only review works, no sideways page scroll, accessible', async ({ page }) => {
  await page.goto('/app/#sample');
  await waitStatus(page, 'reconciled');
  await page.screenshot({ path: 'e2e-artifacts/phone-rows.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('tab', { name: 'PDF', exact: true }).click();
  await page.waitForSelector('.pagebox[data-rendered="true"]');
  await page.screenshot({ path: 'e2e-artifacts/phone-pdf.png' });
  await page.getByRole('tab', { name: 'Rows', exact: true }).click();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('canvas').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
});
