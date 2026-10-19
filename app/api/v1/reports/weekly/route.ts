import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { operatorTeamFilter } from '@/lib/auth/teamScope'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { ensureWeeklyReport, lastCompletedWeek, parseWeek, presentReport } from '@/lib/reports/weekly'

// Weekly reports for the operators this caller supervises (supervisor: own team; manager: the client; CEO: any client).
// Reports are created/refreshed as drafts on read; a reviewed report is frozen. Earnings only for those allowed to see them.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'VIEW_OPERATOR_DETAIL')
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    const raw = url.searchParams.get('week')
    const weekStart = raw ? parseWeek(raw) : lastCompletedWeek()
    if (!weekStart) return fail('week must be a date like 2026-10-12', 400)
    const operators = await db.operator.findMany({ where: { tenantId, ...operatorTeamFilter(session) }, orderBy: { operatorNumber: 'asc' }, select: { id: true, operatorNumber: true, user: { select: { displayName: true } } } })
    const showEarnings = can(session.role, 'EARNINGS_VIEW_OPERATOR')
    const out = []
    for (const o of operators) {
      const report = await ensureWeeklyReport(o.id, weekStart)
      out.push({ operator: { id: o.id, number: o.operatorNumber, name: o.user.displayName }, ...(await presentReport(report, { showEarnings, feedbackVisible: true })) })
    }
    return ok({ weekStart, reports: out })
  } catch (err) {
    return handleRouteError(err)
  }
}
