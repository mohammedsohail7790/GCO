import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan, can } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'
import { followUpsDue } from '@/lib/crm/discovery'

/**
 * Sales funnel metrics for Manager/CEO, computed only from rows that exist. Anything GCO does not record is reported as
 * unavailable with the reason - never guessed. Revenue/commission figures are CEO-only (a Manager keeps today's access:
 * they never saw finance), so they are omitted for other roles.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_VIEW_TEAM')

    const [byStageRows, owned, byQualRows, onboardingRows, followUps, recent] = await Promise.all([
      db.lead.groupBy({ by: ['pipelineStage'], _count: { _all: true } }),
      db.lead.count({ where: { ownerId: { not: null } } }),
      db.lead.groupBy({ by: ['qualification'], _count: { _all: true } }),
      db.clientOnboarding.groupBy({ by: ['status'], _count: { _all: true } }),
      followUpsDue({ limit: 200 }),
      followUpsDue({ limit: 20 }),
    ])
    const byStage: Record<string, number> = {}
    for (const r of byStageRows) byStage[r.pipelineStage] = r._count._all
    const total = Object.values(byStage).reduce((a, b) => a + b, 0)
    const qualification: Record<string, number> = { UNASSESSED: 0, QUALIFIED: 0, NOT_QUALIFIED: 0, NEEDS_FOLLOW_UP: 0 }
    for (const r of byQualRows) qualification[r.qualification ?? 'UNASSESSED'] = r._count._all
    const onboarding: Record<string, number> = {}
    for (const r of onboardingRows) onboarding[r.status] = r._count._all

    const funnel = {
      leads: { total, owned, unassigned: total - owned, byStage },
      qualification,
      // MEETING_BOOKED is the "discovery call" stage: a Hunter moves a lead there when a call is booked.
      discovery: { meetingStage: byStage['MEETING_BOOKED'] ?? 0, callsHeld: { available: false, reason: 'GCO does not record whether a booked call took place (Calendly is a link only).' } },
      proposals: byStage['PROPOSAL'] ?? 0,
      pendingApproval: byStage['PENDING_APPROVAL'] ?? 0,
      closedWon: byStage['CLOSED_WON'] ?? 0,
      closedLost: byStage['CLOSED_LOST'] ?? 0,
      followUps: { dueCount: followUps.length, items: recent },
      onboarding: { byStatus: onboarding, inProgress: (onboarding.PROVISIONING ?? 0) + (onboarding.SETUP ?? 0) + (onboarding.READY_FOR_GO_LIVE ?? 0) + (onboarding.FAILED ?? 0), live: onboarding.LIVE ?? 0 },
      calendlyBookings: { available: false, reason: 'Bookings are not tracked: the Calendly event is linked from the website, with no webhook or API integration.' },
      finance: null as null | Record<string, number>,
    }
    if (can(session.role, 'VIEW_REVENUE')) {
      const [revenue, firstMonth, commissions] = await Promise.all([
        db.revenueRecord.aggregate({ _sum: { amountEurCents: true } }),
        db.revenueRecord.aggregate({ where: { source: 'DEAL_CLOSED' }, _sum: { amountEurCents: true } }),
        db.commission.groupBy({ by: ['status'], _sum: { amountEurCents: true } }),
      ])
      const commissionBy = (s: string) => commissions.find((c) => c.status === s)?._sum.amountEurCents ?? 0
      funnel.finance = {
        totalRevenueEurCents: revenue._sum.amountEurCents ?? 0,
        firstMonthRevenueEurCents: firstMonth._sum.amountEurCents ?? 0, // DEAL_CLOSED = the confirmed first payment
        commissionPendingEurCents: commissionBy('PENDING'),
        commissionApprovedEurCents: commissionBy('APPROVED'),
        commissionPaidEurCents: commissionBy('PAID'),
      }
    }
    return ok(funnel)
  } catch (err) {
    return handleRouteError(err)
  }
}
