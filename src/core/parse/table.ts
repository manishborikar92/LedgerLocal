/**
 * Table detection and row assembly. Algorithm: docs/DESIGN.md §4.2
 *  1. find header lines (>=2 recognised column titles incl. a date and an amount-type column);
 *  2. a header opens a region that runs until an end marker, the next header, or (if the
 *     next page has no header) it carries over to the next page;
 *  3. column zones come from the header, then are fitted to the data (alignment-agnostic);
 *  4. a line whose date cell parses as a date starts a row; later date-less lines are
 *     description continuations (tight vertical spacing) or amount-completions.
 */
import { parseDateParts, looksLikeDate, type DateOrder, type DateParts } from '../dates';
import { lineText, segCx, type Line, type Seg } from '../geometry';
import type { BBox, CellRefs, ColumnDef, ColumnRole } from '../model';
import { parseAmountToken, type AmountToken, type NumberFormat } from '../numbers';
import { analyzeHeaderLine, type HeaderCell } from './headers';

const NUMERIC: ColumnRole[] = ['debit', 'credit', 'amount', 'balance'];
const isNumericRole = (r: ColumnRole): boolean => NUMERIC.includes(r);

export const END_RE =
  /^(total(s)?\b|sub-?total|ending balance|closing balance|new balance|daily (ending )?balance|balance summary|summary of|account summary|interest charge|fees? (and|&) charges|checks? (cleared|paid)|important (information|messages?)|how to (reach|contact)|your (rewards|points)|year-to-date|totals? for)/i;
export const NOISE_RE =
  /^(page\s+\d+\s*(of|\/)\s*\d+|\d+\s+of\s+\d+$|continued\b|\(?continued\)?$|\.{2,}\s*continued|statement (continued|period)|member fdic|customer service)/i;
export const CHECKPOINT_RE =
  /^(opening balance|beginning balance|previous balance|prior balance|starting balance|balance (brought|carried) (forward|fwd)|balance (forward|b\/f|c\/f|b\.f\.?|c\.f\.?)|brought forward|carried forward|closing balance|ending balance|new balance|statement balance|opening bal\b|closing bal\b|beginning bal\b|ending bal\b)/i;

export interface Region {
  page: number;
  headerY: number | null;
  /** header cells (sorted by x) — only meaningful on the root region */
  hdr: HeaderCell[];
  lines: Line[];
  /** continuation pages point at the region that owns the columns */
  root: Region;
  columns: ColumnDef[];
}

/** Step 1-2: find header lines and slice lines into regions. */
export function collectRegions(pages: { page: number; width: number; lines: Line[] }[]): Region[] {
  const regions: Region[] = [];
  let active: Region | null = null;
  for (const p of pages) {
    if (active) {
      const cont: Region = { page: p.page, headerY: null, hdr: [], lines: [], root: active.root, columns: [] };
      regions.push(cont);
      active = cont;
    }
    for (const line of p.lines) {
      const h = analyzeHeaderLine(line);
      if (h) {
        if (h.txCapable) {
          const r: Region = { page: p.page, headerY: line.cy, hdr: [...h.cells].sort((a, b) => a.x0 - b.x0), lines: [], root: null as unknown as Region, columns: [] };
          r.root = r;
          regions.push(r);
          active = r;
        } else active = null;
        continue;
      }
      if (!active) continue;
      const txt = lineText(line);
      const isEnd = (END_RE.test(txt) && !CHECKPOINT_RE.test(txt)) || /^(totals?\b|sub-?total)/i.test(txt);
      if (isEnd) {
        active = null;
        continue;
      }
      active.lines.push(line);
      if (/^(ending balance|closing balance|new balance|statement balance)/i.test(txt)) active = null;
    }
  }
  return regions;
}

export function initialZones(cellsIn: HeaderCell[], pageWidth: number): ColumnDef[] {
  const cells = [...cellsIn].sort((a, b) => a.x0 - b.x0);
  return cells.map((c, i) => {
    const prev = cells[i - 1];
    const next = cells[i + 1];
    return {
      role: c.role,
      x0: prev ? (prev.x1 + c.x0) / 2 : 0,
      x1: next ? (c.x1 + next.x0) / 2 : pageWidth,
    };
  });
}

export interface Ctx {
  fmt: NumberFormat;
  exp: number;
}

const parseNum = (s: Seg, ctx: Ctx): AmountToken | null => parseAmountToken(s.text, { fmt: ctx.fmt, exp: ctx.exp });

/**
 * Step 3: fit zones to data. Numeric segments are matched to numeric header columns by the
 * smallest of (right-edge, left-edge, centre) distance, so left-, right- and centre-aligned
 * headers all work. Each column's span grows to cover its data; boundaries are gutter midpoints.
 */
