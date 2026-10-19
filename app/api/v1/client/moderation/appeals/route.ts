import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { ok } from '@/lib/api/response'
import { createAppeal } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

const Body = z.object({ kind: z.enum(['MESSAGE', 'IMAGE', 'PROFILE', 'POST', 'COMMENT', 'REPORT']), externalItemId: z.string().min(1).max(200), reason: z.string().min(5).max(2000) }).strict()

// The client forwards an appeal from one of its users for a decided item of its own.
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'MODERATION_VIEW_CLIENT')
    const a = await createAppeal({ tenantId: resolveTenantScope(session, null), ...Body.parse(await req.json()) })
    return ok({ id: a.id, status: a.status })
  } catch (err) {
    return moderationRouteError(err)
  }
}
