import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant, sharedAdminContext } from './helpers'

// The productivity report and the client-tool ticket counts over real HTTP: who may read or write them, and client isolation.
test.describe('productivity report and ticket counts', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { a = await seedIsolatedTenant('pra'); b = await seedIsolatedTenant('prb') })
  test.afterAll(async () => {
    await db.externalTicketCount.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('managers read their own client only; operators and clients are refused', async () => {
    expect((await a.operatorCtx.get('/api/v1/reports/productivity')).status()).toBe(403)
    expect((await a.clientCtx.get('/api/v1/reports/productivity')).status()).toBe(403)
    expect((await b.managerCtx.get(`/api/v1/reports/productivity?tenantId=${a.tenantId}`)).status()).toBe(403)
    expect((await a.managerCtx.get('/api/v1/reports/productivity?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z')).status()).toBe(400) // longer than 93 days
    const r = await a.managerCtx.get('/api/v1/reports/productivity')
    expect(r.status()).toBe(200)
    const d = (await r.json()).data
    expect(d.operators.length).toBeGreaterThan(0)
    expect(d.totals).toHaveProperty('secondsSavedPerReply')
    expect(d.aiDrafts).toHaveProperty('usedUnchanged')
  })

  test('only the CEO records ticket counts from the client tool; entries are listed and can be deleted', async () => {
    const admin = await sharedAdminContext()
    const body = { tenantId: a.tenantId, periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z', count: 120, source: 'Zendesk report' }
    expect((await a.managerCtx.post('/api/v1/admin/billing/ticket-counts', { data: body })).status()).toBe(403)
    expect((await a.clientCtx.post('/api/v1/admin/billing/ticket-counts', { data: body })).status()).toBe(403)
    expect((await admin.post('/api/v1/admin/billing/ticket-counts', { data: { ...body, count: -1 } })).status()).toBe(400)
    const created = await admin.post('/api/v1/admin/billing/ticket-counts', { data: body })
    expect(created.status()).toBe(200)
    const id = (await created.json()).data.id
    const list = (await (await admin.get(`/api/v1/admin/billing/ticket-counts?tenantId=${a.tenantId}`)).json()).data
    expect(list.map((x: { id: string }) => x.id)).toContain(id)
    expect((await a.managerCtx.delete(`/api/v1/admin/billing/ticket-counts/${id}`)).status()).toBe(403)
    expect((await admin.delete(`/api/v1/admin/billing/ticket-counts/${id}`)).status()).toBe(200)
    // Billing settings accept the new model and fields
    const put = await admin.put('/api/v1/admin/billing/settings', { data: { tenantId: a.tenantId, billingModel: 'HOURLY_PLUS_TICKETS', includedTicketsPerPeriod: 300, pricePerModeratedItemEurCents: 30 } })
    expect(put.status()).toBe(200)
    expect((await put.json()).data).toMatchObject({ billingModel: 'HOURLY_PLUS_TICKETS', includedTicketsPerPeriod: 300, pricePerModeratedItemEurCents: 30 })
  })
})
