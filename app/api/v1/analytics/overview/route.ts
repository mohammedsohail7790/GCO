import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'

/** Manager operational dashboard summary - live counts, computed on read (V1; move to
 *  async materialized aggregates once volume requires it, see docs/decisions.md). */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))

    const [operators, queueSize, activeConversations, expiredToday, avgAssignments] = await Promise.all([
      db.operator.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      db.conversation.count({ where: { tenantId, state: { in: ['QUEUED', 'REASSIGNING'] } } }),
      db.conversation.count({ where: { tenantId, state: 'ACTIVE' } }),
      db.assignment.count({
        where: { tenantId, status: 'EXPIRED', expiredAt: { gte: new Date(Date.now() - 86400_000) } },
      }),
      db.assignment.findMany({
        where: { tenantId, status: 'COMPLETED', respondedAt: { not: null }, assignedAt: { gte: new Date(Date.now() - 86400_000) } },
        select: { assignedAt: true, respondedAt: true },
      }),
    ])

    const responseTimesSec = avgAssignments
      .filter((a) => a.respondedAt)
      .map((a) => (a.respondedAt!.getTime() - a.assignedAt.getTime()) / 1000)
    const avgResponseSeconds = responseTimesSec.length
      ? responseTimesSec.reduce((a, b) => a + b, 0) / responseTimesSec.length
      : null

    const operatorStatusCounts = Object.fromEntries(operators.map((o) => [o.status, o._count]))

    return ok({
      tenantId,
      operators: {
        available: operatorStatusCounts.AVAILABLE ?? 0,
        busy: operatorStatusCounts.BUSY ?? 0,
        offline: operatorStatusCounts.OFFLINE ?? 0,
        paused: operatorStatusCounts.PAUSED ?? 0,
      },
      queueSize,
      activeConversations,
      slaBreachesLast24h: expiredToday,
      avgResponseSecondsLast24h: avgResponseSeconds,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
