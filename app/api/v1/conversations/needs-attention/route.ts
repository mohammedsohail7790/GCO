import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { consecutiveSlaExpiries, getSlaCap } from '@/lib/assignment/slaCap'

/**
 * Conversations whose automatic SLA reassignment was capped (state EXPIRED) and now need a manager. Operational
 * metadata only - never message content. MANAGER is scoped to their own tenant; CEO_ADMIN/ASSISTANT may pass
 * ?tenantId= or omit it for every tenant. CLIENT/OPERATOR/HUNTER are refused by the permission check.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'QUEUE_INSPECT')
    const requested = new URL(req.url).searchParams.get('tenantId')
    const isGlobal = session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT'
    const tenantId = isGlobal && !requested ? null : resolveTenantScope(session, requested)

    const conversations = await db.conversation.findMany({
      where: { state: 'EXPIRED', ...(tenantId ? { tenantId } : {}) },
      orderBy: { updatedAt: 'asc' },
      take: 50,
      select: { id: true, tenantId: true, externalUserId: true, updatedAt: true, tenant: { select: { name: true, slug: true } } },
    })
    const cap = getSlaCap()
    const rows = await Promise.all(
      conversations.map(async (c) => {
        const { count, lastCustomerMessageAt } = await consecutiveSlaExpiries(db, c.id)
        const last = await db.assignment.findFirst({
          where: { conversationId: c.id },
          orderBy: { assignedAt: 'desc' },
          select: { expiredAt: true, slaSeconds: true, operator: { select: { user: { select: { displayName: true } } } } },
        })
        return {
          conversationId: c.id,
          tenant: { id: c.tenantId, name: c.tenant.name, slug: c.tenant.slug },
          customerRef: c.externalUserId,
          status: 'SLA_CAPPED',
          reason: 'Automatic reassignment stopped after repeated unanswered SLA expiries',
          consecutiveExpiries: count,
          cap,
          lastCustomerMessageAt,
          lastAssignedTo: last?.operator.user.displayName ?? null,
          lastExpiredAt: last?.expiredAt ?? null,
          slaSeconds: last?.slaSeconds ?? null,
          escalatedSince: c.updatedAt,
        }
      }),
    )
    return ok(rows)
  } catch (err) {
    return handleRouteError(err)
  }
}
