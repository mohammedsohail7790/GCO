import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { anonymousContext, cleanupTenant, loginAs, seedIsolatedTenant, sharedAdminContext } from './helpers'

const tokenOf = (url: string) => /#token=([0-9a-f]{64})$/.exec(url)![1]!
const PASSWORD = 'Meadow-Copper-Lantern-2026'

// The whole path: CEO invites -> person opens the one-time link and chooses their own password -> signs in with the right role.
test.describe('staff invitations: operators and managers choose their own password', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const stamp = Date.now()
  test.beforeAll(async () => { t = await seedIsolatedTenant('invite') })
  test.afterAll(async () => { await db.staffInvitation.deleteMany({ where: { tenantId: t.tenantId } }); await cleanupTenant(t.tenantId) })

  test('only CEO/assistant can invite or list; everyone else is refused', async () => {
    const body = { tenantId: t.tenantId, email: `nope-${stamp}@e2e.gco`, displayName: 'No', role: 'OPERATOR' }
    for (const ctx of [t.managerCtx, t.operatorCtx, t.clientCtx, await anonymousContext()]) {
      const r = await ctx.post('/api/v1/admin/staff-invitations', { data: body })
      expect([401, 403]).toContain(r.status())
      expect([401, 403]).toContain((await ctx.get(`/api/v1/admin/staff-invitations?tenantId=${t.tenantId}`)).status())
    }
    expect(await db.user.count({ where: { email: body.email } })).toBe(0)
  })

  test('operator: invite -> link -> own password -> sign in OFFLINE with languages; the link is single-use; passwords stay out of the audit trail', async () => {
    const admin = await sharedAdminContext()
    const email = `inv-op-${stamp}@e2e.gco`
    const res = await admin.post('/api/v1/admin/staff-invitations', { data: { tenantId: t.tenantId, email, displayName: 'Invited Operator', role: 'OPERATOR', languages: ['fr', 'en'] } })
    expect(res.status()).toBe(201)
    const { setupUrl, invitationId } = (await res.json()).data
    expect(setupUrl).toContain('/accept-invitation#token=')
    const token = tokenOf(setupUrl)

    // cannot sign in yet, and the unknown password is unusable
    const anon = await anonymousContext()
    expect((await anon.post('/api/v1/auth/login', { data: { email, password: PASSWORD }, headers: { 'x-forwarded-for': `inv-before-${stamp}` } })).status()).toBe(401)

    const accept = (password: string, tok = token) => anon.post('/api/v1/auth/accept-invitation', { data: { token: tok, password }, headers: { 'x-forwarded-for': `inv-accept-${Math.random()}` } })
    expect((await accept('short')).status()).toBe(400) // too short
    expect((await accept(`inv-op-${stamp}-abcdef`)).status()).toBe(400) // contains the email name: refused by the staff policy, and the link is NOT consumed
    expect((await accept(PASSWORD, '0'.repeat(64))).status()).toBe(400) // wrong token: generic failure
    const ok = await accept(PASSWORD)
    expect(ok.status()).toBe(200)
    expect((await accept('Another-Meadow-Phrase-77')).status()).toBe(400) // single use

    const op = await loginAs(email, PASSWORD)
    const me = (await (await op.get('/api/v1/auth/me')).json()).data.user
    expect(me).toMatchObject({ role: 'OPERATOR', tenantId: t.tenantId, operator: { status: 'OFFLINE', languages: ['en', 'fr'] } })
    expect((await op.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(200)

    const list = await (await admin.get(`/api/v1/admin/staff-invitations?tenantId=${t.tenantId}`)).json()
    expect(list.data.find((p: { email: string }) => p.email === email)).toMatchObject({ state: 'active', role: 'OPERATOR' })
    expect((await admin.post(`/api/v1/admin/staff-invitations/${invitationId}/reissue`)).status()).toBe(409) // already accepted
    const audit = JSON.stringify(await db.auditLog.findMany({ where: { tenantId: t.tenantId, action: { startsWith: 'staff.' } } }))
    expect(audit).not.toContain(token); expect(audit).not.toContain(PASSWORD)
  })

  test('manager: re-issuing a link kills the old one; cancelling blocks the account; validation errors', async () => {
    const admin = await sharedAdminContext()
    const email = `inv-mgr-${stamp}@e2e.gco`
    const first = (await (await admin.post('/api/v1/admin/staff-invitations', { data: { tenantId: t.tenantId, email, displayName: 'Invited Manager', role: 'MANAGER' } })).json()).data
    const reissued = (await (await admin.post(`/api/v1/admin/staff-invitations/${first.invitationId}/reissue`)).json()).data
    const anon = await anonymousContext()
    const accept = (token: string) => anon.post('/api/v1/auth/accept-invitation', { data: { token, password: PASSWORD }, headers: { 'x-forwarded-for': `inv-m-${Math.random()}` } })
    expect((await accept(tokenOf(first.setupUrl))).status()).toBe(400) // replaced link no longer works
    expect((await accept(tokenOf(reissued.setupUrl))).status()).toBe(200)
    const mgr = await loginAs(email, PASSWORD)
    expect((await mgr.get('/api/v1/auth/me').then((r) => r.json())).data.user.role).toBe('MANAGER')

    const cancelEmail = `inv-cancel-${stamp}@e2e.gco`
    const c = (await (await admin.post('/api/v1/admin/staff-invitations', { data: { tenantId: t.tenantId, email: cancelEmail, displayName: 'Cancelled', role: 'OPERATOR' } })).json()).data
    expect((await admin.post(`/api/v1/admin/staff-invitations/${c.invitationId}/cancel`)).status()).toBe(200)
    expect((await accept(tokenOf(c.setupUrl))).status()).toBe(400)
    expect((await anon.post('/api/v1/auth/login', { data: { email: cancelEmail, password: PASSWORD }, headers: { 'x-forwarded-for': `inv-c-${stamp}` } })).status()).toBe(401)

    const bad = (data: Record<string, unknown>) => admin.post('/api/v1/admin/staff-invitations', { data: { tenantId: t.tenantId, email: `bad-${Math.random()}@e2e.gco`, displayName: 'B', role: 'OPERATOR', ...data } })
    expect((await bad({ role: 'CEO_ADMIN' })).status()).toBe(400)
    expect((await bad({ role: 'CLIENT' })).status()).toBe(400)
    expect((await bad({ email: 'x@demo.gco' })).status()).toBe(400)
    expect((await bad({ extra: 1 })).status()).toBe(400)
    expect((await bad({ tenantId: 'no-such-client' })).status()).toBe(404)
    expect((await bad({ email })).status()).toBe(409) // already exists
  })
})
