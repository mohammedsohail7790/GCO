import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { transferConversation } from '@/lib/assignment/engine'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'

const Body = z.object({ toOperatorId: z.string().min(1).max(100), reason: z.string().max(300).default('') }).strict()
const MESSAGE = { not_holder: 'This conversation is no longer assigned to you.', target_unavailable: 'That colleague is not available for this conversation (offline, or does not cover its language).', target_full: 'That colleague has no free slot right now.' } as const

// An operator hands over a conversation they hold to a colleague of the same client; a manager/supervisor can move any conversation
// of their scope (a supervisor only one held by their own team). The transfer itself lives in the assignment engine.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const body = Body.parse(await req.json())
    if (await isRateLimited(`ops-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return fail('Assignment not found', 404)
    let fromOperatorId: string | null = null
    if (session.role === 'OPERATOR' && can(session.role, 'CONVERSATION_HANDLE')) {
      const me = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true, tenantId: true } })
      if (!me || me.id !== assignment.operatorId) return fail('Assignment not found', 404)
      fromOperatorId = me.id
    } else if (can(session.role, 'CONVERSATION_REASSIGN')) {
      if (resolveTenantScope(session, assignment.tenantId) !== assignment.tenantId) return fail('Assignment not found', 404)
      await assertOperatorInTeam(session, assignment.operatorId)
    } else return fail('Forbidden', 403)
    const r = await transferConversation({ conversationId: assignment.conversationId, fromOperatorId, toOperatorId: body.toOperatorId, actorUserId: session.sub, reason: body.reason })
    return r.transferred ? ok({ transferred: true }) : fail(MESSAGE[r.reason], 409, r.reason.toUpperCase())
  } catch (err) {
    return handleRouteError(err)
  }
}
