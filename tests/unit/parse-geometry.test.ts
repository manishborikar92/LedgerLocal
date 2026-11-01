import { describe, expect, it } from 'vitest';
import { buildLines, type PageText, type TextItem } from '@/core/geometry';
import { analyzeHeaderLine, classifyHeader } from '@/core/parse/headers';
import { parseStatement, ParseError } from '@/core/parse';

const t = (str: string, x: number, y: number, w = str.length * 5, h = 9): TextItem => ({ str, x, y, w, h });

describe('row clustering', () => {
  it('groups items on one baseline into one line and splits cells by gap', () => {
    const page: PageText = { page: 1, width: 612, height: 792, items: [t('Date', 40, 100), t('Description', 110, 100.4), t('Amount', 400, 99.8), t('01/05', 40, 120), t('GROCERY', 110, 120), t('MART', 148, 120), t('-12.30', 400, 120)] };
    const lines = buildLines(page);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.segs.map((s) => s.text)).toEqual(['01/05', 'GROCERY MART', '-12.30']);
  });
  it('drops pdf.js spacer items (blank / zero height)', () => {
    const page: PageText = { page: 1, width: 612, height: 792, items: [t('A', 10, 10), { str: ' ', x: 20, y: 10, w: 100, h: 0 }, t('B', 130, 10)] };
    expect(buildLines(page)[0]!.segs.map((s) => s.text)).toEqual(['A', 'B']);
  });
  it('joins fragments of one word with no inserted space', () => {
    const page: PageText = { page: 1, width: 612, height: 792, items: [t('Pine', 10, 10, 20), t('crest', 30.2, 10, 25)] };
    expect(buildLines(page)[0]!.segs[0]!.text).toBe('Pinecrest');
  });
});

describe('header / table detection', () => {
  it('classifies header titles', () => {
    const c = classifyHeader;
    expect([c('Date'), c('Posting Date'), c('Trans Date'), c('Withdrawals'), c('Deposits'), c('Money out'), c('Paid in'), c('Balance'), c('Amount ($)'), c('Particulars')]).toEqual(['date', 'postDate', 'date', 'debit', 'credit', 'debit', 'credit', 'balance', 'amount', 'description']);
    expect(c('Value Date')).toBe('postDate');
    expect(c('Charges')).toBe('debit');
    expect(c('Category')).toBeNull();
  });
  it('recognises a header line but not a data line', () => {
    const hdr = buildLines({ page: 1, width: 612, height: 792, items: [t('Date', 40, 100), t('Description', 110, 100), t('Amount', 400, 100), t('Balance', 480, 100)] })[0]!;
    expect(analyzeHeaderLine(hdr)?.txCapable).toBe(true);
    const data = buildLines({ page: 1, width: 612, height: 792, items: [t('01/05/2025', 40, 100), t('Payment Received', 110, 100), t('12.00', 400, 100)] })[0]!;
    expect(analyzeHeaderLine(data)).toBeNull();
  });
  it('a lone Posting Date column is the date column', () => {
    const hdr = buildLines({ page: 1, width: 612, height: 792, items: [t('Posting Date', 40, 100), t('Transaction', 150, 100), t('Money out', 380, 100), t('Money in', 450, 100)] })[0]!;
    expect(analyzeHeaderLine(hdr)?.cells[0]?.role).toBe('date');
  });
  it('rejects PDFs without a text layer', () => {
    expect(() => parseStatement([{ page: 1, width: 612, height: 792, items: [] }])).toThrow(ParseError);
  });
  it('parses a tiny hand-built statement incl. multi-line description and CR/DR', () => {
    const items: TextItem[] = [
      t('Statement Period: 01/01/2025 - 01/31/2025', 40, 60, 200), t('Opening Balance', 40, 80, 80), t('1,000.00', 200, 80, 40), t('Closing Balance', 40, 94, 80), t('1,150.00', 200, 94, 40),
      t('Date', 40, 130), t('Description', 110, 130), t('Debit', 380, 130), t('Credit', 450, 130), t('Balance', 520, 130),
      t('01/03/2025', 40, 150), t('COFFEE SHOP', 110, 150, 60), t('4.50', 380, 150, 20), t('995.50', 520, 150, 30),
      t('01/04/2025', 40, 165), t('PAYROLL', 110, 165, 40), t('160.00', 450, 165, 30), t('1,155.50', 520, 165, 40),
      t('JANUARY', 110, 177, 40),
      t('01/20/2025', 40, 192), t('SNACKS', 110, 192, 30), t('5.50', 380, 192, 20), t('1,150.00', 520, 192, 40),
    ];
    const out = parseStatement([{ page: 1, width: 612, height: 792, items }]);
    expect(out.rows.map((r) => [r.date, r.amountMinor, r.description])).toEqual([
      ['2025-01-03', -450, 'COFFEE SHOP'], ['2025-01-04', 16000, 'PAYROLL JANUARY'], ['2025-01-20', -550, 'SNACKS'],
    ]);
    expect(out.openingBalanceMinor).toBe(100000);
    expect(out.closingBalanceMinor).toBe(115000);
    expect(out.periodStart).toBe('2025-01-01');
  });
});
