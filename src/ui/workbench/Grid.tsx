'use client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { currencyExponent, formatMinor, minorToPlain } from '@/core/money';
import type { Row } from '@/core/model';
import type { ReconcileResult } from '@/core/reconcile';
import { deleteTargets, editCell, focusRow, insertRowBelow, openDialog, store, toggleChecked, flipTargets, mergeChecked, notify, type Doc } from '@/ui/state';
import { useSel } from '@/ui/state/create-store';

type ColId = 'check' | 'tick' | 'date' | 'description' | 'payee' | 'category' | 'amount' | 'balance';
const HEAD: Record<ColId, string> = { check: '', tick: '', date: 'Date', description: 'Description', payee: 'Payee', category: 'Category', amount: 'Amount', balance: 'Balance' };
const EDITABLE = new Set<ColId>(['date', 'description', 'payee', 'category', 'amount', 'balance']);
const FLAG_LABEL: Record<string, string> = { manual: 'added', split: 'split', merged: 'merged', edited: 'edited', 'date-inherited': 'date from above' };

export function Grid({ doc, rec, showPayee }: { doc: Doc; rec: ReconcileResult; showPayee: boolean }) {
  const st = doc.statement;
  const rows = st.rows;
  const exp = currencyExponent(st.currency);
  const focusRowId = useSel(store, (s) => s.focusRowId);
  const checked = useSel(store, (s) => s.checked);
  const cols: ColId[] = showPayee ? ['check', 'tick', 'date', 'description', 'payee', 'category', 'amount', 'balance'] : ['check', 'tick', 'date', 'description', 'amount', 'balance'];
  const [col, setCol] = useState(2);
  const [edit, setEdit] = useState<{ rowId: string; col: ColId; value: string; error?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 34, overscan: 10 });
  const activeIdx = rows.findIndex((r) => r.id === focusRowId);

  useEffect(() => { if (activeIdx >= 0) v.scrollToIndex(activeIdx, { align: 'auto' }); }, [focusRowId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (wantFocus.current && !edit && focusRowId) {
      document.getElementById(`c-${focusRowId}-${cols[col]}`)?.focus();
      wantFocus.current = false;
    }
  });

  const text = (r: Row, c: ColId): string => {
    switch (c) {
      case 'date': return r.date;
      case 'description': return r.description;
      case 'payee': return r.payee ?? '';
      case 'category': return r.category ?? '';
      case 'amount': return minorToPlain(r.amountMinor, exp);
      case 'balance': return r.balanceMinor == null ? '' : minorToPlain(r.balanceMinor, exp);
      default: return '';
    }
  };
  const move = (dr: number, dc: number) => {
    const i = Math.max(0, Math.min(rows.length - 1, (activeIdx < 0 ? 0 : activeIdx) + dr));
    const nc = Math.max(0, Math.min(cols.length - 1, col + dc));
    setCol(nc);
    if (rows[i]) focusRow(rows[i]!.id);
    wantFocus.current = true;
  };
  const startEdit = (r: Row, c: ColId, initial?: string) => {
    if (!EDITABLE.has(c)) return;
    setEdit({ rowId: r.id, col: c, value: initial ?? text(r, c) });
  };
  const commit = (dir: 'down' | 'right' | 'none') => {
    if (!edit) return;
    const err = editCell(edit.rowId, edit.col as 'date' | 'description' | 'amount' | 'balance' | 'payee' | 'category', edit.value);
    if (err) { setEdit({ ...edit, error: err }); return; }
    setEdit(null);
    if (dir === 'down') move(1, 0); else if (dir === 'right') move(0, 1); else wantFocus.current = true;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (edit) return;
    const r = rows[activeIdx < 0 ? 0 : activeIdx];
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && k.toLowerCase() === 'f') { e.preventDefault(); flipTargets(); return; }
    if (mod && k.toLowerCase() === 'm') { e.preventDefault(); const m = mergeChecked(); if (m) notify('info', m); return; }
    if (mod && k === '\\') { e.preventDefault(); openDialog('split'); return; }
    if (mod && (k === 'Enter')) { e.preventDefault(); insertRowBelow(); return; }
    if (mod) return;
    if (k === 'ArrowDown') { e.preventDefault(); move(1, 0); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
    else if (k === 'ArrowRight') { e.preventDefault(); move(0, 1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
    else if (k === 'PageDown') { e.preventDefault(); move(10, 0); }
    else if (k === 'PageUp') { e.preventDefault(); move(-10, 0); }
    else if (k === 'Home') { e.preventDefault(); move(0, -cols.length); }
    else if (k === 'End') { e.preventDefault(); move(0, cols.length); }
    else if (k === ' ' && r) { e.preventDefault(); toggleChecked(r.id); }
    else if (k === 'Delete') { e.preventDefault(); deleteTargets(); }
    else if (k === 'Insert') { e.preventDefault(); insertRowBelow(); }
    else if ((k === 'Enter' || k === 'F2') && r) { e.preventDefault(); if (cols[col] === 'check') toggleChecked(r.id); else startEdit(r, cols[col]!); }
    else if (k.length === 1 && !e.altKey && r && EDITABLE.has(cols[col]!)) { e.preventDefault(); startEdit(r, cols[col]!, k); }
  };

  if (!rows.length) {
    return (
      <div className="gridwrap" style={{ display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 420 }}>
          <h3 style={{ fontSize: 20, marginBottom: 8 }}>No transactions were read</h3>
          <p className="muted">The PDF has text, but no transaction table was recognised. Open the column guides on the PDF side to mark the columns, or add rows by hand.</p>
          <button className="btn" onClick={insertRowBelow}>Add a row</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gridwrap" ref={scrollRef}>
      <div className="data-grid" role="grid" aria-label={`Transactions in ${st.fileName}`} aria-rowcount={rows.length + 1} aria-colcount={cols.length} aria-multiselectable="true" onKeyDown={onKeyDown}>
        <div role="row" aria-rowindex={1} className={`grid-row head ${showPayee ? 'payee' : ''}`}>
          {cols.map((c, ci) => (
            <div key={c} role="columnheader" aria-colindex={ci + 1} className={`gcell ${c === 'amount' || c === 'balance' ? 'r' : ''} ${c === 'tick' ? 'margin' : ''}`}>
              {c === 'check' ? <span className="sr-only">Select</span> : c === 'tick' ? <span className="sr-only">Running balance check</span> : c === 'balance' ? <span title="Running balance as printed on the statement">{HEAD[c]}<span className="sr-only"> (as printed)</span></span> : HEAD[c]}
            </div>
          ))}
        </div>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const r = rows[vi.index]!;
            const chk = rec.chain.perRow[vi.index] ?? 'na';
            const sel = r.id === focusRowId;
            const isChecked = checked.includes(r.id);
            return (
              <div key={r.id} role="row" aria-rowindex={vi.index + 2} aria-selected={sel || isChecked} data-row-id={r.id} className={`grid-row ${showPayee ? 'payee' : ''} ${chk === 'bad' ? 'bad' : ''}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)` }}>
                {cols.map((c, ci) => {
                  const active = sel && cols[col] === c;
                  const tabStop = (activeIdx < 0 ? vi.index === 0 : sel) && cols[col] === c;
                  const editing = edit?.rowId === r.id && edit.col === c;
                  const common = { role: 'gridcell' as const, id: `c-${r.id}-${c}`, 'aria-colindex': ci + 1, tabIndex: tabStop ? 0 : -1, 'data-active': active };
                  const select = () => { setCol(ci); focusRow(r.id); };
                  if (c === 'check') return <div key={c} {...common} className="gcell" onClick={() => { select(); toggleChecked(r.id); }}><span role="checkbox" aria-checked={isChecked} aria-label={`Select row ${vi.index + 1}`}>{isChecked ? '☑' : '☐'}</span></div>;
                  if (c === 'tick') return (
                    <div key={c} {...common} className="gcell margin" onClick={select} title={chk === 'ok' ? 'Running balance matches' : chk === 'bad' ? 'Running balance does NOT match from this row' : 'No printed balance to check'}>
                      <span className={`tickmark ${chk}`} aria-label={chk === 'ok' ? 'Running balance verified' : chk === 'bad' ? 'Running balance mismatch' : 'Not checked'}>{chk === 'ok' ? '✓' : chk === 'bad' ? '✗' : '–'}</span>
                    </div>
                  );
                  if (editing) {
                    return (
                      <div key={c} {...common} className="gcell" style={{ padding: 0 }}>
                        <input autoFocus aria-label={`Edit ${HEAD[c]}`} aria-invalid={!!edit.error} aria-describedby={edit.error ? 'cell-err' : undefined} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value, error: undefined })}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit('down'); } else if (e.key === 'Tab') { e.preventDefault(); commit('right'); } else if (e.key === 'Escape') { e.preventDefault(); setEdit(null); wantFocus.current = true; } }}
                          onBlur={() => { if (!edit.error) commit('none'); else setEdit(null); }} />
                        {edit.error && <span id="cell-err" role="alert" className="sr-only">{edit.error}</span>}
                      </div>
                    );
                  }
                  const right = c === 'amount' || c === 'balance';
                  const val = c === 'amount' ? formatMinor(r.amountMinor, { exp }) : c === 'balance' ? (r.balanceMinor == null ? '' : formatMinor(r.balanceMinor, { exp })) : text(r, c);
                  const flags = c === 'description' ? (r.flags ?? []).filter((f) => FLAG_LABEL[f]) : [];
                  return (
                    <div key={c} {...common} className={`gcell ${right ? 'r num' : ''} ${c === 'amount' && r.amountMinor < 0 ? 'neg' : ''}`} onClick={select} onDoubleClick={() => startEdit(r, c)} title={c === 'description' ? r.description : undefined}>
                      {val}
                      {flags.map((f) => <span key={f} className="chip" style={{ fontSize: 11, padding: '0 6px', marginLeft: 8 }}>{FLAG_LABEL[f]}</span>)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {edit?.error && <div className="note bad" role="alert" style={{ position: 'sticky', bottom: 0 }}>{edit.error}</div>}
    </div>
  );
}
