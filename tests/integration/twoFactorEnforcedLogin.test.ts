import { describe, it, expect, afterAll, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { beginSetup, confirmEnable } from '@/lib/auth/twoFactor'
import { totpAt } from '@/lib/auth/totp'
import { POST as login } from '@/app/api/v1/auth/login/route'

// P0 two-factor: the enforced sign-in path over the real login handler (the policy function was unit-tested, the route was not).
// Rehearsed by hand on 31 Oct 2026 (docs/readiness/26 section 7); this keeps it from regressing.
const PW = 'Correct-Horse-Battery-9'
const stamp = Date.now()

describe('mandatory two-factor at sign-in (real database, real login route)', () => {
  const ids: string[] = []
  const original = process.env.REQUIRE_TWO_FACTOR_ROLES
  afterEach(() => { if (original === undefined) delete process.env.REQUIRE_TWO_FACTOR_ROLES; else process.env.REQUIRE_TWO_FACTOR_ROLES = original })
  afterAll(async () => {
    await db.session.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  })

  const mk = async (tag: string, role: 'CEO_ADMIN' | 'OPERATOR' | 'CTO') => {
    const email = `tfa-enforce-${stamp}-${tag}@test.gco`
    const u = await db.user.create({ data: { email, passwordHash: await hashPassword(PW), role, displayName: tag } })
    ids.push(u.id)
    return { id: u.id, email }
  }
  const attempt = async (email: string, password = PW, code?: string) => {
    const res = await login(new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
    }))
    const body = await res.json().catch(() => ({}))
    return { status: res.status, code: body?.error?.code as string | undefined }
  }

  it('is off by default: an unenrolled privileged account signs in with its password', async () => {
    delete process.env.REQUIRE_TWO_FACTOR_ROLES
    const u = await mk('default', 'CEO_ADMIN')
    expect((await attempt(u.email)).status).toBe(200)
  })

  it('when enforced, a listed role without two-factor is refused with the right password, and the refusal is audited', async () => {
    process.env.REQUIRE_TWO_FACTOR_ROLES = 'CEO_ADMIN,CTO'
    const ceo = await mk('ceo-unenrolled', 'CEO_ADMIN')
    const cto = await mk('cto-unenrolled', 'CTO')
    expect(await attempt(ceo.email)).toEqual({ status: 403, code: 'TWO_FACTOR_ENROLMENT_REQUIRED' })
    expect(await attempt(cto.email)).toEqual({ status: 403, code: 'TWO_FACTOR_ENROLMENT_REQUIRED' })
    expect(await db.auditLog.count({ where: { actorUserId: ceo.id, action: 'auth.2fa_enrolment_required' } })).toBe(1)
  })

  it('a wrong password never reveals whether two-factor is required', async () => {
    process.env.REQUIRE_TWO_FACTOR_ROLES = 'CEO_ADMIN'
    const u = await mk('wrongpw', 'CEO_ADMIN')
    expect(await attempt(u.email, 'not-the-password-123')).toEqual({ status: 401, code: undefined })
  })

  it('roles that are not listed are unaffected', async () => {
    process.env.REQUIRE_TWO_FACTOR_ROLES = 'CEO_ADMIN,CTO'
    const op = await mk('operator', 'OPERATOR')
    expect((await attempt(op.email)).status).toBe(200)
  })

  it('an enrolled privileged account needs a valid code: none, wrong and right', async () => {
    process.env.REQUIRE_TWO_FACTOR_ROLES = 'CEO_ADMIN'
    const u = await mk('enrolled', 'CEO_ADMIN')
    const { secret } = await beginSetup(u.id)
    const t0 = Date.now() - 60_000 // the confirming code's step is consumed, so sign-in codes must come from a later step
    const { recoveryCodes } = await confirmEnable(u.id, totpAt(secret, t0), t0)
    expect(await attempt(u.email)).toEqual({ status: 401, code: 'TWO_FACTOR_REQUIRED' })
    expect(await attempt(u.email, PW, '000000')).toEqual({ status: 401, code: 'TWO_FACTOR_REQUIRED' })
    expect((await attempt(u.email, PW, totpAt(secret, Date.now()))).status).toBe(200)
    // a recovery code works once and is then spent
    expect((await attempt(u.email, PW, recoveryCodes[0]!)).status).toBe(200)
    expect(await attempt(u.email, PW, recoveryCodes[0]!)).toEqual({ status: 401, code: 'TWO_FACTOR_REQUIRED' })
    expect(await db.auditLog.count({ where: { actorUserId: u.id, action: 'auth.2fa_recovery_code_used' } })).toBe(1)
  })
})
