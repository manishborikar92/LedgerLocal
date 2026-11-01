/** Builds export files from app state. Pure apart from reading the passed state. */
import { zipSync } from 'fflate';
import { buildCsv } from '@/core/export/csv';
import { buildOfx, makeFitids } from '@/core/export/ofx';
import { buildXlsx, type XlsxStatement } from '@/core/export/xlsx';
import { accountKeyOf } from '@/core/merge';
import type { ExportSettings, Statement } from '@/core/model';
import { reconcile } from '@/core/reconcile';

export type ExportFormat = 'csv' | 'xlsx' | 'ofx' | 'qbo';
export interface ExportFile { name: string; bytes: Uint8Array; mime: string }
export interface ExportPlan { files: ExportFile[]; unreconciled: string[]; dedupedRows: number }

const enc = (s: string, charset: 'utf8' | 'latin1' = 'utf8') => (charset === 'utf8' ? new TextEncoder().encode(s) : Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff));
export const EXT: Record<ExportFormat, string> = { csv: 'csv', xlsx: 'xlsx', ofx: 'ofx', qbo: 'qbo' };

/** One account's statements merged into a single export statement (for OFX/CSV across months). */
function combine(group: Statement[]): { statement: Statement; rows: Statement['rows']; dedupedRows: number } {
  const sorted = [...group].sort((a, b) => (a.periodStart ?? '').localeCompare(b.periodStart ?? ''));
  const seen = new Set<string>();
  const rows: Statement['rows'] = [];
  let deduped = 0;
  const occ = new Map<string, number>();
  for (const s of sorted) {
    const local = new Map<string, number>();
    for (const r of s.rows) {
      const k = `${r.date}|${r.amountMinor}|${(r.sourceDescription || r.description).replace(/\s+/g, ' ').trim().toUpperCase()}`;
      const n = (local.get(k) ?? 0) + 1;
      local.set(k, n);
      const key = `${k}|${n}`; // identical rows inside ONE statement are legitimate; across statements they are overlap duplicates
      if (seen.has(key)) { deduped++; continue; }
      seen.add(key);
      rows.push(r);
      occ.set(k, n);
    }
  }
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return { statement: { ...first, periodStart: first.periodStart, periodEnd: last.periodEnd, openingBalanceMinor: first.openingBalanceMinor, closingBalanceMinor: last.closingBalanceMinor }, rows, dedupedRows: deduped };
}

export function planExport(statements: Statement[], format: ExportFormat, settings: ExportSettings, baseName: string): ExportPlan {
  const unreconciled = statements
    .filter((s) => reconcile({ accountType: s.accountType, openingBalanceMinor: s.openingBalanceMinor, closingBalanceMinor: s.closingBalanceMinor, rows: s.rows }).status !== 'reconciled')
    .map((s) => s.fileName);
  const files: ExportFile[] = [];
  let deduped = 0;
  if (format === 'xlsx') {
    const items: XlsxStatement[] = statements.map((s, i) => ({ label: `S${i + 1}`, statement: s, rows: s.rows }));
    const fitids = new Map<string, string>();
    for (const s of statements) for (const [k, v] of makeFitids(s.rows, `${s.accountType}:${s.accountLast4 ?? '0000'}:${s.currency}`)) fitids.set(k, v);
    files.push({ name: `${baseName}.xlsx`, bytes: buildXlsx(items, fitids), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } else {
    const groups = new Map<string, Statement[]>();
    for (const s of statements) groups.set(accountKeyOf(s), [...(groups.get(accountKeyOf(s)) ?? []), s]);
    for (const [key, group] of groups) {
      const { statement, rows, dedupedRows } = combine(group);
      deduped += dedupedRows;
      const suffix = groups.size > 1 ? `-${(statement.accountLast4 ?? key.split(':')[1] ?? 'acct')}` : '';
      if (format === 'csv') {
        const fit = settings.columns.includes('fitid') ? makeFitids(rows, `${statement.accountType}:${statement.accountLast4 ?? '0000'}:${statement.currency}`) : undefined;
        files.push({ name: `${baseName}${suffix}.csv`, bytes: enc(buildCsv({ statement, rows, fitids: fit }, settings)), mime: 'text/csv' });
      } else {
        const { text } = buildOfx({ statement, rows }, settings, format === 'qbo');
        files.push({ name: `${baseName}${suffix}.${format}`, bytes: enc(text, 'latin1'), mime: format === 'qbo' ? 'application/vnd.intu.qbo' : 'application/x-ofx' });
      }
    }
  }
  return { files, unreconciled, dedupedRows: deduped };
}

export function bundle(plan: ExportPlan, baseName: string): ExportFile {
  if (plan.files.length === 1) return plan.files[0]!;
  const z: Record<string, Uint8Array> = {};
  for (const f of plan.files) z[f.name] = f.bytes;
  return { name: `${baseName}.zip`, bytes: zipSync(z), mime: 'application/zip' };
}

