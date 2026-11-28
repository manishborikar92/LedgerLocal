import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureTokens, readTokens } from '../../tools/check-contrast';

const css = fs.readFileSync(path.resolve('src/styles/tokens.css'), 'utf8');

describe('design tokens (docs/DESIGN.md §8)', () => {
  it('every documented text pair is >= 4.5:1 and every UI/status pair >= 3:1, in light and dark', () => {
    const rows = measureTokens(css);
    expect(rows.length).toBeGreaterThan(70);
    expect(rows.filter((r) => !r.ok).map((r) => `${r.theme} ${r.fg}/${r.bg} ${r.ratio.toFixed(2)}`)).toEqual([]);
  });
  it('each colour is defined once, as a light-dark() pair (no duplicated dark palette)', () => {
    const t = readTokens(css);
    for (const k of ['bg', 'surface', 'text', 'text-muted', 'accent', 'success', 'danger', 'warning']) expect(t[k]).toBeDefined();
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect((css.match(/--accent:/g) ?? []).length).toBe(1);
  });
  it('the app and its styles never reference a remote origin (privacy: same-origin only)', () => {
    for (const f of ['tokens', 'base', 'components', 'workbench', 'marketing']) {
      expect(fs.readFileSync(path.resolve(`src/styles/${f}.css`), 'utf8')).not.toMatch(/url\(\s*['"]?https?:/);
    }
  });
});
