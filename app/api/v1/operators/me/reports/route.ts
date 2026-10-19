import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { ensureWeeklyReport, presentReport, weekStartOf } from '@/lib/reports/weekly'

// The operator's own reports: this week so far (live, including earnings) and every reviewed week with the manager's feedback.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'EARNINGS_VIEW_OWN')
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!op) return fail('Operator profile not found', 404)
    const current = await presentReport(await ensureWeeklyReport(op.id, weekStartOf(new Date())), { showEarnings: true, feedbackVisible: false })
    const reviewed = await db.operatorWeeklyReport.findMany({ where: { operatorId: op.id, status: 'REVIEWED' }, orderBy: { weekStart: 'desc' }, take: 26 })
    const history = []
    for (const r of reviewed) history.push(await presentReport(r, { showEarnings: true, feedbackVisible: true }))
    return ok({ current, history })
  } catch (err) {
    return handleRouteError(err)
  }
}
