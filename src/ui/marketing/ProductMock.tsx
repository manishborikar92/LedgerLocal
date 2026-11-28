/**
 * Static illustration of the product's two proofs side by side: the PDF page with the row's boxes outlined, and the
 * ruled rows with their tick margin under the arithmetic proof. Fictional bank, figures from the bundled synthetic
 * sample; five of its 24 rows are shown. It is decorative and hidden from assistive technology except for the caption.
 */
import { Check } from '@/ui/primitives/icons';

const ROWS: { d: string; desc: string; amt: string; bal: string; on?: boolean }[] = [
  { d: '06/01', desc: 'Saffron Table', amt: '−440.09', bal: '6,850.34' },
  { d: '06/03', desc: 'Transfer from Savings', amt: '1,079.58', bal: '7,929.92' },
  { d: '06/06', desc: 'Summit Fitness Club', amt: '−419.74', bal: '7,510.18', on: true },
  { d: '06/07', desc: 'Harbor Fuel #7042', amt: '−399.14', bal: '7,111.04' },
  { d: '06/10', desc: 'Cedar and Oak Hardware', amt: '−255.56', bal: '6,855.48' },
];

export function ProductMock() {
  return (
    <figure className="board">
      <div aria-hidden="true">
        <div className="board-proof">
          <div className="stamp stamp-ok"><span className="inline-flex items-center gap-1.5"><Check /> Reconciled</span><small className="num">Δ 0.00</small></div>
          <div className="footing num">
            <div className="term"><span className="lbl">Opening</span><span className="val">7,290.43</span></div>
            <span className="op">+</span>
            <div className="term"><span className="lbl">Money in</span><span className="val">4,854.32</span></div>
            <span className="op">−</span>
            <div className="term"><span className="lbl">Money out</span><span className="val">5,275.57</span></div>
            <span className="op">=</span>
            <div className="term"><span className="lbl">Computed closing</span><span className="val total">6,869.18</span></div>
            <span className="vr" />
            <div className="term"><span className="lbl">Printed closing</span><span className="val">6,869.18</span></div>
          </div>
        </div>
        <div className="board-body">
          <div className="sheet">
            <div className="sheet-paper">
              <b>Harborline Savings Bank</b>
              Statement of Account · 06/01/2025 – 06/30/2025
              <div className="sheet-head"><span>Date</span><span>Description</span><span>Amount</span><span>Balance</span></div>
              {ROWS.map((r) => (
                <div key={r.d + r.desc} className={`sheet-line num ${r.on ? 'on' : ''}`}>
                  <span className="bx">{r.d}/2025</span>
                  <span className="bx bx-d">{r.desc}</span>
                  <span className="bx bx-a">{r.amt.replace('−', '-')}</span>
                  <span className="bx bx-b">{r.bal}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            {ROWS.map((r) => (
              <div key={r.d + r.desc} className={`mock-row ${r.on ? 'on' : ''}`}>
                <span className="tickmark ok">✓</span>
                <span className="muted">{r.d}</span>
                <span className="truncate">{r.desc}</span>
                <span className="r">{r.amt}</span>
                <span className="r muted">{r.bal}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="muted border-t border-line px-4 py-2.5 text-xs">
        Illustration based on the bundled synthetic sample (fictional bank), descriptions shortened, 5 of 24 rows. Selecting a row outlines its date, description, amount and balance on the PDF page; each ✓ means that row’s printed running balance matched.
      </figcaption>
    </figure>
  );
}
