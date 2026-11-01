import type { ParseOptions, ParseOutput } from '@/core/parse';
import type { WorkerRequest, WorkerResponse } from './protocol';

import { ParseFailure } from '@/ports/errors';
export { ParseFailure };
export interface ParseResult {
  sha256: string;
  pageCount: number;
  output: ParseOutput;
}

/** Runs the parse worker; cancelling terminates and re-creates it (simple, reliable for big files). */
export class ParseClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (r: ParseResult) => void; reject: (e: Error) => void; onProgress?: (d: number, t: number) => void }>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') p.onProgress?.(m.done, m.total);
      else {
        this.pending.delete(m.id);
        if (m.type === 'result') p.resolve({ sha256: m.sha256, pageCount: m.pageCount, output: m.output });
        else p.reject(new ParseFailure(m.code, m.message));
      }
    };
    w.onerror = (e) => {
      for (const [id, p] of this.pending) { p.reject(new ParseFailure('unknown', e.message || 'The parsing worker crashed.')); this.pending.delete(id); }
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private send(req: WorkerRequest, onProgress?: (d: number, t: number) => void, transfer: Transferable[] = []): { id: number; promise: Promise<ParseResult> } {
    const w = this.ensure();
    const promise = new Promise<ParseResult>((resolve, reject) => this.pending.set(req.id, { resolve, reject, onProgress }));
    w.postMessage(req, transfer);
    return { id: req.id, promise };
  }

  parse(bytes: Uint8Array, fileName: string, o: { password?: string; options?: ParseOptions; onProgress?: (d: number, t: number) => void } = {}) {
    const copy = bytes.slice().buffer as ArrayBuffer;
    return this.send({ type: 'parse', id: ++this.seq, bytes: copy, fileName, password: o.password, options: o.options }, o.onProgress, [copy]);
  }
  reparse(sha256: string, options: ParseOptions) {
    return this.send({ type: 'reparse', id: ++this.seq, sha256, options });
  }
  cancel(id: number): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    this.worker?.terminate();
    this.worker = null;
    for (const [oid, op] of this.pending) { op.reject(new ParseFailure('cancelled', 'Cancelled')); this.pending.delete(oid); }
    p.reject(new ParseFailure('cancelled', 'Cancelled'));
  }
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
