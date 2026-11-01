import { ProjectSchema, type Project } from '@/core/model';
import type { ProjectRepository, ProjectSummary } from '@/ports/ProjectRepository';

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory adapter: used by the contract tests. */
export class MemoryProjectRepository implements ProjectRepository {
  private projects = new Map<string, Project>();
  private pdfs = new Map<string, Uint8Array>();
  async list(): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, statementCount: p.statements.length, pdfsStored: p.pdfsStored }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string) { const p = this.projects.get(id); return p ? clone(p) : null; }
  async save(project: Project) { this.projects.set(project.id, clone(ProjectSchema.parse(project))); }
  async delete(id: string) {
    this.projects.delete(id);
    for (const k of [...this.pdfs.keys()]) if (k.startsWith(`${id}/`)) this.pdfs.delete(k);
  }
  async savePdf(projectId: string, statementId: string, bytes: Uint8Array) { this.pdfs.set(`${projectId}/${statementId}`, bytes.slice()); }
  async getPdf(projectId: string, statementId: string) { const b = this.pdfs.get(`${projectId}/${statementId}`); return b ? b.slice() : null; }
  async wipe() { this.projects.clear(); this.pdfs.clear(); }
}
