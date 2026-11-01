/**
 * Amount-token parsing. Recognises US (1,234.56), Indian lakh grouping (1,23,456.78),
 * European (1.234,56), Swiss/space groupings, currency symbols, parentheses negatives,
 * leading/trailing minus, and CR/DR suffixes. See docs/DESIGN.md §4.
 */
import { digitsToMinor } from './money';

export type NumberFormat = 'us' | 'eu';
export type Direction = 'neg' | 'pos' | 'cr' | 'dr';

export interface AmountToken {
  /** Absolute value in minor units. */
  abs: number;
  /** How the sign was expressed on the page. */
  dir: Direction;
  currency?: string;
  raw: string;
}

const CUR = '(?:USD|EUR|GBP|INR|CAD|AUD|CHF|JPY|Rs\\.?|[$€£¥₹])';
const MINUS = '[-\\u2212\\u2013]';

function intPattern(fmt: NumberFormat): string {
  return fmt === 'us'
    ? "(\\d{1,3}(?:[,'\\u00a0\\u202f ]\\d{2,3})+|\\d+)"
    : "(\\d{1,3}(?:[.'\\u00a0\\u202f ]\\d{3})+|\\d+)";
}

const cache = new Map<string, RegExp>();
function amountRegex(fmt: NumberFormat, exp: number, requireDecimals: boolean): RegExp {
  const key = `${fmt}|${exp}|${requireDecimals}`;
  let re = cache.get(key);
  if (!re) {
    const dec = fmt === 'us' ? '\\.' : ',';
    const frac = exp === 0 ? '' : requireDecimals ? `${dec}(\\d{${exp}})` : `(?:${dec}(\\d{${exp}}))?`;
    re = new RegExp(
      `^(\\()?\\s*(${MINUS})?\\s*(${CUR})?\\s*(${MINUS})?\\s*${intPattern(fmt)}${frac}\\s*(${MINUS}|\\+)?\\s*(\\))?\\s*(CR|DR|Cr|Dr|cr|dr)?\\.?$`,
    );
    cache.set(key, re);
  }
  return re;
}

function currencyOf(sym: string | undefined): string | undefined {
  if (!sym) return undefined;
  const s = sym.replace('.', '');
  return ({ $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', Rs: 'INR' } as Record<string, string>)[s] ?? s.toUpperCase();
}

export interface ParseAmountOptions {
  fmt?: NumberFormat;
  exp?: number;
  /** Require the decimal part (default true when exp > 0) so reference numbers are not mistaken for amounts. */
  requireDecimals?: boolean;
}

export function parseAmountToken(rawIn: string, o: ParseAmountOptions = {}): AmountToken | null {
  const fmt = o.fmt ?? 'us';
  const exp = o.exp ?? 2;
  const raw = rawIn.trim().replace(/\s+/g, ' ');
  if (!raw || raw.length > 28 || !/\d/.test(raw)) return null;
  const m = amountRegex(fmt, exp, o.requireDecimals ?? exp > 0).exec(raw);
  if (!m) return null;
  const [, open, lead1, cur, lead2, intRaw, fracRaw, trail, close, suffix] = m as unknown as (string | undefined)[];
  if (!!open !== !!close) return null;
  const intDigits = (intRaw ?? '').replace(/[^\d]/g, '');
  const abs = digitsToMinor(intDigits, fracRaw ?? '', exp);
  let dir: Direction = 'pos';
  if (open || lead1 || lead2 || (trail && trail !== '+')) dir = 'neg';
  const sfx = suffix?.toUpperCase();
  if (sfx === 'CR') dir = 'cr';
  else if (sfx === 'DR') dir = 'dr';
  return { abs, dir, currency: currencyOf(cur), raw };
}

export function looksLikeAmount(s: string, fmt: NumberFormat = 'us', exp = 2): boolean {
  return parseAmountToken(s, { fmt, exp }) !== null;
}

/**
 * Decide the document's number format from many tokens. Unambiguous evidence only:
 * "1,234.56" / "12.50" => us; "1.234,56" / "12,50" => eu. Ties default to "us".
 */
export function detectNumberFormat(tokens: readonly string[]): NumberFormat {
  let us = 0;
  let eu = 0;
  const tail = '\\s*(?:CR|DR|Cr|Dr|-|\\)|[A-Z]{3})?$';
  const usRe = new RegExp(`\\d[.]\\d{2}${tail}`);
  const euRe = new RegExp(`\\d,\\d{2}${tail}`);
  for (const t of tokens) {
    const s = t.trim();
    const isUs = usRe.test(s);
    const isEu = euRe.test(s);
    if (isUs && !isEu) us++;
    else if (isEu && !isUs) eu++;
  }
  return eu > us ? 'eu' : 'us';
}
