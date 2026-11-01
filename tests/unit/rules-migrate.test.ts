import { describe, expect, it } from 'vitest';
import { applyRules, cleanPayee, exportRules, importRules, isValidRegex, ruleMatches, similarity } from '@/core/rules';
import { exportProjectFile, FutureSchemaError, importProjectFile, migrateProject, type Migration } from '@/core/migrate';
import { newId, ProjectSchema, SCHEMA_VERSION, type Rule } from '@/core/model';
import { row, statement } from '../helpers';

const rule = (o: Partial<Rule> & { pattern: string; type?: Rule['match']['type'] }): Rule => ({ id: newId(), name: o.pattern, enabled: true, appliesTo: 'all', match: { type: o.type ?? 'contains', pattern: o.pattern, ...(o.match?.threshold ? { threshold: o.match.threshold } : {}) }, ...(o.setPayee ? { setPayee: o.setPayee } : {}), ...(o.setCategory ? { setCategory: o.setCategory } : {}) });

describe('payee cleanup dictionary', () => {
  it('strips channel prefixes, store numbers and refs', () => {
    expect(cleanPayee('POS PURCHASE NORTHWIND GROCERS #204')).toBe('Northwind Grocers');
    expect(cleanPayee('CHECKCARD HARBOR FUEL 4417')).toBe('Harbor Fuel');
    expect(cleanPayee('ACH DEBIT Quartz Cloud Hosting')).toBe('Quartz Cloud Hosting');
    expect(cleanPayee('SQ *Pinecrest Coffee')).toBe('Pinecrest Coffee');
  });
});
describe('rules', () => {
  it('contains / regex / fuzzy', () => {
    expect(ruleMatches(rule({ pattern: 'grocers' }), 'POS NORTHWIND GROCERS #2', -100)).toBe(true);
    expect(ruleMatches(rule({ pattern: '^pos .*grocers', type: 'regex' }), 'POS NORTHWIND GROCERS', -100)).toBe(true);
    expect(ruleMatches(rule({ pattern: '(', type: 'regex' }), 'x', 1)).toBe(false);
    expect(isValidRegex('(')).toBe(false);
    expect(ruleMatches(rule({ pattern: 'Northwind Grocer', type: 'fuzzy' }), 'NORTHWIND GROCERS #204', -1)).toBe(true);
    expect(ruleMatches(rule({ pattern: 'Totally Different', type: 'fuzzy' }), 'NORTHWIND GROCERS', -1)).toBe(false);
    expect(similarity('a b', 'b a')).toBe(1);
  });
  it('direction filter and disabled rules', () => {
    expect(ruleMatches({ ...rule({ pattern: 'x' }), appliesTo: 'in' }, 'x', -5)).toBe(false);
    expect(ruleMatches({ ...rule({ pattern: 'x' }), enabled: false }, 'x', 5)).toBe(false);
  });
  it('applies first match, respects selection and overwrite, falls back to cleanup', () => {
    const rows = [row('2025-03-01', 'POS NORTHWIND GROCERS #1', -100), row('2025-03-02', 'ACH DEBIT Mystery Vendor', -200)];
    const rules = [rule({ pattern: 'northwind', setPayee: 'Northwind', setCategory: 'Groceries' }), rule({ pattern: 'north', setCategory: 'Other' })];
    const a = applyRules(rows, rules);
    expect(a.rows[0]).toMatchObject({ payee: 'Northwind', category: 'Groceries' });
    expect(a.changed).toBe(1);
    const b = applyRules(rows, rules, { cleanupFallback: true });
    expect(b.rows[1]!.payee).toBe('Mystery Vendor');
    const sel = applyRules(rows, rules, { ids: new Set([rows[1]!.id]) });
    expect(sel.rows[0]!.payee).toBeUndefined();
    const keep = applyRules([{ ...rows[0]!, payee: 'Mine' }], rules);
    expect(keep.rows[0]!.payee).toBe('Mine');
    expect(applyRules([{ ...rows[0]!, payee: 'Mine' }], rules, { overwrite: true }).rows[0]!.payee).toBe('Northwind');
  });
  it('JSON import/export round-trips with fresh ids', () => {
    const r = [rule({ pattern: 'a', setCategory: 'X' })];
    const back = importRules(exportRules(r), [], 'replace');
    expect(back[0]!.match.pattern).toBe('a');
    expect(back[0]!.id).not.toBe(r[0]!.id);
    expect(importRules(exportRules(r), r, 'merge')).toHaveLength(2);
    expect(() => importRules('{"kind":"nope"}', [], 'merge')).toThrow();
  });
});

describe('schema migrations and project file', () => {
  const project = () => ProjectSchema.parse({ schemaVersion: SCHEMA_VERSION, id: newId(), name: 'Client A', createdAt: 'x', updatedAt: 'y', statements: [statement([row('2025-03-02', 'A', -2000)])], rules: [] });
  it('round-trips a project file', () => {
    const p = project();
    const back = importProjectFile(exportProjectFile(p, new Date('2025-01-01T00:00:00Z')));
    expect(back).toEqual(p);
  });
  it('rejects garbage and newer schemas', () => {
    expect(() => importProjectFile('not json')).toThrow(/JSON/);
    expect(() => importProjectFile('{"kind":"other"}')).toThrow();
    expect(() => migrateProject({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(FutureSchemaError);
    expect(() => migrateProject({ schemaVersion: 0 })).toThrow();
  });
  it('runs a chain of registered migrations in order (mechanism test with a synthetic registry)', () => {
    const calls: number[] = [];
    const steps: Migration[] = [
      { from: 1, to: 2, up: (d) => (calls.push(2), { ...d, name: `${String(d.name)} (v2)` }) },
      { from: 2, to: 3, up: (d) => (calls.push(3), { ...d, name: `${String(d.name)} (v3)` }) },
    ];
    const old = { ...project(), schemaVersion: 1 };
    const out = migrateProject(old, steps, 3, (d) => d as never) as unknown as { name: string; schemaVersion: number };
    expect(calls).toEqual([2, 3]);
    expect(out.name).toBe('Client A (v2) (v3)');
    expect(out.schemaVersion).toBe(3);
    expect(() => migrateProject(old, [], 3)).toThrow(/No migration/);
  });
});
