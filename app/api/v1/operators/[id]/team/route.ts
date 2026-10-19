import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { ok, fail, handleRouteError } from '@/lib/api/response'

const Body = z.object({ supervisorUserId: z.string().max(100).nullable() }).strict()

// Puts an operator in a supervisor's team (or removes them). The supervisor must be an active SUPERVISOR of the SAME client.
// CEO/assistant-level and manager callers only (OPERATOR_MANAGE); a manager is pinned to their own client.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'OPERATOR_MANAGE')
    const { id } = await params
    const body = Body.parse(await req.json())
    const operator = await db.operator.findUnique({ where: { id }, select: { id: true, tenantId: true, supervisorUserId: true } })
    const scope = resolveTenantScope(session, operator?.tenantId ?? null)
    if (!operator || operator.tenantId !== scope) return fail('Operator not found', 404)
    if (body.supervisorUserId) {
      const sup = await db.user.findUnique({ where: { id: body.supervisorUserId }, select: { role: true, tenantId: true, isActive: true } })
      if (!sup || sup.role !== 'SUPERVISOR' || sup.tenantId !== operator.tenantId || !sup.isActive) return fail('Supervisor must be an active SUPERVISOR of the same client', 400)
    }
    await db.operator.update({ where: { id }, data: { supervisorUserId: body.supervisorUserId } })
    await writeAuditLog({ tenantId: operator.tenantId, actorUserId: session.sub, action: 'operator.team_set', resource: 'operator', resourceId: id, metadata: { before: operator.supervisorUserId, after: body.supervisorUserId } })
    return ok({ id, supervisorUserId: body.supervisorUserId })
  } catch (err) {
    return handleRouteError(err)
  }
}
