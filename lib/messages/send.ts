import { db } from '@/lib/db/client'
import { completeAssignment } from '@/lib/assignment/engine'
import { enqueueOutboundDelivery } from '@/lib/queue/jobs'
import { writeAuditLog } from '@/lib/audit/log'
import { publishRealtimeEvent } from '@/lib/realtime/publish'
import { nanoid } from 'nanoid'

/**
 * Operator sends the (possibly edited) final reply. This is the ONLY path
 * that creates an OUTBOUND message in V1 - the AI never calls this directly.
 * Persists first (source of truth), then enqueues durable outbound delivery
 * so a temporary client-API outage can't lose the operator's response.
 */
export async function operatorSendMessage(params: {
  conversationId: string
  operatorUserId: string
  operatorId: string
  content: string
  aiGenerationId?: string | null
}) {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: params.conversationId } })

  const message = await db.message.create({
    data: {
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      status: 'PENDING_REVIEW',
      content: params.content,
      externalMessageId: `out_${nanoid()}`,
      operatorId: params.operatorId,
      aiGenerationId: params.aiGenerationId ?? null,
    },
  })

  if (params.aiGenerationId) {
    const generation = await db.aiGeneration.findUnique({ where: { id: params.aiGenerationId } })
    const wasEdited = generation ? generation.suggestedReply.trim() !== params.content.trim() : false
    await db.aiGeneration.update({
      where: { id: params.aiGenerationId },
      data: { status: wasEdited ? 'edited' : 'accepted' },
    })
  }

  await db.messageEvent.create({ data: { messageId: message.id, type: 'EDITED' } })

  if (conversation.currentAssignmentId) {
    await completeAssignment(conversation.currentAssignmentId)
  }

  await writeAuditLog({
    tenantId: conversation.tenantId,
    actorUserId: params.operatorUserId,
    action: 'message.send',
    resource: 'message',
    resourceId: message.id,
    metadata: { conversationId: conversation.id },
  })

  await publishRealtimeEvent(conversation.tenantId, 'message.sent', {
    conversationId: conversation.id,
    messageId: message.id,
  })

  await enqueueOutboundDelivery(message.id)

  return message
}
