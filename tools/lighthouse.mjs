#!/usr/bin/env node
/**
 * Measures Lighthouse scores against a running production server (`npm run build && npm run start`) and writes
 * docs/lighthouse.json. Lighthouse is intentionally NOT a project dependency; install it anywhere and point at it:
 *
 *   npm i lighthouse --prefix <dir>
 *   node tools/lighthouse.mjs --lighthouse <dir>/node_modules/lighthouse/cli/index.js --chrome <path to chrome> [--base http://127.0.0.1:3000] [--runs 3] [--only "Landing, mobile"]
 *
 * Mobile = Lighthouse's default simulated slow 4G + 4x CPU slowdown; desktop = the desktop preset. Each target is run
 * `--runs` times; the file stores the median score of each category and every individual run, because run-to-run
 * variance is several points. `--only` re-measures one target and keeps the others already in the file.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lighthouse = arg('lighthouse');
const chrome = arg('chrome', process.env.CHROME_PATH);
const base = (arg('base', 'http://127.0.0.1:3000')).replace(/\/$/, '');
const runs = Number(arg('runs', '3'));
const only = arg('only');
if (!lighthouse || !chrome) { console.error('usage: node tools/lighthouse.mjs --lighthouse <path to lighthouse/cli/index.js> --chrome <path to chrome> [--base URL] [--runs N] [--only "target name"]'); process.exit(2); }

const TARGETS = [
  { name: 'Landing, mobile', path: '/', form: 'mobile', seo: true },
  { name: 'Landing, desktop', path: '/', form: 'desktop', seo: true },
  { name: 'Guide page, mobile', path: '/guides/verify-offline/', form: 'mobile', seo: true },
  { name: 'Guide page, desktop', path: '/guides/verify-offline/', form: 'desktop', seo: true },
  { name: 'App shell /app/, mobile', path: '/app/', form: 'mobile', seo: false },
  { name: 'App shell /app/, desktop', path: '/app/', form: 'desktop', seo: false },
];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function runOnce(t) {
  const out = path.join(os.tmpdir(), `ll-lh-${process.pid}.json`);
  const args = [lighthouse, `${base}${t.path}`, '--output=json', `--output-path=${out}`, '--quiet', '--chrome-flags=--headless=new --no-sandbox', ...(t.form === 'desktop' ? ['--preset=desktop'] : [])];
  const r = spawnSync(process.execPath, args, { env: { ...process.env, CHROME_PATH: chrome }, encoding: 'utf8', timeout: 240_000 });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`lighthouse failed for ${t.name}: ${(r.stderr || '').slice(-400)}`);
  const lhr = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(out);
  const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const val = (id) => Math.round(lhr.audits[id].numericValue * 1000) / 1000;
  return {
    scores: { performance: score('performance'), accessibility: score('accessibility'), 'best-practices': score('best-practices'), seo: score('seo') },
    metrics: { FCP: val('first-contentful-paint'), LCP: val('largest-contentful-paint'), TBT: val('total-blocking-time'), CLS: val('cumulative-layout-shift'), SI: val('speed-index') },
    version: lhr.lighthouseVersion, chrome: lhr.environment?.hostUserAgent, benchmarkIndex: Math.round(lhr.environment?.benchmarkIndex ?? 0),
  };
}

const file = path.join(root, 'docs/lighthouse.json');
const result = fs.existsSync(file) && only ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
let env = result._environment ?? {};
for (const t of TARGETS.filter((x) => !only || x.name === only)) {
  const all = [];
  for (let i = 0; i < runs; i++) { const r = runOnce(t); all.push(r); console.log(t.name, `run ${i + 1}/${runs}: perf ${r.scores.performance}  LCP ${Math.round(r.metrics.LCP)} ms  TBT ${Math.round(r.metrics.TBT)} ms`); }
  const cats = Object.keys(all[0].scores).filter((c) => t.seo || c !== 'seo');
  result[t.name] = {
    url: t.path, runs,
    scores: Object.fromEntries(cats.map((c) => [c, median(all.map((r) => r.scores[c]))])),
    metricsMedianMs: { FCP: Math.round(median(all.map((r) => r.metrics.FCP))), LCP: Math.round(median(all.map((r) => r.metrics.LCP))), TBT: Math.round(median(all.map((r) => r.metrics.TBT))), CLS: Math.round(median(all.map((r) => r.metrics.CLS)) * 1000) / 1000, SI: Math.round(median(all.map((r) => r.metrics.SI))) },
    performanceByRun: all.map((r) => r.scores.performance),
    ...(t.seo ? {} : { note: 'SEO audit omitted: the workbench is intentionally noindex.' }),
  };
  env = { lighthouse: all[0].version, chrome: all[0].chrome, cpus: os.cpus().length, benchmarkIndexMedian: Math.round(median(all.map((r) => r.benchmarkIndex))) };
}
result._environment = env;
result._note = 'Measured against `next start` (production build, gzip on) on the machine above; mobile = simulated slow 4G + 4x CPU slowdown. Scores are the median of the runs listed; run-to-run variance is several points, and a different machine will give different numbers.';
fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
console.log(`wrote ${path.relative(root, file)}`);
