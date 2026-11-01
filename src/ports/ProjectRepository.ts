import type { Project } from '@/core/model';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  statementCount: number;
  pdfsStored: boolean;
}

/** The app's one port: where saved projects live (IndexedDB adapter; swap it in src/composition.ts). */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  /** Deletes the project and any PDFs stored with it. */
  delete(id: string): Promise<void>;
  /** Only used when the user opts in to keeping source PDFs. */
  savePdf(projectId: string, statementId: string, bytes: Uint8Array): Promise<void>;
  getPdf(projectId: string, statementId: string): Promise<Uint8Array | null>;
  /** Removes every project and PDF. */
  wipe(): Promise<void>;
}
