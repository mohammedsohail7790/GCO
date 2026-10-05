import { describe, it, expect } from 'vitest'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { getClientIp } from '@/lib/api/clientIp'

// Real Redis: the exact production failure - one visitor reaching the app through
// different Cloudflare edges - must now share one bucket and hit 429 after 5.
const via = (edge: string, client: string) => new Headers({ 'x-forwarded-for': edge, 'cf-connecting-ip': client })
const EDGES = ['172.68.234.206', '162.158.159.5', '104.16.9.9', '172.71.148.152', '141.101.64.10', '108.162.200.1', '173.245.48.9', '198.41.130.2']

describe('rate limit through Cloudflare (real Redis)', () => {
  it('8. one visitor over 8 different edges: 5 allowed, then 429', async () => {
    const client = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
    const results: boolean[] = []
    for (const edge of EDGES) {
      const ip = getClientIp(via(edge, client))
      results.push(await isRateLimited(`public-contact:${ip}`, RATE_LIMITS.PUBLIC_FORM.max, RATE_LIMITS.PUBLIC_FORM.windowSeconds))
    }
    expect(results).toEqual([false, false, false, false, false, true, true, true])
  })

  it('different visitors behind the same edge do not limit each other', async () => {
    const base = Math.floor(Math.random() * 100) + 100
    for (let i = 0; i < 8; i++) {
      const ip = getClientIp(via('172.68.234.206', `198.18.${base}.${i + 1}`))
      expect(await isRateLimited(`public-contact:${ip}`, RATE_LIMITS.PUBLIC_FORM.max, RATE_LIMITS.PUBLIC_FORM.windowSeconds)).toBe(false)
    }
  })

  it('a direct client rotating a forged CF-Connecting-IP stays in ONE bucket (its real address)', async () => {
    const real = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    const results: boolean[] = []
    for (let i = 0; i < 8; i++) {
      const ip = getClientIp(new Headers({ 'x-forwarded-for': real, 'cf-connecting-ip': `7.7.7.${i + 1}` }))
      results.push(await isRateLimited(`public-contact:${ip}`, RATE_LIMITS.PUBLIC_FORM.max, RATE_LIMITS.PUBLIC_FORM.windowSeconds))
    }
    expect(results).toEqual([false, false, false, false, false, true, true, true])
  })
})
