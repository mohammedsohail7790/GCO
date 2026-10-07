import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { manualReassign } from '@/lib/assignment/engine'

const Schema = z.object({ reason: z.string().max(500).optional() })

/** Explicit manager action: resume an SLA-capped conversation (resets its expiry counter and assigns it again). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'CONVERSATION_REASSIGN')
    const { id } = await params
    const { reason } = Schema.parse(await req.json().catch(() => ({})))
    if (await isRateLimited(`ops-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)

    const conversation = await db.conversation.findUnique({ where: { id }, select: { id: true, tenantId: true, state: true } })
    if (!conversation) return fail('Conversation not found', 404)
    // CEO_ADMIN/ASSISTANT are global; MANAGER only within their own tenant.
    const isGlobal = session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT'
    if (!isGlobal && session.tenantId !== conversation.tenantId) return fail('Forbidden', 403)
    if (conversation.state !== 'EXPIRED') return fail('This conversation is not waiting for manager attention', 409, 'NOT_ESCALATED')

    const assigned = await manualReassign(id, session.sub, reason?.trim() || 'sla_cap_resumed')
    return ok({ resumed: true, assigned })
  } catch (err) {
    return handleRouteError(err)
  }
}
