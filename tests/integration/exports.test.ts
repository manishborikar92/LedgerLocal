import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCsv } from '@/core/export/csv';
import { buildOfx } from '@/core/export/ofx';
import { buildXlsx } from '@/core/export/xlsx';
import { ExportSettingsSchema } from '@/core/model';
import { reconcile } from '@/core/reconcile';
import { hasSoffice, parsedSample, py, pyHasOfxparse, pyHasOpenpyxl, tmp, toStatement } from './support';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const settings = ExportSettingsSchema.parse({});

describe.skipIf(!pyHasOfxparse)('OFX/QBO round trip through an independent parser (python ofxparse)', () => {
  it.each(['bank-signed', 'bank-multipage', 'cc-two-date', 'bank-european'] as const)('%s', async (layout) => {
    const { out, truth } = await parsedSample(layout, 3);
    const st = toStatement(out);
    for (const qbo of [false, true]) {
      const { text } = buildOfx({ statement: st, rows: st.rows }, settings, qbo);
      const f = tmp(qbo ? 'x.qbo' : 'x.ofx');
      fs.writeFileSync(f, text, 'latin1');
      const r = py('check_ofx.py', f) as { count: number; total: string; unique_fitids: number; balance: string; acct_id: string; currency: string };
      expect(r.count).toBe(truth.rows.length);
      expect(r.unique_fitids).toBe(truth.rows.length);
      const net = truth.rows.reduce((s, x) => s + x.amountMinor, 0) / 100;
      expect(Number(r.total)).toBeCloseTo(net, 2);
      const closing = truth.accountType === 'bank' ? truth.closingBalanceMinor : -truth.closingBalanceMinor;
      expect(Number(r.balance)).toBeCloseTo(closing / 100, 2);
      expect(r.acct_id).toBe(truth.accountLast4);
      expect(r.currency.toUpperCase()).toBe(truth.currency);
    }
  });
});

describe('CSV content matches ground truth', () => {
  it('amounts and dates survive', async () => {
    const { out, truth } = await parsedSample('bank-debit-credit', 2);
    const st = toStatement(out);
    const csv = buildCsv({ statement: st, rows: st.rows }, ExportSettingsSchema.parse({ bom: false })).trim().split('\r\n');
    expect(csv).toHaveLength(truth.rows.length + 1);
    const sum = csv.slice(1).reduce((s, l) => s + Math.round(Number(l.split(',').at(-2)) * 100), 0);
    expect(sum).toBe(truth.rows.reduce((s, r) => s + r.amountMinor, 0));
  });
});

describe.skipIf(!pyHasOpenpyxl)('XLSX contents verified with openpyxl', () => {
  it('has both sheets, real dates/numbers and live formulas', async () => {
    const { out, truth } = await parsedSample('bank-signed', 1);
    const st = toStatement(out);
    const file = tmp('x.xlsx');
    fs.writeFileSync(file, buildXlsx([{ label: 'S1', statement: st, rows: st.rows }]));
    const r = py('check_xlsx.py', file) as Record<string, unknown>;
    expect(r.sheets).toEqual(['Transactions', 'Reconciliation']);
    expect(r.tx_rows).toBe(truth.rows.length);
    expect(r.has_formula).toBe(true);
    expect(r.status).toBe('RECONCILED');
    expect(r.first_date_is_date).toBe('datetime');
    expect(Number(r.first_amount)).toBeCloseTo(truth.rows[0]!.amountMinor / 100, 2);
  });
});

describe.skipIf(!hasSoffice || !pyHasOpenpyxl)('XLSX formulas recalculated by LibreOffice agree with the app', () => {
  it('RECONCILED when balanced and DISCREPANCY when a row is removed', async () => {
    const { out } = await parsedSample('cc-crdr', 1);
    const st = toStatement(out);
    const dir = path.dirname(tmp('x'));
    const run = (name: string, rows: typeof st.rows) => {
      const inFile = path.join(dir, `${name}.xlsx`);
      fs.writeFileSync(inFile, buildXlsx([{ label: 'S1', statement: st, rows }]));
      fs.mkdirSync(path.join(dir, 'lo'), { recursive: true });
      const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'lo'), inFile], { encoding: 'utf8', timeout: 120_000 });
      expect(r.status).toBe(0);
      return py('check_xlsx.py', path.join(dir, 'lo', `${name}.xlsx`));
    };
    const good = run('good', st.rows);
    expect(good.status).toBe('RECONCILED');
    expect(Number(good.difference)).toBe(0);
    const bad = run('bad', st.rows.slice(1));
    expect(bad.status).toBe('DISCREPANCY');
    const expected = reconcile({ accountType: st.accountType, openingBalanceMinor: st.openingBalanceMinor, closingBalanceMinor: st.closingBalanceMinor, rows: st.rows.slice(1) }).deltaMinor!;
    expect(Math.round(Number(bad.difference) * 100)).toBe(expected);
  }, 240_000);
});
