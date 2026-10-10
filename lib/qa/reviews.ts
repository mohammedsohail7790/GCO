import type { QaOutcome } from '@prisma/client'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'

export const QA_FLAGS = ['accuracy', 'tone', 'policy', 'no_resolution', 'language'] as const
const QUEUE_DAYS = 14

/** The reviewed message must be a sent (not draft/failed) OUTBOUND reply in the reviewer's tenant. */
const REVIEWABLE = ['SENT', 'DELIVERED'] as const

/** PASS if everything is solid, FAIL if anything is poor, otherwise COACHING. Pure so it is unit-testable. */
export function deriveOutcome(accuracy: number, tone: number, resolution: number): QaOutcome {
  const min = Math.min(accuracy, tone, resolution)
  const avg = (accuracy + tone + resolution) / 3
  if (min <= 2 || avg < 3) return 'FAIL'
  if (min >= 4 && avg >= 4) return 'PASS'
  return 'COACHING'
}

export class QaError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** Sent replies from the last 14 days that nobody has reviewed yet, each with the customer message it answered. */
export async function qaQueue(tenantId: string, limit = 20) {
  const since = new Date(Date.now() - QUEUE_DAYS * 24 * 3600 * 1000)
  const sent = await db.message.findMany({
    where: { tenantId, direction: 'OUTBOUND', status: { in: [...REVIEWABLE] }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const reviewed = new Set(
    (await db.qaReview.findMany({ where: { messageId: { in: sent.map((m) => m.id) } }, select: { messageId: true } })).map((r) => r.messageId),
  )
  const pending = sent.filter((m) => !reviewed.has(m.id)).slice(0, limit)
  const operators = await db.operator.findMany({
    where: { id: { in: pending.map((m) => m.operatorId).filter((x): x is string => !!x) } },
    include: { user: { select: { displayName: true } } },
  })
  const opName = new Map(operators.map((o) => [o.id, o.user.displayName]))
  const convs = await db.conversation.findMany({ where: { id: { in: pending.map((m) => m.conversationId) } }, select: { id: true, externalUserId: true, language: true } })
  const convById = new Map(convs.map((c) => [c.id, c]))
  const items = []
  for (const m of pending) {
    const customer = await db.message.findFirst({
      where: { conversationId: m.conversationId, direction: 'INBOUND', createdAt: { lte: m.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    })
    const c = convById.get(m.conversationId)
    items.push({
      messageId: m.id,
      conversationId: m.conversationId,
      customer: c?.externalUserId ?? 'customer',
      language: c?.language ?? null,
      customerMessage: customer?.content ?? null,
      reply: m.content,
      operatorName: m.operatorId ? opName.get(m.operatorId) ?? null : null,
      sentAt: (m.sentAt ?? m.createdAt).toISOString(),
    })
  }
  return items
}

export async function submitQaReview(p: {
  tenantId: string
  reviewerUserId: string
  messageId: string
  accuracy: number
  tone: number
  resolution: number
  flags: string[]
  note?: string
}) {
  const message = await db.message.findFirst({ where: { id: p.messageId, tenantId: p.tenantId, direction: 'OUTBOUND' } })
  if (!message) throw new QaError('Message not found', 404) // also covers another tenant's message
  if (!(REVIEWABLE as readonly string[]).includes(message.status)) throw new QaError('Only sent replies can be reviewed', 409)
  const existing = await db.qaReview.findUnique({ where: { messageId_reviewerUserId: { messageId: p.messageId, reviewerUserId: p.reviewerUserId } } })
  if (existing) throw new QaError('You have already reviewed this reply', 409)
  const outcome = deriveOutcome(p.accuracy, p.tone, p.resolution)
  const review = await db.qaReview.create({
    data: {
      tenantId: p.tenantId,
      conversationId: message.conversationId,
      messageId: message.id,
      operatorId: message.operatorId,
      reviewerUserId: p.reviewerUserId,
      accuracy: p.accuracy,
      tone: p.tone,
      resolution: p.resolution,
      outcome,
      flags: p.flags,
      note: p.note?.trim() || null,
    },
  })
  // Audit entry carries ids and the outcome only - never the reply text or the note.
  await writeAuditLog({
    tenantId: p.tenantId,
    actorUserId: p.reviewerUserId,
    action: 'qa.review_submitted',
    resource: 'qa_review',
    resourceId: review.id,
    metadata: { messageId: message.id, outcome },
  })
  return review
}

/** Per-operator averages from REAL reviews only (last 30 days). */
export async function qaSummary(tenantId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const reviews = await db.qaReview.findMany({ where: { tenantId, createdAt: { gte: since } } })
  const operators = await db.operator.findMany({ where: { tenantId }, include: { user: { select: { displayName: true } } } })
  const name = new Map(operators.map((o) => [o.id, o.user.displayName]))
  const by = new Map<string, typeof reviews>()
  for (const r of reviews) by.set(r.operatorId ?? 'unknown', [...(by.get(r.operatorId ?? 'unknown') ?? []), r])
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  const rows = [...by.entries()].map(([operatorId, rs]) => ({
    operatorId,
    operatorName: name.get(operatorId) ?? 'Unknown operator',
    reviews: rs.length,
    accuracy: avg(rs.map((r) => r.accuracy)),
    tone: avg(rs.map((r) => r.tone)),
    resolution: avg(rs.map((r) => r.resolution)),
    pass: rs.filter((r) => r.outcome === 'PASS').length,
    coaching: rs.filter((r) => r.outcome === 'COACHING').length,
    fail: rs.filter((r) => r.outcome === 'FAIL').length,
  }))
  const pendingCount = (await qaQueue(tenantId, 200)).length
  return { totalReviews: reviews.length, pendingReview: pendingCount, operators: rows.sort((a, b) => b.reviews - a.reviews) }
}
