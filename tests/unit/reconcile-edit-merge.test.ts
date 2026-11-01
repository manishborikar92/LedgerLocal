import { describe, expect, it } from 'vitest';
import { reconcile } from '@/core/reconcile';
import { deleteRows, flipAllSigns, flipSign, insertRow, mergeRows, splitRow, updateRow } from '@/core/edit';
import { mergeStatements } from '@/core/merge';
import { row, statement } from '../helpers';

describe('reconciliation', () => {
  const rows = () => [row('2025-03-02', 'A', -2000, 98000), row('2025-03-03', 'B', 50000, 148000), row('2025-03-04', 'C', -3000, 145000)];
  it('bank: opening + in - out = closing', () => {
    const r = reconcile({ accountType: 'bank', openingBalanceMinor: 100000, closingBalanceMinor: 145000, rows: rows() });
    expect(r).toMatchObject({ status: 'reconciled', deltaMinor: 0, totalInMinor: 50000, totalOutMinor: 5000 });
    expect(r.chain.status).toBe('verified');
    expect(r.chain.perRow).toEqual(['ok', 'ok', 'ok']);
  });
  it('credit card: previous + charges - payments = new balance', () => {
    const cc = [row('2025-03-02', 'Shop', -4000), row('2025-03-09', 'Payment', 10000)];
    expect(reconcile({ accountType: 'creditCard', openingBalanceMinor: 20000, closingBalanceMinor: 14000, rows: cc }).status).toBe('reconciled');
  });
  it('reports a discrepancy with the delta and the first divergent row', () => {
    const broken = rows().filter((r) => r.description !== 'B'); // a dropped transaction
    const r = reconcile({ accountType: 'bank', openingBalanceMinor: 100000, closingBalanceMinor: 145000, rows: broken });
    expect(r.status).toBe('discrepancy');
    expect(r.deltaMinor).toBe(-50000);
    expect(r.chain.status).toBe('diverged');
    expect(r.problemRowIndex).toBe(1); // row C: printed 145,000 vs computed 95,000
    expect(r.suggestions.some((s) => s.kind === 'missing-or-extra')).toBe(true);
  });
  it('is incomplete without balances', () => {
    expect(reconcile({ accountType: 'bank', openingBalanceMinor: null, closingBalanceMinor: 1, rows: rows() }).status).toBe('incomplete');
  });
  it('suggests flipping all signs / a single wrong sign / swapped balances', () => {
    const flipped = rows().map((r) => ({ ...r, amountMinor: -r.amountMinor }));
    expect(reconcile({ accountType: 'bank', openingBalanceMinor: 100000, closingBalanceMinor: 145000, rows: flipped }).suggestions.map((s) => s.kind)).toContain('flip-all-signs');
    const one = rows();
    one[2] = { ...one[2]!, amountMinor: 3000, balanceMinor: null };
    one[0] = { ...one[0]!, balanceMinor: null }; one[1] = { ...one[1]!, balanceMinor: null };
    const r = reconcile({ accountType: 'bank', openingBalanceMinor: 100000, closingBalanceMinor: 145000, rows: one });
    expect(r.suggestions).toContainEqual({ kind: 'flip-row-sign', rowIndex: 2, message: 'Row 3 may have the wrong sign.' });
    expect(reconcile({ accountType: 'bank', openingBalanceMinor: 145000, closingBalanceMinor: 100000, rows: rows() }).suggestions.map((s) => s.kind)).toContain('swap-balances');
  });
  it('resyncs after a bad row so later rows are judged independently', () => {
    const rs = [row('2025-03-02', 'A', -2000, 98000), row('2025-03-03', 'B', 100, 1), row('2025-03-04', 'C', -3000, -2999)];
    const r = reconcile({ accountType: 'bank', openingBalanceMinor: 100000, closingBalanceMinor: -2999, rows: rs });
    expect(r.chain.perRow).toEqual(['ok', 'bad', 'ok']);
  });
});

