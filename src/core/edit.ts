/** Pure row-editing operations. Each returns a NEW statement (immutable updates, undo-friendly). */
import { newId, type Row, type RowFlag, type Statement } from './model';

const withFlag = (r: Row, f: RowFlag): Row => ({ ...r, flags: [...new Set([...(r.flags ?? []), f])] });

export type RowPatch = Partial<Pick<Row, 'date' | 'postDate' | 'description' | 'amountMinor' | 'balanceMinor' | 'payee' | 'category' | 'memo'>>;

export function updateRow(st: Statement, id: string, patch: RowPatch): Statement {
  return { ...st, rows: st.rows.map((r) => (r.id === id ? withFlag({ ...r, ...patch }, 'edited') : r)) };
}

export function insertRow(st: Statement, afterIndex: number, init: Partial<Row> = {}): { statement: Statement; id: string } {
  const prev = st.rows[Math.max(0, Math.min(afterIndex, st.rows.length - 1))];
  const id = newId();
  const row: Row = {
    id,
    date: init.date ?? prev?.date ?? st.periodStart ?? '2000-01-01',
    description: init.description ?? '',
    sourceDescription: init.description ?? '',
    amountMinor: init.amountMinor ?? 0,
    balanceMinor: null,
    flags: ['manual'],
  };
  const rows = [...st.rows];
  rows.splice(afterIndex + 1, 0, row);
  return { statement: { ...st, rows }, id };
}

export function deleteRows(st: Statement, ids: readonly string[]): Statement {
  const del = new Set(ids);
  return { ...st, rows: st.rows.filter((r) => !del.has(r.id)) };
}

export function flipSign(st: Statement, ids: readonly string[]): Statement {
  const set = new Set(ids);
  return { ...st, rows: st.rows.map((r) => (set.has(r.id) ? withFlag({ ...r, amountMinor: -r.amountMinor }, 'edited') : r)) };
}

export function flipAllSigns(st: Statement): Statement {
  return flipSign(st, st.rows.map((r) => r.id));
}

/** Split one row into two whose amounts add up to the original; the total never changes. */
export function splitRow(st: Statement, id: string, firstAmountMinor: number): Statement {
  const i = st.rows.findIndex((r) => r.id === id);
  if (i < 0) return st;
  const r = st.rows[i]!;
  const second = r.amountMinor - firstAmountMinor;
  const a: Row = withFlag({ ...r, amountMinor: firstAmountMinor, balanceMinor: null }, 'split');
  const b: Row = withFlag({ ...r, id: newId(), amountMinor: second, source: r.source }, 'split');
  const rows = [...st.rows];
  rows.splice(i, 1, a, b);
  return { ...st, rows };
}

/** Merge rows (by id) into the first one: amounts summed, descriptions joined, last printed balance kept. */
export function mergeRows(st: Statement, ids: readonly string[]): Statement {
  const set = new Set(ids);
  const picked = st.rows.filter((r) => set.has(r.id));
  if (picked.length < 2) return st;
  const first = picked[0]!;
  const last = picked[picked.length - 1]!;
  const merged: Row = withFlag(
    {
      ...first,
      amountMinor: picked.reduce((s, r) => s + r.amountMinor, 0),
      description: picked.map((r) => r.description).filter(Boolean).join(' '),
      balanceMinor: last.balanceMinor ?? null,
    },
    'merged',
  );
  const rows: Row[] = [];
  for (const r of st.rows) {
    if (r.id === first.id) rows.push(merged);
    else if (!set.has(r.id)) rows.push(r);
  }
  return { ...st, rows };
}

export function setBalances(st: Statement, opening: number | null, closing: number | null): Statement {
  return { ...st, openingBalanceMinor: opening, closingBalanceMinor: closing, balanceSource: 'manual' };
}
