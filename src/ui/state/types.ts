/** Shapes of the application state (UI layer). */
import type { ExportSettings, Rule, Statement } from '@/core/model';


export type View = 'work' | 'ledger' | 'rules';
export type DialogId = 'export' | 'projects' | 'shortcuts' | 'report' | 'privacy' | 'balances' | 'wipe' | 'samples' | 'split' | null;

export interface Doc { id: string; statement: Statement; past: Statement[]; future: Statement[]; bytes: Uint8Array | null; password?: string }
export interface QueueItem { id: string; name: string; status: 'queued' | 'parsing' | 'password' | 'error' | 'done' | 'cancelled'; progress: number; error?: string; bytes: Uint8Array; password?: string; passwordWrong?: boolean }
export interface Notice { kind: 'info' | 'success' | 'error'; text: string; id: number }
/** The whole client-side application state; everything lives in memory unless the user saves a project. */
export interface AppState {
  docs: Doc[];
  activeDocId: string | null;
  focusRowId: string | null;
  checked: string[];
  queue: QueueItem[];
  project: { id: string; name: string; rules: Rule[]; exportSettings: ExportSettings; savedAt: string | null; pdfsStored: boolean; dirty: boolean };
  view: View;
  dialog: DialogId;
  notice: Notice | null;
  online: boolean;
  columnMode: boolean;
  exportScope: 'statement' | 'project';
}
