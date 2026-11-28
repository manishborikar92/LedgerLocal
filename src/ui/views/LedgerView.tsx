'use client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mergeStatements, type Continuity } from '@/core/merge';
import { currencyExponent, formatMinor } from '@/core/money';
import { Download } from '@/ui/primitives/icons';
import { openExport, setView, store, useSel } from '@/ui/state';

const KIND: Record<Continuity['kind'], [string, string]> = {
  ok: ['chip-success', '✓ Continuous'],
  'balance-mismatch': ['chip-danger', '✗ Balance mismatch'],
  'period-gap': ['chip-warning', '! Gap'],
  overlap: ['chip-warning', '! Overlap'],
};

export function LedgerView() {
  const docs = useSel(store, (s) => s.docs);
  const statements = useMemo(() => docs.map((d) => d.statement), [docs]);
  const merged = useMemo(() => mergeStatements(statements), [statements]);
  const duplicates = useMemo(() => new Set(merged.duplicates.flatMap((d) => d.rowIds)), [merged]);
  const fileName = (id: string) => statements.find((s) => s.id === id)?.fileName ?? id;
  const scroller = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(34);
  const virt = useVirtualizer({ count: merged.rows.length, getScrollElement: () => scroller.current, estimateSize: () => rowH, overscan: 12 });
  // the stylesheet decides the row height (one line, or two in a narrow card); keep the virtual list in step with it
  useEffect(() => {
    const el = table.current;
    if (!el) return;
    const read = () => { const h = parseFloat(getComputedStyle(el).getPropertyValue('--ledger-row-h')); if (h > 0) setRowH(h); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [docs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { virt.measure(); }, [rowH]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!docs.length) {
    return <div className="page py-8"><p>Open at least two statements to build a merged ledger.</p><button className="btn" onClick={() => setView('work')}>Back to workbench</button></div>;
  }
  const exp = currencyExponent(statements[0]!.currency);
  return (
    <div className="page grid gap-4 pb-10 pt-5">
      <div className="view-head">
        <h1 className="display">Merged ledger</h1>
        <span className="muted num">{statements.length} statements · {merged.rows.length} transactions · {merged.accounts.length} account(s)</span>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => openExport('project')} data-testid="export-merged"><Download /> Export merged…</button>
      </div>
      <section aria-label="Continuity checks" className="card p-4">
        <h2 className="mb-2 text-xl">Continuity</h2>
        {merged.continuity.length === 0 ? <p className="muted m-0">Add a second statement for the same account to check that each month closes where the next one opens.</p> : (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {merged.continuity.map((c, i) => {
              const [cls, label] = KIND[c.kind];
              return <li key={i} className="flex flex-wrap items-baseline gap-2.5"><span className={`chip ${cls}`}>{label}</span><span>{c.detail}{c.deltaMinor !== undefined && <> Difference <span className="num">{formatMinor(c.deltaMinor, { exp })}</span>.</>}</span></li>;
            })}
          </ul>
        )}
        {merged.duplicates.length > 0 && <p className="note warn mb-0 mt-3"><strong>{merged.duplicates.length} possible duplicate transaction(s)</strong> appear in more than one statement (same account, date, amount and description). Exports skip such overlap duplicates automatically.</p>}
      </section>
      <section aria-label="All transactions" className="card ledger overflow-hidden">
        <div ref={table} role="table" aria-label="Merged transactions" aria-rowcount={merged.rows.length + 1}>
          <div role="row" className="grid-row head">
            <div role="columnheader" data-col="date" className="gcell">Date</div><div role="columnheader" data-col="description" className="gcell">Description</div><div role="columnheader" data-col="amount" className="gcell r">Amount</div><div role="columnheader" data-col="account" className="gcell">Account</div><div role="columnheader" className="gcell">Statement</div>
          </div>
          <div ref={scroller} className="max-h-[55dvh] overflow-auto">
            <div className="relative" style={{ height: virt.getTotalSize() }}>
              {virt.getVirtualItems().map((vi) => {
                const r = merged.rows[vi.index]!;
                const acct = r.accountKey.split(':')[1];
                return (
                  <div key={r.id} role="row" aria-rowindex={vi.index + 2} className="grid-row absolute inset-x-0 top-0" style={{ transform: `translateY(${vi.start}px)` }}>
                    <div role="cell" data-col="date" className="gcell num">{r.date}</div>
                    <div role="cell" data-col="description" className="gcell" title={r.description}>{r.description}{duplicates.has(r.id) && <span className="chip chip-warning ml-2 !min-h-0 px-1.5 text-[11px]">possible duplicate</span>}</div>
                    <div role="cell" data-col="amount" className="gcell r num">{formatMinor(r.amountMinor, { exp }).replace(/^-/, '−')}</div>
                    <div role="cell" data-col="account" className="gcell">{acct === 'unknown' ? '—' : `…${acct}`}</div>
                    <div role="cell" data-col="statement" className="gcell muted" title={fileName(r.statementId)}>{fileName(r.statementId)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
