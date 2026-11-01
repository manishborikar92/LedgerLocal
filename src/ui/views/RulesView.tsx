'use client';
import { useMemo, useRef, useState } from 'react';
import { newId, type Rule } from '@/core/model';
import { exportRules, importRules, isValidRegex, ruleMatches } from '@/core/rules';
import { activeDoc, applyAllRules, download, notify, removeRule, replaceRules, saveRule, store, useSel } from '@/ui/state';

const blankRule = (): Rule => ({ id: newId(), name: '', enabled: true, match: { type: 'contains', pattern: '' }, appliesTo: 'all' });
type Scope = 'statement' | 'selection' | 'project';

function RuleEditor({ draft, setDraft, onSave, matches, hasDoc, isEditing }: { draft: Rule; setDraft: (r: Rule) => void; onSave: () => void; matches: number; hasDoc: boolean; isEditing: boolean }) {
  const regexBad = draft.match.type === 'regex' && draft.match.pattern !== '' && !isValidRegex(draft.match.pattern);
  const valid = draft.match.pattern.trim() !== '' && !regexBad && (!!draft.setPayee || !!draft.setCategory);
  const setMatch = (m: Partial<Rule['match']>) => setDraft({ ...draft, match: { ...draft.match, ...m } });
  return (
    <section className="card grid content-start gap-3 p-4" aria-label="Rule editor">
      <h2 className="text-xl">{isEditing ? 'Edit rule' : 'New rule'}</h2>
      <label className="field">Name<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Groceries" /></label>
      <div className="grid grid-cols-[150px_1fr] gap-2">
        <label className="field">Match<select className="input" value={draft.match.type} onChange={(e) => setMatch({ type: e.target.value as Rule['match']['type'] })}><option value="contains">contains</option><option value="regex">regex</option><option value="fuzzy">fuzzy</option></select></label>
        <label className="field">Pattern<input className="input" value={draft.match.pattern} aria-invalid={regexBad} onChange={(e) => setMatch({ pattern: e.target.value })} /></label>
      </div>
      {regexBad && <div role="alert" className="note bad">That regular expression is not valid.</div>}
      {draft.match.type === 'fuzzy' && <label className="field">Similarity threshold ({Math.round((draft.match.threshold ?? 0.8) * 100)}%)<input type="range" min={50} max={100} value={Math.round((draft.match.threshold ?? 0.8) * 100)} onChange={(e) => setMatch({ threshold: +e.target.value / 100 })} /></label>}
      <div className="grid grid-cols-2 gap-2">
        <label className="field">Set payee<input className="input" value={draft.setPayee ?? ''} onChange={(e) => setDraft({ ...draft, setPayee: e.target.value || undefined })} /></label>
        <label className="field">Set category<input className="input" value={draft.setCategory ?? ''} onChange={(e) => setDraft({ ...draft, setCategory: e.target.value || undefined })} /></label>
      </div>
      <label className="field">Applies to<select className="input" value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value as Rule['appliesTo'] })}><option value="all">money in and out</option><option value="in">money in only</option><option value="out">money out only</option></select></label>
      <p className="muted m-0 text-[13px]">{hasDoc ? `Matches ${matches} row(s) in the open statement.` : 'Open a statement to preview matches.'}</p>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!valid} onClick={onSave}>Save rule</button>
        <button className="btn" onClick={() => setDraft(blankRule())}>Clear</button>
      </div>
    </section>
  );
}

export function RulesView() {
  const rules = useSel(store, (s) => s.project.rules);
  const docs = useSel(store, (s) => s.docs);
  const activeId = useSel(store, (s) => s.activeDocId);
  const doc = useMemo(() => activeDoc({ ...store.get(), docs, activeDocId: activeId }), [docs, activeId]);
  const [draft, setDraft] = useState<Rule>(blankRule());
  const [scope, setScope] = useState<Scope>('statement');
  const [overwrite, setOverwrite] = useState(false);
  const [cleanup, setCleanup] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const regexBad = draft.match.type === 'regex' && draft.match.pattern !== '' && !isValidRegex(draft.match.pattern);
  const matches = doc && draft.match.pattern && !regexBad ? doc.statement.rows.filter((r) => ruleMatches({ ...draft, enabled: true }, r.description, r.amountMinor)).length : 0;
  const move = (i: number, d: number) => { const a = [...rules]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!]; replaceRules(a); };

  return (
    <div className="site-container grid gap-4 pb-10 pt-5">
      <h1 className="display text-3xl">Payees &amp; categories</h1>
      <p className="muted m-0 max-w-3xl">Rules run top to bottom; the first match wins. They are saved with the client project and can be exported as JSON to reuse on another client. A small built-in dictionary also tidies bank prefixes and store numbers (“POS PURCHASE NORTHWIND GROCERS #204” → “Northwind Grocers”).</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
        <RuleEditor draft={draft} setDraft={setDraft} matches={matches} hasDoc={!!doc} isEditing={rules.some((r) => r.id === draft.id)} onSave={() => { saveRule({ ...draft, name: draft.name || draft.match.pattern }); setDraft(blankRule()); }} />
        <section className="card grid content-start gap-3 p-4" aria-label="Rules">
          <h2 className="text-xl">Rules ({rules.length})</h2>
          {rules.length === 0 ? <p className="muted m-0">No rules yet.</p> : (
            <ol className="m-0 grid list-none gap-1.5 p-0">
              {rules.map((r, i) => (
                <li key={r.id} className={`flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 ${r.enabled ? '' : 'opacity-60'}`}>
                  <input type="checkbox" checked={r.enabled} aria-label={`Enable ${r.name}`} onChange={(e) => saveRule({ ...r, enabled: e.target.checked })} />
                  <div className="min-w-0 flex-1"><strong>{r.name}</strong><div className="muted truncate text-[13px]">{r.match.type} “{r.match.pattern}” → {[r.setPayee, r.setCategory].filter(Boolean).join(' / ')}</div></div>
                  <button className="btn btn-sm" aria-label={`Move ${r.name} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button className="btn btn-sm" aria-label={`Move ${r.name} down`} onClick={() => move(i, 1)} disabled={i === rules.length - 1}>↓</button>
                  <button className="btn btn-sm" onClick={() => setDraft(r)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeRule(r.id)}>Delete</button>
                </li>
              ))}
            </ol>
          )}
          <hr />
          <div className="grid gap-2">
            <label className="field">Apply to<select className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}><option value="statement">the open statement</option><option value="selection">ticked / selected rows</option><option value="project">all open statements</option></select></label>
            <label><input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} /> Tidy payee names (built-in dictionary) when no rule matches</label>
            <label><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Overwrite payees/categories already set</label>
            <div><button className="btn btn-primary" disabled={!docs.length} data-testid="apply-rules" onClick={() => notify('success', `Updated ${applyAllRules({ scope, overwrite, cleanup })} row(s). Undo with Ctrl+Z in the workbench.`)}>Apply now</button></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" disabled={!rules.length} onClick={() => download('ledgerlocal-rules.json', new TextEncoder().encode(exportRules(rules)), 'application/json')}>Export rules (JSON)</button>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Import rules…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import rules file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { replaceRules(importRules(await f.text(), rules, 'merge')); notify('success', 'Rules imported and added to the list.'); } catch { notify('error', 'That is not a LedgerLocal rules file.'); } e.target.value = ''; }} />
          </div>
        </section>
      </div>
    </div>
  );
}
