import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant, sharedAdminContext } from './helpers'

test.describe('client requests, account thread, notifications and alert routes', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { a = await seedIsolatedTenant('rqa'); b = await seedIsolatedTenant('rqb') })
  test.afterAll(async () => {
    await db.notification.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } }); await db.clientMessage.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } }); await db.clientRequest.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('client raises a request, the manager answers, another client sees nothing', async () => {
    for (const ctx of [a.operatorCtx, a.managerCtx]) expect((await ctx.post('/api/v1/client/requests', { data: { kind: 'MESSAGE', subject: 'hi', body: 'hello' } })).status()).toBe(403)
    expect((await a.operatorCtx.get('/api/v1/client-requests')).status()).toBe(403)
    expect((await a.clientCtx.get('/api/v1/client-requests')).status()).toBe(403)
    const created = await a.clientCtx.post('/api/v1/client/requests', { data: { kind: 'WORKFLOW_CHANGE', subject: 'Escalate refunds over 100', body: 'Please escalate any refund above 100 EUR.' } })
    expect(created.status()).toBe(200)
    const id = (await created.json()).data.id
    const inbox = (await (await a.managerCtx.get('/api/v1/client-requests')).json()).data as { id: string }[]
    expect(inbox.map((r) => r.id)).toContain(id)
    expect((await (await b.managerCtx.get('/api/v1/client-requests')).json()).data.map((r: { id: string }) => r.id)).not.toContain(id)
    expect((await b.managerCtx.post(`/api/v1/client-requests/${id}/messages`, { data: { body: 'not mine' } })).status()).toBeGreaterThanOrEqual(403)
    expect((await b.clientCtx.get(`/api/v1/client/requests/${id}/messages`)).status()).toBe(404)
    expect((await a.managerCtx.post(`/api/v1/client-requests/${id}/messages`, { data: { body: 'Noted, we will configure it.' } })).status()).toBe(200)
    expect((await a.managerCtx.patch(`/api/v1/client-requests/${id}/messages`, { data: { status: 'DECLINED' } })).status()).toBe(400) // needs a reason
    expect((await a.managerCtx.patch(`/api/v1/client-requests/${id}/messages`, { data: { status: 'IN_PROGRESS' } })).status()).toBe(200)
    const t = (await (await a.clientCtx.get(`/api/v1/client/requests/${id}/messages`)).json()).data
    expect(t.messages.map((m: { fromClient: boolean }) => m.fromClient)).toEqual([true, false]); expect(t.request.status).toBe('IN_PROGRESS')
    expect(JSON.stringify(t)).not.toContain('authorUserId')
    const n = (await (await a.clientCtx.get('/api/v1/notifications')).json()).data
    expect(n.unread).toBeGreaterThan(0)
    expect((await a.clientCtx.post('/api/v1/notifications/read', { data: {} })).status()).toBe(200)
    expect((await (await a.clientCtx.get('/api/v1/notifications')).json()).data.unread).toBe(0)
    expect((await (await b.clientCtx.get('/api/v1/notifications')).json()).data.notifications).toEqual([]) // only your own
  })

  test('alert routing is CEO configurable and limited to leadership roles', async () => {
    const admin = await sharedAdminContext()
    for (const ctx of [a.managerCtx, a.operatorCtx, a.clientCtx]) expect((await ctx.get('/api/v1/admin/alert-routes')).status()).toBe(403)
    expect((await admin.put('/api/v1/admin/alert-routes', { data: { role: 'CLIENT', minSeverity: 'info', enabled: true } })).status()).toBe(400)
    expect((await admin.put('/api/v1/admin/alert-routes', { data: { role: 'OPERATOR', minSeverity: 'info', enabled: true } })).status()).toBe(400)
    const routes = (await (await admin.get('/api/v1/admin/alert-routes')).json()).data as { role: string }[]
    expect(routes.map((r) => r.role)).toEqual(expect.arrayContaining(['CEO_ADMIN', 'MANAGER', 'SUPERVISOR', 'CTO']))
  })
})
