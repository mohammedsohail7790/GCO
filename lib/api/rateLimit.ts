import { getRedisConnection } from '@/lib/queue/connection'

/**
 * Redis-backed fixed-window rate limiter. Works correctly across multiple
 * app instances (unlike the earlier per-process in-memory limiter on
 * /auth/login, which only ever protected a single instance - see
 * docs/production-readiness-audit.md).
 *
 * Returns true if the request should be BLOCKED (limit exceeded).
 */
export async function isRateLimited(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  const redis = getRedisConnection()
  const bucketKey = `gco:ratelimit:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`

  const count = await redis.incr(bucketKey)
  if (count === 1) {
    await redis.expire(bucketKey, windowSeconds)
  }
  return count > maxRequests
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
} as const
