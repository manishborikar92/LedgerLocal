/** Payee/category rules and project-level settings. */
import type { ExportSettings, Rule } from '@/core/model';
import { applyRules } from '@/core/rules';
import { commit } from './editing';
import { get, set } from './store';

/* ───────── rules ───────── */
const setRules = (fn: (r: Rule[]) => Rule[]) => set((s) => ({ ...s, project: { ...s.project, rules: fn(s.project.rules), dirty: true } }));
export const saveRule = (rule: Rule) => setRules((rs) => (rs.some((r) => r.id === rule.id) ? rs.map((r) => (r.id === rule.id ? rule : r)) : [...rs, rule]));
export const removeRule = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));
export const replaceRules = (rules: Rule[]) => setRules(() => rules);
export function applyAllRules(o: { scope: 'selection' | 'statement' | 'project'; overwrite: boolean; cleanup: boolean }): number {
  const s = get();
  let changed = 0;
  const docs = o.scope === 'project' ? s.docs : s.docs.filter((d) => d.id === s.activeDocId);
  for (const d of docs) {
    const ids = o.scope === 'selection' ? new Set(s.checked.length ? s.checked : s.focusRowId ? [s.focusRowId] : []) : undefined;
    const res = applyRules(d.statement.rows, s.project.rules, { ids, overwrite: o.overwrite, cleanupFallback: o.cleanup });
    if (res.changed) { changed += res.changed; commit(d.id, (st) => ({ ...st, rows: res.rows })); }
  }
  return changed;
}
export const setExportSettings = (es: ExportSettings) => set((s) => ({ ...s, project: { ...s.project, exportSettings: es, dirty: true } }));
export const renameProject = (name: string) => set((s) => ({ ...s, project: { ...s.project, name, dirty: true } }));
