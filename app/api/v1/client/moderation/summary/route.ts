import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { moderationRouteError } from '@/lib/moderation/http'

// Counts only - the client sees volumes and outcomes of its own moderation, never operator names or other clients.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'MODERATION_VIEW_CLIENT')
    const tenantId = resolveTenantScope(session, null)
    const since = new Date(Date.now() - 30 * 86_400_000)
    const [status, verdicts, appeals] = await Promise.all([
      db.moderationItem.groupBy({ by: ['status'], where: { tenantId, createdAt: { gte: since } }, _count: { _all: true } }),
      db.moderationDecision.groupBy({ by: ['verdict', 'category'], where: { tenantId, createdAt: { gte: since } }, _count: { _all: true } }),
      db.moderationAppeal.groupBy({ by: ['status'], where: { tenantId, createdAt: { gte: since } }, _count: { _all: true } }),
    ])
    return ok({ days: 30, items: Object.fromEntries(status.map((s) => [s.status, s._count._all])), decisions: verdicts.map((v) => ({ verdict: v.verdict, category: v.category, count: v._count._all })), appeals: Object.fromEntries(appeals.map((a) => [a.status, a._count._all])) })
  } catch (err) {
    return moderationRouteError(err)
  }
}
