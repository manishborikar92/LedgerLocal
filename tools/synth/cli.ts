import fs from 'node:fs';
import path from 'node:path';
import { generate, LAYOUT_IDS, HELDOUT_IDS, type LayoutId } from './generate';

const out = process.argv[2] ?? '.generated/synthetic';
const seeds = (process.argv[3] ?? '1').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
for (const id of [...LAYOUT_IDS, ...HELDOUT_IDS]) {
  for (const seed of seeds) {
    const s = await generate(id as LayoutId, seed);
    const name = `${id}.s${seed}`;
    fs.writeFileSync(path.join(out, `${name}.pdf`), s.pdf);
    fs.writeFileSync(path.join(out, `${name}.truth.json`), JSON.stringify(s.truth, null, 2));
  }
}
console.log(`wrote ${(LAYOUT_IDS.length + HELDOUT_IDS.length) * seeds.length} PDFs to ${out}`);
