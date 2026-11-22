import { readTheme } from '@/server/preferences';
import { AppShell } from '@/ui/shell/AppShell';

// Server Component: reads the theme cookie on the server and renders the interactive workbench shell (a Client Component).
export default async function WorkbenchPage() {
  return <AppShell initialTheme={await readTheme()} />;
}
