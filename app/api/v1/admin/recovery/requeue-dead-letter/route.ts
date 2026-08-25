import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { deadLetterQueue } from '@/lib/queue/queues'
import { getRedisConnection } from '@/lib/queue/connection'
import { Queue } from 'bullmq'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'

const BodySchema = z.object({ jobId: z.string() })

/**
 * Emergency recovery action: takes a job that exhausted retries and landed in
 * the dead-letter queue and re-submits it to its original queue. Every call
 * is authenticated, authorized, and audited per spec section 27.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'QUEUE_RECOVER')
    const { jobId } = BodySchema.parse(await req.json())

    const job = await deadLetterQueue.getJob(jobId)
    if (!job) return fail('Dead-letter job not found', 404)

    const { originalQueue, jobName, data } = job.data as {
      originalQueue: string
      jobName: string
      data: unknown
    }

    const target = new Queue(originalQueue, { connection: getRedisConnection() })
    const requeued = await target.add(jobName, data)
    await job.remove()

    await writeAuditLog({
      actorUserId: session.sub,
      action: 'recovery.requeue_dead_letter',
      resource: 'queue_job',
      resourceId: jobId,
      metadata: { originalQueue, jobName, newJobId: requeued.id },
    })

    return ok({ requeued: true, newJobId: requeued.id })
  } catch (err) {
    return handleRouteError(err)
  }
}
