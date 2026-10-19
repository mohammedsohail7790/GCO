import { db } from '@/lib/db/client'
import { syncEarnings } from '@/lib/earnings/ledger'

const DAY = 86_400_000

/** Monday 00:00 UTC of the week containing d. */
export function weekStartOf(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY)
}
/** Parses YYYY-MM-DD to the Monday of that week; null if invalid. */
export function parseWeek(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : weekStartOf(d)
}
export const lastCompletedWeek = (now = new Date()) => new Date(weekStartOf(now).getTime() - 7 * DAY)

export interface WeeklyMetrics {
  messages: { written: number; delivered: number; failed: number; approved: number; rejected: number; unreviewed: number }
  quality: { reviews: number; avgAccuracy: number | null; avgTone: number | null; avgResolution: number | null; passRate: number | null }
  response: { conversationsHandled: number; slaMissed: number; avgResponseSeconds: number | null; slaMetPct: number | null }
  /** Working hours and attendance come from scheduled shifts; null until the operator has shifts in that week. */
  attendance: { scheduledHours: number; absences: number } | null
  /** Euro cents: payable messages in the week plus adjustments dated in the week. Shown only to authorized viewers. */
  earningsEurCents: number
}

const avg = (xs: number[], digits = 1) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10 ** digits) / 10 ** digits : null)

/** Pure comparison against the previous week: numeric deltas (null where either side is unknown). */
export function compareMetrics(cur: WeeklyMetrics, prev: WeeklyMetrics | null) {
  const d = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a - b) * 100) / 100)
  if (!prev) return null
  return {
    written: d(cur.messages.written, prev.messages.written),
    delivered: d(cur.messages.delivered, prev.messages.delivered),
    rejected: d(cur.messages.rejected, prev.messages.rejected),
    avgResponseSeconds: d(cur.response.avgResponseSeconds, prev.response.avgResponseSeconds),
    slaMetPct: d(cur.response.slaMetPct, prev.response.slaMetPct),
    avgAccuracy: d(cur.quality.avgAccuracy, prev.quality.avgAccuracy),
    earningsEurCents: d(cur.earningsEurCents, prev.earningsEurCents),
  }
}

export async function computeWeeklyMetrics(operatorId: string, weekStart: Date): Promise<WeeklyMetrics> {
  const from = weekStart
  const to = new Date(weekStart.getTime() + 7 * DAY)
  const inWeek = { gte: from, lt: to }
  const [msgs, reviews, assignments, lines, adjustments] = await Promise.all([
    db.message.findMany({ where: { operatorId, direction: 'OUTBOUND', createdAt: inWeek }, select: { id: true, status: true } }),
    db.qaReview.findMany({ where: { operatorId, createdAt: inWeek }, select: { messageId: true, outcome: true, accuracy: true, tone: true, resolution: true } }),
    db.assignment.findMany({ where: { operatorId, assignedAt: inWeek }, select: { status: true, assignedAt: true, respondedAt: true, respondsBy: true } }),
    db.operatorEarningLine.findMany({ where: { operatorId, state: 'PAYABLE', messageAt: inWeek }, select: { rateEurCents: true } }),
    db.operatorEarningAdjustment.findMany({ where: { operatorId, createdAt: inWeek }, select: { amountEurCents: true } }),
  ])
  const rejectedIds = new Set(reviews.filter((r) => r.outcome === 'FAIL').map((r) => r.messageId))
  const approvedIds = new Set(reviews.filter((r) => r.outcome !== 'FAIL' && !rejectedIds.has(r.messageId)).map((r) => r.messageId))
  const handled = assignments.filter((a) => a.respondedAt)
  const times = handled.map((a) => (a.respondedAt!.getTime() - a.assignedAt.getTime()) / 1000)
  const missed = assignments.filter((a) => a.status === 'EXPIRED' || (a.respondedAt && a.respondedAt > a.respondsBy)).length
  const answered = handled.length + assignments.filter((a) => a.status === 'EXPIRED' && !a.respondedAt).length
  return {
    messages: {
      written: msgs.length,
      delivered: msgs.filter((m) => m.status === 'DELIVERED').length,
      failed: msgs.filter((m) => m.status === 'FAILED').length,
      approved: approvedIds.size,
      rejected: rejectedIds.size,
      unreviewed: msgs.filter((m) => (m.status === 'DELIVERED' || m.status === 'SENT') && !approvedIds.has(m.id) && !rejectedIds.has(m.id)).length,
    },
    quality: {
      reviews: reviews.length,
      avgAccuracy: avg(reviews.map((r) => r.accuracy)),
      avgTone: avg(reviews.map((r) => r.tone)),
      avgResolution: avg(reviews.map((r) => r.resolution)),
      passRate: reviews.length ? Math.round((reviews.filter((r) => r.outcome === 'PASS').length / reviews.length) * 100) : null,
    },
    response: {
      conversationsHandled: handled.length,
      slaMissed: missed,
      avgResponseSeconds: avg(times, 0),
      slaMetPct: answered ? Math.round(((answered - missed) / answered) * 100) : null,
    },
    attendance: await attendanceFor(operatorId, from, to),
    earningsEurCents: lines.reduce((a, l) => a + l.rateEurCents, 0) + adjustments.reduce((a, x) => a + x.amountEurCents, 0),
  }
}

