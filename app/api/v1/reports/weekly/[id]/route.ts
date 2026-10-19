import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { ensureWeeklyReport } from '@/lib/reports/weekly'

const Body = z.object({ feedback: z.string().max(3000).default('') }).strict()

// Review a weekly report: refreshes the metrics one last time, stores the reviewer's feedback and freezes the report.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'QA_REVIEW')
    const { id } = await params
    const body = Body.parse(await req.json())
    const report = await db.operatorWeeklyReport.findUnique({ where: { id } })
    const tenantId = resolveTenantScope(session, report?.tenantId ?? null)
    if (!report || report.tenantId !== tenantId) return fail('Report not found', 404)
    await assertOperatorInTeam(session, report.operatorId)
    if (report.status === 'REVIEWED') return fail('This report has already been reviewed', 409)
    await ensureWeeklyReport(report.operatorId, report.weekStart)
    const r = await db.operatorWeeklyReport.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'REVIEWED', managerFeedback: body.feedback.trim() || null, reviewedByUserId: session.sub, reviewedAt: new Date() } })
    if (r.count === 0) return fail('This report has already been reviewed', 409)
    await writeAuditLog({ tenantId, actorUserId: session.sub, action: 'report.weekly_reviewed', resource: 'operator_weekly_report', resourceId: id, metadata: { operatorId: report.operatorId } })
    return ok({ id, status: 'REVIEWED' })
  } catch (err) {
    return handleRouteError(err)
  }
}
