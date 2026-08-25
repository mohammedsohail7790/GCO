import { describe, it, expect, beforeAll } from 'vitest'
import { signAccessToken, signRealtimeTicket, verifyAccessToken, verifyRealtimeTicket } from '@/lib/auth/tokens'

const claims = { sub: 'user1', role: 'OPERATOR' as const, tenantId: 'tenant-a', email: 'x@y.com' }

describe('realtime ticket / access token separation', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-at-least-16-chars-long'
  })

  it('a realtime ticket is rejected by verifyAccessToken (cannot be replayed against REST endpoints)', async () => {
    const ticket = await signRealtimeTicket(claims)
    await expect(verifyAccessToken(ticket)).rejects.toThrow()
  })

  it('a REST access token is rejected by verifyRealtimeTicket (cannot connect to the realtime server)', async () => {
    const accessToken = await signAccessToken(claims)
    await expect(verifyRealtimeTicket(accessToken)).rejects.toThrow()
  })

  it('a realtime ticket verifies successfully via verifyRealtimeTicket and carries the right identity', async () => {
    const ticket = await signRealtimeTicket(claims)
    const verified = await verifyRealtimeTicket(ticket)
    expect(verified.sub).toBe(claims.sub)
    expect(verified.tenantId).toBe(claims.tenantId)
  })

  it('an access token verifies successfully via verifyAccessToken', async () => {
    const accessToken = await signAccessToken(claims)
    const verified = await verifyAccessToken(accessToken)
    expect(verified.sub).toBe(claims.sub)
  })
})