export function fitColumns(root: Region, regionLines: Line[], pageWidth: number, ctx: Ctx): ColumnDef[] {
  const init = root.hdr;
  if (!init.length) return [];
  const spans = init.map((c) => ({ role: c.role, s0: c.x0, s1: c.x1, cx: (c.x0 + c.x1) / 2, hx0: c.x0, hx1: c.x1 }));
  const dataLines = regionLines.filter((l) => l.segs.some((s) => looksLikeDate(s.text)));
  const numericCols = spans.map((c, i) => ({ c, i })).filter(({ c }) => isNumericRole(c.role));
  const textCols = spans.map((c, i) => ({ c, i })).filter(({ c }) => !isNumericRole(c.role));
  const grow = (i: number, x0: number, x1: number) => {
    const c = spans[i]!;
    c.s0 = Math.min(c.s0, x0);
    c.s1 = Math.max(c.s1, x1);
  };
  for (const l of dataLines) {
    for (const s of l.segs) {
      if (parseNum(s, ctx) && numericCols.length) {
        let best = -1;
        let bd = Infinity;
        for (const { c, i } of numericCols) {
          const d = Math.min(Math.abs(s.x1 - c.hx1), Math.abs(s.x0 - c.hx0), Math.abs(segCx(s) - c.cx));
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best >= 0) grow(best, s.x0, s.x1);
      } else if (!looksLikeDate(s.text)) {
        // text: left edge decides the column (rightmost column starting at/left of the segment)
        let best = -1;
        for (const { c, i } of textCols) if (c.hx0 <= s.x0 + 2) best = i;
        const t = textCols.find(({ i }) => i === best);
        if (t && t.c.role === 'description') grow(best, s.x0, s.x1);
      }
    }
  }
  // boundaries: gutter midpoints between consecutive spans
  const out: ColumnDef[] = [];
  for (let i = 0; i < spans.length; i++) {
    const c = spans[i]!;
    const prev = spans[i - 1];
    const next = spans[i + 1];
    out.push({
      role: c.role,
      x0: prev ? (Math.min(prev.s1, c.s0) + Math.max(prev.s1, c.s0)) / 2 : 0,
      x1: next ? (Math.min(c.s1, next.s0) + Math.max(c.s1, next.s0)) / 2 : pageWidth,
    });
  }
  return out;
}

export interface CellValue {
  seg: Seg;
  text: string;
}
export interface ParsedLine {
  line: Line;
  cells: Partial<Record<ColumnRole, Seg[]>>;
}

export function assignLine(line: Line, cols: ColumnDef[], ctx: Ctx): ParsedLine {
  const cells: Partial<Record<ColumnRole, Seg[]>> = {};
  const numCols = cols.filter((c) => isNumericRole(c.role));
  for (const s of line.segs) {
    let col: ColumnDef | undefined;
    if (parseNum(s, ctx) && numCols.length) {
      const cx = segCx(s);
      col = numCols.find((c) => cx >= c.x0 && cx < c.x1);
      if (!col) {
        let bd = Infinity;
        for (const c of numCols) {
          const d = Math.min(Math.abs(cx - c.x0), Math.abs(cx - c.x1));
          if (d < bd) {
            bd = d;
            col = c;
          }
        }
      }
    } else {
      col = cols.find((c) => s.x0 >= c.x0 - 1 && s.x0 < c.x1) ?? cols.find((c) => segCx(s) >= c.x0 && segCx(s) < c.x1);
    }
    if (!col) continue;
    (cells[col.role] ??= []).push(s);
  }
  return { cells, line };
}

export interface RawRow {
  page: number;
  dateParts: DateParts | null;
  postParts: DateParts | null;
  descParts: string[];
  refParts: string[];
  debit?: AmountToken;
  credit?: AmountToken;
  amount?: AmountToken;
  balance?: AmountToken;
  boxes: CellRefs;
  lastLine: Line;
  inheritedDate?: boolean;
}

const toBox = (s: Seg, page: number): BBox => ({ page, x: s.x0, y: s.top, w: Math.max(s.x1 - s.x0, 1), h: Math.max(s.bottom - s.top, 1) });
const joinSegs = (segs: Seg[] | undefined): string => (segs ?? []).map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();

export interface AssembleResult {
  rows: RawRow[];
  checkpoints: { kind: 'open' | 'close'; amount: AmountToken; page: number; y: number }[];
}

