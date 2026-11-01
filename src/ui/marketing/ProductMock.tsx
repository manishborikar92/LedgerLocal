/** Static illustration of the proof strip and ruled grid. Figures are made up and labelled as such. */
import { Check } from '@/ui/primitives/icons';

const ROWS: [string, string, string, string, 'ok' | 'bad'][] = [
  ['2025-06-03', 'Transfer from savings', '1,079.58', '7,929.92', 'ok'],
  ['2025-06-06', 'Summit Fitness Club', '−419.74', '7,510.18', 'ok'],
  ['2025-06-07', 'Harbor Fuel #7042', '−399.14', '7,111.04', 'ok'],
  ['2025-06-10', 'Cedar & Oak Hardware', '−255.56', '6,855.48', 'ok'],
  ['2025-06-12', 'Quartz Cloud Hosting', '−19.14', '6,836.34', 'ok'],
];

export function ProductMock() {
  return (
    <figure className="product-frame m-0" aria-label="Illustration of the workbench with made-up figures">
      <div className="bar" aria-hidden="true"><i /><i /><i /></div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-4 py-3">
        <div className="stamp stamp-ok"><span className="inline-flex items-center gap-1.5"><Check /> Reconciled</span><small className="num">Δ 0.00</small></div>
        <div className="footing num">
          <div><span className="lbl">Opening</span><span className="val">7,290.43</span></div>
          <div><span className="lbl">+ Money in</span><span className="val">4,854.32</span></div>
          <div><span className="lbl">− Money out</span><span className="val">5,275.57</span></div>
          <div><span className="lbl">= Computed closing</span><span className="val total">6,869.18</span></div>
        </div>
      </div>
      <div role="presentation">
        {ROWS.map(([d, desc, amt, bal, st]) => (
          <div key={d + desc} className={`mock-row ${st === 'bad' ? 'bad' : ''}`}>
            <span className="tickmark ok" aria-hidden="true">✓</span>
            <span className="num muted">{d.slice(5)}</span>
            <span className="truncate">{desc}</span>
            <span className={`num text-right ${amt.startsWith('−') ? 'neg' : ''}`}>{amt}</span>
            <span className="num muted text-right">{bal}</span>
          </div>
        ))}
      </div>
      <figcaption className="muted px-4 py-2.5 text-xs">Illustration. Every row is checked against the printed running balance; the first mismatch gets a ✗ and a “jump to problem row” button.</figcaption>
    </figure>
  );
}
