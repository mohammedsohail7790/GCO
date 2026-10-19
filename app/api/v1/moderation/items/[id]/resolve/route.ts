import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { resolveEscalation } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

const Body = z.object({ verdict: z.enum(['APPROVE', 'REJECT']), category: z.string().max(40).nullable().optional(), note: z.string().max(2000).nullable().optional() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'MODERATION_MANAGE')
    const { id } = await params
    const item = await db.moderationItem.findUnique({ where: { id }, select: { tenantId: true } })
    if (!item) return fail('Escalated item not found', 404)
    const tenantId = resolveTenantScope(session, item.tenantId)
    if (tenantId !== item.tenantId) return fail('Escalated item not found', 404)
    await resolveEscalation({ userId: session.sub, tenantId, itemId: id, ...Body.parse(await req.json()) })
    return ok({ resolved: true })
  } catch (err) {
    return moderationRouteError(err)
  }
}
