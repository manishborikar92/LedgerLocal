import fs from 'node:fs';
import { parsePdfBytes } from './pdfNode';
import { scoreStatement } from './accuracy-lib';
import type { Truth } from './synth/types';
const dir = process.argv[2] ?? '.generated/synthetic';
const only = process.argv[3];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.pdf') && (!only || x.includes(only)))) {
  const truth = JSON.parse(fs.readFileSync(`${dir}/${f.replace('.pdf', '.truth.json')}`, 'utf8')) as Truth;
  try {
    const p = await parsePdfBytes(new Uint8Array(fs.readFileSync(`${dir}/${f}`)), { password: truth.password });
    const s = scoreStatement(p, truth);
    console.log(f.padEnd(34), `rows ${s.matched}/${s.truthRows} (+${s.parsedRows - s.matched} extra) desc ${s.descOk} bal ${s.balanceOk}/${s.balanceChecked}`, s.reconciled ? 'RECONCILED' : s.status.toUpperCase(), JSON.stringify(Object.entries(s.metaOk).filter(([, v]) => !v).map(([k]) => k)));
    if (only) { console.log(s.note.slice(0, 12).join('\n')); console.log(p.warnings, p.assumptions, p.balanceSource); }
  } catch (e) { console.log(f.padEnd(34), 'ERROR', (e as Error).name, (e as Error).message.slice(0, 80)); }
}
