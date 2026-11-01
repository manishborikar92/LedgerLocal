import { describe, expect, it } from 'vitest';
import { HELDOUT_IDS, LAYOUT_IDS, generate, type LayoutId } from '../../tools/synth/generate';
import { parsePdfBytes } from '../../tools/pdfNode';
import { scoreStatement } from '../../tools/accuracy-lib';
import { PdfCorruptError, PdfPasswordError } from '@/adapters/pdf/extract';
import { ParseError } from '@/core/parse';

const TEXT_LAYOUTS = [...LAYOUT_IDS, ...HELDOUT_IDS].filter((l) => l !== 'scan-image-only');

describe('real parser over synthetic PDFs (ground-truth comparison)', () => {
  for (const layout of TEXT_LAYOUTS) {
    for (const seed of [1, 2, 3]) {
      it(`${layout} seed ${seed}: every row, balance and reconciliation matches the ground truth`, async () => {
        const { pdf, truth } = await generate(layout as LayoutId, seed);
        const p = await parsePdfBytes(pdf, { password: truth.password });
        const s = scoreStatement(p, truth);
        expect(s.note.slice(0, 5), 'mismatches').toEqual([]);
        expect(s.recall).toBe(1);
        expect(s.precision).toBe(1);
        expect(s.descOk).toBe(s.matched);
        expect(s.balanceOk).toBe(s.balanceChecked);
        expect(s.metaOk).toEqual({ accountType: true, last4: true, period: true, currency: true, opening: true, closing: true });
        expect(s.status).toBe('reconciled');
        expect(p.pageCount).toBe(truth.pageCount);
      });
    }
  }
  it('the multi-page layout really spans several pages and keeps page provenance on every row', async () => {
    const { pdf } = await generate('bank-multipage', 1);
    const p = await parsePdfBytes(pdf);
    expect(p.pageCount).toBeGreaterThanOrEqual(2);
    expect(p.pagesWithRows.length).toBe(p.pageCount);
    expect(p.rows.every((r) => r.source?.amount && r.source.amount.w > 0 && r.source.date && r.source.description?.length)).toBe(true);
  });
  it('year rollover: Dec dates get 2024, Jan dates get 2025', async () => {
    const { pdf } = await generate('bank-year-rollover', 1);
    const p = await parsePdfBytes(pdf);
    expect(new Set(p.rows.map((r) => r.date.slice(0, 4)))).toEqual(new Set(['2024', '2025']));
  });
  it('European / Indian / UK number and date formats are detected', async () => {
    expect((await parsePdfBytes((await generate('bank-european', 1)).pdf)).assumptions.join(' ')).toMatch(/European/);
    const ind = await parsePdfBytes((await generate('bank-indian', 1)).pdf);
    expect(ind.currency).toBe('INR');
  });
  it('card statements that print charges as negatives are flipped only because reconciliation proves it, and says so', async () => {
    const p = await parsePdfBytes((await generate('held-cc-negative', 1)).pdf);
    expect(p.assumptions.join(' ')).toMatch(/signs were flipped/);
  });
  it('password-protected PDFs: needed -> incorrect -> correct', async () => {
    const { pdf, truth } = await generate('bank-password', 1);
    await expect(parsePdfBytes(pdf)).rejects.toMatchObject({ name: 'PdfPasswordError', reason: 'needed' });
    await expect(parsePdfBytes(pdf, { password: 'nope' })).rejects.toBeInstanceOf(PdfPasswordError);
    await expect(parsePdfBytes(pdf, { password: 'nope' })).rejects.toMatchObject({ reason: 'incorrect' });
    expect((await parsePdfBytes(pdf, { password: truth.password })).rows.length).toBe(truth.rows.length);
  });
  it('image-only PDFs give a clear no-text-layer error (OCR is roadmap)', async () => {
    const { pdf } = await generate('scan-image-only', 1);
    await expect(parsePdfBytes(pdf)).rejects.toBeInstanceOf(ParseError);
    await expect(parsePdfBytes(pdf)).rejects.toMatchObject({ code: 'no-text-layer' });
  });
  it('corrupt files give a clear error', async () => {
    await expect(parsePdfBytes(new TextEncoder().encode('this is definitely not a pdf'))).rejects.toBeInstanceOf(PdfCorruptError);
  });
  it('a deleted row is detected: DISCREPANCY with the delta and a pinpointed row', async () => {
    const { reconcile } = await import('@/core/reconcile');
    const { pdf } = await generate('bank-signed', 2);
    const p = await parsePdfBytes(pdf);
    const dropped = p.rows[10]!;
    const rows = p.rows.filter((_, i) => i !== 10);
    const r = reconcile({ accountType: p.accountType, openingBalanceMinor: p.openingBalanceMinor, closingBalanceMinor: p.closingBalanceMinor, rows });
    expect(r.status).toBe('discrepancy');
    expect(r.deltaMinor).toBe(-dropped.amountMinor);
    expect(r.problemRowIndex).toBe(10);
  });
});
