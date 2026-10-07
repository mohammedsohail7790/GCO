import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { followUpsDue } from '@/lib/crm/discovery'
import { ok, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_VIEW_OWN')

    const [leads, pendingApprovals, commissions] = await Promise.all([
      db.lead.findMany({ where: { ownerId: session.sub }, orderBy: { updatedAt: 'desc' } }),
      db.approval.count({ where: { submittedByUserId: session.sub, status: 'PENDING' } }),
      db.commission.findMany({ where: { hunterId: session.sub }, include: { lead: { select: { companyName: true } } } }),
    ])

    const byStage: Record<string, number> = {}
    for (const l of leads) byStage[l.pipelineStage] = (byStage[l.pipelineStage] ?? 0) + 1

    // Follow-ups: next action date reached, or the 30-day lock expiring within 5 days (open leads only).
    const followUps = await followUpsDue({ ownerId: session.sub })
    const dueIds = new Set(followUps.map((f) => f.leadId))
    const followUpsDue_ = leads.filter((l) => dueIds.has(l.id))

    const walletEurCents = {
      pending: commissions.filter((c) => c.status === 'PENDING').reduce((s, c) => s + c.amountEurCents, 0),
      approved: commissions.filter((c) => c.status === 'APPROVED').reduce((s, c) => s + c.amountEurCents, 0),
      paid: commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amountEurCents, 0),
    }

    return ok({
      totalLeads: leads.length,
      byStage,
      followUpsDue: followUpsDue_,
      followUps,
      pendingApprovals,
      commissions,
      walletEurCents,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
