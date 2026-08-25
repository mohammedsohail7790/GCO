import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { getRedisConnection } from '@/lib/queue/connection'
import {
  messageIngestQueue,
  aiSuggestionQueue,
  memoryExtractionQueue,
  outboundDeliveryQueue,
  assignmentTimeoutQueue,
  deadLetterQueue,
} from '@/lib/queue/queues'
import { ok, handleRouteError } from '@/lib/api/response'

const QUEUES = {
  messageIngest: messageIngestQueue,
  aiSuggestion: aiSuggestionQueue,
  memoryExtraction: memoryExtractionQueue,
  outboundDelivery: outboundDeliveryQueue,
  assignmentTimeout: assignmentTimeoutQueue,
  deadLetter: deadLetterQueue,
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'VIEW_SYSTEM_METRICS')

    const dbHealthy = await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false)
    const redisHealthy = await getRedisConnection().ping().then(() => true).catch(() => false)

    const queueCounts: Record<string, unknown> = {}
    for (const [key, queue] of Object.entries(QUEUES)) {
      queueCounts[key] = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
    }

    const recentErrors = await db.systemEvent.findMany({
      where: { severity: { in: ['error', 'critical'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    })

    return ok({
      database: { healthy: dbHealthy },
      redis: { healthy: redisHealthy },
      queues: queueCounts,
      recentErrors,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
