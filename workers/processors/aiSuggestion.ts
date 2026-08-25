import type { Job } from 'bullmq'
import { generateSuggestionForMessage } from '@/lib/ai/service'

export async function aiSuggestionProcessor(job: Job<{ messageId: string }>) {
  // generateSuggestionForMessage already swallows provider errors internally
  // (recorded as a failed AiGeneration row) so AI outages never fail this job
  // repeatedly or block the queue.
  await generateSuggestionForMessage(job.data.messageId)
}
