import { getAppRedisConnection } from '@/lib/queue/connection'
import { logger } from '@/lib/observability/logger'

/**
 * Redis-backed fixed-window rate limiter. Works correctly across multiple
 * app instances (unlike the earlier per-process in-memory limiter on
 * /auth/login, which only ever protected a single instance - see
 * docs/production-readiness-audit.md).
 *
 * Returns true if the request should be BLOCKED (limit exceeded).
 *
 * Fails OPEN (returns false / "not limited") if Redis itself is unreachable,
 * rather than throwing and turning a Redis outage into a full outage of
 * every rate-limited route (login, webhooks, all authenticated writes,
 * public forms) - confirmed by fault injection this was previously the
 * actual failure mode: killing Redis made these requests hang indefinitely.
 * Losing this secondary abuse-prevention layer during a Redis outage is an
 * acceptable trade-off; primary controls (auth, RBAC, tenant isolation,
 * webhook signatures) do not depend on Redis at all.
 */
export async function isRateLimited(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  const redis = getAppRedisConnection()
  const bucketKey = `gco:ratelimit:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`

  try {
    const count = await redis.incr(bucketKey)
    if (count === 1) {
      await redis.expire(bucketKey, windowSeconds)
    }
    return count > maxRequests
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err, key }, 'rate limiter unavailable - failing open')
    return false
  }
}

/** Standard limits used across the API - centralized so they're easy to tune per deployment. */
export const RATE_LIMITS = {
  // Per-integration webhook ingestion - generous, this is legitimate traffic,
  // just capped so a misbehaving/compromised client integration can't flood
  // the ingest queue or the database. 3000/min comfortably clears the
  // business's stated peak volume (see docs/load-testing.md - measured
  // throughput at 1000/min showed no strain) with ~3x headroom before this
  // becomes the bottleneck. A single client processing a genuinely higher
  // sustained volume than this should get a per-integration override, not a
  // global bump - see docs/production-readiness-audit.md.
  WEBHOOK: { max: 3000, windowSeconds: 60 },
  // Per-user mutating actions (send message, create ticket) - generous for a
  // human operator, tight enough to blunt a compromised session being scripted.
  AUTHENTICATED_WRITE: { max: 120, windowSeconds: 60 },
  // Login already has its own in-memory limiter (app/api/v1/auth/login/route.ts);
  // this constant is reserved for migrating it to this Redis-backed one.
  LOGIN: { max: 10, windowSeconds: 15 * 60 },
  // Unauthenticated public forms (contact, careers) - keyed by IP. Generous
  // enough for a real visitor who mistypes and resubmits, tight enough to
  // blunt a scripted flood against an endpoint with no login wall at all.
  PUBLIC_FORM: { max: 5, windowSeconds: 60 },
} as const
