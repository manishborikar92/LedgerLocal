/** Main-thread page rendering via pdf.js (its own real worker; no network, no eval, no scripting). */

type PdfjsModule = typeof import('pdfjs-dist');
// The modern pdf.js build (no polyfills; see browserSupport.ts for the browsers it needs). The bundler resolves the worker
// against the installed pdfjs-dist and emits it as a hashed, immutable file on our own origin (no CDN, nothing to copy),
// so the library and its worker can never drift apart.
let lib: Promise<PdfjsModule> | null = null;
function load(): Promise<PdfjsModule> {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    return m;
  });
  return lib;
}

export interface RenderDoc {
  numPages: number;
  size(page: number): Promise<{ width: number; height: number }>;
  render(page: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<{ scale: number }>;
  destroy(): void;
}

export async function openForRender(bytes: Uint8Array, password?: string): Promise<RenderDoc> {
  const pdfjs = await load();
  const task = pdfjs.getDocument({ data: bytes.slice(), password, enableXfa: false, useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  let current: { cancel(): void } | null = null;
  return {
    numPages: doc.numPages,
    async size(n) {
      const v = (await doc.getPage(n)).getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    },
    async render(n, canvas, cssWidth) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = cssWidth / base.width;
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(base.width * scale)}px`;
      canvas.style.height = `${Math.floor(base.height * scale)}px`;
      current?.cancel();
      const task = page.render({ canvas, viewport });
      current = task;
      try {
        await task.promise;
      } catch (e) {
        if ((e as { name?: string }).name !== 'RenderingCancelledException') throw e;
      }
      return { scale };
    },
    destroy() {
      void task.destroy();
    },
  };
}
