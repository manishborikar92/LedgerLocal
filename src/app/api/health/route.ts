import { APP_VERSION } from '@/config/app-config';

export const dynamic = 'force-dynamic';

/** Liveness probe for hosts and load balancers (Render, Coolify, uptime monitors). Returns no data about users. */
export function GET() {
  return Response.json({ status: 'ok', app: 'ledgerlocal', version: APP_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
}
