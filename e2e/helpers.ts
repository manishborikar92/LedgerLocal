import type { Page } from '@playwright/test';

export async function openSample(page: Page, hash = '#sample') {
  await page.goto('/app/' + hash);
}
export const stamp = (page: Page) => page.getByTestId('status-stamp');
export async function waitStatus(page: Page, status: 'reconciled' | 'discrepancy' | 'incomplete') {
  await page.waitForSelector(`[data-testid="status-stamp"][data-status="${status}"]`, { timeout: 30_000 });
}
/** Record every request and CSP violation for later assertions. */
export function watchNetwork(page: Page) {
  const requests: { url: string; type: string }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType() }));
  return { requests };
}
export async function installCspSpy(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
}
export const cspViolations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

import { generate, type LayoutId } from '../tools/synth/generate';

export async function pdfFile(layout: LayoutId, seed: number, opts: Parameters<typeof generate>[2] = {}, name?: string) {
  const g = await generate(layout, seed, opts);
  return { file: { name: name ?? `${layout}-${seed}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(g.pdf) }, truth: g.truth };
}
export async function waitRendered(page: Page) {
  await page.waitForSelector('.pagebox[data-rendered="true"]', { timeout: 30_000 });
}
