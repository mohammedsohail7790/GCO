import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
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

    const followUpsDue = leads.filter(
      (l) => l.ownershipExpiresAt && l.ownershipExpiresAt.getTime() - Date.now() < 5 * 24 * 60 * 60 * 1000,
    )

    const walletEurCents = {
      pending: commissions.filter((c) => c.status === 'PENDING').reduce((s, c) => s + c.amountEurCents, 0),
      approved: commissions.filter((c) => c.status === 'APPROVED').reduce((s, c) => s + c.amountEurCents, 0),
      paid: commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amountEurCents, 0),
    }

    return ok({
      totalLeads: leads.length,
      byStage,
      followUpsDue,
      pendingApprovals,
      commissions,
      walletEurCents,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
