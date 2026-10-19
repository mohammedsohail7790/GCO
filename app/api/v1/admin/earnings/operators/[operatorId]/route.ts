import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { syncEarnings } from '@/lib/earnings/ledger'
import { getEarningsSummary, listRecentLines } from '@/lib/earnings/summary'
import { earningsRouteError } from '@/lib/earnings/http'

// One operator's earnings for the CEO, or for a manager - limited to operators of the manager's own tenant.
export async function GET(req: NextRequest, { params }: { params: Promise<{ operatorId: string }> }) {
  try {
    const session = await requirePermission(req, 'EARNINGS_VIEW_OPERATOR')
    const { operatorId } = await params
    const operator = await db.operator.findUnique({ where: { id: operatorId }, select: { id: true, tenantId: true, operatorNumber: true } })
    if (!operator) return fail('Operator not found', 404)
    if (session.role !== 'CEO_ADMIN') {
      const scope = resolveTenantScope(session, null)
      if (scope !== operator.tenantId) return fail('Operator not found', 404) // same answer as a missing operator: no cross-tenant probing
    }
    await syncEarnings(operator.id)
    const [summary, lines] = await Promise.all([getEarningsSummary(operator.id), listRecentLines(operator.id)])
    return ok({ operator: { id: operator.id, operatorNumber: operator.operatorNumber }, ...summary, lines })
  } catch (err) {
    return earningsRouteError(err)
  }
}
