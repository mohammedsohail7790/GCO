import { db } from '@/lib/db/client'
import { getAiProvider } from './provider'
import { AiDisabledError } from './guard'
import type { ConversationContext } from './types'
import { flags } from '@/lib/config/flags'
import { describeAiError } from './observability'
import { maskPersonalData } from './redact'
import { takeAiCall } from './budget'

const CONTEXT_MESSAGE_LIMIT = 20
/** Ceiling on the client's standing instructions sent with each call (characters), so knowledge cannot crowd out the conversation. */
export const INSTRUCTIONS_MAX_CHARS = 3000

/**
 * Builds provider context. `tenantId` must come from a trusted server-side record
 * (the message/conversation row), never from request input; every query is scoped
 * to it so a mismatched conversation can never leak another tenant's data.
 * Adds the client's standing instructions (knowledge entries of kind INSTRUCTION, any language or the conversation's), and
 * masks personal data in everything that is sent when the client has masking on (Tenant.aiMaskPersonalData, default on).
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
  const [tenant, instructions] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { aiMaskPersonalData: true } }),
    db.knowledgeEntry.findMany({
      where: { tenantId, kind: 'INSTRUCTION', archivedAt: null, OR: [{ language: null }, ...(conversation.language ? [{ language: conversation.language }] : [])] },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { title: true, body: true },
    }),
  ])
  const mask = tenant.aiMaskPersonalData ? maskPersonalData : (t: string) => t
  const clientInstructions = instructions.map((i) => `${i.title}: ${i.body}`).join('\n').slice(0, INSTRUCTIONS_MAX_CHARS)

  return {
    conversationId,
    tenantId: conversation.tenantId,
    language: conversation.language,
    recentMessages: recent
      .reverse()
      .map((m) => ({ id: m.id, direction: m.direction, content: mask(m.content), createdAt: m.createdAt })),
    extractedFacts: facts.map((f) => ({ type: f.type, value: mask(f.correctedValue ?? f.value) })),
    clientInstructions: clientInstructions ? mask(clientInstructions) : null,
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
  // A client set to HUMAN_ONLY never gets AI output generated (not merely hidden): no provider call, no stored suggestion.
  const tenantMode = await db.tenant.findUnique({ where: { id: message.tenantId }, select: { aiMode: true, aiDailyCallLimit: true } })
  if (!tenantMode || tenantMode.aiMode === 'HUMAN_ONLY') return null

  let provider
  try {
    provider = getAiProvider()
  } catch (err) {
    if (err instanceof AiDisabledError) return null // AI switched off (or external provider not approved): no generation, no row, no call
    throw err
  }
  // Daily cap per client: over it (or with the counter unavailable) the operator simply gets no draft.
  if (!(await takeAiCall(message.tenantId, tenantMode.aiDailyCallLimit))) return null
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
