import type { Job } from 'bullmq'
import { db } from '@/lib/db/client'
import { getAdapter } from '@/lib/integrations/registry'
import { publishRealtimeEvent } from '@/lib/realtime/publish'

export async function outboundDeliveryProcessor(job: Job<{ messageId: string }>) {
  const message = await db.message.findUniqueOrThrow({ where: { id: job.data.messageId } })
  if (message.status === 'DELIVERED' || message.status === 'SENT') return // idempotent

  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: message.conversationId } })
  const integration = await db.integration.findFirstOrThrow({
    where: { tenantId: message.tenantId, status: 'ACTIVE' },
  })
  const adapter = getAdapter(integration.adapterKey)

  const result = await adapter.sendOutbound(
    {
      externalUserId: conversation.externalUserId,
      content: message.content,
      // Stable per message: used by adapters as the idempotency key so a retry after an unacknowledged success is
      // recognisable by the destination.
      externalMessageId: message.externalMessageId ?? message.id,
    },
    integration.config as Record<string, unknown>,
    { integrationId: integration.id, tenantId: message.tenantId, secret: integration.webhookSecret },
  )

  if (result.delivered) {
    await db.message.update({
      where: { id: message.id },
      data: { status: 'DELIVERED', sentAt: new Date(), deliveredAt: new Date() },
    })
    await db.messageEvent.create({
      data: { messageId: message.id, type: 'DELIVERY_CONFIRMED', metadata: { externalDeliveryId: result.externalDeliveryId, latencyMs: result.latencyMs } },
    })
  } else {
    await db.message.update({
      where: { id: message.id },
      data: { status: 'FAILED', failedReason: result.error ?? 'unknown' },
    })
    await db.messageEvent.create({
      data: {
        messageId: message.id,
        type: 'DELIVERY_FAILED',
        metadata: { error: result.error, category: result.failureCategory, retryable: result.retryable !== false, latencyMs: result.latencyMs },
      },
    })
    if (result.retryable === false) {
      // Permanent (e.g. the client's endpoint rejected the request, bad destination, wrong secret): retrying cannot
      // help. The message stays FAILED - never DELIVERED - and management is told through a SystemEvent (no content).
      await db.systemEvent
        .create({
          data: {
            category: 'delivery',
            severity: 'error',
            message: 'Outbound delivery failed permanently - check the client integration',
            metadata: { tenantId: message.tenantId, integrationId: integration.id, messageId: message.id, category: result.failureCategory ?? 'unknown' },
          },
        })
        .catch(() => null)
      return
    }
    throw new Error(result.error ?? 'Outbound delivery failed') // triggers BullMQ retry/backoff
  }

  await publishRealtimeEvent(message.tenantId, 'message.delivered', {
    conversationId: message.conversationId,
    messageId: message.id,
  })
}
