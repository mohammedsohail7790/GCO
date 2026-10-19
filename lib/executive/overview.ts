import { db } from '@/lib/db/client'

const D = 86_400_000

export interface ClientRow {
  tenantId: string
  name: string
  status: string
  industry: string | null
  billableMessages: number
  billedEurCents: number
  operatorOwedEurCents: number
  marginEurCents: number
  marginPercent: number | null
  invoicedOutstandingEurCents: number
  operators: number
  activeConversations: number
  slaMetPct: number | null
  qaPassRate: number | null
}

/** Month-to-date total projected to the end of the month at the current daily run rate. Honest label: a projection, not a forecast model. */
export function runRateProjection(monthToDate: number, now: Date): number {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const elapsed = Math.max((now.getTime() - start.getTime()) / D, 1)
  const total = (end.getTime() - start.getTime()) / D
  return Math.round((monthToDate / elapsed) * total)
}

/**
 * Company-wide executive view for a period: per-client profitability, totals, a daily series, payment obligations and capacity.
 * Revenue = the per-message prices recorded in the usage ledger; cost = what operators are owed in the earnings ledger
 * (payable messages + adjustments dated in the period). Everything is read from the existing ledgers - nothing is estimated.
 */
export async function computeExecutive(from: Date, to: Date, now = new Date()) {
  const inP = { gte: from, lt: to }
  const [tenants, usage, owedLines, owedAdj, outstanding, operators, active, assignments, reviews, awaiting, pendingPayouts, shifts7d, series] = await Promise.all([
    db.tenant.findMany({ select: { id: true, name: true, status: true, industry: true }, orderBy: { name: 'asc' } }),
    db.usageRecord.groupBy({ by: ['tenantId'], where: { billable: true, createdAt: inP }, _count: { _all: true }, _sum: { priceEurCents: true } }),
    db.operatorEarningLine.groupBy({ by: ['tenantId'], where: { state: 'PAYABLE', messageAt: inP }, _sum: { rateEurCents: true } }),
    db.operatorEarningAdjustment.groupBy({ by: ['tenantId'], where: { createdAt: inP }, _sum: { amountEurCents: true } }),
    db.invoice.groupBy({ by: ['tenantId'], where: { status: 'ISSUED' }, _sum: { totalEurCents: true } }),
    db.operator.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    db.conversation.groupBy({ by: ['tenantId'], where: { state: { in: ['ACTIVE', 'QUEUED', 'REASSIGNING', 'WAITING_FOR_OPERATOR'] } }, _count: { _all: true } }),
    db.assignment.groupBy({ by: ['tenantId', 'status'], where: { assignedAt: inP }, _count: { _all: true } }),
    db.qaReview.groupBy({ by: ['tenantId', 'outcome'], where: { createdAt: inP }, _count: { _all: true } }),
    db.operatorEarningLine.aggregate({ where: { state: 'PAYABLE', payoutId: null }, _sum: { rateEurCents: true } }),
    db.operatorPayout.aggregate({ where: { status: 'PENDING' }, _sum: { totalEurCents: true } }),
    db.shift.count({ where: { status: 'SCHEDULED', startsAt: { gte: now, lt: new Date(now.getTime() + 7 * D) } } }),
    db.$queryRaw<{ day: Date; n: bigint; amount: bigint | null }[]>`SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS n, SUM("priceEurCents") AS amount FROM "UsageRecord" WHERE "billable" = true AND "createdAt" >= ${new Date(now.getTime() - 30 * D)} GROUP BY 1 ORDER BY 1`,
  ])
  const by = <T extends { tenantId: string | null }>(rows: T[]) => new Map(rows.filter((r) => r.tenantId).map((r) => [r.tenantId as string, r] as const))
  const u = by(usage), l = by(owedLines), a = by(owedAdj), o = by(outstanding), ops = by(operators), act = by(active)

  const clients: ClientRow[] = tenants.map((t) => {
    const billed = u.get(t.id)?._sum.priceEurCents ?? 0
    const owed = (l.get(t.id)?._sum.rateEurCents ?? 0) + (a.get(t.id)?._sum.amountEurCents ?? 0)
    const asg = assignments.filter((x) => x.tenantId === t.id)
    const total = asg.reduce((s, x) => s + x._count._all, 0)
    const missed = asg.filter((x) => x.status === 'EXPIRED').reduce((s, x) => s + x._count._all, 0)
    const rv = reviews.filter((x) => x.tenantId === t.id)
    const rvTotal = rv.reduce((s, x) => s + x._count._all, 0)
    return {
      tenantId: t.id, name: t.name, status: t.status, industry: t.industry,
      billableMessages: u.get(t.id)?._count._all ?? 0, billedEurCents: billed, operatorOwedEurCents: owed, marginEurCents: billed - owed,
      marginPercent: billed > 0 ? Math.round(((billed - owed) / billed) * 1000) / 10 : null,
      invoicedOutstandingEurCents: o.get(t.id)?._sum.totalEurCents ?? 0,
      operators: ops.get(t.id)?._count._all ?? 0, activeConversations: act.get(t.id)?._count._all ?? 0,
      slaMetPct: total ? Math.round(((total - missed) / total) * 100) : null,
      qaPassRate: rvTotal ? Math.round((rv.filter((x) => x.outcome === 'PASS').reduce((s, x) => s + x._count._all, 0) / rvTotal) * 100) : null,
    }
  })
  const sum = (k: keyof ClientRow) => clients.reduce((s, c) => s + (typeof c[k] === 'number' ? (c[k] as number) : 0), 0)
  const revenue = sum('billedEurCents'), cost = sum('operatorOwedEurCents')

  const [available, capacityRows, mtd] = await Promise.all([
    db.operator.count({ where: { status: { in: ['AVAILABLE', 'BUSY'] } } }),
    db.operator.aggregate({ where: { status: { in: ['AVAILABLE', 'BUSY'] } }, _sum: { capacity: true } }),
    db.usageRecord.aggregate({ where: { billable: true, createdAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } }, _sum: { priceEurCents: true } }),
  ])
  const capacitySlots = capacityRows._sum.capacity ?? 0
  const activeTotal = sum('activeConversations')
  return {
    period: { from, to },
    totals: { revenueEurCents: revenue, operatorCostEurCents: cost, marginEurCents: revenue - cost, marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null, billableMessages: sum('billableMessages'), outstandingInvoicesEurCents: sum('invoicedOutstandingEurCents'), clients: tenants.length, activeClients: tenants.filter((t) => t.status === 'ACTIVE').length, operators: sum('operators') },
    obligations: { operatorsAwaitingPayoutEurCents: awaiting._sum.rateEurCents ?? 0, payoutsInProgressEurCents: pendingPayouts._sum.totalEurCents ?? 0 },
    capacity: { operatorsOnline: available, openSlots: Math.max(capacitySlots - activeTotal, 0), totalSlots: capacitySlots, activeConversations: activeTotal, shiftsNext7Days: shifts7d },
    projection: { monthToDateRevenueEurCents: mtd._sum.priceEurCents ?? 0, projectedMonthRevenueEurCents: runRateProjection(mtd._sum.priceEurCents ?? 0, now), basis: 'Month-to-date revenue extrapolated at the current daily rate' },
    series: series.map((r) => ({ day: r.day.toISOString().slice(0, 10), messages: Number(r.n), revenueEurCents: Number(r.amount ?? 0) })),
    clients: clients.sort((x, y) => y.billedEurCents - x.billedEurCents),
  }
}

