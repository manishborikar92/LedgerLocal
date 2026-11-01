import { beforeEach, describe, expect, it } from 'vitest';
import { newId, ProjectSchema, SCHEMA_VERSION, type Project } from '@/core/model';
import type { ProjectRepository } from '@/ports/ProjectRepository';
import { row, statement } from '../helpers';

export const makeProject = (name = 'Client', updatedAt = '2025-01-01T00:00:00.000Z', pdfsStored = false): Project =>
  ProjectSchema.parse({ schemaVersion: SCHEMA_VERSION, id: newId(), name, createdAt: updatedAt, updatedAt, statements: [statement([row('2025-03-02', 'A', -100)])], rules: [], pdfsStored });

/** One contract, run against every ProjectRepository adapter. */
export function repositoryContract(name: string, create: () => Promise<ProjectRepository> | ProjectRepository): void {
  describe(`ProjectRepository contract: ${name}`, () => {
    let repo: ProjectRepository;
    beforeEach(async () => {
      repo = await create();
      await repo.wipe();
    });
    it('returns null for unknown ids and an empty list initially', async () => {
      expect(await repo.get(newId())).toBeNull();
      expect(await repo.list()).toEqual([]);
    });
    it('saves and loads a project losslessly', async () => {
      const p = makeProject();
      await repo.save(p);
      expect(await repo.get(p.id)).toEqual(p);
    });
    it('overwrites on the same id', async () => {
      const p = makeProject();
      await repo.save(p);
      await repo.save({ ...p, name: 'Renamed' });
      expect((await repo.get(p.id))!.name).toBe('Renamed');
      expect(await repo.list()).toHaveLength(1);
    });
    it('lists summaries newest first', async () => {
      const a = makeProject('A', '2025-01-01T00:00:00.000Z');
      const b = makeProject('B', '2025-02-01T00:00:00.000Z');
      await repo.save(a);
      await repo.save(b);
      const l = await repo.list();
      expect(l.map((x) => x.name)).toEqual(['B', 'A']);
      expect(l[0]).toMatchObject({ statementCount: 1, pdfsStored: false });
    });
    it('returns independent copies (mutating a result does not change the store)', async () => {
      const p = makeProject();
      await repo.save(p);
      const got = (await repo.get(p.id))!;
      got.name = 'mutated';
      got.statements[0]!.rows[0]!.description = 'mutated';
      const again = (await repo.get(p.id))!;
      expect(again.name).toBe('Client');
      expect(again.statements[0]!.rows[0]!.description).toBe('A');
    });
    it('rejects invalid projects', async () => {
      await expect(repo.save({ ...makeProject(), name: '' })).rejects.toThrow();
    });
    it('stores PDFs only when asked, and deleting a project deletes its PDFs', async () => {
      const p = makeProject('A', undefined, true);
      await repo.save(p);
      expect(await repo.getPdf(p.id, 's1')).toBeNull();
      await repo.savePdf(p.id, 's1', new Uint8Array([1, 2, 3]));
      expect(Array.from((await repo.getPdf(p.id, 's1'))!)).toEqual([1, 2, 3]);
      await repo.delete(p.id);
      expect(await repo.get(p.id)).toBeNull();
      expect(await repo.getPdf(p.id, 's1')).toBeNull();
    });
    it('wipe removes everything', async () => {
      const p = makeProject();
      await repo.save(p);
      await repo.savePdf(p.id, 's1', new Uint8Array([9]));
      await repo.wipe();
      expect(await repo.list()).toEqual([]);
      expect(await repo.getPdf(p.id, 's1')).toBeNull();
    });
  });
}
