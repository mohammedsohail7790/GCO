import type { Job } from 'bullmq'
import { expireAssignment } from '@/lib/assignment/engine'

export async function assignmentTimeoutProcessor(job: Job<{ assignmentId: string }>) {
  // expireAssignment is idempotent - safe even if this job is retried or the
  // assignment was already completed/expired by the time it runs.
  await expireAssignment(job.data.assignmentId)
}
