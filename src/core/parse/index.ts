/** Statement parser orchestrator: PageText[] -> rows + metadata. Pure; runs in a Worker or Node. */
import { addDays, detectDateOrder, parseDateParts, isoToDays, resolveWithPeriod, toIso, validMD, type DateOrder, type DateParts } from '../dates';
import { buildLines, lineText, type PageText } from '../geometry';
import { currencyExponent } from '../money';
import { newId, type AccountType, type BalanceSource, type ColumnDef, type Row, type RowFlag, type TableRegion } from '../model';
import { detectNumberFormat, parseAmountToken, type AmountToken, type NumberFormat } from '../numbers';
import { balanceStep, reconcile } from '../reconcile';
import { assembleRows, assignLine, collectRegions, fitColumns, type RawRow, type Region } from './table';
import { detectAccountType, detectCurrency, findBalanceCandidates, findLast4, findPeriod, signedBalance, type BalanceCandidate, type Period } from './summary';

export class ParseError extends Error {
  constructor(public code: 'no-text-layer' | 'no-transactions', message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface ParseOptions {
  dateOrder?: DateOrder;
  numberFormat?: NumberFormat;
  accountType?: AccountType;
  currency?: string;
  /** Explicit column zones (user-dragged anchors); replaces fitted zones in every table region. */
  columnOverride?: ColumnDef[];
  currentYear?: number;
}

export interface ParseOutput {
  accountType: AccountType;
  accountLast4?: string;
  currency: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalanceMinor: number | null;
  closingBalanceMinor: number | null;
  balanceSource: BalanceSource;
  rows: Row[];
  tables: TableRegion[];
  warnings: string[];
  assumptions: string[];
  pagesWithRows: number[];
}

const NUMERIC_LIKE = /^[-\u2212(]?\s*(?:USD|EUR|GBP|INR|Rs\.?|[$€£₹])?\s*[\d.,' ]+\s*[-\u2212)]?\s*(?:CR|DR|Cr|Dr)?$/;

function canonicalAmount(acct: AccountType, r: RawRow): number | null {
  const sign = (t: AmountToken, role: 'debit' | 'credit'): number => {
    const base = role === 'debit' ? -t.abs : t.abs;
    return t.dir === 'neg' || (role === 'debit' ? t.dir === 'cr' : t.dir === 'dr') ? -base : base;
  };
  if (r.debit || r.credit) return (r.debit ? sign(r.debit, 'debit') : 0) + (r.credit ? sign(r.credit, 'credit') : 0);
  const t = r.amount;
  if (!t) return null;
  if (t.dir === 'cr') return t.abs;
  if (t.dir === 'dr') return -t.abs;
  const printed = t.dir === 'neg' ? -t.abs : t.abs;
  return acct === 'bank' ? printed : -printed;
}

/** Assign years to year-less dates: period first, otherwise sequence with Dec/Jan rollover. */
function assignYears(raws: { p: DateParts | null }[], period: Period | undefined, fallbackYear: number): (string | null)[] {
  const out: (string | null)[] = raws.map(() => null);
  const missing: number[] = [];
  raws.forEach((r, i) => {
    const p = r.p;
    if (!p) return;
    if (p.y !== undefined) out[i] = validMD(p.y, p.m, p.d) ? toIso(p.y, p.m, p.d) : null;
    else if (period) out[i] = resolveWithPeriod(p, period.start, period.end);
    else missing.push(i);
  });
  if (missing.length) {
    const months = missing.map((i) => raws[i]!.p!.m);
    let dropAt = -1;
    let riseAt = -1;
    for (let k = 1; k < months.length; k++) {
      if (months[k - 1]! - months[k]! >= 6 && dropAt < 0) dropAt = k;
      if (months[k]! - months[k - 1]! >= 6 && riseAt < 0) riseAt = k;
    }
    missing.forEach((i, k) => {
      const p = raws[i]!.p!;
      let y = fallbackYear;
      if (dropAt >= 0 && k < dropAt) y = fallbackYear - 1; // ascending, Dec .. Jan
      else if (riseAt >= 0 && k >= riseAt) y = fallbackYear - 1; // descending, Jan .. Dec
      out[i] = validMD(y, p.m, p.d) ? toIso(y, p.m, p.d) : validMD(fallbackYear, p.m, p.d) ? toIso(fallbackYear, p.m, p.d) : null;
    });
  }
  return out;
}

export function parseStatement(pages: PageText[], opts: ParseOptions = {}): ParseOutput {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const itemCount = pages.reduce((n, p) => n + p.items.filter((i) => i.str.trim()).length, 0);
  if (itemCount < 12) throw new ParseError('no-text-layer', 'This PDF has no readable text layer (it looks like a scan or an image). Offline OCR is not available in this version.');

  const pageLines = pages.map((p) => ({ page: p.page, width: p.width, lines: buildLines(p) }));
  const allLines = pageLines.flatMap((p) => p.lines);
  const fullText = allLines.map(lineText).join('\n');

  const currency = opts.currency ?? detectCurrency(fullText) ?? 'USD';
  const exp = currencyExponent(currency);
  const numericSegs = allLines.flatMap((l) => l.segs.map((s) => s.text)).filter((t) => NUMERIC_LIKE.test(t) && /\d/.test(t));
  const fmt = opts.numberFormat ?? detectNumberFormat(numericSegs);
  if (fmt === 'eu') assumptions.push('European number format (1.234,56) detected.');
  const accountType = opts.accountType ?? detectAccountType(fullText);
  const ctx = { fmt, exp };

  // Regions and column zones
  const regions = collectRegions(pageLines);
  const widthOf = (page: number) => pages.find((p) => p.page === page)?.width ?? 612;
  const roots = regions.filter((r) => r.root === r);
  for (const root of roots) {
    const lines = regions.filter((r) => r.root === root).flatMap((r) => r.lines);
    root.columns = opts.columnOverride ?? fitColumns(root, lines, widthOf(root.page), ctx);
  }
  for (const r of regions) r.columns = r.root.columns;
  if (!roots.length) warnings.push('No transaction table was detected. Use the column guides to define one, or add rows manually.');

  // Date order
  const dateTokens: string[] = [];
  for (const r of regions) {
    for (const l of r.lines) {
      const c = assignLine(l, r.columns, ctx).cells;
      for (const s of [...(c.date ?? []), ...(c.postDate ?? [])]) dateTokens.push(s.text);
    }
  }
  let order: DateOrder;
  if (opts.dateOrder) order = opts.dateOrder;
  else {
    const hint: DateOrder = fmt === 'eu' || dateTokens.some((t) => /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(t)) ? 'dmy' : 'mdy';
    const v = detectDateOrder(dateTokens, hint);
    order = v.order;
    if (!v.confident) {
      // use chronology: the order producing fewer out-of-sequence steps wins
      const viol = (o: DateOrder) => {
        const days: number[] = [];
        for (const t of dateTokens) {
          const p = parseDateParts(t, o);
          if (p) days.push(isoToDays(toIso(p.y ?? 2000, p.m, p.d)));
        }
        let asc = 0;
        let desc = 0;
        for (let i = 1; i < days.length; i++) {
          if (days[i]! < days[i - 1]!) asc++;
          if (days[i]! > days[i - 1]!) desc++;
        }
        return Math.min(asc, desc);
      };
      const a = viol('mdy');
      const b = viol('dmy');
      if (a !== b) order = a < b ? 'mdy' : 'dmy';
      else assumptions.push(`Dates are ambiguous (DD/MM vs MM/DD); assumed ${order === 'mdy' ? 'MM/DD' : 'DD/MM'}. Check the first rows.`);
    }
  }

  const period = findPeriod(allLines, order);
  const last4 = findLast4(allLines);

  // Assemble raw rows
  const raws: RawRow[] = [];
  const checkpoints: BalanceCandidate[] = [];
  for (const r of regions) {
    const res = assembleRows(r, r.columns, ctx, order);
    raws.push(...res.rows);
    for (const c of res.checkpoints) {
      checkpoints.push({ kind: c.kind, amountMinor: signedBalance(c.amount, accountType), page: c.page, y: c.y, from: 'checkpoint' });
    }
  }

  const yearMatches = [...fullText.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => +m[0]);
  const fallbackYear = period ? +period.end.slice(0, 4) : yearMatches.length ? Math.max(...yearMatches) : (opts.currentYear ?? new Date().getFullYear());
  if (!period && raws.some((r) => r.dateParts && r.dateParts.y === undefined)) {
    assumptions.push(`No statement period found; year ${fallbackYear} assumed for dates without a year.`);
  }
  const isos = assignYears(raws.map((r) => ({ p: r.dateParts })), period, fallbackYear);
  const postIsos = assignYears(raws.map((r) => ({ p: r.postParts })), period, fallbackYear);

  const rows: Row[] = [];
  let noAmount = 0;
  let badDate = 0;
  raws.forEach((raw, i) => {
    const amt = canonicalAmount(accountType, raw);
    const date = isos[i];
    if (amt === null) {
      noAmount++;
      return;
    }
    if (!date) {
      badDate++;
      return;
    }
    const desc = raw.descParts.join(' ').replace(/\s+/g, ' ').trim();
    const flags: RowFlag[] = raw.inheritedDate ? ['date-inherited'] : [];
    rows.push({
      id: newId(),
      date,
      ...(postIsos[i] ? { postDate: postIsos[i] as string } : {}),
      description: desc,
      sourceDescription: desc,
      amountMinor: amt,
      balanceMinor: raw.balance ? signedBalance(raw.balance, accountType) : null,
      ...(raw.refParts.length ? { memo: raw.refParts.join(' ') } : {}),
      source: raw.boxes,
      ...(flags.length ? { flags } : {}),
    });
  });
  if (noAmount) warnings.push(`${noAmount} dated line(s) had no amount and were skipped.`);
  if (badDate) warnings.push(`${badDate} line(s) had an unreadable date and were skipped.`);
  if (roots.length && !rows.length) warnings.push('A table header was found but no transaction rows could be read.');

  // Balances
  const cands = [...findBalanceCandidates(allLines, accountType, fmt, exp), ...checkpoints];
  const prio = (c: BalanceCandidate) => (c.from === 'summary' ? 0 : 1);
  const opens = cands.filter((c) => c.kind === 'open').sort((a, b) => prio(a) - prio(b) || a.page - b.page || a.y - b.y);
  const closes = cands
    .filter((c) => c.kind === 'close')
    .sort((a, b) => prio(a) - prio(b) || (a.from === 'summary' ? a.page - b.page || a.y - b.y : b.page - a.page || b.y - a.y));
  const uniq = (xs: BalanceCandidate[]) => [...new Map(xs.map((x) => [x.amountMinor, x])).values()].slice(0, 4);
  const O = uniq(opens);
  const C = uniq(closes);
  let opening: number | null = O[0]?.amountMinor ?? null;
  let closing: number | null = C[0]?.amountMinor ?? null;
  let source: BalanceSource = opening !== null || closing !== null ? 'label' : 'none';
  const check = (o: number | null, c: number | null) => reconcile({ accountType, openingBalanceMinor: o, closingBalanceMinor: c, rows }).status;
  if (rows.length && O.length && C.length && check(opening, closing) !== 'reconciled') {
    outer: for (const o of O) for (const c of C) {
      if (check(o.amountMinor, c.amountMinor) === 'reconciled') {
        opening = o.amountMinor;
        closing = c.amountMinor;
        source = 'label-search';
        break outer;
      }
    }
  }
  // Derive missing endpoints from printed running balances
  if (rows.length) {
    if (opening === null) {
      const k = rows.findIndex((r) => r.balanceMinor != null);
      if (k >= 0) {
        let s = 0;
        for (let i = 0; i <= k; i++) s += balanceStep(accountType, rows[i]!.amountMinor);
        opening = (rows[k]!.balanceMinor as number) - s;
        source = 'running-balance';
        assumptions.push('Opening balance derived from the first printed running balance.');
      }
    }
    if (closing === null) {
      let k = -1;
      rows.forEach((r, i) => { if (r.balanceMinor != null) k = i; });
      if (k >= 0) {
        let s = 0;
        for (let i = k + 1; i < rows.length; i++) s += balanceStep(accountType, rows[i]!.amountMinor);
        closing = (rows[k]!.balanceMinor as number) + s;
        source = 'running-balance';
        assumptions.push('Closing balance derived from the last printed running balance.');
      }
    }
  }
  // Sign convention check: some statements print charges as negatives. If (and only if) flipping
  // every sign makes the rows reconcile with the printed balances, flip and say so.
  const singleAmountCol = roots.length > 0 && roots.every((r) => r.columns.some((c) => c.role === 'amount') && !r.columns.some((c) => c.role === 'debit' || c.role === 'credit'));
  if (rows.length && singleAmountCol && (source === 'label' || source === 'label-search') && opening !== null && closing !== null) {
    const now = check(opening, closing);
    if (now === 'discrepancy') {
      const flipped = rows.map((r) => ({ amountMinor: -r.amountMinor, balanceMinor: r.balanceMinor }));
      if (reconcile({ accountType, openingBalanceMinor: opening, closingBalanceMinor: closing, rows: flipped }).status === 'reconciled') {
        for (const r of rows) r.amountMinor = -r.amountMinor;
        assumptions.push('All amount signs were flipped: the printed sign convention is the opposite of the assumed one, and only the flipped signs reconcile with the printed balances.');
      }
    }
  }
  if (rows.length && (opening === null || closing === null)) warnings.push('Opening and/or closing balance not found: enter them manually to reconcile.');
  if (source === 'label-search') assumptions.push('The printed opening/closing pair was chosen because it is the one that reconciles with the extracted rows.');

  const tables: TableRegion[] = roots.map((r) => ({ page: r.page, headerY: r.headerY ?? 0, columns: r.columns }));
  const pagesWithRows = [...new Set(rows.flatMap((r) => [r.source?.date?.page, r.source?.amount?.page, ...(r.source?.description ?? []).map((b) => b.page)]).filter((p): p is number => !!p))].sort((a, b) => a - b);
  void addDays;
  return {
    accountType,
    ...(last4 ? { accountLast4: last4 } : {}),
    currency,
    ...(period ? { periodStart: period.start, periodEnd: period.end } : {}),
    openingBalanceMinor: opening,
    closingBalanceMinor: closing,
    balanceSource: source,
    rows,
    tables,
    warnings,
    assumptions,
    pagesWithRows,
  };
}

export type { Region };
export { parseAmountToken };
