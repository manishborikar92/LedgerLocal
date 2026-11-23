/**
 * pdf.js -> core PageText adapter. Works with the modern build (browsers) and the legacy build (Node tooling)
 * (the caller injects the pdfjs module). Runs in a Web Worker in the app; never touches the network.
 */
import type { PageText, TextItem } from '@/core/geometry';

export class PdfPasswordError extends Error {
  constructor(public reason: 'needed' | 'incorrect') {
    super(reason === 'needed' ? 'This PDF is password protected.' : 'That password is not correct.');
    this.name = 'PdfPasswordError';
  }
}
export class PdfCorruptError extends Error {
  constructor(message = 'This file is not a readable PDF.') {
    super(message);
    this.name = 'PdfCorruptError';
  }
}

interface PdfjsItem { str?: string; transform?: number[]; width?: number; height?: number }
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfjsItem[] }>;
  cleanup?: () => void;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
export interface PdfjsLike {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}

export async function pageToText(page: PdfPage, pageNumber: number): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of tc.items) {
    if (typeof it.str !== 'string' || !it.transform) continue;
    const [a, b, , , e, f] = it.transform as [number, number, number, number, number, number];
    const h = it.height && it.height > 0 ? it.height : Math.hypot(a, b);
    if (!(h > 0)) continue;
    items.push({ str: it.str, x: e, y: vp.height - f - h * 0.8, w: it.width ?? 0, h });
  }
  return { page: pageNumber, width: vp.width, height: vp.height, items };
}

export interface ExtractOptions {
  password?: string;
  onProgress?: (done: number, total: number) => void;
  signal?: { aborted: boolean };
}

export async function extractAllPages(pdfjs: PdfjsLike, data: Uint8Array, opts: ExtractOptions = {}): Promise<{ pageCount: number; pages: PageText[] }> {
  const task = pdfjs.getDocument({
    data: data.slice(),
    password: opts.password,
    enableXfa: false,
    verbosity: 0,
    useSystemFonts: true,
    disableFontFace: true,
  });
  let doc: PdfDoc;
  try {
    doc = await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2 ? 'incorrect' : 'needed');
    if (err?.name === 'InvalidPDFException' || err?.name === 'FormatError' || err?.name === 'MissingPDFException') throw new PdfCorruptError();
    throw new PdfCorruptError(e instanceof Error ? e.message : undefined);
  }
  const pages: PageText[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const page = await doc.getPage(i);
      pages.push(await pageToText(page, i));
      page.cleanup?.();
      opts.onProgress?.(i, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return { pageCount: pages.length, pages };
}
