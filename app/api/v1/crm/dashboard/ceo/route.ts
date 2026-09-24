import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'

/**
 * Executive dashboard. Every figure here is computed from real recorded rows
 * only - net margin explicitly reports `available: false` rather than a
 * number when no FulfillmentCost has ever been recorded, per the business
 * rule "if BPO fulfillment cost is unavailable, show unavailable/incomplete
 * rather than inventing it" (docs/crm.md).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'COMMISSION_CONFIGURE') // CEO_ADMIN only - matrix already restricts this

    const now = new Date()
    const [leads, commissions, revenueRecords, fulfillmentCosts] = await Promise.all([
      db.lead.findMany(),
      db.commission.findMany(),
      db.revenueRecord.findMany(),
      db.fulfillmentCost.findMany(),
    ])

    // Closed-Won leads whose client onboarding (BPO handoff) succeeded but
    // whose first-month payment has not yet been confirmed - Closed Won
    // alone never makes a commission payable (confirmed business rule), so
    // this is the CEO's worklist for that separate, explicit step.
    const commissionedLeadIds = new Set(commissions.map((c) => c.leadId))
    const closedWonLeadIds = leads.filter((l) => l.pipelineStage === 'CLOSED_WON').map((l) => l.id)
    const succeededHandoffs = closedWonLeadIds.length
      ? await db.bpoHandoff.findMany({
          where: { leadId: { in: closedWonLeadIds }, status: 'SUCCEEDED' },
          select: { leadId: true },
        })
      : []
    const awaitingPaymentConfirmation = leads.filter(
      (l) =>
        l.pipelineStage === 'CLOSED_WON' &&
        !commissionedLeadIds.has(l.id) &&
        succeededHandoffs.some((h) => h.leadId === l.id),
    )

    const closedWon = leads.filter((l) => l.pipelineStage === 'CLOSED_WON')
    const closedLost = leads.filter((l) => l.pipelineStage === 'CLOSED_LOST')
    const openLeads = leads.filter((l) => l.pipelineStage !== 'CLOSED_WON' && l.pipelineStage !== 'CLOSED_LOST')
    const pipelineValueEurCents = openLeads.reduce((s, l) => s + (l.estimatedValueEurCents ?? 0), 0)
    const totalDecided = closedWon.length + closedLost.length
    const winRate = totalDecided > 0 ? closedWon.length / totalDecided : null

    const totalRevenueEurCents = revenueRecords.reduce((s, r) => s + r.amountEurCents, 0)
    const mrrEurCents = revenueRecords
      .filter((r) => r.periodStart <= now && r.periodEnd >= now)
      .reduce((s, r) => s + r.amountEurCents, 0)

    const totalCommissionEurCents = commissions.reduce((s, c) => s + c.amountEurCents, 0)
    const pendingPayoutEurCents = commissions
      .filter((c) => c.status === 'PENDING' || c.status === 'APPROVED')
      .reduce((s, c) => s + c.amountEurCents, 0)

    const totalFulfillmentCostEurCents = fulfillmentCosts.reduce((s, f) => s + f.amountEurCents, 0)
    const netMargin =
      fulfillmentCosts.length === 0
        ? { available: false as const, reason: 'No fulfillment cost has been recorded yet' }
        : {
            available: true as const,
            revenueEurCents: totalRevenueEurCents,
            fulfillmentCostEurCents: totalFulfillmentCostEurCents,
            commissionEurCents: totalCommissionEurCents,
            netMarginEurCents: totalRevenueEurCents - totalFulfillmentCostEurCents - totalCommissionEurCents,
          }

    // Leaderboard: group commissions by hunter, join display names.
    const byHunter = new Map<string, { amountEurCents: number; dealsWon: number }>()
    for (const c of commissions) {
      const cur = byHunter.get(c.hunterId) ?? { amountEurCents: 0, dealsWon: 0 }
      cur.amountEurCents += c.amountEurCents
      cur.dealsWon += 1
      byHunter.set(c.hunterId, cur)
    }
    const hunterIds = [...byHunter.keys()]
    const hunterUsers = hunterIds.length
      ? await db.user.findMany({ where: { id: { in: hunterIds } }, select: { id: true, displayName: true } })
      : []
    const leaderboard = hunterUsers
      .map((u) => ({ hunterId: u.id, displayName: u.displayName, ...byHunter.get(u.id)! }))
      .sort((a, b) => b.amountEurCents - a.amountEurCents)

    return ok({
      totalLeads: leads.length,
      closedWonCount: closedWon.length,
      closedLostCount: closedLost.length,
      winRate,
      pipelineValueEurCents,
      totalRevenueEurCents,
      mrrEurCents,
      pendingPayoutEurCents,
      netMargin,
      leaderboard,
      awaitingPaymentConfirmation: awaitingPaymentConfirmation.map((l) => ({
        id: l.id,
        companyName: l.companyName,
        contactName: l.contactName,
      })),
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
