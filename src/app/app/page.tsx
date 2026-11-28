import { headers } from 'next/headers';
import { readTheme } from '@/server/preferences';
import { AppShell } from '@/ui/shell/AppShell';

// Server Component: reads the theme cookie and the Content-Security-Policy that src/proxy.ts attached to this request, and
// renders the interactive workbench shell (a Client Component). The policy arrives as an HTTP header, which page scripts cannot
// read, so the server tells the "Verify it is offline" dialog whether this very response forbids network requests.
export default async function WorkbenchPage() {
  const csp = (await headers()).get('content-security-policy') ?? '';
  const networkBlocked = /connect-src 'none'/.test(csp) && /form-action 'none'/.test(csp);
  return <AppShell initialTheme={await readTheme()} networkBlocked={networkBlocked} />;
}
