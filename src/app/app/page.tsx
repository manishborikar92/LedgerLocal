import { AppShell } from '@/ui/shell/AppShell';

// The shell is pre-rendered (static export) so the first paint is real HTML; it hydrates into the interactive app.
export default function WorkbenchPage() {
  return <AppShell />;
}
