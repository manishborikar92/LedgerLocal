import fs from 'node:fs';
import { parsePdfBytes } from './pdfNode';
const f = process.argv[2]!;
const truth = JSON.parse(fs.readFileSync(f.replace('.pdf','.truth.json'),'utf8'));
const p = await parsePdfBytes(new Uint8Array(fs.readFileSync(f)));
console.log('open', p.openingBalanceMinor, 'truth', truth.openingBalanceMinor, 'close', p.closingBalanceMinor, 'truth', truth.closingBalanceMinor, p.balanceSource, p.pageCount);
console.log(p.rows.slice(-3).map(r=>[r.date,r.amountMinor,r.balanceMinor,r.description]));
