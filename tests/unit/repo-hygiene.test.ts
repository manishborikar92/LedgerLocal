import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('.');
const SKIP = new Set(['node_modules', '.next', '.git', '.generated', 'test-results', 'playwright-report', 'e2e-artifacts', 'public']);
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(ROOT).filter((f) => /\.(ts|tsx|mjs|cjs|js|json|css|md|py)$/.test(f) && !/package-lock\.json$/.test(f) && !/THIRD_PARTY/.test(f));
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

describe('repository hygiene (catches leaked scratch files and machine-specific paths)', () => {
  it('no absolute, machine-specific paths in any source, config or doc file', () => {
    const bad: string[] = [];
    const re = /(\/home\/[a-z0-9_.-]+\/|\/Users\/[A-Za-z0-9_.-]+\/|[A-Z]:\\Users\\|\/mnt\/user-data|\/tmp\/(ll|cr|lh|pw|serve|dbg))/;
    for (const f of files) {
      if (rel(f) === 'tests/unit/repo-hygiene.test.ts') continue;
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (re.test(line)) bad.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 90)}`); });
    }
    expect(bad).toEqual([]);
  });
  it('no scratch/debug files are shipped', () => {
    const scratch = files.map(rel).filter((f) => /(^|\/)(dbg|debug|scratch|tmp|probe|same)[^/]*\.(ts|mjs|js|cjs)$/.test(f));
    expect(scratch).toEqual([]);
  });
  it('relative imports in tools/ and tests/ resolve inside the repository', () => {
    const bad: string[] = [];
    for (const f of files.filter((x) => /\.(ts|tsx|mjs)$/.test(x) && /^(tools|tests|e2e|scripts)\//.test(rel(x)))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/from ['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = path.resolve(path.dirname(f), m[1]!);
        if (!target.startsWith(ROOT)) bad.push(`${rel(f)} -> ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('the app uses the standard Next.js server workflow (no static export, start script present)', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
    expect(cfg).not.toMatch(/output:\s*['"]export['"]/);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toMatch(/^next dev\b/);
    expect(pkg.scripts.start).toBe('next start');
    expect(pkg.scripts.build).toMatch(/^next build/);
    // next.config.mjs has a webpack plugin (offline precache list). Next 16 defaults to Turbopack and refuses to start
    // `next dev` / `next build` when a webpack config exists, unless the bundler is chosen explicitly.
    expect(pkg.scripts.dev).toContain('--webpack');
    expect(pkg.scripts.build).toContain('--webpack');
  });
  it('no pricing, payment, licence-key or separate-backend vocabulary in app source', () => {
    const bad: string[] = [];
    const re = /\b(pricing|subscription|checkout|merchant of record|licen[cs]e key|control plane)\b/i;
    for (const f of files.filter((x) => /^src\//.test(rel(x)))) if (re.test(fs.readFileSync(f, 'utf8'))) bad.push(rel(f));
    expect(bad).toEqual([]);
  });
});
