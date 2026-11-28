'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getServices, type RenderDoc } from '@/composition';
import type { ColumnDef, ColumnRole, Row } from '@/core/model';
import type { ReconcileResult } from '@/core/reconcile';
import { focusRow, reattachPdf, reparseWith, setColumnMode, store, type Doc } from '@/ui/state';
import { useSel } from '@/ui/state/create-store';
import { ChevronLeft, ChevronRight, Columns, Minus, Plus } from '@/ui/primitives/icons';

type Kind = 'date' | 'desc' | 'amount' | 'balance';
interface Box { key: string; rowId: string; kind: Kind; page: number; x: number; y: number; w: number; h: number }
const KIND_LABEL: Record<Kind, string> = { date: 'date', desc: 'description', amount: 'amount', balance: 'balance' };
const ROLES: ColumnRole[] = ['date', 'postDate', 'description', 'debit', 'credit', 'amount', 'balance', 'ref', 'ignore'];

function boxesOf(r: Row): Box[] {
  const s = r.source;
  if (!s) return [];
  const out: Box[] = [];
  const add = (kind: Kind, b: { page: number; x: number; y: number; w: number; h: number } | undefined, i = 0) => b && out.push({ key: `${r.id}-${kind}-${i}`, rowId: r.id, kind, ...b });
  add('date', s.date);
  (s.description ?? []).forEach((b, i) => add('desc', b, i));
  add('amount', s.amount);
  add('balance', s.balance);
  return out;
}
export const firstPage = (r: Row): number | null => r.source?.date?.page ?? r.source?.amount?.page ?? r.source?.description?.[0]?.page ?? null;

