import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { weeklyAttendance } from '@/lib/shifts/service'
import { BillingConfigError, buildLines, invoiceNumber, totals } from './calc'

export class BillingError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface BillingSettings {
  billingModel: 'PER_MESSAGE' | 'PER_TICKET' | 'PER_HOUR' | 'MONTHLY_FLAT'
  pricePerMessageEurCents: number
  operatorCostPerMessageEurCents: number
  pricePerTicketEurCents: number | null
  pricePerHourEurCents: number | null
  monthlyFeeEurCents: number | null
  vatRatePercent: number
  vatNote: string | null
  paymentTermsDays: number
}

const SETTINGS_SELECT = { billingModel: true, pricePerMessageEurCents: true, operatorCostPerMessageEurCents: true, pricePerTicketEurCents: true, pricePerHourEurCents: true, monthlyFeeEurCents: true, vatRatePercent: true, vatNote: true, paymentTermsDays: true } as const

export async function getBillingSettings(tenantId: string): Promise<BillingSettings> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: SETTINGS_SELECT })
  if (!t) throw new BillingError('Client not found', 404)
  return t
}

export async function updateBillingSettings(tenantId: string, patch: Partial<BillingSettings>, actorUserId: string) {
  const before = await getBillingSettings(tenantId)
  const t = await db.tenant.update({ where: { id: tenantId }, data: patch, select: SETTINGS_SELECT })
  await writeAuditLog({ tenantId, actorUserId, action: 'billing.settings_changed', resource: 'tenant', resourceId: tenantId, metadata: { before, after: t } })
  return t
}

/** Operators' scheduled hours for a client over a period (net of absences) - the billable base for hourly clients. */
async function scheduledHours(tenantId: string, from: Date, to: Date) {
  const ops = await db.operator.findMany({ where: { tenantId }, select: { id: true } })
  let h = 0
  for (const o of ops) h += (await weeklyAttendance(o.id, from, to))?.scheduledHours ?? 0
  return h
}

export async function createDraftInvoice(i: { tenantId: string; periodStart: Date; periodEnd: Date; actorUserId: string }) {
  if (!(i.periodEnd.getTime() > i.periodStart.getTime()) || i.periodEnd.getTime() - i.periodStart.getTime() > 93 * 86_400_000) throw new BillingError('Choose a period of up to 3 months')
  if (i.periodEnd.getTime() > Date.now() + 86_400_000) throw new BillingError('The period cannot end in the future')
  const s = await getBillingSettings(i.tenantId)
  const overlap = await db.invoice.findFirst({ where: { tenantId: i.tenantId, status: { not: 'VOID' }, periodStart: { lt: i.periodEnd }, periodEnd: { gt: i.periodStart } } })
  if (overlap) throw new BillingError('An invoice already covers part of this period (void it first to re-bill)', 409)

  const inPeriod = { gte: i.periodStart, lt: i.periodEnd }
  const [usage, resolved, hours] = await Promise.all([
    db.usageRecord.aggregate({ where: { tenantId: i.tenantId, billable: true, createdAt: inPeriod }, _count: { _all: true }, _sum: { priceEurCents: true } }),
    db.ticket.count({ where: { tenantId: i.tenantId, status: { in: ['RESOLVED', 'CLOSED'] }, updatedAt: inPeriod } }),
    s.billingModel === 'PER_HOUR' ? scheduledHours(i.tenantId, i.periodStart, i.periodEnd) : Promise.resolve(0),
  ])
  let lines
  try {
    lines = buildLines(s.billingModel, { messages: { count: usage._count._all, amountEurCents: usage._sum.priceEurCents ?? 0 }, tickets: { resolved }, hours, settings: s })
  } catch (e) {
    if (e instanceof BillingConfigError) throw new BillingError(e.message)
    throw e
  }
  const tot = totals(lines, s.vatRatePercent)
  if (tot.subtotalEurCents <= 0) throw new BillingError('Nothing to bill for this period', 409)
  const inv = await db.invoice.create({
    data: { tenantId: i.tenantId, periodStart: i.periodStart, periodEnd: i.periodEnd, billingModel: s.billingModel, lines: lines as never, ...tot, vatRatePercent: s.vatRatePercent, vatNote: s.vatNote, createdByUserId: i.actorUserId },
  })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.actorUserId, action: 'invoice.drafted', resource: 'invoice', resourceId: inv.id, metadata: { total: inv.totalEurCents, model: inv.billingModel } })
  return inv
}

/** Assigns the next gap-free number for the year in the same transaction as the status change. */
export async function issueInvoice(i: { id: string; actorUserId: string; now?: Date }) {
  const now = i.now ?? new Date()
  const inv = await db.$transaction(async (tx) => {
    const draft = await tx.invoice.findUnique({ where: { id: i.id } })
    if (!draft) throw new BillingError('Invoice not found', 404)
    const terms = (await tx.tenant.findUniqueOrThrow({ where: { id: draft.tenantId }, select: { paymentTermsDays: true } })).paymentTermsDays
    const year = now.getUTCFullYear()
    const counter = await tx.invoiceCounter.upsert({ where: { year }, create: { year, last: 1 }, update: { last: { increment: 1 } } })
    const r = await tx.invoice.updateMany({ where: { id: i.id, status: 'DRAFT' }, data: { status: 'ISSUED', number: invoiceNumber(year, counter.last), issuedAt: now, dueAt: new Date(now.getTime() + terms * 86_400_000) } })
    if (r.count === 0) throw new BillingError('Only a draft can be issued', 409) // rolls back the counter increment too
    return tx.invoice.findUniqueOrThrow({ where: { id: i.id } })
  })
  await writeAuditLog({ tenantId: inv.tenantId, actorUserId: i.actorUserId, action: 'invoice.issued', resource: 'invoice', resourceId: inv.id, metadata: { number: inv.number, total: inv.totalEurCents } })
  return inv
}

