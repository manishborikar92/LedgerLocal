/** Transient UI state: dialogs, views, notices, connectivity. */
import { get, set } from './store';
import type { DialogId, Notice, View } from './types';

let noticeSeq = 0;
export function notify(kind: Notice['kind'], text: string): void {
  const id = ++noticeSeq;
  set((s) => ({ ...s, notice: { kind, text, id } }));
  setTimeout(() => { if (get().notice?.id === id) set((s) => ({ ...s, notice: null })); }, kind === 'error' ? 9000 : 5000);
}
export const closeDialog = () => set((s) => ({ ...s, dialog: null }));
export const openDialog = (d: DialogId) => set((s) => ({ ...s, dialog: d }));
export const openExport = (scope: 'statement' | 'project') => set((s) => ({ ...s, dialog: 'export', exportScope: scope }));
export const setView = (view: View) => set((s) => ({ ...s, view }));
export const setOnline = (online: boolean) => set((s) => ({ ...s, online }));
export const setColumnMode = (on: boolean) => set((s) => ({ ...s, columnMode: on }));
