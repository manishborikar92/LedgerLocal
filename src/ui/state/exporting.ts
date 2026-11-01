/** Downloads and export orchestration (builds files via ./exporter, which is loaded lazily). */
import { fileStem } from '@/core/export/shared';
import type { ExportFormat } from './exporter';
import { get } from './store';

/* ───────── downloads / export ───────── */
export function download(name: string, bytes: Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ExportOutcome = { ok: true; names: string[]; deduped: number } | { ok: false; reason: 'empty' | 'unreconciled' | 'error'; message: string };
export async function runExport(format: ExportFormat, scope: 'statement' | 'project', allowUnreconciled: boolean): Promise<ExportOutcome> {
  const s = get();
  const docs = scope === 'project' ? s.docs : s.docs.filter((d) => d.id === s.activeDocId);
  const statements = docs.map((d) => d.statement).filter((st) => st.rows.length);
  if (!statements.length) return { ok: false, reason: 'empty', message: 'There are no rows to export.' };
  const base = scope === 'project' ? fileStem(s.project.name) : fileStem(statements[0]!.fileName);
  let plan;
  // The export engine (CSV/OFX/XLSX writers, zip) is loaded on demand to keep the first load small.
  const { planExport, bundle } = await import('./exporter');
  try {
    plan = planExport(statements, format, s.project.exportSettings, base);
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Export failed.' };
  }
  if (plan.unreconciled.length && !allowUnreconciled) return { ok: false, reason: 'unreconciled', message: `Not reconciled: ${plan.unreconciled.join(', ')}` };
  const file = bundle(plan, base);
  download(file.name, file.bytes, file.mime);
  return { ok: true, names: plan.files.map((f) => f.name), deduped: plan.dedupedRows };
}
