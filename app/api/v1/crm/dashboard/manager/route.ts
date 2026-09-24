import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_VIEW_TEAM')

    const [leads, pendingApprovals, commissions] = await Promise.all([
      db.lead.findMany({ include: { owner: { select: { id: true, displayName: true } } } }),
      db.approval.count({ where: { status: 'PENDING' } }),
      db.commission.findMany(),
    ])

    const byStage: Record<string, number> = {}
    for (const l of leads) byStage[l.pipelineStage] = (byStage[l.pipelineStage] ?? 0) + 1

    const teamCommissionEurCents = commissions.reduce((s, c) => s + c.amountEurCents, 0)

    return ok({
      totalLeads: leads.length,
      byStage,
      pendingApprovals,
      teamCommissionEurCents,
      leads,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
