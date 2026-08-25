import { describe, it, expect, afterAll } from 'vitest'
import { isRateLimited } from '@/lib/api/rateLimit'
import { getRedisConnection } from '@/lib/queue/connection'

describe('Redis-backed rate limiter', () => {
  afterAll(async () => {
    await getRedisConnection().quit()
  })

  it('allows requests under the limit and blocks once exceeded', async () => {
    const key = `test-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 3; i++) {
      expect(await isRateLimited(key, 3, 60)).toBe(false)
    }
    // 4th request exceeds max=3
    expect(await isRateLimited(key, 3, 60)).toBe(true)
  })

  it('uses independent windows per key', async () => {
    const keyA = `test-a-${Date.now()}`
    const keyB = `test-b-${Date.now()}`
    for (let i = 0; i < 3; i++) await isRateLimited(keyA, 3, 60)
    expect(await isRateLimited(keyA, 3, 60)).toBe(true)
    // A different key has its own independent counter, unaffected by A's usage.
    expect(await isRateLimited(keyB, 3, 60)).toBe(false)
  })

  it('the counter key expires (verified via TTL, not by waiting out the window)', async () => {
    const key = `test-ttl-${Date.now()}`
    await isRateLimited(key, 5, 30)
    const redis = getRedisConnection()
    const bucketKey = `gco:ratelimit:${key}:${Math.floor(Date.now() / (30 * 1000))}`
    const ttl = await redis.ttl(bucketKey)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(30)
  })
})
