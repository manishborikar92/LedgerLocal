'use client';
import { useEffect, useRef, useState } from 'react';
import { getServices } from '@/composition';
import type { ProjectSummary } from '@/ports/ProjectRepository';
import { Dialog } from '@/ui/primitives/Dialog';
import { closeDialog, deleteProjectById, downloadProjectFile, importProjectText, newSession, openDialog, openProject, renameProject, saveProject, store, useSel } from '@/ui/state';

export function ProjectsDialog() {
  const project = useSel(store, (s) => s.project);
  const docs = useSel(store, (s) => s.docs);
  const [name, setName] = useState(project.name);
  const [keepPdfs, setKeepPdfs] = useState(project.pdfsStored);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => { void getServices().repo.list().then(setList); };
  useEffect(refresh, []);

  return (
    <Dialog open onClose={closeDialog} title="Client projects" footer={<button className="btn" onClick={closeDialog}>Close</button>}>
      <p className="muted m-0">Sessions are <strong className="text-fg">ephemeral</strong>: nothing is kept when you close the tab unless you save here. A project is one client: its statements, rules and export settings.</p>
      <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); renameProject(name); await saveProject(name || 'Untitled client', keepPdfs); refresh(); }}>
        <label className="field">Client / project name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><input type="checkbox" checked={keepPdfs} onChange={(e) => setKeepPdfs(e.target.checked)} /> Also keep the source PDFs on this device (off by default; needed for the audit-trail view after reopening)</label>
        <div><button className="btn btn-primary" type="submit" disabled={!docs.length}>Save on this device</button></div>
      </form>
      <h3 className="text-base">Saved on this device</h3>
      {list.length === 0 ? <p className="muted m-0">Nothing saved yet.</p> : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {list.map((p) => (
            <li key={p.id} className="panel flex flex-wrap items-center gap-3 p-3">
              <div className="flex-1"><strong>{p.name}</strong><div className="muted text-[13px]">{p.statementCount} statement(s) · {new Date(p.updatedAt).toLocaleString()} · {p.pdfsStored ? 'PDFs kept' : 'no PDFs'}</div></div>
              <button className="btn btn-sm" onClick={() => { void openProject(p.id); }}>Open</button>
              <button className="btn btn-sm btn-danger" onClick={async () => { await deleteProjectById(p.id); refresh(); }}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={downloadProjectFile} disabled={!docs.length}>Export project file (.json)</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import project file…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import project file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importProjectText(await f.text()); e.target.value = ''; }} />
        <button className="btn" onClick={() => { newSession(); closeDialog(); }}>New empty session</button>
        <button className="btn btn-danger" onClick={() => openDialog('wipe')}>Wipe all local data…</button>
      </div>
    </Dialog>
  );
}
