/**
 * Text geometry: raw positioned text items -> lines -> segments (cells).
 * Coordinates are PDF points with the origin at the TOP-LEFT of the page.
 */

export interface TextItem {
  str: string;
  x: number;
  /** top of the glyph box */
  y: number;
  w: number;
  h: number;
}
export interface PageText {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface Seg {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  page: number;
}
export interface Line {
  page: number;
  /** vertical centre */
  cy: number;
  top: number;
  bottom: number;
  h: number;
  segs: Seg[];
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * Algorithm (docs/DESIGN.md §4.1):
 *  1. drop blank / zero-height spacer items (pdf.js emits them between runs);
 *  2. cluster items into lines by vertical centre within 0.5 x the median text height;
 *  3. within a line, sort by x and merge items whose gap is < 0.45 x text height into one
 *     segment (a "cell"); larger gaps start a new segment.
 */
export function buildLines(page: PageText): Line[] {
  const items = page.items.filter((i) => i.str.trim() !== '' && i.h > 0 && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (!items.length) return [];
  const medH = median(items.map((i) => i.h)) || 10;
  const tol = Math.max(1.5, medH * 0.5);
  const sorted = [...items].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const groups: { cy: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const cy = it.y + it.h / 2;
    const g = groups[groups.length - 1];
    if (g && Math.abs(cy - g.cy) <= tol) {
      g.items.push(it);
      g.cy = g.items.reduce((s, i) => s + i.y + i.h / 2, 0) / g.items.length;
    } else groups.push({ cy, items: [it] });
  }
  const lines: Line[] = [];
  for (const g of groups) {
    const row = g.items.sort((a, b) => a.x - b.x);
    const segs: Seg[] = [];
    for (const it of row) {
      const prev = segs[segs.length - 1];
      const gap = prev ? it.x - prev.x1 : Infinity;
      const h = Math.max(it.h, 1);
      if (prev && gap < 0.45 * h) {
        const needSpace = gap > 0.12 * h && !/\s$/.test(prev.text) && !/^\s/.test(it.str);
        prev.text += (needSpace ? ' ' : '') + it.str.replace(/^\s+/, (m) => (prev.text.endsWith(' ') ? '' : m));
        prev.x1 = Math.max(prev.x1, it.x + it.w);
        prev.top = Math.min(prev.top, it.y);
        prev.bottom = Math.max(prev.bottom, it.y + it.h);
      } else {
        segs.push({ text: it.str, x0: it.x, x1: it.x + it.w, top: it.y, bottom: it.y + it.h, page: page.page });
      }
    }
    for (const s of segs) s.text = s.text.replace(/\s+/g, ' ').trim();
    const top = Math.min(...segs.map((s) => s.top));
    const bottom = Math.max(...segs.map((s) => s.bottom));
    lines.push({ page: page.page, cy: g.cy, top, bottom, h: median(row.map((r) => r.h)), segs: segs.filter((s) => s.text) });
  }
  return lines.filter((l) => l.segs.length);
}

export const lineText = (l: Line): string => l.segs.map((s) => s.text).join(' ');
export const segCx = (s: Seg): number => (s.x0 + s.x1) / 2;
