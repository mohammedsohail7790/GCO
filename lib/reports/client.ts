import { db } from '@/lib/db/client'

/**
 * Client-safe reporting for one tenant over the last `days` days. Deliberately excludes anything internal:
 * no operator names, no internal notes, no QA notes/flags - only counts, timings and average scores.
 */
export async function clientReport(tenantId: string, days: number, now: Date = new Date()) {
  const since = new Date(now.getTime() - days * 86400_000)
  const [created, closed, inbound, outbound, completed, expiredAssignments, reviews, byLang, escalations] = await Promise.all([
    db.conversation.findMany({ where: { tenantId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.conversation.count({ where: { tenantId, state: 'CLOSED', closedAt: { gte: since } } }),
    db.message.count({ where: { tenantId, direction: 'INBOUND', createdAt: { gte: since } } }),
    db.message.count({ where: { tenantId, direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: since } } }),
    db.assignment.findMany({ where: { tenantId, status: 'COMPLETED', respondedAt: { not: null }, assignedAt: { gte: since } }, select: { assignedAt: true, respondedAt: true, slaSeconds: true } }),
    db.assignment.count({ where: { tenantId, status: 'EXPIRED', assignedAt: { gte: since } } }),
    db.qaReview.findMany({ where: { tenantId, createdAt: { gte: since } }, select: { accuracy: true, tone: true, resolution: true, outcome: true } }),
    db.conversation.groupBy({ by: ['language'], where: { tenantId, createdAt: { gte: since } }, _count: true }),
    db.escalation.count({ where: { tenantId, createdAt: { gte: since } } }),
  ])
  const perDay = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) perDay.set(new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10), 0)
  for (const c of created) { const k = c.createdAt.toISOString().slice(0, 10); if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1) }

  const secs = completed.map((a) => (a.respondedAt!.getTime() - a.assignedAt.getTime()) / 1000)
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  const withinSla = completed.filter((a) => (a.respondedAt!.getTime() - a.assignedAt.getTime()) / 1000 <= a.slaSeconds).length
  const answered = completed.length + expiredAssignments
  return {
    days,
    conversationsPerDay: [...perDay.entries()].map(([date, count]) => ({ date, count })),
    totals: { conversationsStarted: created.length, conversationsResolved: closed, messagesReceived: inbound, repliesSent: outbound, escalations },
    responseTime: { averageSeconds: avg(secs), samples: secs.length },
    slaCompliance: { percent: answered ? Math.round((withinSla / answered) * 1000) / 10 : null, answered },
    quality: reviews.length
      ? { reviews: reviews.length, accuracy: avg(reviews.map((r) => r.accuracy)), tone: avg(reviews.map((r) => r.tone)), resolution: avg(reviews.map((r) => r.resolution)), passRate: Math.round((reviews.filter((r) => r.outcome === 'PASS').length / reviews.length) * 1000) / 10 }
      : { reviews: 0, accuracy: null, tone: null, resolution: null, passRate: null },
    languages: byLang.map((l) => ({ language: l.language, conversations: l._count })).sort((a, b) => b.conversations - a.conversations),
  }
}
