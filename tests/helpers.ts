import { newId, type Row, type Statement } from '@/core/model';

export function row(date: string, desc: string, amountMinor: number, balanceMinor: number | null = null, extra: Partial<Row> = {}): Row {
  return { id: newId(), date, description: desc, sourceDescription: desc, amountMinor, balanceMinor, ...extra };
}
export function statement(rows: Row[], o: Partial<Statement> = {}): Statement {
  return {
    id: newId(), fileName: 'test.pdf', fileSha256: 'abc', pageCount: 1, accountType: 'bank', accountLast4: '1234', currency: 'USD',
    periodStart: '2025-03-01', periodEnd: '2025-03-31', openingBalanceMinor: 100000, closingBalanceMinor: 100000 + rows.reduce((s, r) => s + r.amountMinor, 0),
    balanceSource: 'label', rows, tables: [], warnings: [], assumptions: [], pagesWithRows: [1], createdAt: '2025-04-01T00:00:00.000Z', ...o,
  };
}
