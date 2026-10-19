import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { ok, handleRouteError } from '@/lib/api/response'
import { clientLive } from '@/lib/reports/live'

// Live status for the client's own operation; tenant is taken from the session. Counts only, never content.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'INVOICE_VIEW_OWN') // client-only permission
    return ok(await clientLive(resolveTenantScope(session, null)), 200)
  } catch (err) {
    return handleRouteError(err)
  }
}
