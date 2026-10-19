import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { decideAppeal } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

const Body = z.object({ outcome: z.enum(['UPHELD', 'OVERTURNED']), note: z.string().max(2000).nullable().optional(), category: z.string().max(40).nullable().optional() }).strict()

// Appeals are reviewed by an operator or a supervisor/manager of the same client who did NOT take the original decision.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const appeal = await db.moderationAppeal.findUnique({ where: { id }, select: { tenantId: true } })
    if (!appeal) return fail('Appeal not found', 404)
    if (!can(session.role, 'MODERATION_HANDLE') && !can(session.role, 'MODERATION_MANAGE')) return fail('Forbidden', 403)
    const tenantId = resolveTenantScope(session, appeal.tenantId)
    if (tenantId !== appeal.tenantId) return fail('Appeal not found', 404)
    await decideAppeal({ tenantId, userId: session.sub, appealId: id, ...Body.parse(await req.json()) })
    return ok({ decided: true })
  } catch (err) {
    return moderationRouteError(err)
  }
}
