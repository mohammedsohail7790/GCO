import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { isSupervisor, supervisorTeam } from '@/lib/auth/teamScope'
import { ok } from '@/lib/api/response'
import { overview } from '@/lib/moderation/service'
import { moderationRouteError } from '@/lib/moderation/http'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'MODERATION_MANAGE')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    return ok(await overview(tenantId, isSupervisor(session) ? (await supervisorTeam(session.sub, tenantId)).operatorIds : undefined))
  } catch (err) {
    return moderationRouteError(err)
  }
}