/** Global search over clients, people, invoices and leads for the executive dashboard. */
export async function executiveSearch(q: string) {
  const term = q.trim()
  if (term.length < 2) return []
  const c = { contains: term, mode: 'insensitive' as const }
  const [tenants, users, invoices, leads] = await Promise.all([
    db.tenant.findMany({ where: { OR: [{ name: c }, { slug: c }] }, take: 5, select: { id: true, name: true } }),
    db.user.findMany({ where: { OR: [{ displayName: c }, { email: c }], NOT: { email: { endsWith: '@anonymised.invalid' } } }, take: 8, select: { id: true, displayName: true, email: true, role: true } }),
    db.invoice.findMany({ where: { number: c }, take: 5, select: { id: true, number: true, status: true } }),
    db.lead.findMany({ where: { OR: [{ companyName: c }, { contactName: c }] }, take: 5, select: { id: true, companyName: true } }),
  ])
  return [
    ...tenants.map((t) => ({ type: 'client', label: t.name, href: `/admin/billing?tenantId=${t.id}` })),
    ...users.map((x) => ({ type: x.role.toLowerCase().replace('_', ' '), label: `${x.displayName} · ${x.email}`, href: x.role === 'OPERATOR' ? '/admin/earnings' : '/admin' })),
    ...invoices.map((i) => ({ type: 'invoice', label: `${i.number} (${i.status.toLowerCase()})`, href: `/admin/billing/invoice/${i.id}` })),
    ...leads.map((x) => ({ type: 'lead', label: x.companyName, href: '/admin' })),
  ]
}
