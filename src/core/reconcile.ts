/**
 * Reconciliation: the product's core promise.
 *   Bank:        opening + credits - debits = closing
 *   Credit card: previous balance + charges - payments = new balance (balances are "owed")
 * plus a row-by-row running-balance chain check that pinpoints the first divergence.
 * Pure functions, no I/O.
 */
import type { AccountType, Row } from './model';

/** Effect of one row on the printed balance (bank: +in/-out, card: owed goes DOWN on money in). */
export const balanceStep = (acct: AccountType, amountMinor: number): number => (acct === 'bank' ? amountMinor : -amountMinor);

export type RowCheck = 'ok' | 'bad' | 'na';

export interface Suggestion {
  kind: 'flip-all-signs' | 'flip-row-sign' | 'swap-balances' | 'missing-or-extra';
  message: string;
  rowIndex?: number;
}

export interface ReconcileInput {
  accountType: AccountType;
  openingBalanceMinor: number | null;
  closingBalanceMinor: number | null;
  rows: readonly Pick<Row, 'amountMinor' | 'balanceMinor'>[];
}

export interface ReconcileResult {
  status: 'reconciled' | 'discrepancy' | 'incomplete';
  /** computed closing minus printed closing; 0 when reconciled. null if balances are missing. */
  deltaMinor: number | null;
  computedClosingMinor: number | null;
  totalInMinor: number;
  totalOutMinor: number;
  chain: {
    status: 'verified' | 'diverged' | 'unavailable';
    /** rows that carry a printed running balance and could be compared */
    checked: number;
    perRow: RowCheck[];
    firstBadIndex: number | null;
    expectedMinor?: number;
    printedMinor?: number;
  };
  /** Index of the first row to look at (chain divergence if any). */
  problemRowIndex: number | null;
  suggestions: Suggestion[];
}

export function reconcile(inp: ReconcileInput): ReconcileResult {
  const { accountType: acct, rows } = inp;
  let totalIn = 0;
  let totalOut = 0;
  for (const r of rows) {
    if (r.amountMinor >= 0) totalIn += r.amountMinor;
    else totalOut += -r.amountMinor;
  }
  const net = totalIn - totalOut;

  // Running-balance chain
  const perRow: RowCheck[] = [];
  let running: number | null = inp.openingBalanceMinor;
  let checked = 0;
  let firstBad: number | null = null;
  let expectedAtBad: number | undefined;
  let printedAtBad: number | undefined;
  rows.forEach((r, i) => {
    const step = balanceStep(acct, r.amountMinor);
    const printed = r.balanceMinor ?? null;
    if (printed === null) {
      perRow.push('na');
      running = running === null ? null : running + step;
      return;
    }
    if (running === null) {
      // First printed balance without an opening: trust it as the anchor, nothing to compare.
      perRow.push('na');
      running = printed;
      return;
    }
    checked++;
    const expected = running + step;
    if (expected === printed) perRow.push('ok');
    else {
      perRow.push('bad');
      if (firstBad === null) {
        firstBad = i;
        expectedAtBad = expected;
        printedAtBad = printed;
      }
    }
    running = printed; // resync so later rows are judged independently
  });
  const chainStatus = checked === 0 ? 'unavailable' : firstBad === null ? 'verified' : 'diverged';

  const haveBal = inp.openingBalanceMinor !== null && inp.closingBalanceMinor !== null;
  const computed = inp.openingBalanceMinor === null ? null : inp.openingBalanceMinor + balanceStep(acct, net);
  const delta = haveBal && computed !== null ? computed - (inp.closingBalanceMinor as number) : null;
  const status: ReconcileResult['status'] = !haveBal ? 'incomplete' : delta === 0 ? 'reconciled' : 'discrepancy';

  const suggestions: Suggestion[] = [];
  if (status === 'discrepancy' && delta !== null) {
    const open = inp.openingBalanceMinor as number;
    const close = inp.closingBalanceMinor as number;
    if (net !== 0 && open + balanceStep(acct, -net) === close) {
      suggestions.push({ kind: 'flip-all-signs', message: 'Flipping the sign of every row would reconcile this statement.' });
    }
    if (close + balanceStep(acct, net) === open) {
      suggestions.push({ kind: 'swap-balances', message: 'Opening and closing balances look swapped.' });
    }
    rows.forEach((r, i) => {
      if (r.amountMinor !== 0 && Math.abs(delta) === 2 * Math.abs(r.amountMinor)) {
        const wouldFix = open + balanceStep(acct, net - 2 * r.amountMinor) === close;
        if (wouldFix) suggestions.push({ kind: 'flip-row-sign', rowIndex: i, message: `Row ${i + 1} may have the wrong sign.` });
      }
    });
    if (firstBad !== null && printedAtBad !== undefined && expectedAtBad !== undefined) {
      const gap = printedAtBad - expectedAtBad;
      suggestions.push({
        kind: 'missing-or-extra',
        rowIndex: firstBad,
        message: `At row ${firstBad + 1} the statement's running balance differs from the rows by ${gap > 0 ? '+' : ''}${gap}. A transaction may be missing, extra or have the wrong amount.`,
      });
    }
  }

  return {
    status,
    deltaMinor: delta,
    computedClosingMinor: computed,
    totalInMinor: totalIn,
    totalOutMinor: totalOut,
    chain: { status: chainStatus, checked, perRow, firstBadIndex: firstBad, expectedMinor: expectedAtBad, printedMinor: printedAtBad },
    problemRowIndex: firstBad,
    suggestions,
  };
}
