/** Statement-level metadata: account type, last-4, period, currency and printed balances. */
import { findDatesInText, isoToDays, resolveWithPeriod, toIso, type DateOrder, type DateParts } from '../dates';
import { lineText, segCx, type Line } from '../geometry';
import type { AccountType } from '../model';
import { parseAmountToken, type AmountToken, type NumberFormat } from '../numbers';

export function detectCurrency(text: string): string | undefined {
  const iso = /\b(USD|EUR|GBP|INR|CAD|AUD|CHF|JPY|NZD|SGD|AED|ZAR)\b/.exec(text);
  if (iso) return iso[1];
  const counts: Record<string, number> = { USD: 0, EUR: 0, GBP: 0, INR: 0, JPY: 0 };
  for (const [sym, cur] of [['$', 'USD'], ['€', 'EUR'], ['£', 'GBP'], ['₹', 'INR'], ['Rs.', 'INR'], ['¥', 'JPY']] as const) {
    counts[cur]! += text.split(sym).length - 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : undefined;
}

const CC_STRONG = [/credit card/i, /minimum payment/i, /payment due/i, /credit limit/i, /available credit/i, /cash advance/i, /annual percentage rate|\bapr\b/i, /finance charge|interest charged/i, /rewards/i];
const CC_WEAK = [/new balance/i, /previous balance/i, /purchases/i, /\bcharges\b/i];
const BANK_STRONG = [/checking/i, /savings/i, /routing/i, /overdraft/i, /withdrawals?/i, /deposits?/i, /\batm\b/i, /direct deposit/i];
const BANK_WEAK = [/beginning balance/i, /ending balance/i, /opening balance/i, /closing balance/i, /debit card/i];

export function detectAccountType(text: string): AccountType {
  const score = (strong: RegExp[], weak: RegExp[]) => strong.filter((r) => r.test(text)).length * 2 + weak.filter((r) => r.test(text)).length;
  return score(CC_STRONG, CC_WEAK) > score(BANK_STRONG, BANK_WEAK) ? 'creditCard' : 'bank';
}

export function findLast4(lines: Line[]): string | undefined {
  for (const l of lines) {
    const t = lineText(l);
    const m = /(?:account|acct|a\/c|card)(?:\s*(?:number|no\.?|#))?\s*(?:ending\s*(?:in)?|:|#)?\s*[:#]?\s*([Xx*•\-\d ]*\d{4})\b/i.exec(t);
    if (m) {
      const digits = m[1]!.replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
  }
  return undefined;
}

export interface Period {
  start: string;
  end: string;
}

function partsToIso(p: DateParts, fallbackY: number): string {
  return toIso(p.y ?? fallbackY, p.m, p.d);
}

export function findPeriod(lines: Line[], order: DateOrder): Period | undefined {
  for (const l of lines) {
    const t = lineText(l);
    if (!/(period|statement date|through|thru|\bto\b|\s[-–]\s)/i.test(t)) continue;
    const ds = findDatesInText(t, order);
    if (ds.length < 2) continue;
    const a = ds[0]!.parts;
    const b = ds[1]!.parts;
    if (b.y === undefined) continue;
    let ay = a.y ?? b.y;
    if (a.y === undefined && a.m > b.m) ay = b.y - 1;
    const start = partsToIso({ ...a, y: ay }, b.y);
    const end = partsToIso(b, b.y);
    const span = isoToDays(end) - isoToDays(start);
    if (span >= 0 && span <= 400) return { start, end };
  }
  return undefined;
}

export function periodResolve(p: DateParts, per: Period | undefined): string | null {
  return per ? resolveWithPeriod(p, per.start, per.end) : null;
}

export interface BalanceCandidate {
  kind: 'open' | 'close';
  /** printed convention (bank: funds; card: owed) */
  amountMinor: number;
  page: number;
  y: number;
  from: 'summary' | 'checkpoint';
}

export function signedBalance(tok: AmountToken, acct: AccountType): number {
  if (acct === 'bank') return tok.dir === 'neg' || tok.dir === 'dr' ? -tok.abs : tok.abs;
  return tok.dir === 'neg' || tok.dir === 'cr' ? -tok.abs : tok.abs;
}

const OPEN_PH = ['opening balance', 'beginning balance', 'previous balance', 'prior balance', 'starting balance', 'balance brought forward', 'brought forward', 'balance forward', 'balance b/f', 'opening bal', 'beginning bal', 'previous statement balance', 'last statement balance'];
const CLOSE_PH = ['closing balance', 'ending balance', 'new balance', 'statement balance', 'balance carried forward', 'carried forward', 'balance c/f', 'closing bal', 'ending bal', 'balance this statement', 'final balance'];

export function labelKind(text: string): 'open' | 'close' | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ').replace(/[:.]+$/, '').trim();
  for (const p of CLOSE_PH) if (t.startsWith(p) && t.length - p.length <= 28) return 'close';
  for (const p of OPEN_PH) if (t.startsWith(p) && t.length - p.length <= 28) return 'open';
  return null;
}

const TRAILING_AMOUNT = /(?:^|\s)([-\u2212(]?\s*(?:USD|EUR|GBP|INR|Rs\.?|[$€£₹])?\s*[-\u2212]?\d[\d,.' ]*[.,]\d{2}\s*[-\u2212)]?\s*(?:CR|DR|Cr|Dr)?)\s*$/;

/** Labelled balances anywhere in the document (summary boxes etc.). */
export function findBalanceCandidates(lines: Line[], acct: AccountType, fmt: NumberFormat, exp: number): BalanceCandidate[] {
  const out: BalanceCandidate[] = [];
  const amt = (s: string) => parseAmountToken(s, { fmt, exp });
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li]!;
    for (let i = 0; i < l.segs.length; i++) {
      const seg = l.segs[i]!;
      const kind = labelKind(seg.text);
      if (!kind) continue;
      let tok: AmountToken | null = null;
      const tail = TRAILING_AMOUNT.exec(seg.text);
      if (tail) tok = amt(tail[1]!);
      for (let j = i + 1; !tok && j < l.segs.length; j++) {
        const s = l.segs[j]!;
        if (labelKind(s.text)) break;
        tok = amt(s.text);
      }
      if (!tok) {
        const next = lines[li + 1];
        if (next && next.page === l.page && next.top - l.bottom <= 2.5 * l.h && !next.segs.some((s) => labelKind(s.text))) {
          const near = next.segs.filter((s) => Math.abs(segCx(s) - segCx(seg)) < 120 && amt(s.text));
          if (near[0]) tok = amt(near[0].text);
        }
      }
      if (tok) out.push({ kind, amountMinor: signedBalance(tok, acct), page: l.page, y: l.cy, from: 'summary' });
    }
  }
  return out;
}
