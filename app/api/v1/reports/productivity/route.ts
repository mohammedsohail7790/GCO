import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { isSupervisor, operatorTeamFilter } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { fail, ok, handleRouteError } from '@/lib/api/response'
import { productivityReport } from '@/lib/reports/productivity'

/** Operator productivity and the measured effect of AI drafts for one client and period (up to 93 days). Supervisors see their team. */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'VIEW_OPERATOR_DETAIL')
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : new Date()
    const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : new Date(to.getTime() - 7 * 86_400_000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) return fail('Choose a period of up to 93 days', 400)
    const team = isSupervisor(session) ? (await db.operator.findMany({ where: { tenantId, ...operatorTeamFilter(session) }, select: { id: true } })).map((o) => o.id) : undefined
    return ok(await productivityReport(tenantId, from, to, team))
  } catch (err) {
    return handleRouteError(err)
  }
}
