import { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { decideState, resolveRateCard } from './rates'

export class EarningsError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const SYNC_BATCH = 500

/**
 * Idempotent. (1) Creates a line for every operator-written OUTBOUND message that does not have one yet, using the
 * rate in force when the message was written (messages with no applicable rate are skipped and reported, never
 * priced at zero). (2) Re-evaluates the state of unpaid lines, since delivery and quality review can arrive later.
 * Paid lines are never touched. Does not read or modify the message pipeline - only reads Message/QaReview.
 */
export async function syncEarnings(operatorId: string): Promise<{ created: number; unrated: number; updated: number }> {
  const operator = await db.operator.findUnique({ where: { id: operatorId }, select: { id: true } })
  if (!operator) throw new EarningsError('Operator not found', 404)

  const cards = await db.operatorRateCard.findMany({ orderBy: { effectiveFrom: 'asc' } })
  // Operator messages with no ledger line yet (oldest first, bounded per call).
  const pending = await db.$queryRaw<{ id: string }[]>`
    SELECT m."id" FROM "Message" m
    LEFT JOIN "OperatorEarningLine" l ON l."messageId" = m."id"
    WHERE m."operatorId" = ${operatorId} AND m."direction" = 'OUTBOUND' AND l."id" IS NULL
    ORDER BY m."createdAt" ASC LIMIT ${SYNC_BATCH}`
  const todo = pending.length ? await db.message.findMany({ where: { id: { in: pending.map((p) => p.id) } }, orderBy: { createdAt: 'asc' } }) : []

  let created = 0
  let unrated = 0
  const reviewsFor = async (messageIds: string[]) => {
    const rows = await db.qaReview.findMany({ where: { messageId: { in: messageIds } }, select: { messageId: true, outcome: true } })
    const map = new Map<string, ('PASS' | 'COACHING' | 'FAIL')[]>()
    for (const r of rows) map.set(r.messageId, [...(map.get(r.messageId) ?? []), r.outcome])
    return map
  }
  if (todo.length) {
    const reviews = await reviewsFor(todo.map((m) => m.id))
    for (const m of todo) {
      const card = resolveRateCard(cards, { tenantId: m.tenantId, operatorId, at: m.createdAt })
      if (!card) { unrated++; continue }
      const d = decideState({ basis: card.basis, messageStatus: m.status, reviews: reviews.get(m.id) ?? [] })
      try {
        await db.operatorEarningLine.create({
          data: { operatorId, tenantId: m.tenantId, messageId: m.id, rateCardId: card.id, rateEurCents: card.amountEurCents, basis: card.basis, state: d.state, stateReason: d.reason, messageAt: m.createdAt },
        })
        created++
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err // concurrent sync created it
      }
    }
  }

  // Re-evaluate unpaid, non-final lines.
  const open = await db.operatorEarningLine.findMany({ where: { operatorId, payoutId: null, state: 'PENDING' }, take: SYNC_BATCH })
  let updated = 0
  if (open.length) {
    const msgs = await db.message.findMany({ where: { id: { in: open.map((l) => l.messageId) } }, select: { id: true, status: true } })
    const status = new Map(msgs.map((m) => [m.id, m.status]))
    const reviews = await reviewsFor(open.map((l) => l.messageId))
    for (const l of open) {
      const d = decideState({ basis: l.basis, messageStatus: status.get(l.messageId) ?? 'PENDING_REVIEW', reviews: reviews.get(l.messageId) ?? [] })
      if (d.state !== l.state) {
        const r = await db.operatorEarningLine.updateMany({ where: { id: l.id, payoutId: null, state: 'PENDING' }, data: { state: d.state, stateReason: d.reason } })
        updated += r.count
      }
    }
  }
  return { created, unrated, updated }
}

export async function createRateCard(input: {
  tenantId?: string | null
  operatorId?: string | null
  amountEurCents: number
  basis: 'DELIVERED' | 'APPROVED'
  effectiveFrom: Date
  note?: string | null
  actorUserId: string
}) {
  if (!Number.isInteger(input.amountEurCents) || input.amountEurCents < 0 || input.amountEurCents > 100_000) throw new EarningsError('Rate must be 0-100000 euro cents')
  if (input.tenantId && !(await db.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } }))) throw new EarningsError('Tenant not found', 404)
  if (input.operatorId && !(await db.operator.findUnique({ where: { id: input.operatorId }, select: { id: true } }))) throw new EarningsError('Operator not found', 404)
  const card = await db.operatorRateCard.create({
    data: {
      tenantId: input.tenantId ?? null,
      operatorId: input.operatorId ?? null,
      amountEurCents: input.amountEurCents,
      basis: input.basis,
      effectiveFrom: input.effectiveFrom,
      note: input.note ?? null,
      createdByUserId: input.actorUserId,
    },
  })
  await writeAuditLog({
    tenantId: input.tenantId ?? null,
    actorUserId: input.actorUserId,
    action: 'earnings.rate_card_created',
    resource: 'operator_rate_card',
    resourceId: card.id,
    metadata: { operatorId: input.operatorId ?? null, amountEurCents: card.amountEurCents, basis: card.basis, effectiveFrom: card.effectiveFrom.toISOString() },
  })
  return card
}

