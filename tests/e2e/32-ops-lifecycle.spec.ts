import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { anonymousContext, cleanupTenant, loginAs, seedIsolatedTenant, sendWebhook, sharedAdminContext, waitFor } from './helpers'

// Conversation lifecycle, history, alerts, client report, tenant settings and password change - through the real API.
test.describe('operations: lifecycle, history, alerts, reports, settings', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let other: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let convId = ''
  test.beforeAll(async () => { t = await seedIsolatedTenant('ops'); other = await seedIsolatedTenant('ops-other') })
  test.afterAll(async () => { await db.qaReview.deleteMany({ where: { tenantId: { in: [t.tenantId, other.tenantId] } } }); await cleanupTenant(t.tenantId); await cleanupTenant(other.tenantId) })

  test('operator resolves an assigned conversation; manager searches it, reads the transcript, reopens it; roles and tenants are enforced', async () => {
    const res = await sendWebhook(t.integrationId, [{ event_id: 'ops-ev-1', message_id: 'ops-m-1', user_id: 'ops-customer-parcel', text: 'Where is parcel 55501?' }])
    expect(res.status()).toBe(202)
    await waitFor(async () => !!(await db.conversation.findFirst({ where: { tenantId: t.tenantId, externalUserId: 'ops-customer-parcel', currentAssignmentId: { not: null } } })))
    convId = (await db.conversation.findFirstOrThrow({ where: { tenantId: t.tenantId, externalUserId: 'ops-customer-parcel' } })).id

    // roles: client and anonymous cannot resolve; another tenant's operator/manager cannot see it
    expect((await t.clientCtx.post(`/api/v1/conversations/${convId}/resolve`)).status()).toBe(403)
    expect((await (await anonymousContext()).post(`/api/v1/conversations/${convId}/resolve`)).status()).toBe(401)
    expect((await other.operatorCtx.post(`/api/v1/conversations/${convId}/resolve`)).status()).toBe(404)
    expect((await other.managerCtx.get(`/api/v1/conversations/${convId}/transcript`)).status()).toBe(404)

    // note by the assigned operator
    const note = await t.operatorCtx.post(`/api/v1/conversations/${convId}/notes`, { data: { body: 'Customer is waiting for a courier call-back' } })
    expect(note.status()).toBe(201)
    expect((await t.operatorCtx.post(`/api/v1/conversations/${convId}/notes`, { data: { body: '' } })).status()).toBe(400)
    expect((await t.clientCtx.post(`/api/v1/conversations/${convId}/notes`, { data: { body: 'x' } })).status()).toBe(403)

    // supervisor-only history
    expect((await t.operatorCtx.get('/api/v1/conversations/search?q=parcel')).status()).toBe(403)
    expect((await t.clientCtx.get('/api/v1/conversations/search?q=parcel')).status()).toBe(403)
    const found = await (await t.managerCtx.get('/api/v1/conversations/search?q=parcel%2055501')).json()
    expect(found.data.map((c: { id: string }) => c.id)).toContain(convId)
    const otherSees = await (await other.managerCtx.get('/api/v1/conversations/search?q=parcel%2055501')).json()
    expect(otherSees.data).toHaveLength(0)
    const transcript = await (await t.managerCtx.get(`/api/v1/conversations/${convId}/transcript`)).json()
    expect(transcript.data.messages[0].content).toBe('Where is parcel 55501?')
    expect(transcript.data.notes[0].body).toContain('courier call-back')

    // resolve, then reopen (operator cannot reopen)
    expect((await t.operatorCtx.post(`/api/v1/conversations/${convId}/resolve`)).status()).toBe(200)
    expect((await t.operatorCtx.post(`/api/v1/conversations/${convId}/resolve`)).status()).toBe(409)
    expect((await db.conversation.findUniqueOrThrow({ where: { id: convId } })).state).toBe('CLOSED')
    expect((await t.operatorCtx.post(`/api/v1/conversations/${convId}/reopen`)).status()).toBe(403)
    expect((await other.managerCtx.post(`/api/v1/conversations/${convId}/reopen`)).status()).toBe(404)
    const re = await t.managerCtx.post(`/api/v1/conversations/${convId}/reopen`)
    expect(re.status()).toBe(200)
    expect((await db.conversation.findUniqueOrThrow({ where: { id: convId } })).closedAt).toBeNull()
    expect(await db.auditLog.count({ where: { tenantId: t.tenantId, resourceId: convId, action: { in: ['conversation.resolved', 'conversation.reopened', 'conversation.note_added'] } } })).toBe(3)
  })

  test('alerts are for supervisors only', async () => {
    const r = await t.managerCtx.get('/api/v1/ops/alerts')
    expect(r.status()).toBe(200)
    expect(Array.isArray((await r.json()).data)).toBe(true)
    for (const ctx of [t.operatorCtx, t.clientCtx]) expect((await ctx.get('/api/v1/ops/alerts')).status()).toBe(403)
    expect((await (await anonymousContext()).get('/api/v1/ops/alerts')).status()).toBe(401)
  })

  test('client report: the client sees only its own tenant, with no internal names or notes', async () => {
    const r = await t.clientCtx.get('/api/v1/reports/client?days=7')
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.data.totals.conversationsStarted).toBeGreaterThanOrEqual(1)
    expect(body.data.conversationsPerDay).toHaveLength(7)
    const text = JSON.stringify(body)
    expect(text).not.toContain('courier call-back')
    expect(text).not.toContain(t.operatorEmail)
    // a client asking for another tenant is still pinned to its own
    const pinned = await (await other.clientCtx.get(`/api/v1/reports/client?days=7&tenantId=${t.tenantId}`)).json()
    expect(pinned.data.totals.conversationsStarted).toBe(0)
    expect((await t.operatorCtx.get('/api/v1/reports/client')).status()).toBe(403)
    expect((await t.clientCtx.get('/api/v1/reports/client?days=500')).status()).toBe(400)
  })

  test('tenant settings: readable by manager/client, changeable only by CEO/assistant, validated and audited', async () => {
    expect((await t.managerCtx.get('/api/v1/tenant/settings')).status()).toBe(200)
    expect((await t.clientCtx.get('/api/v1/tenant/settings')).status()).toBe(200)
    expect((await t.operatorCtx.get('/api/v1/tenant/settings')).status()).toBe(403)
    expect((await t.managerCtx.patch('/api/v1/tenant/settings', { data: { responseSlaSeconds: 300 } })).status()).toBe(403)
    expect((await t.clientCtx.patch('/api/v1/tenant/settings', { data: { responseSlaSeconds: 300 } })).status()).toBe(403)
    const admin = await sharedAdminContext()
    const patch = (data: Record<string, unknown>) => admin.patch('/api/v1/tenant/settings', { data: { tenantId: t.tenantId, ...data } })
    expect((await patch({ responseSlaSeconds: 5 })).status()).toBe(400)
    expect((await patch({ operatorCapacity: 0 })).status()).toBe(400)
    expect((await patch({ timezone: 'Mars/Olympus' })).status()).toBe(400)
    expect((await patch({ operatingHours: { mon: { open: '18:00', close: '09:00' } } })).status()).toBe(400)
    expect((await patch({ bogus: 1 })).status()).toBe(400)
    expect((await patch({})).status()).toBe(400)
    const ok = await patch({ responseSlaSeconds: 300, operatorCapacity: 3, timezone: 'Europe/Dublin', operatingHours: { mon: { open: '09:00', close: '17:00' } } })
    expect(ok.status()).toBe(200)
    const row = await db.tenant.findUniqueOrThrow({ where: { id: t.tenantId } })
    expect(row).toMatchObject({ defaultResponseSlaSeconds: 300, defaultOperatorCapacity: 3, timezone: 'Europe/Dublin' })
    expect(await db.auditLog.count({ where: { tenantId: t.tenantId, action: 'tenant.settings_changed' } })).toBe(1)
    // a CEO cannot be tricked into editing a tenant that does not exist
    expect((await admin.patch('/api/v1/tenant/settings', { data: { tenantId: 'no-such-tenant', responseSlaSeconds: 300 } })).status()).toBe(404)
  })

  test('change password: needs the current password, enforces policy, rotates the hash, signs out other sessions', async () => {
    const email = t.managerEmail
    const A = await loginAs(email)
    const B = await loginAs(email)
    expect((await (await anonymousContext()).post('/api/v1/auth/change-password', { data: { currentPassword: 'x', newPassword: 'y' } })).status()).toBe(401)
    const change = (ctx: typeof A, currentPassword: string, newPassword: string) => ctx.post('/api/v1/auth/change-password', { data: { currentPassword, newPassword } })
    expect((await change(B, 'wrong-current-password', 'Blue-Harbor-Lantern-77')).status()).toBe(400)
    expect((await change(B, 'DemoPassword123!', 'DemoPassword123!')).status()).toBe(400) // same
    expect((await change(B, 'DemoPassword123!', 'short')).status()).toBe(400) // policy
    const before = (await db.user.findUniqueOrThrow({ where: { email } })).passwordHash
    const done = await change(B, 'DemoPassword123!', 'Blue-Harbor-Lantern-77')
    expect(done.status()).toBe(200)
    const after = (await db.user.findUniqueOrThrow({ where: { email } })).passwordHash
    expect(after).not.toBe(before)
    expect(after).toMatch(/^\$2[aby]\$12\$/)
    // old password no longer works, the new one does
    const anon = await anonymousContext()
    expect((await anon.post('/api/v1/auth/login', { data: { email, password: 'DemoPassword123!' }, headers: { 'x-forwarded-for': `cp-old-${Date.now()}` } })).status()).toBe(401)
    expect((await anon.post('/api/v1/auth/login', { data: { email, password: 'Blue-Harbor-Lantern-77' }, headers: { 'x-forwarded-for': `cp-new-${Date.now()}` } })).status()).toBe(200)
    // the other session was signed out, the one that changed the password was not
    expect((await A.post('/api/v1/auth/refresh')).status()).toBe(401)
    expect((await B.post('/api/v1/auth/refresh')).status()).toBe(200)
    // the audit entry never contains either password
    const audit = await db.auditLog.findMany({ where: { action: 'auth.password_changed', tenantId: t.tenantId } })
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit)).not.toContain('Blue-Harbor')
  })
})
