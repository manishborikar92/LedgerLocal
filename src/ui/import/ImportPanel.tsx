'use client';
import { useEffect, useRef, useState } from 'react';
import { getServices } from '@/composition';
import { Check, Lock, Shield, Upload } from '@/ui/primitives/icons';
import { cancelItem, closeDialog, dismissItem, enqueueFiles, loadSampleById, openDialog, store, submitPassword, useSel } from '@/ui/state';

export function DropZone({ compact }: { compact?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => { if (list?.length) void enqueueFiles(Array.from(list)); };
  return (
    <div
      className={`drop ${compact ? 'drop-compact' : ''}`}
      data-over={over}
      data-testid="dropzone"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Choose PDF statements" data-testid="file-input" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {!compact && <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent"><Upload /></div>}
      <div>
        <strong className={compact ? 'text-sm' : 'text-lg'}>{compact ? 'Add more PDFs' : 'Drop PDF statements here'}</strong>
        {!compact && <p className="muted mb-4 mt-1">Bank or credit-card statements, several at once. Files are read on this device and never uploaded.</p>}
      </div>
      <button className={`btn ${compact ? 'btn-sm' : 'btn-primary btn-lg'}`} onClick={() => input.current?.click()}>Choose PDFs…</button>
    </div>
  );
}

const STATUS_TEXT = { queued: 'Waiting…', parsing: 'Reading…', password: 'Password needed', error: 'Could not read', done: 'Done', cancelled: 'Cancelled' } as const;

export function QueueList() {
  const queue = useSel(store, (s) => s.queue);
  const [pw, setPw] = useState<Record<string, string>>({});
  const items = queue.filter((q) => q.status !== 'done' && q.status !== 'cancelled');
  if (!items.length) return null;
  return (
    <ul className="m-0 grid list-none gap-2 p-0" aria-label="Import queue" data-testid="queue">
      {items.map((q) => (
        <li key={q.id} className="panel p-3">
          <div className="flex items-center gap-3">
            <strong className="min-w-0 flex-1 truncate">{q.name}</strong>
            <span className="muted text-[13px]">{q.status === 'parsing' ? `Reading… ${Math.round(q.progress * 100)}%` : STATUS_TEXT[q.status]}</span>
            {(q.status === 'queued' || q.status === 'parsing') && <button className="btn btn-sm" onClick={() => cancelItem(q.id)}>Cancel</button>}
            {(q.status === 'error' || q.status === 'password') && <button className="btn btn-sm btn-quiet" onClick={() => dismissItem(q.id)}>Dismiss</button>}
          </div>
          {q.status === 'parsing' && <div className="progress mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(q.progress * 100)} aria-label={`Reading ${q.name}`}><i style={{ width: `${q.progress * 100}%` }} /></div>}
          {q.status === 'password' && (
            <form className="mt-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submitPassword(q.id, pw[q.id] ?? ''); }}>
              <label className="field flex-1"><span className="inline-flex items-center gap-1.5"><Lock /> Password for this PDF</span>
                <input className="input" type="password" autoComplete="off" value={pw[q.id] ?? ''} onChange={(e) => setPw({ ...pw, [q.id]: e.target.value })} aria-invalid={!!q.passwordWrong} aria-describedby={q.passwordWrong ? `pwerr-${q.id}` : undefined} autoFocus />
              </label>
              <button className="btn btn-primary" type="submit">Unlock</button>
            </form>
          )}
          {q.passwordWrong && <p id={`pwerr-${q.id}`} role="alert" className="mt-1.5 text-[13px] text-danger">{q.error}</p>}
          {q.status === 'error' && <p role="alert" className="note bad mt-2">{q.error}</p>}
        </li>
      ))}
    </ul>
  );
}

export function SampleList() {
  const [samples, setSamples] = useState<{ id: string; title: string; note: string }[]>([]);
  useEffect(() => { void getServices().loadSamples().then(setSamples); }, []);
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {samples.map((s) => (
        <li key={s.id} className="panel flex items-center gap-3 p-3">
          <div className="flex-1"><strong>{s.title}</strong><div className="muted text-sm">{s.note}</div></div>
          <button className="btn btn-sm" onClick={() => { void loadSampleById(s.id); closeDialog(); }}>Open</button>
        </li>
      ))}
    </ul>
  );
}

const FACTS = [
  { icon: <Shield />, title: 'Stays on your device', body: 'Read in a Web Worker. The page cannot make network requests.' },
  { icon: <Check />, title: 'Proven, not guessed', body: 'Opening + movements = closing, with a check on every running balance.' },
  { icon: <Upload />, title: 'Export anywhere', body: 'QuickBooks QBO, OFX, Excel with a proof sheet, or CSV.' },
];

export function EmptyState() {
  return (
    <div className="empty-hero flex-1">
      <div className="site-container grid max-w-3xl gap-8 py-10 md:py-14">
        <header className="grid gap-3 text-center">
          <span className="chip mx-auto"><Shield /> Private by design · works offline</span>
          <h1 className="display text-[clamp(30px,4.6vw,48px)]">Drop in a statement. Get a proof, then your export.</h1>
          <p className="muted mx-auto m-0 max-w-xl text-lg">LedgerLocal reads bank and credit-card PDFs in your browser, checks the arithmetic against the printed balances, and exports QBO, OFX, Excel or CSV.</p>
        </header>
        <DropZone />
        <QueueList />
        <div className="panel flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[220px] flex-1"><strong>No statement handy?</strong><div className="muted text-sm">Try a bundled synthetic statement (fictional bank) from start to finish.</div></div>
          <button className="btn btn-primary" data-testid="try-sample" onClick={() => { void loadSampleById('bank-clean'); }}>Try a sample statement</button>
          <button className="btn" onClick={() => openDialog('samples')}>More samples</button>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
          {FACTS.map((f) => (
            <li key={f.title} className="card grid content-start gap-1.5 p-4">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">{f.icon}</span>
              <strong>{f.title}</strong>
              <span className="muted text-sm">{f.body}</span>
            </li>
          ))}
        </ul>
        <p className="muted m-0 text-center text-[13px]">Not financial advice. Always verify exports before filing or importing.</p>
      </div>
    </div>
  );
}
