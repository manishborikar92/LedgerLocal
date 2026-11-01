'use client';
import { formatMinor, currencyExponent } from '@/core/money';
import { activeDoc, closeDialog, reconcileOf, store, useSel } from '@/ui/state';
import { Printer } from '@/ui/primitives/icons';

export function ReportOverlay() {
  const docs = useSel(store, (s) => s.docs);
  const activeId = useSel(store, (s) => s.activeDocId);
  const project = useSel(store, (s) => s.project);
  const doc = activeDoc({ ...store.get(), docs, activeDocId: activeId });
  if (!doc) return null;
  const st = doc.statement;
  const rec = reconcileOf(st);
  const exp = currencyExponent(st.currency);
  const f = (n: number | null) => (n === null ? '—' : formatMinor(n, { exp }));
  const cc = st.accountType === 'creditCard';
  const bad = st.rows.map((r, i) => ({ r, i })).filter(({ i }) => rec.chain.perRow[i] === 'bad');
  const stamp = rec.status === 'reconciled' ? 'Reconciled' : rec.status === 'incomplete' ? 'Incomplete' : 'Discrepancy';
  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Reconciliation report" data-testid="report">
      <div className="no-print mx-auto mb-3 flex max-w-[820px] gap-2">
        <button className="btn btn-primary" onClick={() => window.print()}><Printer /> Print / save as PDF</button>
        <button className="btn" onClick={closeDialog} autoFocus>Close</button>
      </div>
      <article className="report">
        <h1 className="text-[26px]">Reconciliation report</h1>
        <p className="my-1 mb-3">Client: <strong>{project.name}</strong> · Generated {new Date().toLocaleString()} on this device by LedgerLocal. Nothing was uploaded.</p>
        <table><tbody>
          <tr><th>Source file</th><td>{st.fileName}</td><th>Account</th><td>{cc ? 'Credit card' : 'Bank account'} {st.accountLast4 ? `…${st.accountLast4}` : '(number not found)'} · {st.currency}</td></tr>
          <tr><th>Statement period</th><td>{st.periodStart ?? '?'} to {st.periodEnd ?? '?'}</td><th>PDF fingerprint (SHA-256)</th><td className="mono break-all text-[11px]">{st.fileSha256}</td></tr>
        </tbody></table>
        <h2 className="text-lg">Proof <span className="stamp-print ml-3">{stamp}</span></h2>
        <table className="num"><tbody>
          <tr><td>{cc ? 'Previous balance (printed)' : 'Opening balance (printed)'}</td><td className="r">{f(st.openingBalanceMinor)}</td></tr>
          <tr><td>{cc ? '− Payments and credits' : '+ Money in'}</td><td className="r">{f(rec.totalInMinor)}</td></tr>
          <tr><td>{cc ? '+ Charges, fees and interest' : '− Money out'}</td><td className="r">{f(rec.totalOutMinor)}</td></tr>
          <tr><td><strong>= Computed {cc ? 'new balance' : 'closing balance'}</strong></td><td className="r"><strong>{f(rec.computedClosingMinor)}</strong></td></tr>
          <tr><td>{cc ? 'New balance (printed)' : 'Closing balance (printed)'}</td><td className="r">{f(st.closingBalanceMinor)}</td></tr>
          <tr><td><strong>Difference</strong></td><td className="r"><strong>{f(rec.deltaMinor)}</strong></td></tr>
        </tbody></table>
        <p>Running-balance check: {rec.chain.status === 'verified' ? `${rec.chain.checked} rows verified one by one against the printed running balance.` : rec.chain.status === 'unavailable' ? 'this statement prints no running balance, so only the totals could be proven.' : `first divergence at row ${(rec.problemRowIndex ?? 0) + 1}.`} Balances source: {st.balanceSource}. {st.rows.length} transactions on {st.pagesWithRows.length} page(s) of {st.pageCount}.</p>
        {bad.length > 0 && (<><h3 className="text-base">Rows needing attention</h3><table><thead><tr><th>#</th><th>Date</th><th>Description</th><th className="r">Amount</th><th className="r">Printed balance</th></tr></thead><tbody>{bad.slice(0, 40).map(({ r, i }) => <tr key={r.id}><td>{i + 1}</td><td>{r.date}</td><td>{r.description}</td><td className="r">{f(r.amountMinor)}</td><td className="r">{f(r.balanceMinor ?? null)}</td></tr>)}</tbody></table></>)}
        {(st.warnings.length > 0 || st.assumptions.length > 0) && (<><h3 className="text-base">How this file was read</h3><ul>{[...st.warnings, ...st.assumptions].map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
        <p className="border-t border-[#999] pt-2 text-xs">Not financial advice. This report proves arithmetic consistency between the rows read from the PDF and the balances printed on it; it does not prove that the statement itself is genuine. Verify exports before filing or importing.</p>
      </article>
    </div>
  );
}
