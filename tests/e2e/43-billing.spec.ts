import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant, sharedAdminContext } from './helpers'

test.describe('billing and invoices', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('bila'); b = await seedIsolatedTenant('bilb')
    const conv = await db.conversation.create({ data: { tenantId: a.tenantId, externalUserId: 'bill-x', state: 'ACTIVE' } })
    const when = new Date(Date.now() - 5 * 86_400_000)
    for (let i = 0; i < 3; i++) {
      const m = await db.message.create({ data: { tenantId: a.tenantId, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'x', externalMessageId: `bill-${Date.now()}-${i}`, createdAt: when } })
      await db.usageRecord.create({ data: { tenantId: a.tenantId, messageId: m.id, eventType: 'message_processed', priceEurCents: 14, operatorCostEurCents: 6, idempotencyKey: `bill-${m.id}`, source: 'test', createdAt: when } })
    }
  })
  test.afterAll(async () => {
    await db.invoice.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('only the CEO bills; a client sees only its own issued invoices', async () => {
    const admin = await sharedAdminContext()
    for (const ctx of [a.managerCtx, a.operatorCtx, a.clientCtx]) {
      expect((await ctx.get(`/api/v1/admin/billing/settings?tenantId=${a.tenantId}`)).status()).toBe(403)
      expect((await ctx.post('/api/v1/admin/billing/invoices', { data: { tenantId: a.tenantId, periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-02-01T00:00:00Z' } })).status()).toBe(403)
    }
    expect((await admin.put('/api/v1/admin/billing/settings', { data: { tenantId: a.tenantId, vatRatePercent: 22, paymentTermsDays: 14 } })).status()).toBe(200)
    expect((await admin.put('/api/v1/admin/billing/settings', { data: { tenantId: a.tenantId, vatRatePercent: 99 } })).status()).toBe(400)
    const from = new Date(Date.now() - 10 * 86_400_000).toISOString(); const to = new Date(Date.now() - 1 * 86_400_000).toISOString()
    const draft = await admin.post('/api/v1/admin/billing/invoices', { data: { tenantId: a.tenantId, periodStart: from, periodEnd: to } })
    expect(draft.status()).toBe(200)
    const inv = (await draft.json()).data
    expect(inv).toMatchObject({ status: 'DRAFT', subtotalEurCents: 42, totalEurCents: 51 })

    expect((await a.clientCtx.get('/api/v1/client/invoices').then((r) => r.json())).data).toEqual([]) // drafts are invisible to the client
    const issued = await (await admin.post(`/api/v1/admin/billing/invoices/${inv.id}/issue`, { data: {} })).json()
    expect(issued.data.number).toMatch(/^GCO-\d{4}-\d{4}$/)
    const mine = (await a.clientCtx.get('/api/v1/client/invoices').then((r) => r.json())).data
    expect(mine).toHaveLength(1)
    expect(mine[0]).not.toHaveProperty('createdByUserId')
    expect((await b.clientCtx.get('/api/v1/client/invoices').then((r) => r.json())).data).toEqual([]) // another client sees nothing
    for (const ctx of [a.operatorCtx, a.managerCtx]) expect((await ctx.get('/api/v1/client/invoices')).status()).toBe(403)
    expect((await a.clientCtx.get(`/api/v1/admin/billing/invoices/${inv.id}`)).status()).toBe(403)

    const rec = await admin.get(`/api/v1/admin/billing/reconciliation?tenantId=${a.tenantId}&from=${from}&to=${to}`)
    expect((await rec.json()).data.clientBilling.invoicedSubtotalEurCents).toBe(42)
    expect((await admin.get(`/api/v1/admin/billing/reconciliation?tenantId=${a.tenantId}`)).status()).toBe(400)
    expect((await admin.post(`/api/v1/admin/billing/invoices/${inv.id}/pay`, { data: { reference: 'SEPA-9' } })).status()).toBe(200)
    expect((await admin.post(`/api/v1/admin/billing/invoices/${inv.id}/void`, { data: { reason: 'too late to void a paid invoice' } })).status()).toBe(409)
  })
})
