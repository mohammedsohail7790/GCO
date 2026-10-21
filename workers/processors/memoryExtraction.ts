import type { Job } from 'bullmq'
import { db } from '@/lib/db/client'
import { getAiProvider } from '@/lib/ai/provider'
import { AiDisabledError, isAiEnabled } from '@/lib/ai/guard'
import { buildConversationContext } from '@/lib/ai/service'
import { categorizeAiError } from '@/lib/ai/observability'
import { logger } from '@/lib/observability/logger'

export async function memoryExtractionProcessor(
  job: Job<{ conversationId: string; triggerMessageId: string }>,
) {
  const { conversationId, triggerMessageId } = job.data
  // Jobs queued before AI was switched off must not run the provider (the queue can still hold them).
  if (!isAiEnabled()) return
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
  // tenantId is derived from the trusted conversation row, never from job input.
  const tenantId = conversation.tenantId
  if ((await db.tenant.findUnique({ where: { id: tenantId }, select: { aiMode: true } }))?.aiMode === 'HUMAN_ONLY') return // human-only clients: no AI processing at all

  // The trigger message must belong to this same conversation AND tenant, or the
  // job is malformed/cross-tenant and is skipped without touching the provider.
  const trigger = await db.message.findFirst({
    where: { id: triggerMessageId, conversationId, tenantId },
    select: { id: true },
  })
  if (!trigger) {
    logger.warn({ component: 'ai', operation: 'extract', tenantId, conversationId, triggerMessageId }, 'extraction skipped: trigger message not in conversation/tenant')
    return
  }

  let provider
  try {
    provider = getAiProvider()
  } catch (err) {
    if (err instanceof AiDisabledError) return
    throw err
  }
  const context = await buildConversationContext(conversationId, tenantId)

  let facts
  try {
    facts = await provider.extractMemory(context)
  } catch (err) {
    // Memory extraction is best-effort analytics, never blocks the message pipeline.
    // The provider already logged the failure (content-free); leave an operator-
    // visible, content-free record too so outages are not silent.
    await db.systemEvent
      .create({
        data: {
          category: 'ai',
          severity: 'warning',
          message: 'AI memory extraction failed',
          metadata: { provider: provider.name, tenantId, conversationId, triggerMessageId, category: categorizeAiError(err) },
        },
      })
      .catch(() => null)
    return
  }

  if (facts.length === 0) return

  // Idempotent insert: a BullMQ retry (or a re-extraction over an overlapping
  // message window) must not duplicate facts. The advisory lock serialises
  // concurrent extractions for one conversation so check-then-insert is race-free;
  // soft-deleted facts still count, so an operator-deleted fact is not resurrected.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${conversationId}))`
    for (const fact of facts) {
      const sourceMessageId = fact.source_message_id === 'unknown' ? triggerMessageId : fact.source_message_id
      const existing = await tx.aiMemory.findFirst({
        where: { tenantId, conversationId, sourceMessageId, type: fact.type as any, value: fact.value },
        select: { id: true },
      })
      if (existing) continue
      await tx.aiMemory.create({
        data: {
          tenantId,
          conversationId,
          externalUserId: conversation.externalUserId,
          type: fact.type as any,
          value: fact.value,
          confidence: fact.confidence,
          sourceMessageId,
        },
      })
    }
  })
}
