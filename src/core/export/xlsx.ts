/**
 * Minimal, dependency-light XLSX writer (SpreadsheetML via fflate zip). Chosen over a general
 * library so the Reconciliation sheet can carry LIVE formulas with cached values, and the bundle
 * stays small (docs/DECISIONS.md D-07). Verified by openpyxl + LibreOffice in the test-suite.
 */
import { zipSync, strToU8 } from 'fflate';
import { isoToDays } from '../dates';
import { currencyExponent, minorToPlain } from '../money';
import type { Statement } from '../model';
import { balanceStep, reconcile } from '../reconcile';
import { accountLabel, sortChronological, type ExportRow } from './shared';

type Cell = { t: 's'; v: string; s?: number } | { t: 'n'; v: string; s?: number } | { t: 'f'; f: string; v: string; vt: 'n' | 'str'; s?: number };
// strip characters that are illegal in XML 1.0 (control characters other than tab/LF/CR)
// eslint-disable-next-line no-control-regex
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i: number): string => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

// style ids (see STYLES below)
const S = { header: 1, money: 2, date: 3, bold: 4, total: 5, ok: 6, bad: 7, title: 8, note: 9 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>
<fonts count="6"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF0B6B57"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFB42318"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF26405F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDF3EC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFBE3E0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color auto="1"/></top><bottom style="double"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(rows: Cell[][], o: { widths: number[]; freezeRow?: number; filter?: string }): string {
  const cols = o.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows
    .map((cells, r) => {
      const cs = cells
        .map((c, i) => {
          if (!c) return '';
          const ref = `${col(i)}${r + 1}`;
          const st = c.s ? ` s="${c.s}"` : '';
          if (c.t === 's') return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
          if (c.t === 'n') return `<c r="${ref}"${st}><v>${c.v}</v></c>`;
          return `<c r="${ref}"${st}${c.vt === 'str' ? ' t="str"' : ''}><f>${esc(c.f)}</f><v>${esc(c.v)}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join('');
  const view = o.freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${o.freezeRow}" topLeftCell="A${o.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}<sheetFormatPr defaultRowHeight="13"/><cols>${cols}</cols><sheetData>${body}</sheetData>${o.filter ? `<autoFilter ref="${o.filter}"/>` : ''}</worksheet>`;
}

const str = (v: string, s?: number): Cell => ({ t: 's', v, ...(s ? { s } : {}) });
const num = (minor: number, exp: number, s = S.money): Cell => ({ t: 'n', v: minorToPlain(minor, exp), s });
const dateCell = (iso: string): Cell => ({ t: 'n', v: String(isoToDays(iso) + 25569), s: S.date });

export interface XlsxStatement {
  label: string;
  statement: Pick<Statement, 'fileName' | 'accountType' | 'accountLast4' | 'currency' | 'periodStart' | 'periodEnd' | 'openingBalanceMinor' | 'closingBalanceMinor'>;
  rows: readonly ExportRow[];
}

export function buildXlsx(statements: readonly XlsxStatement[], fitids?: ReadonlyMap<string, string>): Uint8Array {
  const exp = currencyExponent(statements[0]?.statement.currency ?? 'USD');
  const head = ['Statement', 'Date', 'Post date', 'Description', 'Payee', 'Category', 'Amount', 'Balance (printed)', 'Source page', 'FITID'];
  const tx: Cell[][] = [head.map((h) => str(h, S.header))];
  const rowRange = new Map<string, [number, number]>();
  for (const s of statements) {
    const start = tx.length + 1;
    for (const r of sortChronological(s.rows)) {
      tx.push([
        str(s.label), dateCell(r.date), r.postDate ? dateCell(r.postDate) : str(''), str(r.description), str(r.payee ?? ''), str(r.category ?? ''),
        num(r.amountMinor, exp), r.balanceMinor == null ? str('') : num(r.balanceMinor, exp), str(String(r.source?.date?.page ?? r.source?.amount?.page ?? '')), str(fitids?.get(r.id) ?? ''),
      ]);
    }
    rowRange.set(s.label, [start, tx.length]);
  }
  const last = Math.max(tx.length, 2);
  const rec: Cell[][] = [[str('Reconciliation proof', S.title)], [str('Every figure in columns D to J is a live formula over the Transactions sheet. Printed balances come from the PDF; "on synthetic layouts" accuracy claims do not apply to your data - verify before filing.', S.note)], []];
  rec.push(['Statement', 'Account', 'Period', 'Opening (printed)', 'Money in', 'Money out', 'Computed closing', 'Closing (printed)', 'Difference', 'Status'].map((h) => str(h, S.header)));
  for (const s of statements) {
    const st = s.statement;
    const r = rec.length + 1;
    const rr = reconcile({ accountType: st.accountType, openingBalanceMinor: st.openingBalanceMinor, closingBalanceMinor: st.closingBalanceMinor, rows: s.rows });
    const inM = rr.totalInMinor, outM = rr.totalOutMinor;
    const lbl = `"${s.label}"`;
    const sumIn = `SUMIFS(Transactions!$G$2:$G$${last},Transactions!$A$2:$A$${last},${lbl},Transactions!$G$2:$G$${last},">0")`;
    const sumOut = `-SUMIFS(Transactions!$G$2:$G$${last},Transactions!$A$2:$A$${last},${lbl},Transactions!$G$2:$G$${last},"<0")`;
    const have = st.openingBalanceMinor !== null && st.closingBalanceMinor !== null;
    const sign = st.accountType === 'bank' ? ['+', '-'] : ['-', '+'];
    const computed = st.openingBalanceMinor === null ? null : st.openingBalanceMinor + balanceStep(st.accountType, inM - outM);
    const cells: Cell[] = [
      str(s.label), str(`${accountLabel(st)} (${st.currency})`), str(`${st.periodStart ?? '?'} to ${st.periodEnd ?? '?'}`),
      st.openingBalanceMinor === null ? str('not found') : num(st.openingBalanceMinor, exp),
      { t: 'f', f: sumIn, v: minorToPlain(inM, exp), vt: 'n', s: S.money },
      { t: 'f', f: sumOut, v: minorToPlain(outM, exp), vt: 'n', s: S.money },
      have ? { t: 'f', f: `D${r}${sign[0]}E${r}${sign[1]}F${r}`, v: minorToPlain(computed ?? 0, exp), vt: 'n', s: S.total } : str('n/a'),
      st.closingBalanceMinor === null ? str('not found') : num(st.closingBalanceMinor, exp),
      have ? { t: 'f', f: `ROUND(G${r}-H${r},${exp})`, v: minorToPlain(rr.deltaMinor ?? 0, exp), vt: 'n', s: S.total } : str('n/a'),
      have ? { t: 'f', f: `IF(I${r}=0,"RECONCILED","DISCREPANCY")`, v: rr.status === 'reconciled' ? 'RECONCILED' : 'DISCREPANCY', vt: 'str', s: rr.status === 'reconciled' ? S.ok : S.bad } : str('INCOMPLETE', S.bad),
    ];
    rec.push(cells);
  }
  void rowRange;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/><sheet name="Reconciliation" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(tx, { widths: [11, 12, 12, 46, 24, 18, 14, 16, 10, 28], freezeRow: 1, filter: `A1:J${tx.length}` })),
    'xl/worksheets/sheet2.xml': strToU8(sheetXml(rec, { widths: [11, 24, 26, 18, 14, 14, 18, 18, 14, 16] })),
  };
  return zipSync(files, { level: 6 });
}
