import 'dotenv/config'
import { Worker, type Job } from 'bullmq'
import { getRedisConnection } from '@/lib/queue/connection'
import { QUEUE_NAMES, deadLetterQueue } from '@/lib/queue/queues'
import { ingestProcessor } from './processors/ingest'
import { aiSuggestionProcessor } from './processors/aiSuggestion'
import { memoryExtractionProcessor } from './processors/memoryExtraction'
import { outboundDeliveryProcessor } from './processors/outboundDelivery'
import { assignmentTimeoutProcessor } from './processors/assignmentTimeout'
import { analyticsProcessor } from './processors/analytics'
import { db } from '@/lib/db/client'
import { tryAssignConversation } from '@/lib/assignment/engine'
import { logger } from '@/lib/observability/logger'

const connection = getRedisConnection()

function makeWorker(name: string, processor: (job: Job) => Promise<void>, concurrency = 5) {
  const worker = new Worker(name, processor, { connection, concurrency })
  const log = logger.child({ component: 'worker', queue: name })

  worker.on('failed', async (job, err) => {
    log.error({ jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'job failed')
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      // Exhausted retries - move to dead-letter for manual inspection/requeue
      // via the admin recovery console instead of losing it silently.
      await deadLetterQueue.add('dead-letter', {
        originalQueue: name,
        jobName: job.name,
        data: job.data,
        error: err.message,
        failedAt: new Date().toISOString(),
      })
      await db.systemEvent.create({
        data: {
          category: 'queue',
          severity: 'error',
          message: `Job exhausted retries and moved to dead-letter: ${name}/${job.name}`,
          metadata: { jobId: job.id, data: job.data as any, error: err.message },
        },
      })
    }
  })

  worker.on('error', (err) => log.error({ err: err.message }, 'worker error'))

  return worker
}

const workers = [
  makeWorker(QUEUE_NAMES.MESSAGE_INGEST, ingestProcessor, 10),
  makeWorker(QUEUE_NAMES.AI_SUGGESTION, aiSuggestionProcessor, 10),
  makeWorker(QUEUE_NAMES.MEMORY_EXTRACTION, memoryExtractionProcessor, 5),
  makeWorker(QUEUE_NAMES.OUTBOUND_DELIVERY, outboundDeliveryProcessor, 10),
  makeWorker(QUEUE_NAMES.ASSIGNMENT_TIMEOUT, assignmentTimeoutProcessor, 5),
  makeWorker(QUEUE_NAMES.ANALYTICS, analyticsProcessor, 20),
]

// Periodic sweep: catches conversations left QUEUED/REASSIGNING because no
// operator was free at the moment of ingestion/expiry (e.g. all operators
// went BUSY then one became AVAILABLE again with no new inbound message to
// trigger a retry).
const SWEEP_INTERVAL_MS = 15_000
const sweepTimer = setInterval(async () => {
  try {
    const stuck = await db.conversation.findMany({
      where: { state: { in: ['QUEUED', 'REASSIGNING'] }, currentAssignmentId: null },
      take: 50,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })
    for (const c of stuck) {
      await tryAssignConversation(c.id)
    }
  } catch (err) {
    logger.error({ component: 'worker:sweep', err: err instanceof Error ? err.message : err }, 'sweep error')
  }
}, SWEEP_INTERVAL_MS)

logger.info({ queueCount: workers.length, sweepIntervalMs: SWEEP_INTERVAL_MS }, 'GCO workers started')

async function shutdown() {
  clearInterval(sweepTimer)
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