describe('row edits (immutable, total-preserving where promised)', () => {
  it('update / insert / delete / flip', () => {
    const st = statement([row('2025-03-02', 'A', -2000), row('2025-03-03', 'B', 500)]);
    const u = updateRow(st, st.rows[0]!.id, { description: 'A2' });
    expect(u.rows[0]!.description).toBe('A2');
    expect(u.rows[0]!.flags).toContain('edited');
    expect(st.rows[0]!.description).toBe('A'); // original untouched
    const { statement: ins, id } = insertRow(st, 0, { description: 'new', amountMinor: 7 });
    expect(ins.rows[1]!.id).toBe(id);
    expect(ins.rows[1]!.flags).toContain('manual');
    expect(deleteRows(ins, [id]).rows).toHaveLength(2);
    expect(flipSign(st, [st.rows[0]!.id]).rows[0]!.amountMinor).toBe(2000);
    expect(flipAllSigns(st).rows.map((r) => r.amountMinor)).toEqual([2000, -500]);
  });
  it('split keeps the sum; merge sums and joins', () => {
    const st = statement([row('2025-03-02', 'Big', -10000, 90000), row('2025-03-03', 'Small', -500, 89500)]);
    const sp = splitRow(st, st.rows[0]!.id, -4000);
    expect(sp.rows.map((r) => r.amountMinor)).toEqual([-4000, -6000, -500]);
    expect(sp.rows.reduce((s, r) => s + r.amountMinor, 0)).toBe(-10500);
    const mg = mergeRows(sp, [sp.rows[0]!.id, sp.rows[1]!.id]);
    expect(mg.rows).toHaveLength(2);
    expect(mg.rows[0]!.amountMinor).toBe(-10000);
    expect(mg.rows[0]!.description).toBe('Big Big');
    expect(mergeRows(st, [st.rows[0]!.id]).rows).toHaveLength(2); // <2 rows: no-op
  });
});

describe('multi-statement merge', () => {
  const jan = statement([row('2025-01-10', 'Rent', -90000), row('2025-01-31', 'Pay', 10000)], { fileName: 'jan.pdf', periodStart: '2025-01-01', periodEnd: '2025-01-31', openingBalanceMinor: 500000, closingBalanceMinor: 420000 });
  it('merges chronologically and passes continuity when closing = next opening', () => {
    const feb = statement([row('2025-02-05', 'Gas', -2000)], { fileName: 'feb.pdf', periodStart: '2025-02-01', periodEnd: '2025-02-28', openingBalanceMinor: 420000, closingBalanceMinor: 418000 });
    const m = mergeStatements([feb, jan]);
    expect(m.rows.map((r) => r.description)).toEqual(['Rent', 'Pay', 'Gas']);
    expect(m.continuity.map((c) => c.kind)).toEqual(['ok']);
  });
  it('flags gaps, overlaps, balance mismatches and cross-statement duplicates', () => {
    const mar = statement([row('2025-03-12', 'Gas', -2000)], { fileName: 'mar.pdf', periodStart: '2025-03-05', periodEnd: '2025-03-31', openingBalanceMinor: 1, closingBalanceMinor: 1 - 2000 });
    const gap = mergeStatements([jan, mar]);
    expect(gap.continuity.map((c) => c.kind).sort()).toEqual(['balance-mismatch', 'period-gap']);
    const overlapping = statement([row('2025-01-31', 'Pay', 10000)], { fileName: 'jan2.pdf', periodStart: '2025-01-25', periodEnd: '2025-02-10', openingBalanceMinor: 420000, closingBalanceMinor: 430000 });
    const ov = mergeStatements([jan, overlapping]);
    expect(ov.continuity.some((c) => c.kind === 'overlap')).toBe(true);
    expect(ov.duplicates).toHaveLength(1);
  });
  it('keeps separate accounts apart', () => {
    const other = statement([row('2025-01-12', 'X', -1)], { accountLast4: '9999' });
    expect(mergeStatements([jan, other]).accounts).toHaveLength(2);
  });
});
