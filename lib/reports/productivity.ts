import { db } from '@/lib/db/client'
import { weeklyAttendance } from '@/lib/shifts/service'
import { completedTickets } from '@/lib/billing/service'

// Operator productivity and AI-draft effect for one client and period, computed from rows the platform already records:
// reply time = an operator reply's time minus the latest customer message before it in the same conversation; "with draft" = the
// reply was sent from an AI suggestion (accepted unchanged or edited). Counts and times are measured; the AI cost line is an ESTIMATE
// from the token counts the provider returned (see estimateAiCostUsd).

/** Below this many replies in either group the time-saved comparison is not shown (too few to mean anything). */
export const MIN_SAMPLE = 20

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Seconds saved per reply (median without a draft minus median with one), or null when either group is below MIN_SAMPLE. */
export function timeSavedPerReply(withDraft: number[], withoutDraft: number[]): number | null {
  if (withDraft.length < MIN_SAMPLE || withoutDraft.length < MIN_SAMPLE) return null
  return Math.round(median(withoutDraft)! - median(withDraft)!)
}

/** Estimated provider cost in US dollars of the drafts' token use. Prices are per million tokens (defaults: gpt-4o-mini list prices, OpenAI price page, 8 Nov 2026;
 *  override with AI_PRICE_INPUT_USD_PER_M / AI_PRICE_OUTPUT_USD_PER_M when another model is used). For budget tracking, not an invoice: the provider's bill decides.
 *  Memory-extraction calls are not recorded per call, so they are not included. */
export function estimateAiCostUsd(promptTokens: number, completionTokens: number, inPerM = Number(process.env.AI_PRICE_INPUT_USD_PER_M ?? 0.15), outPerM = Number(process.env.AI_PRICE_OUTPUT_USD_PER_M ?? 0.6)): number {
  return (promptTokens * inPerM + completionTokens * outPerM) / 1_000_000
}

interface ReplyRow { operatorId: string; withDraft: boolean; secs: number }

export async function productivityReport(tenantId: string, from: Date, to: Date, operatorIds?: string[]) {
  const replies = await db.$queryRaw<ReplyRow[]>`
    SELECT m."operatorId" AS "operatorId", (m."aiGenerationId" IS NOT NULL) AS "withDraft",
           EXTRACT(EPOCH FROM (m."createdAt" - prev."createdAt"))::float8 AS "secs"
    FROM "Message" m
    JOIN LATERAL (
      SELECT i."createdAt" FROM "Message" i
      WHERE i."conversationId" = m."conversationId" AND i."direction" = 'INBOUND' AND i."createdAt" <= m."createdAt"
      ORDER BY i."createdAt" DESC LIMIT 1
    ) prev ON true
    WHERE m."tenantId" = ${tenantId} AND m."direction" = 'OUTBOUND' AND m."operatorId" IS NOT NULL
      AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
    LIMIT 50000`
  const operators = await db.operator.findMany({
    where: { tenantId, ...(operatorIds ? { id: { in: operatorIds } } : {}) },
    select: { id: true, operatorNumber: true, user: { select: { displayName: true } } },
    orderBy: { operatorNumber: 'asc' },
  })
  const inPeriod = { gte: from, lt: to }
  const [moderated, generations, tickets, usage] = await Promise.all([
    db.moderationItem.groupBy({ by: ['assignedOperatorId'], where: { tenantId, status: 'DECIDED', decidedAt: inPeriod }, _count: { _all: true } }),
    db.aiGeneration.groupBy({ by: ['status'], where: { tenantId, createdAt: inPeriod }, _count: { _all: true } }),
    completedTickets(tenantId, from, to),
    db.$queryRaw<{ prompt: number; completion: number; counted: number }[]>`
      SELECT COALESCE(SUM(("tokenUsage"->>'promptTokens')::int), 0)::int AS "prompt", COALESCE(SUM(("tokenUsage"->>'completionTokens')::int), 0)::int AS "completion", COUNT(*)::int AS "counted"
      FROM "AiGeneration" WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from} AND "createdAt" < ${to} AND "tokenUsage" IS NOT NULL`,
  ])

  const rows = await Promise.all(
    operators.map(async (o) => {
      const mine = replies.filter((r) => r.operatorId === o.id)
      const withD = mine.filter((r) => r.withDraft).map((r) => r.secs)
      const without = mine.filter((r) => !r.withDraft).map((r) => r.secs)
      const hours = (await weeklyAttendance(o.id, from, to))?.scheduledHours ?? 0
      return {
        operatorId: o.id,
        operatorNumber: o.operatorNumber,
        name: o.user.displayName,
        replies: mine.length,
        repliesWithDraft: withD.length,
        medianReplySeconds: median(mine.map((r) => r.secs)),
        medianReplySecondsWithDraft: median(withD),
        medianReplySecondsWithoutDraft: median(without),
        moderatedItems: moderated.find((m) => m.assignedOperatorId === o.id)?._count._all ?? 0,
        scheduledHours: Math.round(hours * 100) / 100,
        repliesPerScheduledHour: hours > 0 ? Math.round((mine.length / hours) * 10) / 10 : null,
      }
    }),
  )

  const scoped = new Set(operators.map((o) => o.id))
  const all = replies.filter((r) => scoped.has(r.operatorId))
  const withD = all.filter((r) => r.withDraft).map((r) => r.secs)
  const without = all.filter((r) => !r.withDraft).map((r) => r.secs)
  const gen = (s: string) => generations.find((g) => g.status === s)?._count._all ?? 0
  return {
    period: { from, to },
    operators: rows,
    totals: {
      replies: all.length,
      completedTickets: tickets.total,
      moderatedItems: rows.reduce((a, r) => a + r.moderatedItems, 0),
      medianReplySecondsWithDraft: median(withD),
      medianReplySecondsWithoutDraft: median(without),
      // Null until both groups have MIN_SAMPLE replies - an early number would mislead.
      secondsSavedPerReply: timeSavedPerReply(withD, without),
    },
    aiDrafts: { generated: gen('generated') + gen('accepted') + gen('edited') + gen('rejected'), usedUnchanged: gen('accepted'), edited: gen('edited'), notUsed: gen('generated') + gen('rejected'), failed: gen('failed'),
      // Token use as returned by the provider, and the estimated cost (see estimateAiCostUsd); null cost when no draft recorded token use (mock provider, AI off).
      tokens: { prompt: usage[0]?.prompt ?? 0, completion: usage[0]?.completion ?? 0, draftsWithUsage: usage[0]?.counted ?? 0 },
      estimatedCostUsd: (usage[0]?.counted ?? 0) > 0 ? Math.round(estimateAiCostUsd(usage[0]!.prompt, usage[0]!.completion) * 1e6) / 1e6 : null,
      estimatedCostPerDraftUsd: (usage[0]?.counted ?? 0) > 0 ? Math.round((estimateAiCostUsd(usage[0]!.prompt, usage[0]!.completion) / usage[0]!.counted) * 1e6) / 1e6 : null },
  }
}
