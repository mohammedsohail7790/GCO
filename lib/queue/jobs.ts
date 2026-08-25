import {
  messageIngestQueue,
  aiSuggestionQueue,
  memoryExtractionQueue,
  outboundDeliveryQueue,
  assignmentTimeoutQueue,
  analyticsQueue,
} from './queues'

// All enqueue helpers use a deterministic jobId derived from a domain key so
// re-enqueuing the same logical unit of work is a no-op (BullMQ treats a
// duplicate jobId as already-exists rather than creating a second job).
// Note: BullMQ custom job IDs may not contain ":" (reserved for its internal
// Redis key namespacing), so we use "-" as the separator here.

export function enqueueMessageIngest(webhookEventId: string) {
  return messageIngestQueue.add(
    'ingest',
    { webhookEventId },
    { jobId: `ingest-${webhookEventId}` },
  )
}

export function enqueueAiSuggestion(messageId: string) {
  return aiSuggestionQueue.add(
    'suggest',
    { messageId },
    { jobId: `suggest-${messageId}` },
  )
}

export function enqueueMemoryExtraction(conversationId: string, triggerMessageId: string) {
  return memoryExtractionQueue.add(
    'extract',
    { conversationId, triggerMessageId },
    { jobId: `extract-${triggerMessageId}` },
  )
}

export function enqueueOutboundDelivery(messageId: string) {
  return outboundDeliveryQueue.add(
    'deliver',
    { messageId },
    { jobId: `deliver-${messageId}` },
  )
}

/** Schedules a delayed check of an assignment's SLA deadline. Re-scheduling with the same
 *  assignmentId replaces nothing automatically - callers must remove a stale job first if the
 *  deadline changes (see lib/assignment/engine.ts releaseAssignment). */
export function scheduleAssignmentTimeoutCheck(assignmentId: string, delayMs: number) {
  return assignmentTimeoutQueue.add(
    'check-timeout',
    { assignmentId },
    { jobId: `timeout-${assignmentId}`, delay: Math.max(delayMs, 0) },
  )
}

export async function cancelAssignmentTimeoutCheck(assignmentId: string) {
  const job = await assignmentTimeoutQueue.getJob(`timeout-${assignmentId}`)
  if (job) await job.remove()
}

export function enqueueAnalyticsEvent(type: string, payload: Record<string, unknown>) {
  return analyticsQueue.add(type, payload, { removeOnComplete: true })
}
