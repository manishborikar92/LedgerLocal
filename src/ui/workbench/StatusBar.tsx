'use client';
import { formatMinor, currencyExponent } from '@/core/money';
import type { ReconcileResult } from '@/core/reconcile';
import type { Statement } from '@/core/model';
import { flipEverything, focusRow, openDialog } from '@/ui/state';
import { Check, Warn, Printer } from '@/ui/primitives/icons';

const SOURCE_NOTE: Record<string, string> = {
  label: 'Balances read from the statement.',
  'label-search': 'Balances chosen because they are the printed pair that reconciles.',
  'running-balance': 'Balances derived from the printed running balance.',
  manual: 'Balances entered by you.',
  none: 'No balances found.',
};

export function StatusBar({ st, rec }: { st: Statement; rec: ReconcileResult }) {
  const exp = currencyExponent(st.currency);
  const f = (n: number) => formatMinor(n, { exp });
  const cc = st.accountType === 'creditCard';
  const ok = rec.status === 'reconciled';
  const incomplete = rec.status === 'incomplete';
  const cls = ok ? 'stamp-ok' : incomplete ? 'stamp-warn' : 'stamp-bad';
  const label = ok ? 'Reconciled' : incomplete ? 'Needs balances' : 'Discrepancy';
  const sub = ok ? 'Δ 0.00' : incomplete ? 'enter opening & closing' : `Δ ${rec.deltaMinor! > 0 ? '+' : ''}${f(rec.deltaMinor!)}`;
  const live = ok ? `Reconciled. Difference zero.` : incomplete ? 'Opening or closing balance is missing.' : `Discrepancy of ${f(rec.deltaMinor!)}.`;
  const problem = rec.problemRowIndex !== null ? st.rows[rec.problemRowIndex] : undefined;
  const printedLbl = `Printed ${cc ? 'new balance' : 'closing'}`;
  return (
    <div className="proof" role="region" aria-label="Reconciliation proof">
      <div role="status" aria-live="polite" className="sr-only">{live}</div>
      {/* keyed by status so the stamp settles again whenever the verdict changes */}
      <div key={rec.status} className={`stamp ${cls}`} data-testid="status-stamp" data-status={rec.status}>
        <span className="inline-flex items-center gap-1.5">{ok ? <Check /> : <Warn />}{label}</span>
        <small className="num">{sub}</small>
      </div>
      {rec.status !== 'incomplete' || st.openingBalanceMinor !== null ? (
        <div className="footing num" role="group" aria-label="Reconciliation arithmetic">
          <div className="step"><div className="term"><span className="lbl">{cc ? 'Previous balance' : 'Opening'}</span><span className="val">{st.openingBalanceMinor === null ? '—' : f(st.openingBalanceMinor)}</span></div></div>
          <div className="step"><span className="op" aria-hidden="true">{cc ? '−' : '+'}</span><div className="term"><span className="lbl">{cc ? 'Payments & credits' : 'Money in'}</span><span className="val">{f(rec.totalInMinor)}</span></div></div>
          <div className="step"><span className="op" aria-hidden="true">{cc ? '+' : '−'}</span><div className="term"><span className="lbl">{cc ? 'Charges' : 'Money out'}</span><span className="val">{f(rec.totalOutMinor)}</span></div></div>
          <div className="step"><span className="op" aria-hidden="true">=</span><div className="term"><span className="lbl">Computed {cc ? 'new balance' : 'closing'}</span><span className="val total">{rec.computedClosingMinor === null ? '—' : f(rec.computedClosingMinor)}</span></div></div>
          <div className="step vs"><span className="vr" aria-hidden="true" /><div className="term"><span className="lbl">{printedLbl}</span><span className="val">{st.closingBalanceMinor === null ? '—' : f(st.closingBalanceMinor)}</span></div></div>
        </div>
      ) : <span />}
      <div className="proof-actions">
        {problem && <button className="btn btn-sm btn-danger" onClick={() => focusRow(problem.id)}>Jump to problem row ({(rec.problemRowIndex ?? 0) + 1})</button>}
        {rec.suggestions.some((s) => s.kind === 'flip-all-signs') && <button className="btn btn-sm" onClick={flipEverything}>Flip all signs</button>}
        <button className="btn btn-sm" onClick={() => openDialog('balances')}>Edit balances</button>
        <button className="btn btn-sm" onClick={() => openDialog('report')} title="Printable reconciliation report"><Printer /> Report</button>
      </div>
      <p className="proof-note">
        {!ok && !incomplete && rec.deltaMinor !== null && `The rows give a ${cc ? 'new balance' : 'closing balance'} ${f(Math.abs(rec.deltaMinor))} ${rec.deltaMinor > 0 ? 'higher' : 'lower'} than the one printed. `}{SOURCE_NOTE[st.balanceSource]} {rec.chain.status === 'verified' && `Running balance verified on ${rec.chain.checked} rows.`}
        {rec.chain.status === 'diverged' && problem && ` Running balance first diverges at row ${(rec.problemRowIndex ?? 0) + 1}: statement shows ${f(rec.chain.printedMinor!)}, rows give ${f(rec.chain.expectedMinor!)}.`}
        {rec.suggestions.filter((s) => s.kind !== 'missing-or-extra').map((s) => ` ${s.message}`).join('')}
      </p>
    </div>
  );
}
