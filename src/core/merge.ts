/** Multi-statement merge: one chronological ledger + continuity, gap, overlap and duplicate checks. */
import { daysBetween } from './dates';
import type { Row, Statement } from './model';

export interface LedgerRow extends Row {
  statementId: string;
  fileName: string;
  accountKey: string;
}
export interface Continuity {
  accountKey: string;
  fromStatementId: string;
  toStatementId: string;
  kind: 'ok' | 'balance-mismatch' | 'period-gap' | 'overlap';
  detail: string;
  /** next opening minus previous closing (balance-mismatch only) */
  deltaMinor?: number;
  days?: number;
}
export interface DuplicateGroup {
  key: string;
  rowIds: string[];
}
export interface LedgerResult {
  rows: LedgerRow[];
  continuity: Continuity[];
  duplicates: DuplicateGroup[];
  accounts: { accountKey: string; statementIds: string[] }[];
}

export const accountKeyOf = (s: Pick<Statement, 'accountType' | 'accountLast4' | 'currency'>): string => `${s.accountType}:${s.accountLast4 ?? 'unknown'}:${s.currency}`;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();
const startOf = (s: Statement) => s.periodStart ?? s.rows.map((r) => r.date).sort()[0] ?? '9999-12-31';
const endOf = (s: Statement) => s.periodEnd ?? [...s.rows.map((r) => r.date)].sort().pop() ?? '0000-01-01';

export function mergeStatements(statements: readonly Statement[]): LedgerResult {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const k = accountKeyOf(s);
    byAccount.set(k, [...(byAccount.get(k) ?? []), s]);
  }
  const continuity: Continuity[] = [];
  const accounts: LedgerResult['accounts'] = [];
  for (const [key, list] of byAccount) {
    list.sort((a, b) => startOf(a).localeCompare(startOf(b)));
    accounts.push({ accountKey: key, statementIds: list.map((s) => s.id) });
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const next = list[i]!;
      const base = { accountKey: key, fromStatementId: prev.id, toStatementId: next.id };
      let issues = 0;
      const gap = daysBetween(endOf(prev), startOf(next)) - 1;
      if (gap > 0) {
        issues++;
        continuity.push({ ...base, kind: 'period-gap', days: gap, detail: `${gap} day(s) between ${prev.fileName} and ${next.fileName} are not covered.` });
      } else if (gap < 0) {
        issues++;
        continuity.push({ ...base, kind: 'overlap', days: -gap, detail: `${prev.fileName} and ${next.fileName} overlap by ${-gap} day(s).` });
      }
      if (prev.closingBalanceMinor !== null && next.openingBalanceMinor !== null && prev.closingBalanceMinor !== next.openingBalanceMinor) {
        issues++;
        continuity.push({ ...base, kind: 'balance-mismatch', deltaMinor: next.openingBalanceMinor - prev.closingBalanceMinor, detail: `Closing balance of ${prev.fileName} does not equal the opening balance of ${next.fileName}.` });
      }
      if (!issues) continuity.push({ ...base, kind: 'ok', detail: `${prev.fileName} closes where ${next.fileName} opens.` });
    }
  }
  const order = new Map(statements.map((s, i) => [s.id, i]));
  const rows: LedgerRow[] = [];
  for (const s of statements) s.rows.forEach((r) => rows.push({ ...r, statementId: s.id, fileName: s.fileName, accountKey: accountKeyOf(s) }));
  const idx = new Map(rows.map((r, i) => [r.id, i]));
  rows.sort((a, b) => a.date.localeCompare(b.date) || (order.get(a.statementId)! - order.get(b.statementId)!) || (idx.get(a.id)! - idx.get(b.id)!));

  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const k = `${r.accountKey}|${r.date}|${r.amountMinor}|${norm(r.sourceDescription || r.description)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const duplicates: DuplicateGroup[] = [];
  for (const [key, g] of groups) {
    if (new Set(g.map((r) => r.statementId)).size > 1) duplicates.push({ key, rowIds: g.map((r) => r.id) });
  }
  return { rows, continuity, duplicates, accounts };
}
