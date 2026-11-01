import { withBase } from '@/config/paths';
export default function NotFound() {
  return (
    <main className="site-container" style={{ padding: '64px 0' }}>
      <h1 style={{ fontSize: 36 }}>Page not found</h1>
      <p><a href={withBase('/')}>Back to LedgerLocal</a> or <a href={withBase('/app/')}>open the workbench</a>.</p>
    </main>
  );
}
