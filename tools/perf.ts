/** Parse-time benchmark on a synthetic ~100-page statement (Node, pdf.js legacy build). Writes docs/perf-node.json. */
import fs from 'node:fs';
import { generate } from './synth/generate';
import { extractAllPages } from '../src/adapters/pdf/extract';
import { pdfjsNode } from './pdfNode';
import { parseStatement } from '../src/core/parse';
import { reconcile } from '../src/core/reconcile';

const g = await generate('bank-multipage', 5, { rows: 4300 });
const t0 = performance.now();
const { pages, pageCount } = await extractAllPages(await pdfjsNode(), g.pdf);
const t1 = performance.now();
const out = parseStatement(pages);
const t2 = performance.now();
const rec = reconcile({ accountType: out.accountType, openingBalanceMinor: out.openingBalanceMinor, closingBalanceMinor: out.closingBalanceMinor, rows: out.rows });
const t3 = performance.now();
const r = { pages: pageCount, rows: out.rows.length, truthRows: g.truth.rows.length, pdfKB: Math.round(g.pdf.length / 1024), extractMs: Math.round(t1 - t0), parseMs: Math.round(t2 - t1), reconcileMs: Math.round(t3 - t2), status: rec.status, node: process.version };
fs.writeFileSync('docs/perf-node.json', JSON.stringify(r, null, 2));
console.log(r);
