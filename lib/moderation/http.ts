import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { fail, handleRouteError } from '@/lib/api/response'
import { db } from '@/lib/db/client'
import { ModerationError } from './service'

export function moderationRouteError(err: unknown) {
  if (err instanceof ModerationError) return fail(err.message, err.status, err.code)
  return handleRouteError(err)
}

/** The signed-in operator and their client; tenant always comes from the operator profile. */
export async function requireModerationOperator(req: NextRequest) {
  const session = await requirePermission(req, 'MODERATION_HANDLE')
  const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true, tenantId: true } })
  if (!op) throw new ModerationError('Operator profile not found', 404)
  return { session, operatorId: op.id, tenantId: op.tenantId }
}
