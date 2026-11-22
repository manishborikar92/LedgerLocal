/** The single app store plus tiny selectors. Feature modules import { get, set } from here. */
import { reconcile } from '@/core/reconcile';
import { ExportSettingsSchema, newId, type Statement } from '@/core/model';
import { createStore } from './create-store';
import type { AppState, Doc } from './types';

export const freshProject = (): AppState['project'] => ({ id: newId(), name: 'Untitled client', rules: [], exportSettings: ExportSettingsSchema.parse({}), savedAt: null, pdfsStored: false, dirty: false });
export const store = createStore<AppState>({ docs: [], activeDocId: null, focusRowId: null, checked: [], queue: [], project: freshProject(), view: 'work', dialog: null, notice: null, online: true, columnMode: false, exportScope: 'statement', offlineReady: false });
export const get = store.get;
export const set = store.set;

export const activeDoc = (s: AppState): Doc | null => s.docs.find((d) => d.id === s.activeDocId) ?? null;
export const reconcileOf = (st: Statement) => reconcile({ accountType: st.accountType, openingBalanceMinor: st.openingBalanceMinor, closingBalanceMinor: st.closingBalanceMinor, rows: st.rows });
