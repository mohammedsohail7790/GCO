import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { createHandover } from '@/lib/shifts/service'
import { shiftRouteError } from '@/lib/shifts/http'

// Operators see handovers addressed to them or to the whole team plus the ones they wrote; management sees the client's.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (session.role === 'OPERATOR') {
      const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true, tenantId: true } })
      if (!op) return fail('Operator profile not found', 404)
      return ok(await db.shiftHandover.findMany({ where: { tenantId: op.tenantId, OR: [{ toOperatorId: op.id }, { toOperatorId: null }, { fromOperatorId: op.id }] }, orderBy: { createdAt: 'desc' }, take: 50 }))
    }
    assertCan(session.role, 'SHIFT_MANAGE')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    return ok(await db.shiftHandover.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }))
  } catch (err) {
    return shiftRouteError(err)
  }
}

const Body = z.object({ toOperatorId: z.string().max(100).nullable().optional(), body: z.string().min(3).max(2000), conversationIds: z.array(z.string().max(100)).max(20).default([]) }).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'SHIFT_VIEW_OWN')
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!op) return fail('Operator profile not found', 404)
    const body = Body.parse(await req.json())
    return ok(await createHandover({ operatorId: op.id, toOperatorId: body.toOperatorId, body: body.body, conversationIds: body.conversationIds, actorUserId: session.sub }))
  } catch (err) {
    return shiftRouteError(err)
  }
}
