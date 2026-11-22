/** Opt-in persistence: saving/opening projects, project files, re-attaching PDFs, wiping local data. */
import { getServices } from '@/composition';
import { exportProjectFile, importProjectFile } from '@/core/migrate';
import { newId, ProjectSchema, SCHEMA_VERSION, type Project } from '@/core/model';
import { download } from './exporting';
import { fileStem } from '@/core/export/shared';
import { activeDoc, freshProject, get, set } from './store';
import { clearThemeCookie } from '@/lib/theme-cookie';
import { notify } from './ui';
import type { AppState, Doc } from './types';

/* ───────── projects (opt-in persistence) ───────── */
function toProject(s: AppState, keepPdfs: boolean): Project {
  return ProjectSchema.parse({ schemaVersion: SCHEMA_VERSION, id: s.project.id, name: s.project.name, createdAt: s.project.savedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), statements: s.docs.map((d) => d.statement), rules: s.project.rules, exportSettings: s.project.exportSettings, pdfsStored: keepPdfs });
}
export async function saveProject(name: string, keepPdfs: boolean): Promise<void> {
  const repo = getServices().repo;
  set((s) => ({ ...s, project: { ...s.project, name } }));
  const s = get();
  if (!keepPdfs) await repo.delete(s.project.id); // also removes any PDFs stored by an earlier save
  const p = toProject(get(), keepPdfs);
  await repo.save(p);
  if (keepPdfs) for (const d of s.docs) if (d.bytes) await repo.savePdf(p.id, d.id, d.bytes);
  set((x) => ({ ...x, project: { ...x.project, savedAt: p.updatedAt, pdfsStored: keepPdfs, dirty: false } }));
  notify('success', keepPdfs ? 'Project saved on this device, including source PDFs.' : 'Project saved on this device (rows and settings only, no PDFs).');
}
async function loadProject(p: Project, pdf: (stId: string) => Promise<Uint8Array | null>): Promise<void> {
  const docs: Doc[] = [];
  for (const st of p.statements) docs.push({ id: st.id, statement: st, past: [], future: [], bytes: await pdf(st.id) });
  set((s) => ({ ...s, docs, activeDocId: docs[0]?.id ?? null, focusRowId: docs[0]?.statement.rows[0]?.id ?? null, checked: [], view: 'work', dialog: null, project: { id: p.id, name: p.name, rules: p.rules, exportSettings: p.exportSettings, savedAt: p.updatedAt, pdfsStored: p.pdfsStored, dirty: false } }));
}
export async function openProject(id: string): Promise<void> {
  const repo = getServices().repo;
  const p = await repo.get(id);
  if (!p) return notify('error', 'That project no longer exists.');
  await loadProject(p, (sid) => repo.getPdf(p.id, sid));
  notify('success', `Opened “${p.name}”.${p.pdfsStored ? '' : ' Source PDFs were not stored; re-attach a PDF to see the audit trail.'}`);
}
export async function deleteProjectById(id: string): Promise<void> {
  await getServices().repo.delete(id);
  if (get().project.id === id) set((s) => ({ ...s, project: { ...s.project, savedAt: null, pdfsStored: false, dirty: true } }));
}
export function downloadProjectFile(): void {
  const p = toProject(get(), false);
  download(`${fileStem(p.name)}.ledgerlocal.json`, new TextEncoder().encode(exportProjectFile(p)), 'application/json');
}
export async function importProjectText(text: string): Promise<void> {
  try {
    const p = importProjectFile(text);
    await loadProject({ ...p, id: newId() }, async () => null);
    notify('success', `Imported “${p.name}”.`);
  } catch (e) {
    notify('error', e instanceof Error ? e.message : 'Could not import that file.');
  }
}
const cur = () => activeDoc(get());

export async function reattachPdf(file: File): Promise<void> {
  const d = cur();
  if (!d) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { sha256Hex } = await import('@/core/hash');
  if (sha256Hex(bytes) !== d.statement.fileSha256) return notify('error', 'That PDF is not the same file this statement was read from (hash mismatch).');
  set((s) => ({ ...s, docs: s.docs.map((x) => (x.id === d.id ? { ...x, bytes } : x)) }));
  notify('success', 'Source PDF attached; the audit trail is available.');
}
export async function wipeAll(): Promise<void> {
  await getServices().repo.wipe();
  for (const k of Object.keys(localStorage)) if (k.startsWith('ll.')) localStorage.removeItem(k);
  clearThemeCookie();
  set((s) => ({ ...s, docs: [], activeDocId: null, focusRowId: null, checked: [], queue: [], project: freshProject(), dialog: null, view: 'work' }));
  notify('success', 'All saved projects, PDFs and preferences on this device were deleted.');
}
export function newSession(): void {
  set((s) => ({ ...s, docs: [], activeDocId: null, focusRowId: null, checked: [], queue: [], project: freshProject(), view: 'work' }));
}
