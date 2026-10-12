import { test, expect, request } from '@playwright/test'
import { cleanupTenant, loginAs, seedIsolatedTenant } from './helpers'
import { totpAt } from '../../lib/auth/totp'

const PW = 'DemoPassword123!'
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// The whole path over HTTP: enrol -> sign-in now needs a code -> code works once -> recovery code works once -> turn off.
test.describe('two-factor sign-in', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { t = await seedIsolatedTenant('tfa') })
  test.afterAll(async () => { await cleanupTenant(t.tenantId) })

  test('requires password to change anything, then enforces a code at sign-in', async () => {
    const mgr = t.managerCtx
    expect((await mgr.get('/api/v1/auth/2fa/status')).ok()).toBe(true)
    expect((await mgr.post('/api/v1/auth/2fa/setup', { data: { password: 'wrong-password-123' } })).status()).toBe(400)
    const setup = (await (await mgr.post('/api/v1/auth/2fa/setup', { data: { password: PW } })).json()).data
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(setup.otpauthUri).toContain('otpauth://totp/GCO:')
    // wrong code / wrong password do not enable it
    expect((await mgr.post('/api/v1/auth/2fa/enable', { data: { password: PW, code: '000000' } })).status()).toBe(400)
    expect((await mgr.post('/api/v1/auth/2fa/enable', { data: { password: 'nope-nope-nope', code: totpAt(setup.secret, Date.now()) } })).status()).toBe(400)
    const en = await mgr.post('/api/v1/auth/2fa/enable', { data: { password: PW, code: totpAt(setup.secret, Date.now()) } })
    expect(en.status()).toBe(200)
    const recovery: string[] = (await en.json()).data.recoveryCodes
    expect(recovery).toHaveLength(10)

    const anon = async () => request.newContext({ baseURL: BASE })
    const attempt = async (code?: string) => {
      const ctx = await anon()
      const res = await ctx.post('/api/v1/auth/login', { data: { email: t.managerEmail, password: PW, ...(code ? { code } : {}) }, headers: { 'x-forwarded-for': `tfa-${Math.random()}` } })
      return { res, ctx }
    }
    // wrong password never reveals that a second factor exists
    const bad = await (await anon()).post('/api/v1/auth/login', { data: { email: t.managerEmail, password: 'wrong-password-123' }, headers: { 'x-forwarded-for': `tfa-${Math.random()}` } })
    expect(bad.status()).toBe(401); expect((await bad.json()).error.code).toBeUndefined()
    // right password, no code -> asked for the code, and no session cookies are set
    const none = await attempt()
    expect(none.res.status()).toBe(401)
    expect((await none.res.json()).error.code).toBe('TWO_FACTOR_REQUIRED')
    expect(none.res.headers()['set-cookie'] ?? '').not.toContain('gco_at')
    expect((await attempt('123456')).res.status()).toBe(401)

    // The confirmation consumed the current step; the next step's code signs in, and cannot be replayed.
    const future = Date.now() + 30_000
    const code = totpAt(setup.secret, future)
    // (server clock is real time; the +30s step is inside the +-1 window)
    const good = await attempt(code)
    expect(good.res.status()).toBe(200)
    expect((await good.ctx.get('/api/v1/auth/me')).ok()).toBe(true)
    expect((await attempt(code)).res.status()).toBe(401)

    // recovery code: works once
    const r = await attempt(recovery[0])
    expect(r.res.status()).toBe(200)
    expect((await attempt(recovery[0])).res.status()).toBe(401)
    expect((await (await mgr.get('/api/v1/auth/2fa/status')).json()).data.recoveryCodesLeft).toBe(9)

    // turning off needs the password; afterwards password-only sign-in works again
    expect((await mgr.post('/api/v1/auth/2fa/disable', { data: { password: 'wrong-password-123' } })).status()).toBe(400)
    expect((await mgr.post('/api/v1/auth/2fa/disable', { data: { password: PW } })).status()).toBe(200)
    expect((await (await loginAs(t.managerEmail)).get('/api/v1/auth/me')).ok()).toBe(true)
  })

  test('setting up again after turning off works and sign-in asks for the code again', async () => {
    const mgr = t.managerCtx
    const setup = (await (await mgr.post('/api/v1/auth/2fa/setup', { data: { password: PW } })).json()).data
    expect((await mgr.post('/api/v1/auth/2fa/enable', { data: { password: PW, code: totpAt(setup.secret, Date.now()) } })).status()).toBe(200)
    const ctx = await request.newContext({ baseURL: BASE })
    const res = await ctx.post('/api/v1/auth/login', { data: { email: t.managerEmail, password: PW }, headers: { 'x-forwarded-for': `tfa-${Math.random()}` } })
    expect((await res.json()).error.code).toBe('TWO_FACTOR_REQUIRED')
  })
})
