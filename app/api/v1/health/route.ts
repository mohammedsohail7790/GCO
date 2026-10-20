import { db } from '@/lib/db/client'
import { getAppRedisConnection } from '@/lib/queue/connection'
import { ok } from '@/lib/api/response'
import { environmentName } from '@/lib/config/environment'
import { aiStatus } from '@/lib/ai/guard'

export const dynamic = 'force-dynamic'

// Liveness/readiness check: does not require auth (used by orchestrators/load balancers).
export async function GET() {
  const checks: Record<string, { status: 'up' | 'down'; latencyMs?: number; error?: string }> = {}

  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = { status: 'up', latencyMs: Date.now() - dbStart }
  } catch (err) {
    checks.database = { status: 'down', error: 'unavailable' } // never echo driver messages (they can carry host names)
  }

  const redisStart = Date.now()
  try {
    // The app's shared BullMQ connection (getRedisConnection) has
    // maxRetriesPerRequest: null and would hang this liveness check
    // indefinitely during a real Redis outage instead of reporting
    // unhealthy - use the fast-fail connection here instead (confirmed by
    // fault injection).
    await getAppRedisConnection().ping()
    checks.redis = { status: 'up', latencyMs: Date.now() - redisStart }
  } catch (err) {
    checks.redis = { status: 'down', error: 'unavailable' }
  }

  const healthy = Object.values(checks).every((c) => c.status === 'up')
  return ok({ healthy, checks, environment: environmentName(), ai: aiStatus() }, healthy ? 200 : 503)
}
