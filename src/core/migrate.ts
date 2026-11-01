/** Schema migrations + the documented project file format (docs/DESIGN.md §6). */
import { PROJECT_FILE_KIND, ProjectFileSchema, ProjectSchema, SCHEMA_VERSION, type Project } from './model';

export class FutureSchemaError extends Error {
  constructor(public found: number, public supported: number) {
    super(`This project was saved by a newer version of LedgerLocal (schema ${found}; this build understands up to ${supported}).`);
    this.name = 'FutureSchemaError';
  }
}
export interface Migration {
  from: number;
  to: number;
  up(data: Record<string, unknown>): Record<string, unknown>;
}
/** Registered migrations. Schema 1 is the first public version, so the list is empty by design. */
export const MIGRATIONS: Migration[] = [];

export function migrateProject(raw: unknown, registry: readonly Migration[] = MIGRATIONS, target: number = SCHEMA_VERSION, finalize: (d: unknown) => Project = (d) => ProjectSchema.parse(d)): Project {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a LedgerLocal project.');
  let data = raw as Record<string, unknown>;
  const sv = data.schemaVersion;
  if (typeof sv !== 'number' || !Number.isInteger(sv) || sv < 1) throw new Error('Project has no valid schemaVersion.');
  let v: number = sv;
  if (v > target) throw new FutureSchemaError(v, target);
  while (v < target) {
    const step = registry.find((m) => m.from === v);
    if (!step) throw new Error(`No migration from schema ${v}.`);
    data = { ...step.up(data), schemaVersion: step.to };
    v = step.to;
  }
  return finalize(data);
}

export function exportProjectFile(project: Project, now: Date = new Date()): string {
  return JSON.stringify({ kind: PROJECT_FILE_KIND, schemaVersion: project.schemaVersion, exportedAt: now.toISOString(), project }, null, 2);
}
export function importProjectFile(text: string, registry: readonly Migration[] = MIGRATIONS, target: number = SCHEMA_VERSION): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = ProjectFileSchema.parse(json);
  const project = file.project as Record<string, unknown>;
  return migrateProject({ ...project, schemaVersion: project?.schemaVersion ?? file.schemaVersion }, registry, target);
}