export function PdfPane({ doc, rec }: { doc: Doc; rec: ReconcileResult }) {
  const st = doc.statement;
  const focusRowId = useSel(store, (s) => s.focusRowId);
  const columnMode = useSel(store, (s) => s.columnMode);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rdoc, setRdoc] = useState<RenderDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pageWidthPts, setPageWidthPts] = useState(612);
  const [ready, setReady] = useState<number | null>(null); // page number whose canvas is fully drawn
  const [width, setWidth] = useState(600);
  const [draft, setDraft] = useState<ColumnDef[] | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // open the document for rendering
  useEffect(() => {
    let dead = false;
    let opened: RenderDoc | null = null;
    setRdoc(null); setErr(null);
    if (!doc.bytes) return;
    getServices().renderPdf(doc.bytes, doc.password).then((d) => { if (dead) d.destroy(); else { opened = d; setRdoc(d); } }).catch((e) => !dead && setErr(e instanceof Error ? e.message : 'Could not render this PDF.'));
    return () => { dead = true; opened?.destroy(); };
  }, [doc.id, doc.bytes, doc.password]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(260, el.clientWidth - 32)));
    ro.observe(el);
    setWidth(Math.max(260, el.clientWidth - 32));
    return () => ro.disconnect();
  }, []);

  // follow the focused row to its page
  const focusRowObj = useMemo(() => st.rows.find((r) => r.id === focusRowId), [st.rows, focusRowId]);
  useEffect(() => { const p = focusRowObj ? firstPage(focusRowObj) : null; if (p && p !== page) setPage(p); }, [focusRowId]); // eslint-disable-line react-hooks/exhaustive-deps

  // render the page
  useEffect(() => {
    const c = canvasRef.current;
    if (!rdoc || !c) return;
    let dead = false;
    const pg = Math.min(Math.max(page, 1), rdoc.numPages);
    setReady(null);
    rdoc.render(pg, c, width * zoom).then((r) => { if (!dead) { setScale(r.scale); setPageWidthPts((width * zoom) / r.scale); setReady(pg); } }).catch((e) => !dead && setErr(e instanceof Error ? e.message : 'Render failed.'));
    return () => { dead = true; };
  }, [rdoc, page, width, zoom]);

  // scroll the focused box into view
  useEffect(() => { boxRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' }); }, [focusRowId, scale, page]);

  const bad = useMemo(() => new Set(st.rows.filter((_, i) => rec.chain.perRow[i] === 'bad').map((r) => r.id)), [st.rows, rec]);
  const boxes = useMemo(() => st.rows.flatMap(boxesOf).filter((b) => b.page === page), [st.rows, page]);

  // column guides (user anchoring)
  const root = st.tables.find((t) => t.page <= page) ?? st.tables[0];
  useEffect(() => { if (columnMode) setDraft(root ? root.columns.map((c) => ({ ...c })) : null); }, [columnMode, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<number | null>(null);
  /** Move the border between column i-1 and i to x (PDF points), keeping a minimum column width. */
  const moveGuide = (i: number, x: number) => {
    if (!draft) return;
    const lo = (draft[i - 1]?.x0 ?? 0) + 8;
    const hi = (draft[i]?.x1 ?? 1000) - 8;
    const nx = Math.min(Math.max(x, lo), hi);
    setDraft(draft.map((c, j) => (j === i ? { ...c, x0: nx } : j === i - 1 ? { ...c, x1: nx } : c)));
  };
  const onGuideMove = (e: React.PointerEvent, i: number) => {
    if (drag.current !== i) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    moveGuide(i, (e.clientX - rect.left) / scale);
  };
  // WCAG 2.2 SC 2.5.7: dragging has a keyboard alternative (arrows move 1 pt; Shift+arrows move 10 pt).
  const onGuideKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveGuide(i, (draft?.[i]?.x0 ?? 0) - step); }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveGuide(i, (draft?.[i]?.x0 ?? 0) + step); }
  };

  if (!doc.bytes) {
    return (
      <div className="pdfstage grid place-items-center text-center">
        <div className="max-w-sm">
          <h3 className="mb-2 text-xl">Source PDF not on this device</h3>
          <p className="muted mb-4">Saved projects keep rows, not PDFs (unless you opted in). Attach the original PDF to see the highlighted audit trail. It is verified against the stored fingerprint and never uploaded.</p>
          <label className="btn btn-primary cursor-pointer">
            Attach the original PDF
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void reattachPdf(f); }} />
          </label>
        </div>
      </div>
    );
  }
  const pages = rdoc?.numPages ?? st.pageCount;
  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="PDF controls">
        <button className="btn btn-sm btn-icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page"><ChevronLeft /></button>
        <span className="num pg" aria-live="polite">Page {page} of {pages}</span>
        <button className="btn btn-sm btn-icon" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page"><ChevronRight /></button>
        <span aria-hidden className="sep" />
        <button className="btn btn-sm btn-icon" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out"><Minus /></button>
        <span className="num pg">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm btn-icon" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Zoom in"><Plus /></button>
        <div className="spacer" />
        <button className="btn btn-sm" aria-pressed={columnMode} onClick={() => setColumnMode(!columnMode)} disabled={!st.tables.length && !columnMode} title="Move column borders and re-read the statement"><Columns /> <span className="lbl-wide">Column guides</span></button>
      </div>
      {columnMode && draft && (
        <div className="note guides-panel">
          <strong>Column guides.</strong> Drag the red lines on the page to move column borders, set what each column is, then re-read. Applies to the whole statement.
          <div className="my-2 flex flex-wrap gap-1.5">
            {draft.map((c, i) => (
              <label key={i} className="field min-w-28">Column {i + 1}
                <select className="input" value={c.role} onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, role: e.target.value as ColumnRole } : d)))}>
                  {ROLES.map((r) => <option key={r} value={r}>{r === 'postDate' ? 'post date' : r}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => { void reparseWith(draft); setColumnMode(false); }}>Re-read with these columns</button>{' '}
          <button className="btn btn-sm" onClick={() => setDraft(root ? root.columns.map((c) => ({ ...c })) : null)}>Reset</button>
        </div>
      )}
      <div className="pdfstage" ref={stageRef} data-testid="pdf-stage">
        {err ? <div className="note bad">{err}</div> : (
          <div className="pagebox" data-rendered={ready === page ? 'true' : 'false'} style={ready === page ? undefined : { minHeight: 240 }}>
            <canvas ref={canvasRef} aria-label={`PDF page ${page}`} role="img" style={{ visibility: ready === page ? 'visible' : 'hidden' }} />
            {ready === page && <div className="ovl">
              {boxes.map((b) => {
                const sel = b.rowId === focusRowId;
                const isBad = bad.has(b.rowId);
                const row = st.rows.find((r) => r.id === b.rowId);
                return (
                  <div
                    key={b.key}
                    ref={sel && b.kind === 'amount' ? boxRef : undefined}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Row ${(st.rows.findIndex((r) => r.id === b.rowId)) + 1} ${KIND_LABEL[b.kind]}: ${row?.description ?? ''}`}
                    className={`cellbox k-${b.kind} ${sel ? 'sel' : ''} ${isBad ? 'badrow' : ''}`}
                    data-row-id={b.rowId}
                    style={{ left: b.x * scale - 1, top: b.y * scale - 1, width: b.w * scale + 2, height: b.h * scale + 2 }}
                    onClick={() => focusRow(b.rowId)}
                    onKeyDown={(e) => { if (e.key === 'Enter') focusRow(b.rowId); }}
                  />
                );
              })}
              {columnMode && draft && draft.slice(1).map((c, k) => {
                const i = k + 1;
                return (
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions
                  <div key={i} className="colguide" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Border between column ${i} and ${i + 1}`} aria-valuenow={Math.round(c.x0)} aria-valuemin={0} aria-valuemax={Math.round(pageWidthPts)} style={{ left: c.x0 * scale }}
                    onPointerDown={(e) => { drag.current = i; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
                    onPointerMove={(e) => onGuideMove(e, i)} onPointerUp={() => { drag.current = null; }} onKeyDown={(e) => onGuideKey(e, i)}>
                    <span className="handle" aria-hidden="true">⇔</span>
                  </div>
                );
              })}
            </div>}
          </div>
        )}
        {ready !== page && !err && <p className="muted m-0 mt-3 text-center">Rendering page…</p>}
        <ul className="legend" aria-label="What the outlines on the page mean">
          <li><i /> date</li><li><i className="k-desc" /> description</li><li><i className="k-amount" /> amount</li><li><i className="k-balance" /> balance</li><li><i className="k-bad" /> running-balance mismatch</li>
        </ul>
      </div>
    </>
  );
}
