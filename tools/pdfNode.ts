/** Node helper for tests and tools: parse a PDF byte array with pdf.js (legacy build) and our parser. */
import { extractAllPages, type PdfjsLike } from '../src/adapters/pdf/extract';
import { parseStatement, type ParseOptions, type ParseOutput } from '../src/core/parse';

let lib: PdfjsLike | null = null;
export async function pdfjsNode(): Promise<PdfjsLike> {
  if (!lib) lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLike;
  return lib;
}
export async function parsePdfBytes(bytes: Uint8Array, o: ParseOptions & { password?: string } = {}): Promise<ParseOutput & { pageCount: number }> {
  const { pages, pageCount } = await extractAllPages(await pdfjsNode(), bytes, { password: o.password });
  return { ...parseStatement(pages, o), pageCount };
}
