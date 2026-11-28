'use client';
import dynamic from 'next/dynamic';
import type { View } from '@/ui/state';

// The workbench and secondary views load when the first statement opens, not with the empty state.
const Workbench = dynamic(() => import('@/ui/workbench/Workbench').then((m) => m.Workbench), { loading: () => <p className="muted p-6" role="status">Loading…</p> });
const LedgerView = dynamic(() => import('@/ui/views/LedgerView').then((m) => m.LedgerView), { loading: () => <p className="muted p-6" role="status">Loading…</p> });
const RulesView = dynamic(() => import('@/ui/views/RulesView').then((m) => m.RulesView), { loading: () => <p className="muted p-6" role="status">Loading…</p> });

export function ViewRouter({ view }: { view: View }) {
  if (view === 'ledger') return <LedgerView />;
  if (view === 'rules') return <RulesView />;
  return <Workbench />;
}
