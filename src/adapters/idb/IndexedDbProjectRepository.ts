import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ProjectSchema, type Project } from '@/core/model';
import { migrateProject } from '@/core/migrate';
import type { ProjectRepository, ProjectSummary } from '@/ports/ProjectRepository';

interface LL extends DBSchema {
  projects: { key: string; value: Project };
  pdfs: { key: string; value: Uint8Array };
}

export class IndexedDbProjectRepository implements ProjectRepository {
  private db: Promise<IDBPDatabase<LL>>;
  constructor(private name = 'ledgerlocal') {
    this.db = openDB<LL>(name, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('pdfs');
      },
    });
  }
  async list(): Promise<ProjectSummary[]> {
    const all = await (await this.db).getAll('projects');
    return all
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, statementCount: p.statements.length, pdfsStored: p.pdfsStored }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<Project | null> {
    const p = await (await this.db).get('projects', id);
    return p ? migrateProject(p) : null;
  }
  async save(project: Project): Promise<void> {
    await (await this.db).put('projects', ProjectSchema.parse(project));
  }
  async delete(id: string): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(['projects', 'pdfs'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    const keys = await tx.objectStore('pdfs').getAllKeys();
    for (const k of keys) if (String(k).startsWith(`${id}/`)) await tx.objectStore('pdfs').delete(k);
    await tx.done;
  }
  async savePdf(projectId: string, statementId: string, bytes: Uint8Array): Promise<void> {
    await (await this.db).put('pdfs', bytes.slice(), `${projectId}/${statementId}`);
  }
  async getPdf(projectId: string, statementId: string): Promise<Uint8Array | null> {
    return (await (await this.db).get('pdfs', `${projectId}/${statementId}`)) ?? null;
  }
  async wipe(): Promise<void> {
    const db = await this.db;
    await Promise.all([db.clear('projects'), db.clear('pdfs')]);
  }
}
