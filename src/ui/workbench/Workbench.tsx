'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DropZone, QueueList } from '@/ui/import/ImportPanel';
import { Download, Flip, Merge, Plus, Printer, Redo, Split, Trash, Undo } from '@/ui/primitives/icons';
import { activeDoc, deleteTargets, flipTargets, insertRowBelow, mergeChecked, notify, openDialog, openExport, reconcileOf, redo, removeDoc, setActiveDoc, store, undo, useSel } from '@/ui/state';
import { Grid } from './Grid';
import { PdfPane } from './PdfPane';
import { StatusBar } from './StatusBar';

const SPLIT_MIN = 25;
const SPLIT_MAX = 75;

function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Warn before leaving the page with unsaved edits. */
function useUnsavedGuard() {
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = store.get();
      if (s.project.dirty && s.docs.some((d) => d.past.length)) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
}

export function Workbench() {
  const docs = useSel(store, (s) => s.docs);
  const activeId = useSel(store, (s) => s.activeDocId);
  const checked = useSel(store, (s) => s.checked);
  const doc = useMemo(() => activeDoc({ ...store.get(), docs, activeDocId: activeId }), [docs, activeId]);
  const rec = useMemo(() => (doc ? reconcileOf(doc.statement) : null), [doc]);
  const [pct, setPct] = useState(46);
  const [pane, setPane] = useState<'rows' | 'pdf'>('rows');
  const [showPayee, setShowPayee] = useState(false);
  const work = useRef<HTMLDivElement>(null);
  useUndoShortcuts();
  useUnsavedGuard();

  if (!doc || !rec) return null;

  const startDrag = (e: React.PointerEvent) => {
    const el = work.current;
    if (!el) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { const r = el.getBoundingClientRect(); setPct(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ((ev.clientX - r.left) / r.width) * 100))); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onSplitterKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPct((p) => Math.max(SPLIT_MIN, p - 3)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setPct((p) => Math.min(SPLIT_MAX, p + 3)); }
  };
  const notes = [...doc.statement.warnings, ...doc.statement.assumptions];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <div role="tablist" aria-label="Open statements" className="tabs flex-wrap">
          {docs.map((d) => {
            const r = reconcileOf(d.statement);
            const name = d.statement.fileName;
            return (
              <button key={d.id} role="tab" className="tab" aria-selected={d.id === activeId} onClick={() => setActiveDoc(d.id)} title={name}>
                <span aria-hidden>{r.status === 'reconciled' ? '✓' : r.status === 'incomplete' ? '?' : '✗'}</span> <span className="sr-only">{r.status}:</span>{' '}
                {name.length > 26 ? `${name.slice(0, 24)}…` : name}
              </button>
            );
          })}
        </div>
        <button className="btn btn-sm btn-quiet" aria-label={`Close ${doc.statement.fileName}`} onClick={() => removeDoc(doc.id)}>Close file ×</button>
        <div className="spacer" />
        <div className="min-w-[220px]"><DropZone compact /></div>
      </div>
      <QueueList />
      <StatusBar st={doc.statement} rec={rec} />
      {notes.length > 0 && (
        <details className="border-b border-line bg-[var(--warning-soft)] px-4 py-1.5">
          <summary className="font-medium text-warning">{notes.length} note(s) about how this file was read</summary>
          <ul className="mb-1 mt-1.5 text-sm">{notes.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
      <div className="tabs only-mobile m-2 self-start" role="tablist" aria-label="Pane">
        <button role="tab" className="tab" aria-selected={pane === 'rows'} onClick={() => setPane('rows')}>Rows</button>
        <button role="tab" className="tab" aria-selected={pane === 'pdf'} onClick={() => setPane('pdf')}>PDF</button>
      </div>
      <div className="work" ref={work} style={{ ['--split' as string]: `${pct}%` }}>
        <section aria-label="PDF source" data-hidden={pane !== 'pdf' ? 'true' : undefined}>
          <PdfPane doc={doc} rec={rec} />
        </section>
        {/* A focusable separator is an ARIA 1.2 widget (window splitter); lint cannot see that. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Resize panes" aria-valuenow={Math.round(pct)} aria-valuemin={SPLIT_MIN} aria-valuemax={SPLIT_MAX} tabIndex={0} onPointerDown={startDrag} onKeyDown={onSplitterKey} />
        <section aria-label="Transactions" data-hidden={pane !== 'rows' ? 'true' : undefined}>
          <div className="toolbar" role="toolbar" aria-label="Row tools">
            <button className="btn btn-sm" onClick={undo} disabled={!doc.past.length} aria-label="Undo (Ctrl+Z)"><Undo /> Undo</button>
            <button className="btn btn-sm" onClick={redo} disabled={!doc.future.length} aria-label="Redo (Ctrl+Shift+Z)"><Redo /> Redo</button>
            <span aria-hidden className="sep" />
            <button className="btn btn-sm" onClick={insertRowBelow}><Plus /> Add row</button>
            <button className="btn btn-sm" onClick={deleteTargets}><Trash /> Delete</button>
            <button className="btn btn-sm" onClick={() => openDialog('split')}><Split /> Split</button>
            <button className="btn btn-sm" onClick={() => { const m = mergeChecked(); if (m) notify('info', m); }} disabled={checked.length < 2}><Merge /> Merge{checked.length > 1 ? ` (${checked.length})` : ''}</button>
            <button className="btn btn-sm" onClick={flipTargets}><Flip /> Flip sign</button>
            <label className="chip cursor-pointer"><input type="checkbox" checked={showPayee} onChange={(e) => setShowPayee(e.target.checked)} /> Payee &amp; category</label>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={() => openDialog('report')}><Printer /> Report</button>
            <button className="btn btn-sm btn-primary" data-testid="export-btn" onClick={() => openExport('statement')}><Download /> Export…</button>
          </div>
          <Grid doc={doc} rec={rec} showPayee={showPayee} />
          <div className="muted border-t border-line px-3 py-1.5 text-[12.5px]">
            {doc.statement.rows.length} rows · <button className="btn btn-quiet btn-sm !min-h-0 !p-0 underline" onClick={() => openDialog('shortcuts')}>keyboard shortcuts</button> · column guides are on the PDF side
          </div>
        </section>
      </div>
    </div>
  );
}