export async function markInvoicePaid(i: { id: string; reference?: string | null; actorUserId: string }) {
  const r = await db.invoice.updateMany({ where: { id: i.id, status: 'ISSUED' }, data: { status: 'PAID', paidAt: new Date(), paymentReference: i.reference?.slice(0, 120) ?? null } })
  if (r.count === 0) throw new BillingError('Only an issued, unpaid invoice can be marked paid', 409)
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: i.id } })
  await writeAuditLog({ tenantId: inv.tenantId, actorUserId: i.actorUserId, action: 'invoice.paid', resource: 'invoice', resourceId: inv.id, metadata: { number: inv.number } })
  return inv
}

/** A draft or issued invoice can be voided with a reason; a paid one cannot (credit it separately). The number is kept - never reused. */
export async function voidInvoice(i: { id: string; reason: string; actorUserId: string }) {
  const reason = i.reason.trim()
  if (reason.length < 5) throw new BillingError('Give a reason for voiding')
  const r = await db.invoice.updateMany({ where: { id: i.id, status: { in: ['DRAFT', 'ISSUED'] } }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason.slice(0, 300) } })
  if (r.count === 0) throw new BillingError('Only a draft or unpaid issued invoice can be voided', 409)
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: i.id } })
  await writeAuditLog({ tenantId: inv.tenantId, actorUserId: i.actorUserId, action: 'invoice.voided', resource: 'invoice', resourceId: inv.id, metadata: { number: inv.number } })
  return inv
}

/**
 * Reconciliation of operational activity, client billing and operator compensation for one client and period:
 * what the client is billed, what the usage ledger says operators cost, what operators are owed in the earnings ledger, and the
 * mismatches that need a human (messages with no usage record, delivered operator messages with no earning line, ...).
 */
export async function reconcile(tenantId: string, from: Date, to: Date) {
  const inP = { gte: from, lt: to }
  const [usage, outbound, lines, adjustments, invoices, deliveredNoUsage, deliveredNoLine] = await Promise.all([
    db.usageRecord.aggregate({ where: { tenantId, billable: true, createdAt: inP }, _count: { _all: true }, _sum: { priceEurCents: true, operatorCostEurCents: true } }),
    db.message.count({ where: { tenantId, direction: 'OUTBOUND', status: 'DELIVERED', createdAt: inP } }),
    db.operatorEarningLine.groupBy({ by: ['state'], where: { tenantId, messageAt: inP }, _count: { _all: true }, _sum: { rateEurCents: true } }),
    db.operatorEarningAdjustment.aggregate({ where: { tenantId, createdAt: inP }, _sum: { amountEurCents: true } }),
    db.invoice.findMany({ where: { tenantId, status: { not: 'VOID' }, periodStart: { lt: to }, periodEnd: { gt: from } }, select: { number: true, status: true, subtotalEurCents: true, totalEurCents: true } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Message" m LEFT JOIN "UsageRecord" u ON u."messageId" = m."id" WHERE m."tenantId" = ${tenantId} AND m."direction" = 'OUTBOUND' AND m."status" = 'DELIVERED' AND m."createdAt" >= ${from} AND m."createdAt" < ${to} AND u."id" IS NULL`,
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Message" m LEFT JOIN "OperatorEarningLine" l ON l."messageId" = m."id" WHERE m."tenantId" = ${tenantId} AND m."direction" = 'OUTBOUND' AND m."operatorId" IS NOT NULL AND m."status" = 'DELIVERED' AND m."createdAt" >= ${from} AND m."createdAt" < ${to} AND l."id" IS NULL`,
  ])
  const billed = usage._sum.priceEurCents ?? 0
  const usageCost = usage._sum.operatorCostEurCents ?? 0
  const payableLines = lines.find((l) => l.state === 'PAYABLE')
  const operatorOwed = (payableLines?._sum.rateEurCents ?? 0) + (adjustments._sum.amountEurCents ?? 0)
  const invoiced = invoices.reduce((a, x) => a + x.subtotalEurCents, 0)
  return {
    period: { from, to },
    activity: { billableMessages: usage._count._all, deliveredOperatorMessages: outbound },
    clientBilling: { billedPerUsageEurCents: billed, invoicedSubtotalEurCents: invoiced, invoices },
    operatorCompensation: { ledgerCostEurCents: usageCost, owedEurCents: operatorOwed, payableMessages: payableLines?._count._all ?? 0, pendingMessages: lines.find((l) => l.state === 'PENDING')?._count._all ?? 0, rejectedMessages: lines.find((l) => l.state === 'REJECTED')?._count._all ?? 0 },
    margin: { grossEurCents: billed - operatorOwed, grossPercent: billed > 0 ? Math.round(((billed - operatorOwed) / billed) * 1000) / 10 : null },
    mismatches: {
      deliveredWithoutUsageRecord: Number(deliveredNoUsage[0]?.n ?? 0), // delivered but never billed
      deliveredWithoutEarningLine: Number(deliveredNoLine[0]?.n ?? 0), // an operator wrote it but earnings were not synced / no rate
      usageVsInvoiceDifferenceEurCents: invoices.length ? billed - invoiced : null, // non-zero when billing model is not per-message or usage changed after invoicing
    },
  }
}

