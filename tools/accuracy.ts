/**
 * Accuracy + performance report. Uses FRESH seeds (201-210) that no debugging ever looked at.
 * Writes docs/ACCURACY.md and docs/accuracy-results.json. Numbers are "on synthetic layouts" only.
 */
import fs from 'node:fs';
import { generate, HELDOUT_IDS, LAYOUT_IDS, type LayoutId } from './synth/generate';
import { parsePdfBytes } from './pdfNode';
import { scoreStatement, type LayoutScore } from './accuracy-lib';
import { ParseError } from '../src/core/parse';

const SEEDS = Array.from({ length: 10 }, (_, i) => 201 + i);
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : '—') + '%';
const rowsOut: string[] = [];
const results: Record<string, unknown>[] = [];
const all: LayoutScore[] = [];

for (const id of [...LAYOUT_IDS, ...HELDOUT_IDS]) {
  const scores: LayoutScore[] = [];
  let errorsOk = 0;
  for (const seed of SEEDS) {
    const { pdf, truth } = await generate(id as LayoutId, seed);
    try {
      const p = await parsePdfBytes(pdf, { password: truth.password });
      scores.push(scoreStatement(p, truth));
    } catch (e) {
      if (truth.expectedError && e instanceof ParseError && e.code === truth.expectedError) errorsOk++;
      else throw e;
    }
  }
  if (id === 'scan-image-only') {
    rowsOut.push(`| \`${id}\` | ${SEEDS.length} | — | — | — | — | rejected with "no text layer": ${errorsOk}/${SEEDS.length} |`);
    results.push({ layout: id, files: SEEDS.length, rejectedCorrectly: errorsOk });
    continue;
  }
  all.push(...scores);
  const sum = (f: (s: LayoutScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  const tr = sum((s) => s.truthRows), pr = sum((s) => s.parsedRows), m = sum((s) => s.matched), d = sum((s) => s.descOk);
  const rec = scores.filter((s) => s.reconciled).length;
  const meta = scores.filter((s) => Object.values(s.metaOk).every(Boolean)).length;
  rowsOut.push(`| \`${id}\`${(HELDOUT_IDS as readonly string[]).includes(id) ? ' †' : ''} | ${scores.length} | ${pct(m, tr)} | ${pct(m, pr)} | ${pct(d, m)} | ${rec}/${scores.length} | ${meta}/${scores.length} |`);
  results.push({ layout: id, files: scores.length, truthRows: tr, rowRecall: m / tr, rowPrecision: m / pr, descriptionExact: d / m, reconciled: rec, metadataAllCorrect: meta });
}
const T = all.reduce((a, s) => a + s.truthRows, 0), M = all.reduce((a, s) => a + s.matched, 0), P = all.reduce((a, s) => a + s.parsedRows, 0);
const R = all.filter((s) => s.reconciled).length;


const md = `# Accuracy report — on synthetic layouts

> **Read this first.** These numbers are measured on *synthetic* statements produced by this repository's own generator
> (\`tools/synth\`), for *fictional* banks. The same author wrote the generator and the parser, so the figures are an
> optimistic ceiling, not a forecast for real-world statements. Real statements add scanned pages, odd fonts, merged cells,
> rotated pages and layouts nobody here has seen. Always check the green/red **reconciliation** status on every file.

Method: for each layout, ${SEEDS.length} statements were generated with seeds ${SEEDS[0]}–${SEEDS.at(-1)} (never used while developing). Each PDF was parsed with the
production parser (pdf.js text extraction + \`core/parse\`) and compared with the generator's ground-truth JSON.
Rows are matched on (date, signed amount); description is compared exactly after whitespace/case normalisation.
"Reconciled" = the app reported RECONCILED (opening + movements = closing) for the file; "metadata" = account type, last-4,
period, currency and both balances all correct.

| Layout | Files | Row recall | Row precision | Description exact | Reconciled | Metadata all correct |
|---|---:|---:|---:|---:|---:|---:|
${rowsOut.join('\n')}

**Overall (text layouts):** ${M}/${T} rows recovered (${pct(M, T)} recall, ${pct(M, P)} precision); ${R}/${all.length} statements reconciled.

† *Held-out layouts.* These four layouts were written after the parser was tuned. On their first run two of them failed outright
(a lone "Posting Date" header was mis-classified so no table was found; a card statement that prints charges as negatives came out with every
sign inverted). Both were fixed (see docs/DECISIONS.md D-12), so these layouts are no longer pristine; the seeds above are fresh, the layouts are not.

## What this does not measure
* Scanned / image-only PDFs: rejected with a clear message (OCR is roadmap). \`scan-image-only\` above verifies the rejection only.
* Real bank layouts, ligature-heavy fonts, rotated pages, statements where columns are drawn as images, multi-currency tables.
* The previously cited "~83% for rule-based converters on unfamiliar layouts" claim could not be verified from a primary source and is not used anywhere in the product (docs/RESEARCH.md §1).
`;
fs.writeFileSync('docs/ACCURACY.md', md);
fs.writeFileSync('docs/accuracy-results.json', JSON.stringify({ seeds: SEEDS, layouts: results, overall: { rows: T, matched: M, parsed: P, reconciled: R, statements: all.length } }, null, 2));
console.log(md.split('\n').slice(14, 40).join('\n'));
