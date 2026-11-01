/**
 * Composition root: the ONE place where ports are bound to adapters.
 * To change where projects are stored, implement ProjectRepository and bind it here.
 */
import { IndexedDbProjectRepository } from '@/adapters/idb/IndexedDbProjectRepository';
import { openForRender, type RenderDoc } from '@/adapters/pdf/render';
import { ParseClient } from '@/adapters/pdf/workerClient';
import type { ProjectRepository } from '@/ports/ProjectRepository';

export interface Services {
  repo: ProjectRepository;
  parse: ParseClient;
  renderPdf: (bytes: Uint8Array, password?: string) => Promise<RenderDoc>;
  loadSamples: () => Promise<import('@/adapters/samples/data').Sample[]>;
}
let services: Services | null = null;

/** Lazily created, browser-only. */
export function getServices(): Services {
  services ??= {
    repo: new IndexedDbProjectRepository(),
    parse: new ParseClient(),
    renderPdf: openForRender,
    loadSamples: () => import('@/adapters/samples/data').then((m) => m.SAMPLES),
  };
  return services;
}
export type { RenderDoc };
