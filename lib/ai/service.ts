import { db } from '@/lib/db/client'
import { getAiProvider } from './provider'
import type { ConversationContext } from './types'
import { flags } from '@/lib/config/flags'
import { describeAiError } from './observability'

const CONTEXT_MESSAGE_LIMIT = 20

/**
 * Builds provider context. `tenantId` must come from a trusted server-side record
 * (the message/conversation row), never from request input; every query is scoped
 * to it so a mismatched conversation can never leak another tenant's data.
 */
export async function buildConversationContext(
  conversationId: string,
  tenantId: string,
): Promise<ConversationContext> {
  const conversation = await db.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } })
  const recent = await db.message.findMany({
    where: { conversationId, tenantId },
    orderBy: { createdAt: 'desc' },
    take: CONTEXT_MESSAGE_LIMIT,
  })
  const facts = await db.aiMemory.findMany({
    where: { conversationId, tenantId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })

  return {
    conversationId,
    tenantId: conversation.tenantId,
    language: conversation.language,
    recentMessages: recent
      .reverse()
      .map((m) => ({ id: m.id, direction: m.direction, content: m.content, createdAt: m.createdAt })),
    extractedFacts: facts.map((f) => ({ type: f.type, value: f.correctedValue ?? f.value })),
  }
}

/**
 * Generates and persists an AI suggestion for the latest inbound message.
 * Never throws to the caller on AI failure - the assignment/operator flow
 * must continue even if the AI provider is down (see docs/decisions.md).
 */
export async function generateSuggestionForMessage(messageId: string) {
  const message = await db.message.findUniqueOrThrow({ where: { id: messageId } })

  if (!flags.aiSuggestions) return null

  const provider = getAiProvider()
  const context = await buildConversationContext(message.conversationId, message.tenantId)

  try {
    const result = await provider.generateReply(context)
    const generation = await db.aiGeneration.create({
      data: {
        tenantId: message.tenantId,
        conversationId: message.conversationId,
        provider: result.provider,
        model: result.model,
        suggestedReply: result.reply.suggested_reply,
        language: result.reply.language,
        confidence: result.reply.confidence,
        reasoningSummary: result.reply.reasoning_summary,
        flags: result.reply.flags,
        requiresReview: result.reply.requires_review,
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage as any,
        status: 'generated',
      },
    })
    await db.messageEvent.create({
      data: { messageId, type: 'AI_SUGGESTED', metadata: { generationId: generation.id } },
    })
    return generation
  } catch (err) {
    await db.aiGeneration.create({
      data: {
        tenantId: message.tenantId,
        conversationId: message.conversationId,
        provider: provider.name,
        model: 'unknown',
        suggestedReply: '',
        status: 'failed',
        // Category + HTTP status only: raw provider messages can echo request content.
        errorMessage: describeAiError(err),
        requiresReview: true,
      },
    })
    // Swallow - operator can still respond manually. Caller/UI shows "AI unavailable".
    return null
  }
}
