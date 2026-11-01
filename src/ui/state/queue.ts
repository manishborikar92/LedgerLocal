/** Import queue: reading PDFs in the parse worker, password prompts, cancel, and the open-statement list. */
import { getServices } from '@/composition';
import { newId, type Statement } from '@/core/model';
import { base64ToBytes } from '@/core/base64';
import { ParseFailure } from '@/ports/errors';
import { get, reconcileOf, set } from './store';
import { notify } from './ui';
import type { QueueItem } from './types';

/* ───────── import queue ───────── */
let running = false;
let currentJob: { itemId: string; jobId: number } | null = null;
const patchItem = (id: string, p: Partial<QueueItem>) => set((s) => ({ ...s, queue: s.queue.map((q) => (q.id === id ? { ...q, ...p } : q)) }));

export async function enqueueFiles(files: File[]): Promise<void> {
  for (const f of files) {
    const id = newId();
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      set((s) => ({ ...s, queue: [...s.queue, { id, name: f.name, status: 'error', progress: 0, bytes: new Uint8Array(), error: 'This is not a PDF file. Only PDF bank or credit-card statements are supported.' }] }));
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    set((s) => ({ ...s, queue: [...s.queue, { id, name: f.name, status: 'queued', progress: 0, bytes }] }));
  }
  void processQueue();
}
export function enqueueBytes(name: string, bytes: Uint8Array, password?: string): void {
  set((s) => ({ ...s, queue: [...s.queue, { id: newId(), name, status: 'queued', progress: 0, bytes, ...(password ? { password } : {}) }] }));
  void processQueue();
}
export function submitPassword(id: string, password: string): void {
  patchItem(id, { status: 'queued', password, passwordWrong: false, error: undefined });
  void processQueue();
}
export function cancelItem(id: string): void {
  const q = get().queue.find((x) => x.id === id);
  if (!q) return;
  if (q.status === 'parsing' && currentJob?.itemId === id) getServices().parse.cancel(currentJob.jobId);
  patchItem(id, { status: 'cancelled', bytes: new Uint8Array() });
}
export function dismissItem(id: string): void {
  set((s) => ({ ...s, queue: s.queue.filter((q) => q.id !== id) }));
}

const FRIENDLY: Record<string, string> = {
  corrupt: 'This file could not be read as a PDF (it may be damaged or not a PDF).',
  'no-text-layer': 'This PDF has no readable text (it looks like a scan or photo). Offline OCR is on the roadmap; for now, use a text-based PDF from your bank portal.',
  unknown: 'Something went wrong while reading this file.',
};

async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const item = get().queue.find((q) => q.status === 'queued');
      if (!item) break;
      patchItem(item.id, { status: 'parsing', progress: 0 });
      const { id: jobId, promise } = getServices().parse.parse(item.bytes, item.name, { password: item.password, onProgress: (d, t) => patchItem(item.id, { progress: t ? d / t : 0 }) });
      currentJob = { itemId: item.id, jobId };
      try {
        const res = await promise;
        addParsed(item, res.sha256, res.pageCount, res.output);
        patchItem(item.id, { status: 'done', progress: 1, bytes: new Uint8Array() });
      } catch (e) {
        const code = e instanceof ParseFailure ? e.code : 'unknown';
        if (code === 'cancelled') patchItem(item.id, { status: 'cancelled' });
        else if (code === 'password-needed' || code === 'password-incorrect') patchItem(item.id, { status: 'password', passwordWrong: code === 'password-incorrect', error: code === 'password-incorrect' ? 'That password is not correct.' : undefined });
        else patchItem(item.id, { status: 'error', error: FRIENDLY[code] ?? (e instanceof Error ? e.message : FRIENDLY.unknown) });
      } finally {
        currentJob = null;
      }
    }
  } finally {
    running = false;
  }
}

function addParsed(item: QueueItem, sha: string, pageCount: number, out: import('@/core/parse').ParseOutput): void {
  if (get().docs.some((d) => d.statement.fileSha256 === sha)) {
    notify('info', `${item.name} is already open.`);
    return;
  }
  const st: Statement = { id: newId(), fileName: item.name, fileSha256: sha, pageCount, createdAt: new Date().toISOString(), ...out };
  const rec = reconcileOf(st);
  set((s) => {
    const first = s.activeDocId === null;
    return {
      ...s,
      docs: [...s.docs, { id: st.id, statement: st, past: [], future: [], bytes: item.bytes.length ? item.bytes : null, password: item.password }],
      activeDocId: first ? st.id : s.activeDocId,
      focusRowId: first ? (st.rows[rec.problemRowIndex ?? 0]?.id ?? null) : s.focusRowId,
      project: { ...s.project, dirty: true },
    };
  });
}

export function setActiveDoc(id: string): void {
  set((s) => {
    const d = s.docs.find((x) => x.id === id);
    return d ? { ...s, activeDocId: id, focusRowId: d.statement.rows[0]?.id ?? null, checked: [] } : s;
  });
}
export function removeDoc(id: string): void {
  set((s) => {
    const docs = s.docs.filter((d) => d.id !== id);
    const activeDocId = s.activeDocId === id ? (docs[0]?.id ?? null) : s.activeDocId;
    return { ...s, docs, activeDocId, focusRowId: null, checked: [] };
  });
}


export async function loadSampleById(id: string): Promise<void> {
  const samples = await getServices().loadSamples();
  const smp = samples.find((x) => x.id === id);
  if (!smp) return;
  enqueueBytes(smp.fileName, base64ToBytes(smp.base64));
}
