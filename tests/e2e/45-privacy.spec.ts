import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant, sharedAdminContext } from './helpers'

test.describe('privacy requests over HTTP', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('pva'); b = await seedIsolatedTenant('pvb')
    const c = await db.conversation.create({ data: { tenantId: a.tenantId, externalUserId: 'e2e-subject-42', state: 'CLOSED', closedAt: new Date() } })
    await db.message.create({ data: { tenantId: a.tenantId, conversationId: c.id, direction: 'INBOUND', status: 'RECEIVED', content: 'my private words', externalMessageId: `pv-${Date.now()}` } })
  })
  test.afterAll(async () => { await db.dataRequest.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } }); await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId) })

  test('a client raises a request for its own end user; only the CEO executes it, with the matching id', async () => {
    for (const ctx of [a.operatorCtx, a.managerCtx]) expect((await ctx.post('/api/v1/client/data-requests', { data: { kind: 'ERASURE', subjectRef: 'x' } })).status()).toBe(403)
    for (const ctx of [a.clientCtx, a.managerCtx, a.operatorCtx]) expect((await ctx.get('/api/v1/admin/privacy/requests')).status()).toBe(403)
    const created = await a.clientCtx.post('/api/v1/client/data-requests', { data: { kind: 'ERASURE', subjectRef: 'e2e-subject-42' } })
    expect(created.status()).toBe(200)
    const id = (await created.json()).data.id
    expect((await b.clientCtx.get('/api/v1/client/data-requests').then((r) => r.json())).data).toEqual([]) // another client sees nothing
    const mine = (await a.clientCtx.get('/api/v1/client/data-requests').then((r) => r.json())).data
    expect(mine).toHaveLength(1); expect(JSON.stringify(mine)).not.toContain('e2e-subject-42')
    expect((await a.clientCtx.post(`/api/v1/admin/privacy/requests/${id}/execute`, { data: { subjectRef: 'e2e-subject-42' } })).status()).toBe(403)

    const admin = await sharedAdminContext()
    expect((await admin.post(`/api/v1/admin/privacy/requests/${id}/execute`, { data: { subjectRef: 'wrong-id' } })).status()).toBe(400)
    const done = await admin.post(`/api/v1/admin/privacy/requests/${id}/execute`, { data: { subjectRef: 'e2e-subject-42' } })
    expect(done.status()).toBe(200)
    expect((await db.message.findFirstOrThrow({ where: { tenantId: a.tenantId } })).content).toBe('[removed]')
    expect((await admin.post(`/api/v1/admin/privacy/requests/${id}/execute`, { data: { subjectRef: 'e2e-subject-42' } })).status()).toBe(409)
  })

  test('retention policy: CEO only, dry run by default, bounds enforced', async () => {
    const admin = await sharedAdminContext()
    expect((await a.managerCtx.put('/api/v1/admin/privacy/policy', { data: { tenantId: a.tenantId, messageRetentionDays: 90 } })).status()).toBe(403)
    expect((await admin.put('/api/v1/admin/privacy/policy', { data: { tenantId: a.tenantId, messageRetentionDays: 2 } })).status()).toBe(400)
    expect((await admin.put('/api/v1/admin/privacy/policy', { data: { tenantId: a.tenantId, messageRetentionDays: 90, regulations: ['GDPR'], dataRegion: 'EU' } })).status()).toBe(200)
    const dry = await (await admin.post('/api/v1/admin/privacy/retention', { data: { tenantId: a.tenantId } })).json()
    expect(dry.data.dryRun).toBe(true)
    expect((await a.managerCtx.post('/api/v1/admin/privacy/retention', { data: { tenantId: a.tenantId, dryRun: false } })).status()).toBe(403)
  })
})
