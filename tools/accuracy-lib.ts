import type { ParseOutput } from '../src/core/parse';
import { reconcile } from '../src/core/reconcile';
import type { Truth } from './synth/types';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();

export interface LayoutScore {
  layout: string;
  seed: number;
  truthRows: number;
  parsedRows: number;
  matched: number;
  descOk: number;
  balanceOk: number;
  balanceChecked: number;
  recall: number;
  precision: number;
  metaOk: { accountType: boolean; last4: boolean; period: boolean; currency: boolean; opening: boolean; closing: boolean };
  reconciled: boolean;
  status: string;
  note: string[];
}

export function scoreStatement(p: ParseOutput, t: Truth): LayoutScore {
  const used = new Set<number>();
  let matched = 0, descOk = 0, balanceOk = 0, balanceChecked = 0;
  const note: string[] = [];
  for (const tr of t.rows) {
    let idx = p.rows.findIndex((r, i) => !used.has(i) && r.date === tr.date && r.amountMinor === tr.amountMinor && norm(r.description) === norm(tr.description));
    if (idx < 0) idx = p.rows.findIndex((r, i) => !used.has(i) && r.date === tr.date && r.amountMinor === tr.amountMinor);
    if (idx < 0) { note.push(`missing ${tr.date} ${tr.amountMinor} ${tr.description}`); continue; }
    used.add(idx);
    matched++;
    const r = p.rows[idx]!;
    if (norm(r.description) === norm(tr.description)) descOk++;
    else note.push(`desc "${r.description}" != "${tr.description}"`);
    if (tr.balanceMinor !== null) { balanceChecked++; if (r.balanceMinor === tr.balanceMinor) balanceOk++; }
  }
  p.rows.forEach((r, i) => { if (!used.has(i)) note.push(`extra ${r.date} ${r.amountMinor} ${r.description}`); });
  const rec = reconcile({ accountType: p.accountType, openingBalanceMinor: p.openingBalanceMinor, closingBalanceMinor: p.closingBalanceMinor, rows: p.rows });
  return {
    layout: t.layout, seed: t.seed, truthRows: t.rows.length, parsedRows: p.rows.length, matched, descOk, balanceOk, balanceChecked,
    recall: t.rows.length ? matched / t.rows.length : 1,
    precision: p.rows.length ? matched / p.rows.length : 1,
    metaOk: {
      accountType: p.accountType === t.accountType, last4: p.accountLast4 === t.accountLast4,
      period: t.printsPeriod === false || (p.periodStart === t.periodStart && p.periodEnd === t.periodEnd), currency: p.currency === t.currency,
      opening: p.openingBalanceMinor === t.openingBalanceMinor, closing: p.closingBalanceMinor === t.closingBalanceMinor,
    },
    reconciled: rec.status === 'reconciled', status: rec.status, note,
  };
}
