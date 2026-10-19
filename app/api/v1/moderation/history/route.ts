import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { subjectHistory } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

// Everything moderation knows about one person on the client's platform (operators: their own client; managers: scoped).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const subject = url.searchParams.get('subject')?.trim()
    if (!subject) return fail('subject is required', 400)
    let tenantId: string
    if (session.role === 'OPERATOR' && can(session.role, 'MODERATION_HANDLE')) {
      const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { tenantId: true } })
      if (!op) return fail('Operator profile not found', 404)
      tenantId = op.tenantId
    } else if (can(session.role, 'MODERATION_MANAGE')) tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    else return fail('Forbidden', 403)
    return ok(await subjectHistory(tenantId, subject))
  } catch (err) {
    return moderationRouteError(err)
  }
}
