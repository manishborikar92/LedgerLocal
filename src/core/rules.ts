/** Payee normalisation + categorisation rules (contains / regex / fuzzy). */
import { z } from 'zod';
import { newId, RuleSchema, type Row, type Rule } from './model';

const PREFIXES = /^(?:pos (?:purchase|debit|withdrawal)|check ?card(?: purchase)?|debit card purchase|purchase authorized on \d{1,2}\/\d{1,2}|ach (?:debit|credit|withdrawal|deposit)|online (?:pmt|payment|transfer)|recurring payment|visa purchase|sq \*|tst\* |paypal \*|withdrawal|deposit)\s*/i;

/** Small built-in cleanup dictionary: strips channel prefixes, store numbers, trailing reference digits. */
export function cleanPayee(description: string): string {
  let s = description.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) s = s.replace(PREFIXES, '');
  s = s.replace(/\s*[#*]\s*\d+\b/g, '').replace(/\s+(?:\d{3,}|x{2,}\d{2,})\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
  if (!s) return description.trim();
  return s.split(' ').map((w) => (w.length > 3 && w === w.toUpperCase() ? w[0]! + w.slice(1).toLowerCase() : w)).join(' ');
}

function bigrams(s: string): string[] {
  const t = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
/** Sørensen–Dice similarity over token-sorted bigrams (0..1). */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const count = new Map<string, number>();
  for (const x of A) count.set(x, (count.get(x) ?? 0) + 1);
  let hit = 0;
  for (const x of B) {
    const n = count.get(x) ?? 0;
    if (n > 0) {
      hit++;
      count.set(x, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

export function ruleMatches(rule: Rule, description: string, amountMinor: number): boolean {
  if (!rule.enabled) return false;
  if (rule.appliesTo === 'in' && amountMinor < 0) return false;
  if (rule.appliesTo === 'out' && amountMinor >= 0) return false;
  const p = rule.match.pattern;
  if (!p) return false;
  switch (rule.match.type) {
    case 'contains': return description.toLowerCase().includes(p.toLowerCase());
    case 'regex':
      try { return new RegExp(p, 'i').test(description); } catch { return false; }
    case 'fuzzy': {
      const clean = cleanPayee(description);
      return Math.max(similarity(clean, p), description.toLowerCase().includes(p.toLowerCase()) ? 1 : 0) >= (rule.match.threshold ?? 0.8);
    }
  }
}

export function isValidRegex(p: string): boolean {
  try { new RegExp(p, 'i'); return true; } catch { return false; }
}

export interface ApplyOptions {
  /** only these row ids (selection); default all */
  ids?: ReadonlySet<string>;
  /** replace payee/category even when already set */
  overwrite?: boolean;
  /** when no rule matches, fill payee from the cleanup dictionary */
  cleanupFallback?: boolean;
}
export function applyRules(rows: readonly Row[], rules: readonly Rule[], o: ApplyOptions = {}): { rows: Row[]; changed: number } {
  let changed = 0;
  const out = rows.map((r) => {
    if (o.ids && !o.ids.has(r.id)) return r;
    const rule = rules.find((x) => ruleMatches(x, r.description, r.amountMinor));
    let payee = r.payee;
    let category = r.category;
    if (rule) {
      if (rule.setPayee && (o.overwrite || !payee)) payee = rule.setPayee;
      if (rule.setCategory && (o.overwrite || !category)) category = rule.setCategory;
    } else if (o.cleanupFallback && (o.overwrite || !payee)) payee = cleanPayee(r.description);
    if (payee !== r.payee || category !== r.category) {
      changed++;
      return { ...r, ...(payee !== undefined ? { payee } : {}), ...(category !== undefined ? { category } : {}) };
    }
    return r;
  });
  return { rows: out, changed };
}

const RulesFileSchema = z.object({ kind: z.literal('ledgerlocal-rules'), version: z.literal(1), rules: z.array(RuleSchema) });
export const exportRules = (rules: readonly Rule[]): string => JSON.stringify({ kind: 'ledgerlocal-rules', version: 1, rules }, null, 2);
export function importRules(text: string, existing: readonly Rule[], mode: 'merge' | 'replace'): Rule[] {
  const parsed = RulesFileSchema.parse(JSON.parse(text));
  const incoming = parsed.rules.map((r) => ({ ...r, id: newId() }));
  return mode === 'replace' ? incoming : [...existing, ...incoming];
}
