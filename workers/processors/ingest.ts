import type { Job } from 'bullmq'
import { processWebhookEvent } from '@/lib/messages/ingest'

export async function ingestProcessor(job: Job<{ webhookEventId: string }>) {
  await processWebhookEvent(job.data.webhookEventId)
}
