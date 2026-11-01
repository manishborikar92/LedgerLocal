'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { currencyExponent, formatMinor } from '@/core/money';
import { Dialog } from '@/ui/primitives/Dialog';
import { SampleList } from '@/ui/import/ImportPanel';
import { activeDoc, closeDialog, setManualBalances, splitFocus, store, wipeAll } from '@/ui/state';

export function WipeDialog() {
  return (
    <Dialog open onClose={closeDialog} title="Wipe all local data" footer={<>
      <button className="btn" onClick={closeDialog}>Cancel</button>
      <button className="btn btn-danger" data-testid="confirm-wipe" onClick={() => { void wipeAll(); }}>Delete everything</button>
    </>}>
      <p className="m-0">This permanently deletes every saved project, stored PDF and preference (theme, onboarding) from this browser, and clears the current session. It cannot be undone.</p>
    </Dialog>
  );
}

export function PrivacyDialog() {
  const [csp, setCsp] = useState<boolean | null>(null);
  useEffect(() => setCsp(!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), []);
  return (
    <Dialog open onClose={closeDialog} title="Verify it is offline" footer={<button className="btn" onClick={closeDialog}>Close</button>}>
      {csp
        ? <div className="note ok"><strong>Enforced by your browser:</strong> this page&apos;s Content-Security-Policy says <code>connect-src &apos;none&apos;</code>, so scripts here cannot make network requests at all (no fetch, XHR, WebSocket or beacon). Nothing can be uploaded.</div>
        : <div className="note warn">No Content-Security-Policy is present (development build). Production builds add a strict policy; see the README.</div>}
      <h3 className="text-base">Check it yourself</h3>
      <ol className="m-0 grid gap-1.5">
        <li>Open your browser&apos;s developer tools → <strong>Network</strong>, clear the list, then import a statement. No request appears.</li>
        <li>Switch DevTools to <strong>Offline</strong> (or use airplane mode) and import another statement: it still works. After the first visit the app is installable and runs offline.</li>
        <li>In the <strong>Console</strong>, any attempt to contact a server is blocked and reported as a CSP violation.</li>
      </ol>
      <h3 className="text-base">What is stored on this device</h3>
      <ul className="m-0 grid gap-1">
        <li>By default, <strong>nothing</strong> about your statements is saved: closing the tab discards it.</li>
        <li>Preferences (theme) in local storage.</li>
        <li>Only if you click <em>Save</em>: the project&apos;s rows, rules and settings in IndexedDB; PDFs only if you tick the box.</li>
      </ul>
    </Dialog>
  );
}

export function BalancesDialog() {
  const st = activeDoc(store.get())?.statement;
  const exp = st ? currencyExponent(st.currency) : 2;
  const initial = (v: number | null | undefined) => (v == null ? '' : formatMinor(v, { exp, thousands: '' }));
  const [opening, setOpening] = useState(initial(st?.openingBalanceMinor));
  const [closing, setClosing] = useState(initial(st?.closingBalanceMinor));
  const [error, setError] = useState('');
  const card = st?.accountType === 'creditCard';
  const field = (label: string, value: string, set: (v: string) => void): ReactNode => (
    <label className="field">{label}<input className="input num" value={value} onChange={(e) => { set(e.target.value); setError(''); }} inputMode="decimal" aria-invalid={!!error} /></label>
  );
  return (
    <Dialog open onClose={closeDialog} title="Opening and closing balances" footer={<>
      <button className="btn" onClick={closeDialog}>Cancel</button>
      <button className="btn btn-primary" form="bal-form" type="submit">Apply</button>
    </>}>
      <form id="bal-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); const r = setManualBalances(opening, closing); if (r) setError(r); else closeDialog(); }}>
        <p className="muted m-0">Type the figures exactly as printed on the statement{card ? ' (for a card: the amount owed; a credit balance is negative)' : ''}.</p>
        {field(card ? 'Previous balance' : 'Opening balance', opening, setOpening)}
        {field(card ? 'New balance' : 'Closing balance', closing, setClosing)}
        {error && <div role="alert" className="note bad">{error}</div>}
      </form>
    </Dialog>
  );
}

export function SplitDialog() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  return (
    <Dialog open onClose={closeDialog} title="Split row" footer={<>
      <button className="btn" onClick={closeDialog}>Cancel</button>
      <button className="btn btn-primary" form="split-form" type="submit">Split</button>
    </>}>
      <form id="split-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); const r = splitFocus(value); if (r) setError(r); else closeDialog(); }}>
        <p className="muted m-0">Splits the selected row into two rows that still add up to the original amount, so reconciliation is unaffected.</p>
        <label className="field">Amount of the first part (signed, e.g. -40.00)<input className="input num" value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} autoFocus aria-invalid={!!error} /></label>
        {error && <div role="alert" className="note bad">{error}</div>}
      </form>
    </Dialog>
  );
}

const K = ({ children }: { children: string }) => <kbd className="kbd">{children}</kbd>;
const SHORTCUTS: [ReactNode, string][] = [
  [<><K>↑</K> <K>↓</K> <K>←</K> <K>→</K></>, 'Move between cells (selecting a row highlights it on the PDF)'],
  [<><K>Enter</K> / <K>F2</K> / type</>, 'Edit the cell; Enter saves and moves down, Tab saves and moves right, Esc cancels'],
  [<K>Space</K>, 'Tick / untick the row (for merge)'],
  [<><K>Insert</K> / <K>Ctrl</K>+<K>Enter</K></>, 'Add a row below'],
  [<K>Delete</K>, 'Delete the ticked rows (or the current row)'],
  [<><K>Ctrl</K>+<K>Shift</K>+<K>F</K></>, 'Flip the sign of the ticked / current rows'],
  [<><K>Ctrl</K>+<K>M</K></>, 'Merge ticked rows'],
  [<><K>Ctrl</K>+<K>\</K></>, 'Split the current row'],
  [<><K>Ctrl</K>+<K>Z</K> / <K>Ctrl</K>+<K>Shift</K>+<K>Z</K></>, 'Undo / redo'],
  [<><K>PgUp</K> <K>PgDn</K> <K>Home</K> <K>End</K></>, 'Jump around the grid'],
  [<><K>←</K> <K>→</K> on a column guide</>, 'Move a column border (hold Shift for bigger steps)'],
];
export function ShortcutsDialog() {
  return (
    <Dialog open onClose={closeDialog} title="Keyboard shortcuts" footer={<button className="btn" onClick={closeDialog}>Close</button>}>
      <table className="data"><tbody>{SHORTCUTS.map(([k, d], i) => <tr key={i}><td className="whitespace-nowrap">{k}</td><td>{d}</td></tr>)}</tbody></table>
    </Dialog>
  );
}

export function SamplesDialog() {
  return (
    <Dialog open onClose={closeDialog} title="Sample statements" footer={<button className="btn" onClick={closeDialog}>Close</button>}>
      <p className="muted m-0">Synthetic statements from fictional banks, bundled with the app, so you can try the whole flow without uploading anything.</p>
      <SampleList />
    </Dialog>
  );
}
