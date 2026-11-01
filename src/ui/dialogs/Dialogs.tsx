'use client';
import { store, useSel } from '@/ui/state';
import { ReportOverlay } from '@/ui/views/Report';
import { ExportDialog } from './ExportDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { BalancesDialog, PrivacyDialog, SamplesDialog, ShortcutsDialog, SplitDialog, WipeDialog } from './SimpleDialogs';

/** Renders whichever dialog the store says is open (one at a time). */
export function Dialogs() {
  const open = useSel(store, (s) => s.dialog);
  switch (open) {
    case 'export': return <ExportDialog />;
    case 'projects': return <ProjectsDialog />;
    case 'wipe': return <WipeDialog />;
    case 'privacy': return <PrivacyDialog />;
    case 'balances': return <BalancesDialog />;
    case 'split': return <SplitDialog />;
    case 'shortcuts': return <ShortcutsDialog />;
    case 'samples': return <SamplesDialog />;
    case 'report': return <ReportOverlay />;
    default: return null;
  }
}
