import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'

/** Latest AI suggestion for a conversation - the "AI suggested response" panel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession(req)
    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) return fail('Conversation not found', 404)

    // Every role except CEO_ADMIN is pinned to its own tenant - this endpoint
    // returns private conversation content (the suggested reply text), so a
    // guessed/enumerated conversation id from another tenant must not leak it.
    if (session.role !== 'CEO_ADMIN' && session.tenantId !== conversation.tenantId) {
      return fail('Forbidden', 403)
    }

    const generation = await db.aiGeneration.findFirst({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
    })

    if (!generation) return ok({ generation: null })

    // Expose only safe, concise metadata - never raw provider chain-of-thought.
    return ok({
      generation: {
        id: generation.id,
        suggestedReply: generation.status === 'failed' ? null : generation.suggestedReply,
        language: generation.language,
        confidence: generation.confidence,
        reasoningSummary: generation.reasoningSummary,
        flags: generation.flags,
        requiresReview: generation.requiresReview,
        status: generation.status,
        createdAt: generation.createdAt,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
