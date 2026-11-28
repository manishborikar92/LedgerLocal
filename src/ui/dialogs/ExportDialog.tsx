'use client';
import { useState } from 'react';
import { ExportSettingsSchema, type ExportSettings } from '@/core/model';
import { Dialog } from '@/ui/primitives/Dialog';
import { closeDialog, reconcileOf, runExport, setExportSettings, store, useSel } from '@/ui/state';
import type { ExportFormat } from '@/ui/state/exporter';

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'qbo', label: 'QuickBooks (.QBO)', hint: 'Web Connect file with Intuit bank id' },
  { id: 'ofx', label: 'OFX (.ofx)', hint: 'Xero, Quicken, most accounting tools' },
  { id: 'xlsx', label: 'Excel (.xlsx)', hint: 'Data sheet + live reconciliation proof' },
  { id: 'csv', label: 'CSV (.csv)', hint: 'Configurable columns and formats' },
];
const CSV_COLUMNS: ExportSettings['columns'] = ['date', 'postDate', 'description', 'payee', 'category', 'amount', 'balance', 'account', 'page', 'fitid'];

export function ExportDialog() {
  const scope = useSel(store, (s) => s.exportScope);
  const docs = useSel(store, (s) => s.docs);
  const activeId = useSel(store, (s) => s.activeDocId);
  const settings = useSel(store, (s) => s.project.exportSettings);
  const [format, setFormat] = useState<ExportFormat>('qbo');
  const [allowUnreconciled, setAllow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const patch = (p: Partial<ExportSettings>) => setExportSettings(ExportSettingsSchema.parse({ ...settings, ...p }));
  const included = scope === 'project' ? docs : docs.filter((d) => d.id === activeId);
  const unreconciled = included.filter((d) => reconcileOf(d.statement).status !== 'reconciled');
  const rows = included.reduce((n, d) => n + d.statement.rows.length, 0);
  const isOfx = format === 'ofx' || format === 'qbo';

  const run = async () => {
    setBusy(true);
    setMessage(null);
    const r = await runExport(format, scope, allowUnreconciled);
    setBusy(false);
    if (r.ok) closeDialog();
    else setMessage(r.message);
  };

  return (
    <Dialog open onClose={closeDialog} title="Export" footer={<>
      <button className="btn" onClick={closeDialog}>Cancel</button>
      <button className="btn btn-primary" data-testid="do-export" disabled={busy || !rows || (unreconciled.length > 0 && !allowUnreconciled)} onClick={run}>{busy ? 'Exporting…' : 'Export'}</button>
    </>}>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-sm font-semibold">Format</legend>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map((f) => (
            <label key={f.id} className="choice">
              <input type="radio" name="fmt" checked={format === f.id} onChange={() => setFormat(f.id)} /> <strong>{f.label}</strong>
              <div className="hint">{f.hint}</div>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="m-0 num">Exporting <strong>{included.length}</strong> statement{included.length === 1 ? '' : 's'} · <strong>{rows}</strong> rows.</p>
      {unreconciled.length > 0 && (
        <div className="note bad" role="alert">
          <strong>{unreconciled.length === 1 ? 'This statement does not reconcile' : `${unreconciled.length} statements do not reconcile`}.</strong> {unreconciled.map((d) => d.statement.fileName).join(', ')}. Review the red status first.
          <label className="mt-1.5 block"><input type="checkbox" checked={allowUnreconciled} onChange={(e) => setAllow(e.target.checked)} /> Export anyway. I have reviewed the discrepancy.</label>
        </div>
      )}
      {format === 'csv' && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <label className="field">Date format<select className="input" value={settings.dateFormat} onChange={(e) => patch({ dateFormat: e.target.value as ExportSettings['dateFormat'] })}><option value="iso">2025-03-31</option><option value="mdy">03/31/2025</option><option value="dmy">31/03/2025</option><option value="dd-mon-yyyy">31-Mar-2025</option></select></label>
          <label className="field">Amounts<select className="input" value={settings.amountStyle} onChange={(e) => patch({ amountStyle: e.target.value as ExportSettings['amountStyle'] })}><option value="signed">One signed column</option><option value="debitCredit">Debit and credit columns</option></select></label>
          <label className="field">Delimiter<select className="input" value={settings.delimiter} onChange={(e) => patch({ delimiter: e.target.value as ExportSettings['delimiter'] })}><option value=",">Comma</option><option value=";">Semicolon</option><option value={'\t'}>Tab</option></select></label>
          <label className="field">Decimal mark<select className="input" value={settings.decimal} onChange={(e) => patch({ decimal: e.target.value as ExportSettings['decimal'] })}><option value=".">Point (1234.50)</option><option value=",">Comma (1234,50)</option></select></label>
          <label className="chip self-end"><input type="checkbox" checked={settings.bom} onChange={(e) => patch({ bom: e.target.checked })} /> UTF-8 BOM (Excel)</label>
          <fieldset className="col-span-full rounded-lg border border-line px-3 py-2">
            <legend className="px-1 text-sm">Columns</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">{CSV_COLUMNS.map((c) => <label key={c}><input type="checkbox" checked={settings.columns.includes(c)} onChange={(e) => patch({ columns: CSV_COLUMNS.filter((x) => (x === c ? e.target.checked : settings.columns.includes(x))) })} /> {c}</label>)}</div>
          </fieldset>
        </div>
      )}
      {isOfx && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {format === 'qbo' && <label className="field">INTU.BID (Intuit bank id)<input className="input" value={settings.intuBid} onChange={(e) => patch({ intuBid: e.target.value })} /></label>}
          <label className="field">Institution name (ORG)<input className="input" value={settings.fiOrg} onChange={(e) => patch({ fiOrg: e.target.value })} /></label>
          <label className="field">Institution id (FID)<input className="input" value={settings.fiFid} onChange={(e) => patch({ fiFid: e.target.value })} /></label>
          <label className="field">Bank routing id<input className="input" value={settings.bankRoutingId} onChange={(e) => patch({ bankRoutingId: e.target.value })} /></label>
          <label className="field">Account type<select className="input" value={settings.accountTypeOfx} onChange={(e) => patch({ accountTypeOfx: e.target.value as ExportSettings['accountTypeOfx'] })}><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option></select></label>
          <p className="muted col-span-full m-0 text-[13px]">Importing into real QuickBooks or Xero has not been tested by the authors. Transaction ids (FITID) are deterministic, so re-importing overlapping statements is de-duplicated by the accounting tool.</p>
        </div>
      )}
      {message && <div className="note bad" role="alert">{message}</div>}
      <p className="muted m-0 text-[13px]">Not financial advice. Verify exports before filing or importing.</p>
    </Dialog>
  );
}
