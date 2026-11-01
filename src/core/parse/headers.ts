import { looksLikeDate } from '../dates';
import type { Line } from '../geometry';
import type { ColumnRole } from '../model';

/** Classify a header cell's text into a column role (order of tests matters). */
export function classifyHeader(text: string): ColumnRole | null {
  const t = text.toLowerCase().replace(/[^a-z0-9/. ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 40) return null;
  if (/\b(post(ed|ing)?|value|val|effective|clearing)\b.*\b(date|dt)\b|^(posted|posting|post)$/.test(t)) return 'postDate';
  if (/\bdate\b|^(txn|tran|trans)\.? ?dt$|^dt$/.test(t)) return 'date';
  if (/\bbalance\b|^bal\.?$/.test(t)) return 'balance';
  if (/\b(debit|debits|withdrawal|withdrawals|withdrawn|paid out|money out|charges?|purchases?|outgoings|dr)\b/.test(t)) return 'debit';
  if (/\b(credit|credits|deposit|deposits|paid in|money in|payments?|receipts?|incomings|cr)\b/.test(t)) return 'credit';
  if (/\b(amount|amt|value)\b/.test(t)) return 'amount';
  if (/\b(description|details?|particulars?|narrat\w*|transaction|transactions|memo|payee|remarks?|activity|merchant)\b/.test(t)) return 'description';
  if (/\b(ref|reference|cheque|check|chq|no)\b/.test(t)) return 'ref';
  return null;
}

export interface HeaderCell {
  role: ColumnRole;
  x0: number;
  x1: number;
}
export interface HeaderInfo {
  cells: HeaderCell[];
  /** has a date column plus at least one amount-type column */
  txCapable: boolean;
}

export function analyzeHeaderLine(line: Line): HeaderInfo | null {
  if (line.segs.some((s) => looksLikeDate(s.text) || /\d[.,]\d{2}\b/.test(s.text))) return null;
  const cells = line.segs.map((s) => ({ role: classifyHeader(s.text), x0: s.x0, x1: s.x1 }));
  // A lone "Posting Date" / "Value Date" column is the date column.
  if (!cells.some((c) => c.role === 'date')) {
    const post = cells.filter((c) => c.role === 'postDate');
    if (post.length === 1) post[0]!.role = 'date';
  }
  const roles = new Set(cells.filter((c) => c.role).map((c) => c.role as ColumnRole));
  const classified = cells.filter((c) => c.role).length;
  const hasDate = roles.has('date');
  const hasAmt = roles.has('amount') || roles.has('debit') || roles.has('credit');
  const ok = classified >= 2 && (hasDate || roles.has('description')) && (hasAmt || roles.has('balance'));
  if (!ok) return null;
  return {
    cells: cells.map((c) => ({ role: c.role ?? 'ignore', x0: c.x0, x1: c.x1 })),
    txCapable: hasDate && hasAmt,
  };
}
