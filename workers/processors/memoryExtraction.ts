import type { Job } from 'bullmq'
import { db } from '@/lib/db/client'
import { getAiProvider } from '@/lib/ai/provider'
import { buildConversationContext } from '@/lib/ai/service'

export async function memoryExtractionProcessor(
  job: Job<{ conversationId: string; triggerMessageId: string }>,
) {
  const { conversationId, triggerMessageId } = job.data
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
  const provider = getAiProvider()
  const context = await buildConversationContext(conversationId)

  let facts
  try {
    facts = await provider.extractMemory(context)
  } catch {
    // Memory extraction is best-effort analytics, never blocks the message pipeline.
    return
  }

  for (const fact of facts) {
    await db.aiMemory.create({
      data: {
        tenantId: conversation.tenantId,
        conversationId,
        externalUserId: conversation.externalUserId,
        type: fact.type as any,
        value: fact.value,
        confidence: fact.confidence,
        sourceMessageId: fact.source_message_id === 'unknown' ? triggerMessageId : fact.source_message_id,
      },
    })
  }
}
