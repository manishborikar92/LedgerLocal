import type { Row, Statement } from '../model';

/** One exportable row with the context an exporter needs. */
export interface ExportRow extends Row {
  /** short label of the statement the row came from (S1, S2, ...) */
  stmtLabel?: string;
}

export const sortChronological = <T extends { date: string }>(rows: readonly T[]): T[] =>
  rows.map((r, i) => [r, i] as const).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[1] - b[1]).map(([r]) => r);

export const accountLabel = (s: Pick<Statement, 'accountType' | 'accountLast4'>): string =>
  `${s.accountType === 'creditCard' ? 'Card' : 'Account'} ${s.accountLast4 ? '…' + s.accountLast4 : '(unknown)'}`;

/** Make a safe file stem from a statement name. */
export const fileStem = (name: string): string => name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'statement';
