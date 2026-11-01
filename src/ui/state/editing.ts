/** Editing: commit/undo/redo, cell edits, row operations, balances and column re-reads. */
import { getServices } from '@/composition';
import { deleteRows, flipAllSigns, flipSign, insertRow, mergeRows, setBalances, splitRow, updateRow, type RowPatch } from '@/core/edit';
import { parseDateParts, toIso } from '@/core/dates';
import { currencyExponent, parseUserAmount } from '@/core/money';
import type { ColumnDef, Statement } from '@/core/model';
import { ParseFailure } from '@/ports/errors';
import { activeDoc, get, set } from './store';
import { notify } from './ui';

/* ───────── editing with undo / redo ───────── */
export function commit(docId: string, fn: (st: Statement) => Statement): void {
  set((s) => ({
    ...s,
    docs: s.docs.map((d) => {
      if (d.id !== docId) return d;
      const next = fn(d.statement);
      return next === d.statement ? d : { ...d, statement: next, past: [...d.past.slice(-99), d.statement], future: [] };
    }),
    project: { ...s.project, dirty: true },
  }));
}
export function undo(): void {
  set((s) => ({ ...s, docs: s.docs.map((d) => (d.id === s.activeDocId && d.past.length ? { ...d, statement: d.past[d.past.length - 1]!, past: d.past.slice(0, -1), future: [d.statement, ...d.future] } : d)) }));
}
export function redo(): void {
  set((s) => ({ ...s, docs: s.docs.map((d) => (d.id === s.activeDocId && d.future.length ? { ...d, statement: d.future[0]!, future: d.future.slice(1), past: [...d.past, d.statement] } : d)) }));
}

const cur = () => activeDoc(get());
export const focusRow = (id: string | null) => set((s) => ({ ...s, focusRowId: id }));
export const toggleChecked = (id: string) => set((s) => ({ ...s, checked: s.checked.includes(id) ? s.checked.filter((x) => x !== id) : [...s.checked, id] }));
export const clearChecked = () => set((s) => ({ ...s, checked: [] }));
const targets = (): string[] => { const s = get(); return s.checked.length ? s.checked : s.focusRowId ? [s.focusRowId] : []; };

/** Edit one cell from user text. Returns an error message, or null on success. */
export function editCell(rowId: string, field: 'date' | 'description' | 'amount' | 'balance' | 'payee' | 'category', text: string): string | null {
  const d = cur();
  if (!d) return 'No statement open.';
  const exp = currencyExponent(d.statement.currency);
  let patch: RowPatch;
  switch (field) {
    case 'amount': {
      const v = parseUserAmount(text, exp);
      if (v === null) return 'Enter an amount like 1,234.50 or -12.30';
      patch = { amountMinor: v };
      break;
    }
    case 'balance': {
      if (text.trim() === '') { patch = { balanceMinor: null }; break; }
      const v = parseUserAmount(text, exp);
      if (v === null) return 'Enter a balance like 1,234.50 (or leave empty)';
      patch = { balanceMinor: v };
      break;
    }
    case 'date': {
      const t = text.trim();
      const p = /^\d{4}-\d{2}-\d{2}$/.test(t) ? parseDateParts(t) : parseDateParts(t, 'mdy');
      if (!p || p.y === undefined) return 'Use a full date such as 2025-03-31';
      patch = { date: toIso(p.y, p.m, p.d) };
      break;
    }
    case 'description': patch = { description: text }; break;
    case 'payee': patch = { payee: text || undefined }; break;
    case 'category': patch = { category: text || undefined }; break;
  }
  commit(d.id, (st) => updateRow(st, rowId, patch));
  return null;
}
export function insertRowBelow(): void {
  const d = cur();
  if (!d) return;
  const idx = Math.max(0, d.statement.rows.findIndex((r) => r.id === get().focusRowId));
  let newRowId = '';
  commit(d.id, (st) => { const r = insertRow(st, d.statement.rows.length ? idx : -1); newRowId = r.id; return r.statement; });
  focusRow(newRowId);
  // keep keyboard flow: put DOM focus on the new row's date cell once it is rendered
  setTimeout(() => document.getElementById(`c-${newRowId}-date`)?.focus(), 80);
}
export function deleteTargets(): void {
  const d = cur();
  const ids = targets();
  if (!d || !ids.length) return;
  const idx = d.statement.rows.findIndex((r) => r.id === ids[0]);
  commit(d.id, (st) => deleteRows(st, ids));
  const after = cur()!.statement.rows;
  set((s) => ({ ...s, checked: [], focusRowId: after[Math.min(idx, after.length - 1)]?.id ?? null }));
}
export function flipTargets(): void { const d = cur(); const ids = targets(); if (d && ids.length) commit(d.id, (st) => flipSign(st, ids)); }
export function flipEverything(): void { const d = cur(); if (d) commit(d.id, flipAllSigns); }
export function mergeChecked(): string | null {
  const d = cur();
  const ids = get().checked;
  if (!d || ids.length < 2) return 'Tick at least two rows (Space) to merge them.';
  commit(d.id, (st) => mergeRows(st, ids));
  set((s) => ({ ...s, checked: [] }));
  return null;
}
export function splitFocus(firstAmountText: string): string | null {
  const d = cur();
  const id = get().focusRowId;
  if (!d || !id) return 'Select a row first.';
  const v = parseUserAmount(firstAmountText, currencyExponent(d.statement.currency));
  if (v === null) return 'Enter the amount of the first part, e.g. -40.00';
  commit(d.id, (st) => splitRow(st, id, v));
  return null;
}
export function setManualBalances(openText: string, closeText: string): string | null {
  const d = cur();
  if (!d) return 'No statement open.';
  const exp = currencyExponent(d.statement.currency);
  const o = openText.trim() === '' ? null : parseUserAmount(openText, exp);
  const c = closeText.trim() === '' ? null : parseUserAmount(closeText, exp);
  if ((openText.trim() !== '' && o === null) || (closeText.trim() !== '' && c === null)) return 'Enter balances like 1,234.50';
  commit(d.id, (st) => setBalances(st, o, c));
  return null;
}

/** Re-run the parser with user-dragged column zones (uses cached page text in the worker). */
export async function reparseWith(columns: ColumnDef[]): Promise<void> {
  const d = cur();
  if (!d) return;
  const svc = getServices();
  try {
    let res;
    try {
      res = await svc.parse.reparse(d.statement.fileSha256, { columnOverride: columns, accountType: d.statement.accountType }).promise;
    } catch (e) {
      if (!(e instanceof ParseFailure && e.code === 'cache-miss') || !d.bytes) throw e;
      res = await svc.parse.parse(d.bytes, d.statement.fileName, { password: d.password, options: { columnOverride: columns, accountType: d.statement.accountType } }).promise;
    }
    commit(d.id, (st) => ({ ...st, ...res.output, id: st.id, fileName: st.fileName, fileSha256: st.fileSha256, pageCount: st.pageCount, createdAt: st.createdAt }));
    notify('success', `Re-read with your column guides: ${res.output.rows.length} rows.`);
  } catch (e) {
    notify('error', e instanceof Error ? e.message : 'Re-parse failed.');
  }
}
