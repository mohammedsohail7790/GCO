import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { isAiEnabled } from '@/lib/ai/guard'
import { ok, fail, handleRouteError } from '@/lib/api/response'

/** Latest AI suggestion for a conversation - the "AI suggested response" panel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // This endpoint returns private conversation content (the suggested reply
    // text), gated to the VIEW_CONVERSATION_CONTENT permission (CEO_ADMIN,
    // MANAGER, OPERATOR). CLIENT has no such permission and so cannot read the
    // private suggestions of any conversation, including within its own tenant.
    const session = await requirePermission(req, 'VIEW_CONVERSATION_CONTENT')
    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) return fail('Conversation not found', 404)

    // Tenant scoping: every role except CEO_ADMIN is pinned to its own tenant,
    // so a guessed/enumerated conversation id from another tenant must not leak.
    if (session.role !== 'CEO_ADMIN' && session.tenantId !== conversation.tenantId) {
      return fail('Forbidden', 403)
    }

    // AI master switch off: never serve a suggestion, including rows stored while AI was previously enabled.
    if (!isAiEnabled()) return ok({ generation: null, aiMode: 'DISABLED' })

    // Human-only clients never see AI suggestions (the operator works without them).
    const tenant = await db.tenant.findUnique({ where: { id: conversation.tenantId }, select: { aiMode: true } })
    if (tenant?.aiMode === 'HUMAN_ONLY') return ok({ generation: null, aiMode: 'HUMAN_ONLY' })

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
