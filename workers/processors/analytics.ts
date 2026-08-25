import type { Job } from 'bullmq'
import { db } from '@/lib/db/client'

// Analytics is intentionally decoupled from the critical message path - it
// only aggregates into SystemEvent/derived tables and must never be able to
// fail or slow down message delivery.
export async function analyticsProcessor(job: Job) {
  await db.systemEvent.create({
    data: {
      category: 'analytics',
      severity: 'info',
      message: job.name,
      metadata: job.data,
    },
  })
}
