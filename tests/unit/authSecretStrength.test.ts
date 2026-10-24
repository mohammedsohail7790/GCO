import { describe, it, expect, afterEach } from 'vitest'
import { signAccessToken, verifyAccessToken } from '@/lib/auth/tokens'
import { encryptSecret, decryptSecret } from '@/lib/auth/secretBox'

const saved = process.env.AUTH_SECRET
afterEach(() => { if (saved === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = saved })
const claims = { sub: 'u1', role: 'OPERATOR', tenantId: null, email: 'a@b.test' } as never

describe('AUTH_SECRET strength (finding F4)', () => {
  it('rejects a secret shorter than 32 characters for signing and for the secret box', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(31)
    await expect(signAccessToken(claims)).rejects.toThrow(/at least 32|too short/)
    expect(() => encryptSecret('seed')).toThrow(/32/)
  })
  it('accepts exactly 32 characters and round-trips', async () => {
    process.env.AUTH_SECRET = 'y'.repeat(32)
    const t = await signAccessToken(claims)
    expect((await verifyAccessToken(t)).sub).toBe('u1')
    expect(decryptSecret(encryptSecret('seed'))).toBe('seed')
  })
})
