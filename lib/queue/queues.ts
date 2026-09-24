import { Queue, QueueEvents } from 'bullmq'
import { getRedisConnection } from './connection'

// Queue names are centralized so producers (API routes) and consumers
// (workers/index.ts) never drift out of sync.
// Note: BullMQ queue names may not contain ":" (that character is reserved
// for its internal Redis key namespacing), so we use "-" here.
export const QUEUE_NAMES = {
  MESSAGE_INGEST: 'gco-message-ingest',
  AI_SUGGESTION: 'gco-ai-suggestion',
  MEMORY_EXTRACTION: 'gco-memory-extraction',
  OUTBOUND_DELIVERY: 'gco-outbound-delivery',
  ASSIGNMENT_TIMEOUT: 'gco-assignment-timeout',
  ANALYTICS: 'gco-analytics',
  BPO_HANDOFF: 'gco-bpo-handoff',
  DEAD_LETTER: 'gco-dead-letter',
} as const

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 3600, count: 5000 },
  removeOnFail: false, // keep failures visible for the recovery console / dead-letter inspection
}

function makeQueue(name: string) {
  return new Queue(name, { connection: getRedisConnection(), defaultJobOptions })
}

export const messageIngestQueue = makeQueue(QUEUE_NAMES.MESSAGE_INGEST)
export const aiSuggestionQueue = makeQueue(QUEUE_NAMES.AI_SUGGESTION)
export const memoryExtractionQueue = makeQueue(QUEUE_NAMES.MEMORY_EXTRACTION)
export const outboundDeliveryQueue = makeQueue(QUEUE_NAMES.OUTBOUND_DELIVERY)
export const assignmentTimeoutQueue = makeQueue(QUEUE_NAMES.ASSIGNMENT_TIMEOUT)
export const analyticsQueue = makeQueue(QUEUE_NAMES.ANALYTICS)
export const bpoHandoffQueue = makeQueue(QUEUE_NAMES.BPO_HANDOFF)
export const deadLetterQueue = makeQueue(QUEUE_NAMES.DEAD_LETTER)

export function getQueueEvents(name: string) {
  return new QueueEvents(name, { connection: getRedisConnection() })
}