export async function createAdjustment(input: { operatorId: string; amountEurCents: number; reason: string; lineId?: string | null; actorUserId: string }) {
  if (!Number.isInteger(input.amountEurCents) || input.amountEurCents === 0 || Math.abs(input.amountEurCents) > 10_000_000) throw new EarningsError('Adjustment must be a non-zero amount in euro cents')
  const reason = input.reason.trim()
  if (reason.length < 5) throw new EarningsError('A reason the operator can read is required')
  const operator = await db.operator.findUnique({ where: { id: input.operatorId }, select: { id: true, tenantId: true } })
  if (!operator) throw new EarningsError('Operator not found', 404)
  if (input.lineId) {
    const line = await db.operatorEarningLine.findUnique({ where: { id: input.lineId }, select: { operatorId: true } })
    if (!line || line.operatorId !== input.operatorId) throw new EarningsError('Line does not belong to this operator', 400)
  }
  const adj = await db.operatorEarningAdjustment.create({
    data: { operatorId: input.operatorId, tenantId: operator.tenantId, amountEurCents: input.amountEurCents, reason, lineId: input.lineId ?? null, createdByUserId: input.actorUserId },
  })
  await writeAuditLog({
    tenantId: operator.tenantId,
    actorUserId: input.actorUserId,
    action: 'earnings.adjustment_created',
    resource: 'operator_earning_adjustment',
    resourceId: adj.id,
    metadata: { operatorId: input.operatorId, amountEurCents: adj.amountEurCents },
  })
  return adj
}

/**
 * Settles everything currently owed to an operator up to `periodEnd`: PAYABLE unpaid lines plus unsettled adjustments.
 * Claims rows with conditional updates inside one transaction, so two concurrent payouts can never include the same
 * line or adjustment, and a failure leaves nothing half-claimed.
 */
export async function createPayout(input: { operatorId: string; periodEnd: Date; actorUserId: string }) {
  const result = await db.$transaction(async (tx) => {
    const lines = await tx.operatorEarningLine.findMany({ where: { operatorId: input.operatorId, state: 'PAYABLE', payoutId: null, messageAt: { lte: input.periodEnd } }, select: { id: true, rateEurCents: true } })
    const adjs = await tx.operatorEarningAdjustment.findMany({ where: { operatorId: input.operatorId, payoutId: null, createdAt: { lte: input.periodEnd } }, select: { id: true, amountEurCents: true } })
    if (lines.length === 0 && adjs.length === 0) throw new EarningsError('Nothing payable for this operator up to that date', 409)
    const linesTotal = lines.reduce((a, l) => a + l.rateEurCents, 0)
    const adjTotal = adjs.reduce((a, l) => a + l.amountEurCents, 0)
    const total = linesTotal + adjTotal
    if (total < 0) throw new EarningsError('Net amount is negative - settle the adjustment against future earnings instead', 409)
    const payout = await tx.operatorPayout.create({
      data: { operatorId: input.operatorId, periodEnd: input.periodEnd, lineCount: lines.length, linesEurCents: linesTotal, adjustmentsEurCents: adjTotal, totalEurCents: total, createdByUserId: input.actorUserId },
    })
    const l = await tx.operatorEarningLine.updateMany({ where: { id: { in: lines.map((x) => x.id) }, payoutId: null, state: 'PAYABLE' }, data: { payoutId: payout.id } })
    const a = await tx.operatorEarningAdjustment.updateMany({ where: { id: { in: adjs.map((x) => x.id) }, payoutId: null }, data: { payoutId: payout.id } })
    if (l.count !== lines.length || a.count !== adjs.length) throw new EarningsError('Earnings changed while creating the payout - try again', 409)
    return payout
  })
  const op = await db.operator.findUnique({ where: { id: input.operatorId }, select: { tenantId: true } })
  await writeAuditLog({
    tenantId: op?.tenantId ?? null,
    actorUserId: input.actorUserId,
    action: 'earnings.payout_created',
    resource: 'operator_payout',
    resourceId: result.id,
    metadata: { operatorId: input.operatorId, totalEurCents: result.totalEurCents, lineCount: result.lineCount },
  })
  return result
}

export async function markPayoutPaid(input: { payoutId: string; reference?: string | null; actorUserId: string }) {
  const r = await db.operatorPayout.updateMany({
    where: { id: input.payoutId, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date(), paidByUserId: input.actorUserId, reference: input.reference?.slice(0, 120) ?? null },
  })
  if (r.count === 0) throw new EarningsError('Payout not found or already paid', 409)
  await writeAuditLog({ actorUserId: input.actorUserId, action: 'earnings.payout_paid', resource: 'operator_payout', resourceId: input.payoutId })
  return db.operatorPayout.findUniqueOrThrow({ where: { id: input.payoutId } })
}
