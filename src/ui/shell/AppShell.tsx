'use client';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { withBase } from '@/config/paths';
import { EmptyState } from '@/ui/import/ImportPanel';
import { Folder, Help, Logo, Monitor, Moon, Shield, Sun } from '@/ui/primitives/icons';
import { loadSampleById, openDialog, setOnline, setView, store, useSel } from '@/ui/state';
import { ServiceWorker } from './ServiceWorker';
import { useTheme } from './theme';
import { Toast } from './Toast';
import { ViewRouter } from './ViewRouter';

// Dialogs (export, projects, report…) are only needed after a click, so their code loads on first use.
const Dialogs = dynamic(() => import('@/ui/dialogs/Dialogs').then((m) => m.Dialogs));

const VIEWS = [['work', 'Workbench'], ['ledger', 'Merged ledger'], ['rules', 'Payees & rules']] as const;

export function AppShell() {
  const hasDocs = useSel(store, (s) => s.docs.length > 0);
  const view = useSel(store, (s) => s.view);
  const online = useSel(store, (s) => s.online);
  const dialogOpen = useSel(store, (s) => s.dialog !== null);
  const projectName = useSel(store, (s) => s.project.name);
  const dirty = useSel(store, (s) => s.project.dirty);
  const { mode, cycle } = useTheme();

  useEffect(() => {
    setOnline(navigator.onLine);
    if (location.hash === '#sample') {
      history.replaceState(null, '', location.pathname + location.search);
      void loadSampleById('bank-clean');
    }
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <div className="appbody">
      <a href="#main" className="skip">Skip to content</a>
      <header className="topbar">
        <a href={withBase('/')} className="brand" aria-label="LedgerLocal home"><Logo /> <span className="hidden sm:inline">LedgerLocal</span></a>
        <button className="btn btn-sm btn-quiet max-w-[220px]" onClick={() => openDialog('projects')} title="Client projects">
          <Folder /> <span className="truncate">{projectName}{dirty && hasDocs ? ' •' : ''}</span>
        </button>
        {hasDocs && (
          <div className="tabs" role="tablist" aria-label="Views">
            {VIEWS.map(([id, label]) => <button key={id} role="tab" className="tab" aria-selected={view === id} onClick={() => setView(id)}>{label}</button>)}
          </div>
        )}
        <div className="spacer" />
        {!online && <span className="chip chip-warning" role="status">Offline · everything still works</span>}
        <button className="chip chip-success" onClick={() => openDialog('privacy')} data-testid="privacy-chip" title="How to verify nothing is uploaded"><Shield /> 0 bytes uploaded</button>
        <button className="btn btn-sm btn-quiet" onClick={cycle} aria-label={`Theme: ${mode}. Click to change`} title={`Theme: ${mode}`}>{mode === 'light' ? <Sun /> : mode === 'dark' ? <Moon /> : <Monitor />}</button>
        <button className="btn btn-sm btn-quiet" onClick={() => openDialog('shortcuts')} aria-label="Help and keyboard shortcuts"><Help /></button>
      </header>
      <main id="main" className={`flex min-h-0 flex-1 flex-col ${hasDocs && view === 'work' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {hasDocs ? <ViewRouter view={view} /> : <EmptyState />}
      </main>
      <footer className="no-print muted border-t border-line bg-surface px-4 py-1.5 text-xs">
        Not financial advice. Verify exports before filing or importing. Accuracy figures in the docs are measured on synthetic layouts only.
      </footer>
      {dialogOpen && <Dialogs />}
      <Toast />
      <ServiceWorker />
    </div>
  );
}
