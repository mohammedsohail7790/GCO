import { db } from '@/lib/db/client'

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
/** Monday 00:00 UTC of the week containing d. */
const startOfUtcWeek = (d: Date) => {
  const day = startOfUtcDay(d)
  const dow = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - dow * 86_400_000)
}
const startOfUtcMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

/**
 * Everything the operator earnings dashboard (and a manager's view of one operator) needs. Periods are UTC calendar
 * day / ISO week (Monday start) / month, based on when the message was written.
 * Money is integer euro cents; "earned" = PAYABLE lines (paid or not) + adjustments.
 */
export async function getEarningsSummary(operatorId: string, now = new Date()) {
  const dayStart = startOfUtcDay(now)
  const weekStart = startOfUtcWeek(now)
  const monthStart = startOfUtcMonth(now)

  const [written, sent, delivered, failed, reviewRows, lines, adjustments, payouts, unratedRows] = await Promise.all([
    db.message.count({ where: { operatorId, direction: 'OUTBOUND' } }),
    db.message.count({ where: { operatorId, direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED'] } } }),
    db.message.count({ where: { operatorId, direction: 'OUTBOUND', status: 'DELIVERED' } }),
    db.message.count({ where: { operatorId, direction: 'OUTBOUND', status: 'FAILED' } }),
    db.qaReview.findMany({ where: { operatorId }, select: { messageId: true, outcome: true } }),
    db.operatorEarningLine.findMany({ where: { operatorId }, select: { state: true, rateEurCents: true, messageAt: true, payoutId: true } }),
    db.operatorEarningAdjustment.findMany({ where: { operatorId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, amountEurCents: true, reason: true, payoutId: true, createdAt: true } }),
    db.operatorPayout.findMany({ where: { operatorId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Message" m LEFT JOIN "OperatorEarningLine" l ON l."messageId" = m."id" WHERE m."operatorId" = ${operatorId} AND m."direction" = 'OUTBOUND' AND l."id" IS NULL`,
  ])

  const rejectedIds = new Set(reviewRows.filter((r) => r.outcome === 'FAIL').map((r) => r.messageId))
  const approvedIds = new Set(reviewRows.filter((r) => r.outcome !== 'FAIL' && !rejectedIds.has(r.messageId)).map((r) => r.messageId))

  const payable = lines.filter((l) => l.state === 'PAYABLE')
  const sum = (xs: { rateEurCents: number }[]) => xs.reduce((a, l) => a + l.rateEurCents, 0)
  const since = (d: Date) => sum(payable.filter((l) => l.messageAt >= d))
  const adjSince = (d: Date) => adjustments.filter((a) => a.createdAt >= d).reduce((x, a) => x + a.amountEurCents, 0)

  const unpaidPayable = sum(payable.filter((l) => !l.payoutId))
  const unsettledAdj = adjustments.filter((a) => !a.payoutId).reduce((x, a) => x + a.amountEurCents, 0)
  const paidOut = payouts.filter((p) => p.status === 'PAID').reduce((x, p) => x + p.totalEurCents, 0)
  const pendingPayouts = payouts.filter((p) => p.status === 'PENDING').reduce((x, p) => x + p.totalEurCents, 0)

  return {
    messages: {
      written,
      sent,
      delivered,
      failed,
      approved: approvedIds.size,
      rejected: rejectedIds.size,
      payable: payable.length,
      pending: lines.filter((l) => l.state === 'PENDING').length,
      notPayable: lines.filter((l) => l.state === 'REJECTED').length,
      unrated: Number(unratedRows[0]?.n ?? 0), // written but no rate card applies yet - not priced, not lost
    },
    earnings: {
      todayEurCents: since(dayStart) + adjSince(dayStart),
      weekEurCents: since(weekStart) + adjSince(weekStart),
      monthEurCents: since(monthStart) + adjSince(monthStart),
      totalAccumulatedEurCents: sum(payable) + adjustments.reduce((x, a) => x + a.amountEurCents, 0),
      awaitingPayoutEurCents: unpaidPayable + unsettledAdj, // payable but not yet in a payout
      pendingPaymentEurCents: pendingPayouts, // in a payout that is not yet paid
      paidEurCents: paidOut,
      awaitingApprovalMessages: lines.filter((l) => l.state === 'PENDING').length,
    },
    adjustments,
    payouts: payouts.map((p) => ({ id: p.id, status: p.status, totalEurCents: p.totalEurCents, linesEurCents: p.linesEurCents, adjustmentsEurCents: p.adjustmentsEurCents, lineCount: p.lineCount, periodEnd: p.periodEnd, createdAt: p.createdAt, paidAt: p.paidAt, reference: p.reference })),
    period: { timezone: 'UTC', dayStart, weekStart, monthStart },
  }
}

export async function listRecentLines(operatorId: string, take = 50) {
  return db.operatorEarningLine.findMany({
    where: { operatorId },
    orderBy: { messageAt: 'desc' },
    take,
    select: { id: true, messageId: true, rateEurCents: true, state: true, stateReason: true, messageAt: true, payoutId: true },
  })
}

/** One row per operator (optionally one tenant) with what is owed - the CEO's payment-obligation overview. */
export async function getObligations(tenantId?: string) {
  const operators = await db.operator.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { operatorNumber: 'asc' },
    select: { id: true, operatorNumber: true, tenantId: true, user: { select: { displayName: true, isActive: true } }, tenant: { select: { name: true } } },
  })
  const ids = operators.map((o) => o.id)
  const [lineGroups, adjGroups, payoutGroups] = await Promise.all([
    db.operatorEarningLine.groupBy({ by: ['operatorId', 'state', 'payoutId'], where: { operatorId: { in: ids } }, _count: { _all: true }, _sum: { rateEurCents: true } }),
    db.operatorEarningAdjustment.groupBy({ by: ['operatorId', 'payoutId'], where: { operatorId: { in: ids } }, _sum: { amountEurCents: true } }),
    db.operatorPayout.groupBy({ by: ['operatorId', 'status'], where: { operatorId: { in: ids } }, _sum: { totalEurCents: true } }),
  ])
  return operators.map((o) => {
    const mine = lineGroups.filter((g) => g.operatorId === o.id)
    const payableUnpaid = mine.filter((g) => g.state === 'PAYABLE' && !g.payoutId).reduce((a, g) => a + (g._sum.rateEurCents ?? 0), 0)
    const adjUnsettled = adjGroups.filter((g) => g.operatorId === o.id && !g.payoutId).reduce((a, g) => a + (g._sum.amountEurCents ?? 0), 0)
    const payouts = payoutGroups.filter((g) => g.operatorId === o.id)
    return {
      operatorId: o.id,
      operatorNumber: o.operatorNumber,
      name: o.user.displayName,
      active: o.user.isActive,
      tenantId: o.tenantId,
      tenantName: o.tenant.name,
      awaitingPayoutEurCents: payableUnpaid + adjUnsettled,
      pendingPaymentEurCents: payouts.filter((p) => p.status === 'PENDING').reduce((a, p) => a + (p._sum.totalEurCents ?? 0), 0),
      paidEurCents: payouts.filter((p) => p.status === 'PAID').reduce((a, p) => a + (p._sum.totalEurCents ?? 0), 0),
      pendingMessages: mine.filter((g) => g.state === 'PENDING').reduce((a, g) => a + g._count._all, 0),
    }
  })
}
