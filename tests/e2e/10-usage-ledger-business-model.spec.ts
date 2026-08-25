import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant, sharedAdminContext } from './helpers'
import { db } from '@/lib/db/client'

// Validates the usage ledger against the EXACT business model from the
// product spec: €0.14/message client price, €0.06/message operator cost,
// €0.08/message gross margin, 5% of gross margin as founder revenue share
// (= €0.004/message). This is what "the usage ledger provides reliable
// auditable data" has to mean in practice - not just "a number exists",
// but "the number is exactly right against the stated pricing model."
test.describe('usage ledger - business model validation', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('usage-ledger')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('default tenant pricing matches the stated business model exactly', async () => {
    const t = await db.tenant.findUniqueOrThrow({ where: { id: tenant.tenantId } })
    expect(t.pricePerMessageEurCents).toBe(14) // €0.14
    expect(t.operatorCostPerMessageEurCents).toBe(6) // €0.06
    // Gross margin is derived, not stored - verify the arithmetic here once,
    // the ledger math is verified against real records below.
    expect(t.pricePerMessageEurCents - t.operatorCostPerMessageEurCents).toBe(8) // €0.08
  })

  test('N processed messages produce exactly N usage records with correct price/cost/margin/founder-share totals', async () => {
    const messageCount = 5
    for (let i = 0; i < messageCount; i++) {
      const res = await sendWebhook(tenant.integrationId, [
        { event_id: `ev-usage-${i}`, message_id: `msg-usage-${i}`, user_id: `user-usage-${i}`, text: `message ${i}` },
      ])
      expect(res.status()).toBe(202)
    }

    const settled = await waitFor(async () => {
      const count = await db.usageRecord.count({ where: { tenantId: tenant.tenantId } })
      return count === messageCount
    })
    expect(settled).toBe(true)

    // Every record traces back to a real message - auditable, not synthetic.
    const records = await db.usageRecord.findMany({ where: { tenantId: tenant.tenantId } })
    for (const r of records) {
      expect(r.billable).toBe(true)
      expect(r.priceEurCents).toBe(14)
      expect(r.operatorCostEurCents).toBe(6)
      expect(r.source).toBe('webhook')
      expect(r.idempotencyKey).toBe(`usage:${r.messageId}`)
      const message = await db.message.findUnique({ where: { id: r.messageId } })
      expect(message).toBeTruthy()
      expect(message!.tenantId).toBe(tenant.tenantId)
    }

    // Now verify the API-level aggregation (what a real invoice/report would use).
    const admin = await sharedAdminContext()
    const from = new Date(Date.now() - 60_000).toISOString()
    const to = new Date(Date.now() + 60_000).toISOString()
    const res = await admin.get(`/api/v1/usage/summary?tenantId=${tenant.tenantId}&from=${from}&to=${to}`)
    expect(res.ok()).toBe(true)
    const summary = (await res.json()).data

    expect(summary.messageCount).toBe(messageCount)
    expect(summary.totalPriceEur).toBeCloseTo(messageCount * 0.14, 5)
    expect(summary.totalOperatorCostEur).toBeCloseTo(messageCount * 0.06, 5)
    expect(summary.grossMarginEur).toBeCloseTo(messageCount * 0.08, 5)
    // 5% of gross margin = €0.004/message
    expect(summary.founderRevenueShareEur).toBeCloseTo(messageCount * 0.004, 5)
  })

  test('a MANAGER (no VIEW_REVENUE permission) sees message counts but never margin/founder-share figures', async () => {
    const res = await tenant.managerCtx.get('/api/v1/usage/summary')
    expect(res.ok()).toBe(true)
    const summary = (await res.json()).data
    expect(summary.messageCount).toBeGreaterThanOrEqual(0)
    expect(summary.totalOperatorCostEur).toBeUndefined()
    expect(summary.grossMarginEur).toBeUndefined()
    expect(summary.founderRevenueShareEur).toBeUndefined()
  })

  test('a duplicate webhook delivery does not inflate the business numbers', async () => {
    const before = await db.usageRecord.count({ where: { tenantId: tenant.tenantId } })
    const events = [{ event_id: 'ev-usage-dup', message_id: 'msg-usage-dup', user_id: 'user-usage-dup', text: 'dup check' }]

    await sendWebhook(tenant.integrationId, events)
    await waitFor(async () => (await db.usageRecord.count({ where: { tenantId: tenant.tenantId } })) === before + 1)
    await sendWebhook(tenant.integrationId, events) // exact duplicate
    await new Promise((r) => setTimeout(r, 500))

    const after = await db.usageRecord.count({ where: { tenantId: tenant.tenantId } })
    expect(after).toBe(before + 1) // not before + 2
  })
})
