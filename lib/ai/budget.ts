import { db } from '@/lib/db/client'
import { getAppRedisConnection } from '@/lib/queue/connection'
import { logger } from '@/lib/observability/logger'

// Per-client daily cap on AI provider calls (draft and memory extraction both count), so a loop, a flood of messages or a
// misconfiguration cannot run up an unbounded bill. Fails CLOSED: if the counter cannot be read, the call is skipped - the operator
// simply works without a draft, which is always safe. The OpenAI project's own monthly budget is the second, outer limit.

const DAY_MS = 86_400_000

/** Counts one call for the client today (UTC) and says whether it may go ahead. */
export async function takeAiCall(tenantId: string, dailyLimit: number, now: Date = new Date()): Promise<boolean> {
  const day = Math.floor(now.getTime() / DAY_MS)
  const key = `gco:ai-calls:${tenantId}:${day}`
  let count: number
  try {
    const redis = getAppRedisConnection()
    count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 2 * 86_400)
  } catch (err) {
    logger.warn({ component: 'ai', tenantId, err: err instanceof Error ? err.message : String(err) }, 'AI call skipped: daily counter unavailable')
    return false
  }
  if (count <= dailyLimit) return true
  if (count === dailyLimit + 1) {
    // First refused call of the day: one content-free, operator-visible record (not one per message).
    logger.warn({ component: 'ai', tenantId, dailyLimit }, 'AI daily call limit reached for client')
    await db.systemEvent.create({ data: { category: 'ai', severity: 'warning', message: 'AI daily call limit reached for a client', metadata: { tenantId, dailyLimit } } }).catch(() => null)
  }
  return false
}
