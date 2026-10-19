import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { operatorTeamFilter } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { overview } from '@/lib/training/service'
import { trainingRouteError } from '@/lib/training/http'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TRAINING_MANAGE')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    const ops = await db.operator.findMany({ where: { tenantId, ...operatorTeamFilter(session) }, select: { id: true } })
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { requireOperatorApproval: true } })
    return ok({ requireOperatorApproval: t?.requireOperatorApproval ?? false, operators: await overview(ops.map((o) => o.id)) })
  } catch (err) {
    return trainingRouteError(err)
  }
}
