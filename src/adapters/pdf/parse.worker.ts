/// <reference lib="webworker" />
/**
 * Parsing worker: pdf.js (in-thread "fake worker" mode, so no nested worker or extra URL is needed)
 * + the pure core parser. Nothing here can reach the network: pdf.js eval/scripting are off and the
 * page CSP forbids connect-src.
 */
import * as pdfjs from 'pdfjs-dist';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import { sha256Hex } from '@/core/hash';
import type { PageText } from '@/core/geometry';
import { ParseError, parseStatement } from '@/core/parse';
import { extractAllPages, PdfCorruptError, PdfPasswordError, type PdfjsLike } from './extract';
import type { ErrorCode, WorkerRequest, WorkerResponse } from './protocol';

(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = { WorkerMessageHandler };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerResponse) => ctx.postMessage(m);
const cache = new Map<string, { pages: PageText[]; pageCount: number }>();

function fail(id: number, e: unknown): void {
  let code: ErrorCode = 'unknown';
  if (e instanceof PdfPasswordError) code = e.reason === 'needed' ? 'password-needed' : 'password-incorrect';
  else if (e instanceof PdfCorruptError) code = 'corrupt';
  else if (e instanceof ParseError) code = e.code;
  post({ type: 'error', id, code, message: e instanceof Error ? e.message : String(e) });
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  try {
    if (m.type === 'parse') {
      const bytes = new Uint8Array(m.bytes);
      const sha = sha256Hex(bytes);
      const { pages, pageCount } = await extractAllPages(pdfjs as unknown as PdfjsLike, bytes, {
        password: m.password,
        onProgress: (done, total) => post({ type: 'progress', id: m.id, done, total }),
      });
      cache.set(sha, { pages, pageCount });
      if (cache.size > 3) cache.delete(cache.keys().next().value as string);
      post({ type: 'result', id: m.id, sha256: sha, pageCount, output: parseStatement(pages, m.options) });
    } else {
      const c = cache.get(m.sha256);
      if (!c) return post({ type: 'error', id: m.id, code: 'cache-miss', message: 'Source text no longer cached.' });
      post({ type: 'result', id: m.id, sha256: m.sha256, pageCount: c.pageCount, output: parseStatement(c.pages, m.options) });
    }
  } catch (e) {
    fail(m.id, e);
  }
};
