import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { getObligations } from '@/lib/earnings/summary'
import { earningsRouteError } from '@/lib/earnings/http'

// CEO: every operator. Manager: only operators of the manager's own tenant.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'EARNINGS_VIEW_OPERATOR')
    const rows = await getObligations(session.role === 'CEO_ADMIN' ? undefined : resolveTenantScope(session, null))
    const tenants = session.role === 'CEO_ADMIN' ? await db.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) : []
    return ok({ operators: rows, tenants })
  } catch (err) {
    return earningsRouteError(err)
  }
}
