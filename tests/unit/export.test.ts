import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, guardText } from '@/core/export/csv';
import { buildOfx, makeFitids, ofxText } from '@/core/export/ofx';
import { buildXlsx } from '@/core/export/xlsx';
import { ExportSettingsSchema } from '@/core/model';
import { row, statement } from '../helpers';

const settings = (o = {}) => ExportSettingsSchema.parse(o);
const st = () =>
  statement(
    [row('2025-03-02', 'POS PURCHASE Café Müller & Söhne <test>', -2050, 97950), row('2025-03-02', 'Coffee', -450, 97500), row('2025-03-02', 'Coffee', -450, 97050), row('2025-03-05', '=HYPERLINK("http://x")', 100000, 197050)],
    { openingBalanceMinor: 100000, closingBalanceMinor: 197050 },
  );

describe('CSV', () => {
  it('writes configurable columns, date format, delimiter and decimal comma', () => {
    const s = st();
    const out = buildCsv({ statement: s, rows: s.rows }, settings({ dateFormat: 'dmy', delimiter: ';', decimal: ',', bom: false }));
    const lines = out.trim().split('\r\n');
    expect(lines[0]).toBe('Date;Description;Amount;Balance');
    expect(lines[2]).toBe('02/03/2025;Coffee;-4,50;975,00');
  });
  it('debit/credit mode splits the amount into two columns', () => {
    const s = st();
    const out = buildCsv({ statement: s, rows: s.rows }, settings({ amountStyle: 'debitCredit', bom: false })).split('\r\n');
    expect(out[0]).toBe('Date,Description,Debit,Credit,Balance');
    expect(out[2]).toBe('2025-03-02,Coffee,4.50,,975.00');
    expect(out[4]).toContain(',,1000.00,');
  });
  it('quotes properly, adds a BOM, and neutralises formula injection', () => {
    expect(csvCell('a,b', ',')).toBe('"a,b"');
    expect(csvCell('say "hi"', ',')).toBe('"say ""hi"""');
    expect(guardText('=1+1')).toBe("'=1+1");
    expect(guardText('+x')).toBe("'+x");
    expect(guardText('Coffee')).toBe('Coffee');
    const s = st();
    const out = buildCsv({ statement: s, rows: s.rows }, settings({}));
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toContain(`'=HYPERLINK`);
  });
});

describe('OFX / QBO', () => {
  it('writes a bank OFX 1.02 document; QBO adds INTU.BID', () => {
    const s = st();
    const ofx = buildOfx({ statement: s, rows: s.rows }, settings(), false).text;
    const qbo = buildOfx({ statement: s, rows: s.rows }, settings({ intuBid: '3000' }), true).text;
    expect(ofx.startsWith('OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102')).toBe(true);
    expect(ofx).toContain('<BANKMSGSRSV1>');
    expect(ofx).toContain('<TRNAMT>-20.50');
    expect(ofx).toContain('<LEDGERBAL>\r\n<BALAMT>1970.50');
    expect(ofx).not.toContain('INTU.BID');
    expect(qbo).toContain('<INTU.BID>3000');
    expect(ofx.match(/<STMTTRN>/g)).toHaveLength(4);
  });
  it('credit card: CREDITCARDMSGSRSV1 and a negative ledger balance for money owed', () => {
    const s = statement([row('2025-03-02', 'Shop', -4000)], { accountType: 'creditCard', openingBalanceMinor: 20000, closingBalanceMinor: 24000 });
    const ofx = buildOfx({ statement: s, rows: s.rows }, settings(), true).text;
    expect(ofx).toContain('<CREDITCARDMSGSRSV1>');
    expect(ofx).toContain('<CCACCTFROM><ACCTID>1234</CCACCTFROM>');
    expect(ofx).toContain('<BALAMT>-240.00');
  });
  it('escapes SGML, is ASCII-only, and limits NAME to 32 chars with the full text in MEMO', () => {
    expect(ofxText('Café <A&B>')).toBe('Cafe &lt;A&amp;B&gt;');
    expect(ofxText('日本')).toBe('??');
    const s = statement([row('2025-03-02', 'X'.repeat(80), -100)]);
    const ofx = buildOfx({ statement: s, rows: s.rows }, settings(), false).text;
    expect(ofx).toContain(`<NAME>${'X'.repeat(32)}\r\n`);
    expect(ofx).toContain(`<MEMO>${'X'.repeat(80)}`);
    // eslint-disable-next-line no-control-regex
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(buildOfx({ statement: st(), rows: st().rows }, settings(), false).text)).toBe(true);
  });
  it('FITIDs are deterministic, unique (identical rows get different ids) and file-independent', () => {
    const s = st();
    const a = makeFitids(s.rows, 'bank:1234:USD');
    const b = makeFitids([...s.rows].reverse(), 'bank:1234:USD');
    expect(new Set(a.values()).size).toBe(4);
    const coffee = s.rows.filter((r) => r.description === 'Coffee');
    expect(a.get(coffee[0]!.id)).not.toBe(a.get(coffee[1]!.id));
    expect([...a.values()].every((v) => v.length <= 32)).toBe(true);
    // same transaction content in another statement => same FITIDs (dedupes across overlapping statements)
    const other = makeFitids(s.rows.map((r) => ({ ...r, id: r.id + 'x' })), 'bank:1234:USD');
    expect([...other.values()].sort()).toEqual([...a.values()].sort());
    expect(b.size).toBe(4);
  });
  it('refuses an empty export', () => {
    expect(() => buildOfx({ statement: statement([]), rows: [] }, settings(), false)).toThrow(/no transactions/);
  });
});

describe('XLSX', () => {
  it('produces a valid package with Transactions + Reconciliation sheets and live formulas', () => {
    const s = st();
    const bytes = buildXlsx([{ label: 'S1', statement: s, rows: s.rows }]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']));
    const rec = strFromU8(files['xl/worksheets/sheet2.xml']!);
    expect(rec).toContain('<f>SUMIFS(Transactions!');
    expect(rec).toContain('IF(I5=0,"RECONCILED","DISCREPANCY")');
    expect(rec).toContain('<v>RECONCILED</v>');
    const tx = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(tx).toContain('<v>-20.50</v>');
    expect(tx).toContain('Caf');
    expect(tx).toContain('&amp;');
  });
});
