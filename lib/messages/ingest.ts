import { db } from '@/lib/db/client'
import { getAdapter } from '@/lib/integrations/registry'
import { tryAssignConversation } from '@/lib/assignment/engine'
import { enqueueAiSuggestion, enqueueMemoryExtraction, enqueueAnalyticsEvent } from '@/lib/queue/jobs'
import { recordMessageUsage } from '@/lib/usage/ledger'
import { publishRealtimeEvent } from '@/lib/realtime/publish'
import { flags } from '@/lib/config/flags'

/**
 * Processes one previously-persisted WebhookEvent: normalizes it, persists
 * the message(s) idempotently, puts the conversation in the queue, attempts
 * assignment, and fans out AI/analytics work asynchronously.
 *
 * This function is called from the message-ingest worker (see workers/ingest.worker.ts),
 * never directly from the webhook HTTP handler - the handler's only job is to
 * persist the raw event fast and return 200, per section 18 of the spec.
 */
export async function processWebhookEvent(webhookEventId: string) {
  const event = await db.webhookEvent.findUniqueOrThrow({ where: { id: webhookEventId } })
  if (event.processed) return // idempotent no-op on retry/duplicate delivery of the queue job itself

  const integration = await db.integration.findUniqueOrThrow({ where: { id: event.integrationId } })
  const adapter = getAdapter(integration.adapterKey)

  try {
    const normalized = adapter.normalizeInbound(event.rawPayload)

    for (const msg of normalized) {
      await ingestOneMessage({
        tenantId: event.tenantId,
        externalUserId: msg.externalUserId,
        externalMessageId: msg.externalMessageId,
        content: msg.content,
        language: msg.language,
      })
    }

    await db.webhookEvent.update({
      where: { id: event.id },
      data: { processed: true, processedAt: new Date() },
    })
  } catch (err) {
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { error: err instanceof Error ? err.message : 'unknown error' },
    })
    throw err // let BullMQ retry with backoff
  }
}

async function ingestOneMessage(params: {
  tenantId: string
  externalUserId: string
  externalMessageId: string
  content: string
  language?: string
}) {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: params.tenantId } })

  // Find-or-create the open conversation for this external user. A simple V1
  // rule: reuse the most recent non-CLOSED conversation, else start a new one.
  let conversation = await db.conversation.findFirst({
    where: {
      tenantId: params.tenantId,
      externalUserId: params.externalUserId,
      state: { notIn: ['CLOSED', 'FAILED'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenantId: params.tenantId,
        externalUserId: params.externalUserId,
        state: 'QUEUED',
        language: params.language,
      },
    })
  }

  // Idempotent message persistence: (tenantId, externalMessageId, direction) is unique.
  const existing = await db.message.findFirst({
    where: {
      tenantId: params.tenantId,
      externalMessageId: params.externalMessageId,
      direction: 'INBOUND',
    },
  })
  if (existing) return existing // duplicate webhook delivery - safe no-op

  const message = await db.message.create({
    data: {
      tenantId: params.tenantId,
      conversationId: conversation.id,
      direction: 'INBOUND',
      status: 'RECEIVED',
      content: params.content,
      externalMessageId: params.externalMessageId,
    },
  })

  await db.messageEvent.create({ data: { messageId: message.id, type: 'INGESTED' } })

  if (conversation.state === 'WAITING_FOR_OPERATOR' || conversation.state === 'ACTIVE') {
    await db.conversation.update({ where: { id: conversation.id }, data: { state: 'WAITING_FOR_OPERATOR' } })
  } else if (conversation.state !== 'QUEUED') {
    await db.conversation.update({ where: { id: conversation.id }, data: { state: 'QUEUED' } })
  }

  await db.messageEvent.create({ data: { messageId: message.id, type: 'QUEUED' } })

  await recordMessageUsage({
    tenantId: params.tenantId,
    messageId: message.id,
    source: 'webhook',
    priceEurCents: tenant.pricePerMessageEurCents,
    operatorCostEurCents: tenant.operatorCostPerMessageEurCents,
  })

  await publishRealtimeEvent(params.tenantId, 'message.received', {
    conversationId: conversation.id,
    messageId: message.id,
  })

  // Assignment + AI suggestion are best-effort side branches: if either
  // fails, the message is already durably persisted and queued.
  await tryAssignConversation(conversation.id).catch(() => null)
  if (flags.aiSuggestions) await enqueueAiSuggestion(message.id).catch(() => null)
  if (flags.aiMemory) await enqueueMemoryExtraction(conversation.id, message.id).catch(() => null)
  await enqueueAnalyticsEvent('message_ingested', { tenantId: params.tenantId, conversationId: conversation.id })

  return message
}