/** Filled in by the shift module (lib/shifts); null while the operator has no shifts that week. */
async function attendanceFor(operatorId: string, from: Date, to: Date): Promise<WeeklyMetrics['attendance']> {
  const { weeklyAttendance } = await import('@/lib/shifts/service')
  return weeklyAttendance(operatorId, from, to)
}

/**
 * Idempotent: creates or refreshes the DRAFT report for an operator-week. A REVIEWED report is frozen and returned as is.
 */
export async function ensureWeeklyReport(operatorId: string, weekStart: Date) {
  const existing = await db.operatorWeeklyReport.findUnique({ where: { operatorId_weekStart: { operatorId, weekStart } } })
  if (existing?.status === 'REVIEWED') return existing
  const operator = await db.operator.findUniqueOrThrow({ where: { id: operatorId }, select: { tenantId: true } })
  await syncEarnings(operatorId)
  const metrics = await computeWeeklyMetrics(operatorId, weekStart)
  return db.operatorWeeklyReport.upsert({
    where: { operatorId_weekStart: { operatorId, weekStart } },
    create: { operatorId, tenantId: operator.tenantId, weekStart, metrics: metrics as never },
    update: { metrics: metrics as never },
  })
}

export async function previousMetrics(operatorId: string, weekStart: Date): Promise<WeeklyMetrics | null> {
  const prevStart = new Date(weekStart.getTime() - 7 * DAY)
  const row = await db.operatorWeeklyReport.findUnique({ where: { operatorId_weekStart: { operatorId, weekStart: prevStart } } })
  return row ? (row.metrics as unknown as WeeklyMetrics) : computeWeeklyMetrics(operatorId, prevStart)
}

/** Report as shown to a viewer: earnings only when authorized; comparison with the week before. */
export async function presentReport(report: Awaited<ReturnType<typeof ensureWeeklyReport>>, opts: { showEarnings: boolean; feedbackVisible: boolean }) {
  const metrics = report.metrics as unknown as WeeklyMetrics
  const prev = await previousMetrics(report.operatorId, report.weekStart)
  const comparison = compareMetrics(metrics, prev)
  const strip = <T extends { earningsEurCents?: unknown }>(m: T) => { if (opts.showEarnings) return m; const { earningsEurCents: _e, ...rest } = m; return rest }
  return {
    id: report.id,
    operatorId: report.operatorId,
    weekStart: report.weekStart,
    status: report.status,
    metrics: strip(metrics),
    comparison: comparison ? strip(comparison as { earningsEurCents?: unknown }) : null,
    managerFeedback: opts.feedbackVisible ? report.managerFeedback : null,
    reviewedAt: report.reviewedAt,
  }
}
