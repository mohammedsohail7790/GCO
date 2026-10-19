import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { requestAction } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

const Body = z.object({ tenantId: z.string().max(100).optional(), subjectExternalId: z.string().min(1).max(200), kind: z.enum(['WARNING', 'RESTRICTION', 'BAN']), itemId: z.string().max(100).nullable().optional(), reason: z.string().min(5).max(2000) }).strict()

// An operator (own client) or a manager/supervisor requests a warning, restriction or ban for a person on the client platform.
// It is only a REQUEST until someone else confirms it, and applying it on the platform needs that client's API (not built).
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    const body = Body.parse(await req.json())
    let tenantId: string
    if (session.role === 'OPERATOR' && can(session.role, 'MODERATION_HANDLE')) {
      const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { tenantId: true } })
      if (!op) return fail('Operator profile not found', 404)
      tenantId = op.tenantId
    } else if (can(session.role, 'MODERATION_MANAGE')) {
      tenantId = resolveTenantScope(session, body.tenantId ?? null)
    } else return fail('Forbidden', 403)
    return ok(await requestAction({ tenantId, userId: session.sub, subjectExternalId: body.subjectExternalId, kind: body.kind, itemId: body.itemId, reason: body.reason }))
  } catch (err) {
    return moderationRouteError(err)
  }
}
