import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate, type LayoutId } from '../../tools/synth/generate';
import { parsePdfBytes } from '../../tools/pdfNode';
import { newId, type Statement } from '@/core/model';
import type { ParseOutput } from '@/core/parse';

export async function parsedSample(layout: LayoutId, seed = 1) {
  const s = await generate(layout, seed);
  const out = await parsePdfBytes(s.pdf, { password: s.truth.password });
  return { ...s, out };
}
export function toStatement(p: ParseOutput & { pageCount: number }, fileName = 'sample.pdf'): Statement {
  return { id: newId(), fileName, fileSha256: 'x', pageCount: p.pageCount, accountType: p.accountType, accountLast4: p.accountLast4, currency: p.currency, periodStart: p.periodStart, periodEnd: p.periodEnd, openingBalanceMinor: p.openingBalanceMinor, closingBalanceMinor: p.closingBalanceMinor, balanceSource: p.balanceSource, rows: p.rows, tables: p.tables, warnings: p.warnings, assumptions: p.assumptions, pagesWithRows: p.pagesWithRows, createdAt: '2025-01-01T00:00:00.000Z' };
}
export const tmp = (name: string) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'll-')), name);
export const has = (cmd: string, args: string[]): boolean => { try { return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0; } catch { return false; } };
export const pyHasOfxparse = has('python3', ['-c', 'import ofxparse']);
export const pyHasOpenpyxl = has('python3', ['-c', 'import openpyxl']);
export const hasSoffice = has('soffice', ['--version']);
export const py = (script: string, file: string): Record<string, unknown> => JSON.parse(execFileSync('python3', [path.resolve('tests/python', script), file], { encoding: 'utf8' }));
