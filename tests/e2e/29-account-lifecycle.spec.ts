import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { db } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { upsertStaffAccount, disableDemoAccounts } from '@/lib/auth/staffAccounts'

// Account lifecycle against the REAL server: a disabled account cannot sign in or refresh, a rotated password ends old
// sessions, and neither touches anyone else. Fixtures only - never the real demo accounts.
test.describe('account lifecycle (disable + rotate)', () => {
  const stamp = Date.now()
  const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  const PW1 = 'First-Fixture-Passphrase-1'
  const PW2 = 'Second-Fixture-Passphrase-2'
  const ids: string[] = []
  const login = async (email: string, password: string) => {
    const ctx = await request.newContext({ baseURL: BASE })
    const res = await ctx.post('/api/v1/auth/login', { data: { email, password }, headers: { 'x-forwarded-for': `acct-${Math.random()}` } })
    return { ctx, status: res.status() }
  }
  const mkUser = async (tag: string) => {
    const email = `${tag}-${stamp}@acct-${tag}-${stamp}.test`
    const r = await upsertStaffAccount(db, { email, displayName: tag, role: 'HUNTER', passwordHash: await hashPassword(PW1) })
    ids.push(r.userId!)
    return { id: r.userId!, email, domain: `@acct-${tag}-${stamp}.test` }
  }

  test.afterAll(async () => {
    await db.session.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { resourceId: { in: ids } } })
    await db.hunterProfile.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  })

  test('a DISABLED account: sign-in refused, existing session cannot refresh; an unrelated account is unaffected', async () => {
    const victim = await mkUser('victim')
    const bystander = await mkUser('bystander')
    const v = await login(victim.email, PW1)
    const b = await login(bystander.email, PW1)
    expect([v.status, b.status]).toEqual([200, 200])
    expect((await v.ctx.post('/api/v1/auth/refresh')).status()).toBe(200) // a live session refreshes

    const report = await disableDemoAccounts(db, { expected: [{ id: victim.id, email: victim.email, role: 'HUNTER', tenantId: null }], requireReplacement: false, demoEmailDomain: victim.domain })
    expect(report).toMatchObject({ disabled: 1, sessionsRevoked: 1 })

    expect((await login(victim.email, PW1)).status).toBe(401) // cannot sign in, and indistinguishable from a wrong password
    expect((await v.ctx.post('/api/v1/auth/refresh')).status()).toBe(401) // the old refresh token no longer works
    expect((await b.ctx.post('/api/v1/auth/refresh')).status()).toBe(200) // someone else's session is untouched
    expect((await login(bystander.email, PW1)).status).toBe(200)
    expect(await db.user.count({ where: { id: victim.id } })).toBe(1) // disabled, not deleted
  })

  test('a password ROTATION ends every older session; the old password stops working, the new one works', async () => {
    const u = await mkUser('rotate')
    const before = await login(u.email, PW1)
    expect(before.status).toBe(200)
    expect((await before.ctx.post('/api/v1/auth/refresh')).status()).toBe(200)

    await upsertStaffAccount(db, { email: u.email, displayName: 'rotate', role: 'HUNTER', passwordHash: await hashPassword(PW2), updatePassword: true })

    expect((await before.ctx.post('/api/v1/auth/refresh')).status()).toBe(401) // old session revoked
    expect((await login(u.email, PW1)).status).toBe(401) // old password refused
    expect((await login(u.email, PW2)).status).toBe(200) // new password works
  })
})
