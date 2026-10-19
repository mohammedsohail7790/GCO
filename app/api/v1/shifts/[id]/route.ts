import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { cancelShift } from '@/lib/shifts/service'
import { shiftRouteError } from '@/lib/shifts/http'

// Cancels (never deletes) a shift: the history of what was planned stays.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const { id } = await params
    const shift = await db.shift.findUnique({ where: { id }, select: { tenantId: true, operatorId: true } })
    const tenantId = resolveTenantScope(session, shift?.tenantId ?? null)
    if (!shift || shift.tenantId !== tenantId) return fail('Shift not found', 404)
    await assertOperatorInTeam(session, shift.operatorId)
    await cancelShift({ shiftId: id, tenantId, actorUserId: session.sub })
    return ok({ id, cancelled: true })
  } catch (err) {
    return shiftRouteError(err)
  }
}
