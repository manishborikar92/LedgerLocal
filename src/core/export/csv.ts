import { formatDate } from '../dates';
import { currencyExponent, minorToPlain } from '../money';
import type { ExportSettings, Statement } from '../model';
import { accountLabel, sortChronological, type ExportRow } from './shared';

const TITLES: Record<string, string> = {
  date: 'Date', postDate: 'Post Date', description: 'Description', payee: 'Payee', category: 'Category',
  amount: 'Amount', debit: 'Debit', credit: 'Credit', balance: 'Balance', account: 'Account', page: 'Source Page', fitid: 'FITID',
};

/** Neutralise spreadsheet formula injection in text cells (=, +, -, @, tab, CR at the start). */
export function guardText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
export function csvCell(v: string, delimiter: string): string {
  return v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface CsvInput {
  statement: Pick<Statement, 'accountType' | 'accountLast4' | 'currency'>;
  rows: readonly ExportRow[];
  fitids?: ReadonlyMap<string, string>;
}

export function buildCsv(input: CsvInput, s: ExportSettings): string {
  const exp = currencyExponent(input.statement.currency);
  const num = (n: number) => minorToPlain(n, exp).replace('.', s.decimal);
  const cols: string[] = s.columns.flatMap((c) => (c === 'amount' && s.amountStyle === 'debitCredit' ? ['debit', 'credit'] : [c]));
  const header = cols.map((c) => TITLES[c] ?? c);
  const lines = [header.map((h) => csvCell(h, s.delimiter)).join(s.delimiter)];
  for (const r of sortChronological(input.rows)) {
    const cells = cols.map((c) => {
      switch (c) {
        case 'date': return formatDate(r.date, s.dateFormat);
        case 'postDate': return r.postDate ? formatDate(r.postDate, s.dateFormat) : '';
        case 'description': return guardText(r.description);
        case 'payee': return guardText(r.payee ?? '');
        case 'category': return guardText(r.category ?? '');
        case 'amount': return num(r.amountMinor);
        case 'debit': return r.amountMinor < 0 ? num(-r.amountMinor) : '';
        case 'credit': return r.amountMinor > 0 ? num(r.amountMinor) : '';
        case 'balance': return r.balanceMinor == null ? '' : num(r.balanceMinor);
        case 'account': return accountLabel(input.statement);
        case 'page': return String(r.source?.date?.page ?? r.source?.amount?.page ?? '');
        case 'fitid': return input.fitids?.get(r.id) ?? '';
        default: return '';
      }
    });
    lines.push(cells.map((x) => csvCell(x, s.delimiter)).join(s.delimiter));
  }
  return (s.bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}
