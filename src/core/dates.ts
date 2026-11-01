/**
 * Date parsing and calendar arithmetic without the JS Date object (no time-zone surprises).
 * ISO strings (YYYY-MM-DD) are the canonical representation everywhere in the data model.
 */

export type DateOrder = 'mdy' | 'dmy';
export interface DateParts {
  y?: number;
  m: number;
  d: number;
  /** Numeric date where both leading numbers are <= 12, so the order could not be known from this token alone. */
  ambiguous?: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
export function daysInMonth(y: number | undefined, m: number): number {
  if (m === 2) return y === undefined ? 29 : isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}
export function validMD(y: number | undefined, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
export function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && validMD(+m[1]!, +m[2]!, +m[3]!);
}
function fullYear(s: string): number {
  if (s.length === 4) return +s;
  const yy = +s;
  return yy < 70 ? 2000 + yy : 1900 + yy;
}

/** Days since 1970-01-01 (Howard Hinnant's civil-days algorithm). */
export function isoToDays(iso: string): number {
  const [ys, ms, ds] = iso.split('-');
  let y = +ys!;
  const m = +ms!;
  const d = +ds!;
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function daysToIso(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return toIso(y + (m <= 2 ? 1 : 0), m, d);
}
export const addDays = (iso: string, n: number): string => daysToIso(isoToDays(iso) + n);
export const daysBetween = (a: string, b: string): number => isoToDays(b) - isoToDays(a);

/** Parse one date token. Numeric day/month order is decided by `order`. */
export function parseDateParts(rawIn: string, order: DateOrder = 'mdy'): DateParts | null {
  const raw = rawIn.trim().replace(/\s+/g, ' ').replace(/[,.]+$/, '');
  if (!raw || raw.length > 24) return null;
  let m: RegExpExecArray | null;

  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw))) {
    const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
    return validMD(y, mo, d) ? { y, m: mo, d } : null;
  }
  if ((m = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})$/.exec(raw))) {
    const a = +m[1]!, b = +m[3]!;
    const y = fullYear(m[4]!);
    const [mo, d] = order === 'mdy' ? [a, b] : [b, a];
    if (!validMD(y, mo, d)) return null;
    return { y, m: mo, d, ambiguous: a <= 12 && b <= 12 && a !== b };
  }
  if ((m = /^(\d{1,2})([-/])(\d{1,2})$/.exec(raw))) {
    const a = +m[1]!, b = +m[3]!;
    const [mo, d] = order === 'mdy' ? [a, b] : [b, a];
    if (!validMD(undefined, mo, d)) return null;
    return { m: mo, d, ambiguous: a <= 12 && b <= 12 && a !== b };
  }
  if ((m = /^([A-Za-z]{3,9})\.?[ -](\d{1,2})(?:st|nd|rd|th)?(?:,? ?-?(\d{4}|\d{2}))?$/.exec(raw))) {
    const mo = MONTH_NAMES[m[1]!.toLowerCase()];
    const d = +m[2]!;
    const y = m[3] ? fullYear(m[3]) : undefined;
    if (mo && validMD(y, mo, d)) return y === undefined ? { m: mo, d } : { y, m: mo, d };
    return null;
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]?([A-Za-z]{3,9})\.?(?:[ ,-]+(\d{4}|\d{2}))?$/.exec(raw))) {
    const mo = MONTH_NAMES[m[2]!.toLowerCase()];
    const d = +m[1]!;
    const y = m[3] ? fullYear(m[3]) : undefined;
    if (mo && validMD(y, mo, d)) return y === undefined ? { m: mo, d } : { y, m: mo, d };
    return null;
  }
  return null;
}

export const looksLikeDate = (s: string): boolean => parseDateParts(s, 'mdy') !== null || parseDateParts(s, 'dmy') !== null;

/** Find all dates inside free text (used for statement periods). Positions are returned for ordering. */
export function findDatesInText(text: string, order: DateOrder): { parts: DateParts; index: number; text: string }[] {
  const res: { parts: DateParts; index: number; text: string }[] = [];
  const pats = [
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,
    /\b\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})\b/g,
    /\b[A-Za-z]{3,9}\.? \d{1,2}(?:st|nd|rd|th)?(?:, ?\d{4})?\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)? [A-Za-z]{3,9}\.?(?: \d{4})?\b/g,
  ];
  const taken: [number, number][] = [];
  for (const re of pats) {
    for (const mt of text.matchAll(re)) {
      const idx = mt.index ?? 0;
      const end = idx + mt[0].length;
      if (taken.some(([a, b]) => idx < b && end > a)) continue;
      const parts = parseDateParts(mt[0], order);
      if (parts) {
        res.push({ parts, index: idx, text: mt[0] });
        taken.push([idx, end]);
      }
    }
  }
  return res.sort((a, b) => a.index - b.index);
}

export interface DateOrderVerdict {
  order: DateOrder;
  /** true when the document contained an unambiguous token (e.g. 25/12) or period evidence. */
  confident: boolean;
}

/** Decide DD/MM vs MM/DD from evidence in the document (day > 12 in one position). */
export function detectDateOrder(tokens: readonly string[], hint?: DateOrder): DateOrderVerdict {
  let mdy = 0;
  let dmy = 0;
  for (const t of tokens) {
    const m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](?:\d{4}|\d{2}))?$/.exec(t.trim());
    if (!m) continue;
    const a = +m[1]!, b = +m[2]!;
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy > mdy) return { order: 'dmy', confident: true };
  if (mdy > dmy) return { order: 'mdy', confident: true };
  return { order: hint ?? 'mdy', confident: false };
}

/** Resolve a year-less month/day against a statement period (handles Dec -> Jan rollover). */
export function resolveWithPeriod(p: DateParts, start: string, end: string): string | null {
  if (p.y !== undefined) return validMD(p.y, p.m, p.d) ? toIso(p.y, p.m, p.d) : null;
  const sy = +start.slice(0, 4);
  const ey = +end.slice(0, 4);
  let best: string | null = null;
  let bestDist = Infinity;
  for (let y = sy - 1; y <= ey + 1; y++) {
    if (!validMD(y, p.m, p.d)) continue;
    const iso = toIso(y, p.m, p.d);
    const t = isoToDays(iso);
    const dist = t < isoToDays(start) ? isoToDays(start) - t : t > isoToDays(end) ? t - isoToDays(end) : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = iso;
    }
  }
  return best;
}

export type ExportDateFormat = 'iso' | 'mdy' | 'dmy' | 'dd-mon-yyyy';
export function formatDate(iso: string, fmt: ExportDateFormat): string {
  const [y, m, d] = iso.split('-');
  switch (fmt) {
    case 'iso': return iso;
    case 'mdy': return `${m}/${d}/${y}`;
    case 'dmy': return `${d}/${m}/${y}`;
    case 'dd-mon-yyyy': return `${d}-${MONTH_ABBR[+m! - 1]}-${y}`;
  }
}
