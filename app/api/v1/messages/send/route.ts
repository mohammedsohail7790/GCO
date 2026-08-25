import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { operatorSendMessage } from '@/lib/messages/send'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'

const BodySchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1).max(4000),
  aiGenerationId: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (session.role !== 'OPERATOR') return fail('Only operators can send messages', 403)

    if (
      await isRateLimited(`write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    const body = BodySchema.parse(await req.json())
    const operator = await db.operator.findUniqueOrThrow({ where: { userId: session.sub } })

    const conversation = await db.conversation.findUnique({ where: { id: body.conversationId } })
    if (!conversation) return fail('Conversation not found', 404)
    if (conversation.tenantId !== operator.tenantId) return fail('Forbidden', 403)

    // Require an active assignment held by THIS operator - no exceptions. A
    // missing currentAssignmentId (already completed/expired/reassigned) must
    // reject, not silently pass through - otherwise any operator could send
    // into any conversation with no current claim on it once its assignment
    // clears.
    if (!conversation.currentAssignmentId) {
      return fail('This conversation is not currently assigned to you', 403)
    }
    const assignment = await db.assignment.findUnique({ where: { id: conversation.currentAssignmentId } })
    if (!assignment || assignment.operatorId !== operator.id || assignment.status !== 'ACTIVE') {
      return fail('This conversation is not currently assigned to you', 403)
    }

    const message = await operatorSendMessage({
      conversationId: body.conversationId,
      operatorUserId: session.sub,
      operatorId: operator.id,
      content: body.content,
      aiGenerationId: body.aiGenerationId,
    })

    return ok({ message })
  } catch (err) {
    return handleRouteError(err)
  }
}