export function assembleRows(region: Region, cols: ColumnDef[], ctx: Ctx, order: DateOrder): AssembleResult {
  const rows: RawRow[] = [];
  const checkpoints: AssembleResult['checkpoints'] = [];
  let cur: RawRow | null = null;
  let lastDate: DateParts | null = null;
  const hasDateCol = cols.some((c) => c.role === 'date');
  if (!hasDateCol) return { rows, checkpoints };

  for (const line of region.lines) {
    const pl = assignLine(line, cols, ctx);
    const c = pl.cells;
    const dateText = joinSegs(c.date);
    const dateParts = dateText ? parseDateParts(dateText, order) : null;
    const descText = joinSegs(c.description);
    const nums = {
      debit: c.debit?.length ? parseNum(c.debit[c.debit.length - 1]!, ctx) : null,
      credit: c.credit?.length ? parseNum(c.credit[c.credit.length - 1]!, ctx) : null,
      amount: c.amount?.length ? parseNum(c.amount[c.amount.length - 1]!, ctx) : null,
      balance: c.balance?.length ? parseNum(c.balance[c.balance.length - 1]!, ctx) : null,
    };
    const hasAmt = !!(nums.debit || nums.credit || nums.amount);
    const lt = lineText(line);

    // checkpoint rows (balance brought forward etc.) are not transactions
    const cpText = (descText || lt.replace(dateText, '')).trim();
    if (CHECKPOINT_RE.test(cpText)) {
      const tok = nums.balance ?? nums.amount ?? nums.debit ?? nums.credit;
      if (tok) {
        const kind = /^(opening|beginning|previous|prior|starting|balance (brought|forward|b)|brought)/i.test(cpText) ? 'open' : 'close';
        checkpoints.push({ kind, amount: tok, page: region.page, y: line.cy });
      }
      continue;
    }
    if (NOISE_RE.test(lt)) continue;

    if (dateParts && (descText || hasAmt)) {
      cur = {
        page: line.page,
        dateParts,
        postParts: c.postDate?.length ? parseDateParts(joinSegs(c.postDate), order) : null,
        descParts: descText ? [descText] : [],
        refParts: c.ref?.length ? [joinSegs(c.ref)] : [],
        ...(nums.debit ? { debit: nums.debit } : {}),
        ...(nums.credit ? { credit: nums.credit } : {}),
        ...(nums.amount ? { amount: nums.amount } : {}),
        ...(nums.balance ? { balance: nums.balance } : {}),
        boxes: {
          date: c.date?.[0] ? toBox(c.date[0], line.page) : undefined,
          postDate: c.postDate?.[0] ? toBox(c.postDate[0], line.page) : undefined,
          description: (c.description ?? []).map((s) => toBox(s, line.page)),
          amount: pickAmtSeg(c, nums) ? toBox(pickAmtSeg(c, nums) as Seg, line.page) : undefined,
          balance: c.balance?.length ? toBox(c.balance[c.balance.length - 1]!, line.page) : undefined,
        },
        lastLine: line,
      };
      rows.push(cur);
      lastDate = dateParts;
    } else if (!dateParts && cur) {
      const ref = cur.lastLine;
      const tight = line.top - ref.bottom <= 1.6 * Math.max(line.h, ref.h) && line.page === cur.page;
      const prevHasAmt = !!(cur.debit || cur.credit || cur.amount);
      if (hasAmt && prevHasAmt && descText) {
        // date-grouped layouts: another transaction under the same date
        const inh: RawRow = {
          page: line.page,
          dateParts: lastDate,
          postParts: null,
          descParts: [descText],
          refParts: [],
          ...(nums.debit ? { debit: nums.debit } : {}),
          ...(nums.credit ? { credit: nums.credit } : {}),
          ...(nums.amount ? { amount: nums.amount } : {}),
          ...(nums.balance ? { balance: nums.balance } : {}),
          boxes: {
            description: (c.description ?? []).map((s) => toBox(s, line.page)),
            amount: pickAmtSeg(c, nums) ? toBox(pickAmtSeg(c, nums) as Seg, line.page) : undefined,
            balance: c.balance?.length ? toBox(c.balance[c.balance.length - 1]!, line.page) : undefined,
          },
          lastLine: line,
          inheritedDate: true,
        };
        if (lastDate) {
          rows.push(inh);
          cur = inh;
        }
      } else if (hasAmt && !prevHasAmt && tight) {
        if (nums.debit) cur.debit = nums.debit;
        if (nums.credit) cur.credit = nums.credit;
        if (nums.amount) cur.amount = nums.amount;
        if (nums.balance) cur.balance = nums.balance;
        const as = pickAmtSeg(c, nums);
        if (as) cur.boxes.amount = toBox(as, line.page);
        if (c.balance?.length) cur.boxes.balance = toBox(c.balance[c.balance.length - 1]!, line.page);
        if (descText) {
          cur.descParts.push(descText);
          (cur.boxes.description ??= []).push(...(c.description ?? []).map((s) => toBox(s, line.page)));
        }
        cur.lastLine = line;
      } else if (!hasAmt && descText && tight && !(nums.balance)) {
        cur.descParts.push(descText);
        (cur.boxes.description ??= []).push(...(c.description ?? []).map((s) => toBox(s, line.page)));
        if (c.ref?.length) cur.refParts.push(joinSegs(c.ref));
        cur.lastLine = line;
      }
    }
  }
  return { rows, checkpoints };
}

function pickAmtSeg(c: Partial<Record<ColumnRole, Seg[]>>, n: { debit: AmountToken | null; credit: AmountToken | null; amount: AmountToken | null }): Seg | undefined {
  const pick = (a?: Seg[]) => a?.[a.length - 1];
  return (n.amount && pick(c.amount)) || (n.debit && pick(c.debit)) || (n.credit && pick(c.credit)) || undefined;
}
