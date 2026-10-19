import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { acknowledgeHandover } from '@/lib/shifts/service'
import { shiftRouteError } from '@/lib/shifts/http'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const h = await db.shiftHandover.findUnique({ where: { id }, select: { tenantId: true } })
    if (!h) return fail('Handover not found', 404)
    if (session.role === 'OPERATOR') {
      const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true, tenantId: true } })
      if (!op || op.tenantId !== h.tenantId) return fail('Handover not found', 404)
      return ok(await acknowledgeHandover({ handoverId: id, tenantId: h.tenantId, operatorId: op.id, actorUserId: session.sub }))
    }
    if (!can(session.role, 'SHIFT_MANAGE') || (session.role !== 'CEO_ADMIN' && session.role !== 'ASSISTANT' && session.tenantId !== h.tenantId)) return fail('Handover not found', 404)
    return ok(await acknowledgeHandover({ handoverId: id, tenantId: h.tenantId, operatorId: null, actorUserId: session.sub }))
  } catch (err) {
    return shiftRouteError(err)
  }
}
