import { test, expect } from '@playwright/test'
import { anonymousContext, loginAs, seedIsolatedTenant, cleanupTenant } from './helpers'

// TEST 15 - session/token security: unauthorized access, invalid tokens,
// tampered identity, logout invalidation.
test.describe('session security', () => {
  test('a request with no session cookie is rejected', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/api/v1/auth/me')
    expect(res.status()).toBe(401)
    await anon.dispose()
  })

  test('an invalid/garbage access token is rejected, not silently accepted', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/api/v1/auth/me', {
      headers: { Cookie: 'gco_at=not-a-real-jwt-at-all' },
    })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })

  test('a JWT signed with the wrong secret is rejected (tamper resistance)', async () => {
    // Forge a token that LOOKS like ours (same claim shape) but signed with a
    // different secret - proves the server actually verifies the signature
    // rather than trusting claims from a well-formed-looking JWT.
    const jose = await import('jose')
    const forgedToken = await new jose.SignJWT({
      sub: 'attacker',
      role: 'CEO_ADMIN',
      tenantId: null,
      email: 'attacker@evil.example',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('wrong-secret-the-attacker-guessed'))

    const anon = await anonymousContext()
    const res = await anon.get('/api/v1/admin/tenants', {
      headers: { Cookie: `gco_at=${forgedToken}` },
    })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })

  test('logout revokes the session - a stale refresh token can no longer mint a new access token', async () => {
    const ctx = await loginAs('operator1@demo.gco')
    const meBefore = await ctx.get('/api/v1/auth/me')
    expect(meBefore.ok()).toBe(true)

    const logoutRes = await ctx.post('/api/v1/auth/logout')
    expect(logoutRes.ok()).toBe(true)

    const refreshRes = await ctx.post('/api/v1/auth/refresh')
    expect(refreshRes.status()).toBe(401)
    await ctx.dispose()
  })

  test('wrong password is rejected and does not leak whether the email exists', async () => {
    const anon = await anonymousContext()
    const wrongPasswordRes = await anon.post('/api/v1/auth/login', {
      data: { email: 'operator1@demo.gco', password: 'definitely-wrong-password' },
    })
    expect(wrongPasswordRes.status()).toBe(401)

    const nonexistentRes = await anon.post('/api/v1/auth/login', {
      data: { email: 'nobody-such-user@demo.gco', password: 'whatever123' },
    })
    expect(nonexistentRes.status()).toBe(401)

    // Same error message for both cases - doesn't confirm/deny account existence.
    const wrongBody = await wrongPasswordRes.json()
    const nonexistentBody = await nonexistentRes.json()
    expect(wrongBody.error.message).toBe(nonexistentBody.error.message)
    await anon.dispose()
  })

  test('a role claimed only in the request body/session cannot escalate privilege', async () => {
    const tenant = await seedIsolatedTenant('session-escalation')
    try {
      // Even if a CLIENT context somehow sends a body claiming admin intent,
      // the route only trusts the verified JWT's role claim, not the payload.
      const res = await tenant.clientCtx.post('/api/v1/admin/users', {
        data: {
          email: 'escalated@evil.example',
          password: 'password123456',
          displayName: 'escalated',
          role: 'CEO_ADMIN',
        },
      })
      expect(res.status()).toBe(403)
    } finally {
      await cleanupTenant(tenant.tenantId)
    }
  })
})
