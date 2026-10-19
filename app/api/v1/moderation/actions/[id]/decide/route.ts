import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { decideAction } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

const Body = z.object({ applied: z.boolean() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'MODERATION_MANAGE')
    const { id } = await params
    const a = await db.moderationAction.findUnique({ where: { id }, select: { tenantId: true } })
    if (!a) return fail('Request not found', 404)
    const tenantId = resolveTenantScope(session, a.tenantId)
    if (tenantId !== a.tenantId) return fail('Request not found', 404)
    await decideAction({ tenantId, userId: session.sub, actionId: id, applied: Body.parse(await req.json()).applied })
    return ok({ decided: true })
  } catch (err) {
    return moderationRouteError(err)
  }
}
