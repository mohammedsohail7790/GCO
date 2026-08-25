import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { paginated, handleRouteError } from '@/lib/api/response'
import type { ConversationState } from '@prisma/client'

const VALID_STATES = [
  'QUEUED', 'ASSIGNED', 'ACTIVE', 'WAITING_FOR_OPERATOR', 'WAITING_FOR_CLIENT',
  'EXPIRED', 'REASSIGNING', 'CLOSED', 'FAILED',
]

/** Manager/CEO_ADMIN/CLIENT conversation list - tenant isolation enforced server-side. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const requestedTenantId = url.searchParams.get('tenantId')
    const tenantId = resolveTenantScope(session, requestedTenantId)

    const state = url.searchParams.get('state')
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '25', 10), 100)

    const where = {
      tenantId,
      ...(state && VALID_STATES.includes(state) ? { state: state as ConversationState } : {}),
    }

    // CLIENT must never see operator identity/internal fields (spec: "Client
    // must never access internal operator information outside their permitted
    // scope") - only MANAGER/CEO_ADMIN get the operator relation expanded.
    const includeOperatorDetail = can(session.role, 'VIEW_OPERATOR_DETAIL')

    const [total, conversations] = await Promise.all([
      db.conversation.count({ where }),
      db.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          currentAssignment: includeOperatorDetail ? { include: { operator: true } } : true,
          _count: { select: { messages: true } },
        },
      }),
    ])

    return paginated(conversations, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}
