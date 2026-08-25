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
      externalMessageId: message.externalMessageId ?? message.id,
    },
    integration.config as Record<string, unknown>,
  )

  if (result.delivered) {
    await db.message.update({
      where: { id: message.id },
      data: { status: 'DELIVERED', sentAt: new Date(), deliveredAt: new Date() },
    })
    await db.messageEvent.create({
      data: { messageId: message.id, type: 'DELIVERY_CONFIRMED', metadata: { externalDeliveryId: result.externalDeliveryId } },
    })
  } else {
    await db.message.update({
      where: { id: message.id },
      data: { status: 'FAILED', failedReason: result.error ?? 'unknown' },
    })
    await db.messageEvent.create({
      data: { messageId: message.id, type: 'DELIVERY_FAILED', metadata: { error: result.error } },
    })
    throw new Error(result.error ?? 'Outbound delivery failed') // triggers BullMQ retry/backoff
  }

  await publishRealtimeEvent(message.tenantId, 'message.delivered', {
    conversationId: message.conversationId,
    messageId: message.id,
  })
}
