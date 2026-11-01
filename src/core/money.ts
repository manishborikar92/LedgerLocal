/**
 * Money helpers. All amounts in LedgerLocal are INTEGER MINOR UNITS (cents, paise, pence).
 * No floating point is ever used to hold or add money; strings are converted by digit
 * arithmetic only.
 */

const EXP0 = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG']);
const EXP3 = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD']);

export function currencyExponent(code: string): 0 | 2 | 3 {
  const c = code.toUpperCase();
  return EXP0.has(c) ? 0 : EXP3.has(c) ? 3 : 2;
}

/** Combine integer digits and fraction digits into minor units. Throws if not a safe integer. */
export function digitsToMinor(intDigits: string, fracDigits: string, exp: number): number {
  if (!/^\d*$/.test(intDigits) || !/^\d*$/.test(fracDigits)) throw new Error('digitsToMinor: non-digit input');
  const frac = (fracDigits + '0'.repeat(exp)).slice(0, exp);
  const s = (intDigits.replace(/^0+(?=\d)/, '') || '0') + frac;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new Error('Amount too large');
  return n;
}

export interface FormatOptions {
  exp?: number;
  thousands?: string;
  decimal?: string;
  /** Always show a "+" for positive values. */
  plus?: boolean;
  /** Use parentheses for negatives instead of "-". */
  parens?: boolean;
}

/** Format minor units as a decimal string using integer arithmetic only. */
export function formatMinor(minor: number, o: FormatOptions = {}): string {
  const exp = o.exp ?? 2;
  const thousands = o.thousands ?? ',';
  const decimal = o.decimal ?? '.';
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const base = 10 ** exp;
  const whole = Math.trunc(abs / base);
  const frac = abs - whole * base;
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const body = exp > 0 ? `${wholeStr}${decimal}${String(frac).padStart(exp, '0')}` : wholeStr;
  if (neg) return o.parens ? `(${body})` : `-${body}`;
  return o.plus && minor > 0 ? `+${body}` : body;
}

/** Plain machine-readable decimal ("-1234.50"): no thousands separators, "." decimal. */
export function minorToPlain(minor: number, exp = 2): string {
  return formatMinor(minor, { exp, thousands: '', decimal: '.' });
}

export function sumMinor(values: readonly number[]): number {
  let t = 0;
  for (const v of values) t += v;
  if (!Number.isSafeInteger(t)) throw new Error('Sum overflow');
  return t;
}

/** Parse a user-typed decimal ("1,234.5", "-12", "(45.00)") into minor units, or null. */
export function parseUserAmount(input: string, exp = 2): number | null {
  const s = input.trim().replace(/[\s$€£₹¥]/g, '');
  const m = /^(\()?([-+\u2212])?(\d[\d,]*)(?:\.(\d*))?(\))?$/.exec(s);
  if (!m || !!m[1] !== !!m[5]) return null;
  const int = (m[3] ?? '').replace(/,/g, '');
  if (!int) return null;
  const frac = m[4] ?? '';
  if (frac.length > exp) return null;
  const abs = digitsToMinor(int, frac, exp);
  return m[1] || m[2] === '-' || m[2] === '\u2212' ? -abs : abs;
}
