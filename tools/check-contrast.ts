/**
 * Measures the WCAG 2 contrast of every documented colour pair in src/styles/tokens.css, in both themes.
 *   npx tsx tools/check-contrast.ts          prints the table; exit code 1 if any pair misses its threshold
 * Text pairs need >= 4.5:1 (SC 1.4.3); pairs that identify controls, focus and status marks need >= 3:1 (SC 1.4.11).
 * tests/unit/design-tokens.test.ts runs the same measurement, so a token edit that breaks contrast fails the suite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Theme = 'light' | 'dark';
export interface Measure { theme: Theme; kind: 'text' | 'ui'; fg: string; bg: string; fgHex: string; bgHex: string; ratio: number; min: number; ok: boolean }

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-raised'], ['text', 'bg-subtle'], ['text', 'sunken'], ['text', 'accent-soft'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-raised'], ['text-muted', 'bg-subtle'], ['text-muted', 'sunken'], ['text-muted', 'accent-soft'],
  ['accent', 'surface'], ['accent', 'bg'], ['accent', 'bg-subtle'], ['accent', 'accent-soft'], ['accent', 'sunken'], ['success', 'sunken'], ['accent-fg', 'accent'], ['accent-fg', 'accent-hover'],
  ['success', 'success-soft'], ['success', 'surface'], ['danger', 'danger-soft'], ['danger', 'surface'], ['warning', 'warning-soft'], ['warning', 'surface'],
];
const UI_PAIRS: [string, string][] = [
  ['border-strong', 'surface'], ['border-strong', 'surface-raised'], ['border-strong', 'bg'], ['border-strong', 'bg-subtle'], ['border-strong', 'sunken'],
  ['accent', 'surface'], ['accent', 'bg'], ['accent', 'sunken'], ['success', 'surface'], ['danger', 'surface'], ['warning', 'surface'],
  ['paper-ink', 'paper'], ['paper-grey', 'paper'], ['paper-danger', 'paper'],
];

const chan = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * chan(n >> 16) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255); };
export const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };

export function readTokens(css: string): Record<string, { light: string; dark: string }> {
  const out: Record<string, { light: string; dark: string }> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*light-dark\((#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/g)) out[m[1]!] = { light: m[2]!, dark: m[3]! };
  for (const m of css.matchAll(/--(paper[a-z-]*):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]!] = { light: m[2]!, dark: m[2]! };
  return out;
}

export function measureTokens(css: string): Measure[] {
  const t = readTokens(css);
  const res: Measure[] = [];
  for (const [kind, pairs, min] of [['text', TEXT_PAIRS, 4.5], ['ui', UI_PAIRS, 3]] as const) {
    for (const [fg, bg] of pairs) {
      for (const theme of ['light', 'dark'] as const) {
        const f = t[fg]?.[theme], b = t[bg]?.[theme];
        if (!f || !b) throw new Error(`token missing: ${!f ? fg : bg}`);
        const ratio = contrast(f, b);
        res.push({ theme, kind, fg, bg, fgHex: f, bgHex: b, ratio, min, ok: ratio >= min });
      }
    }
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/tokens.css'), 'utf8');
  const rows = measureTokens(css);
  for (const r of rows) console.log(`${r.theme.padEnd(5)} ${r.kind.padEnd(4)} ${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)}:1 (${r.fgHex} / ${r.bgHex}) ${r.ok ? 'ok' : `FAIL (needs ${r.min})`}`);
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - bad.length}/${rows.length} pairs pass`);
  process.exit(bad.length ? 1 : 0);
}
