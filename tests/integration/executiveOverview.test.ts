import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { computeExecutive, executiveSearch } from '@/lib/executive/overview'
import { syncEarnings, createRateCard } from '@/lib/earnings/ledger'

describe('executive overview (real database)', () => {
  const base = `ex-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const D = 86_400_000

  afterAll(async () => {
    const ops = (await db.operator.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((o) => o.id)
    await db.operatorEarningLine.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorRateCard.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.usageRecord.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('shows per-client revenue, operator cost and margin from the ledgers, and company totals include them', async () => {
    const t = (await db.tenant.create({ data: { name: `[TEST] ${base} Profit Co`, slug: `${base}-p`, industry: 'GAMING' } })); tenantIds.push(t.id)
    const u = await db.user.create({ data: { email: `${base}-op@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId: t.id, displayName: 'op' } }); userIds.push(u.id)
    const op = await db.operator.create({ data: { userId: u.id, tenantId: t.id, status: 'AVAILABLE', capacity: 3 } })
    await createRateCard({ tenantId: t.id, amountEurCents: 6, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 20 * D), actorUserId: 'x' })
    const conv = await db.conversation.create({ data: { tenantId: t.id, externalUserId: `${base}-c`, state: 'ACTIVE' } })
    const at = new Date(Date.now() - 2 * D)
    for (let i = 0; i < 5; i++) {
      const m = await db.message.create({ data: { tenantId: t.id, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'x', operatorId: op.id, externalMessageId: `${base}-${i}`, createdAt: at } })
      await db.usageRecord.create({ data: { tenantId: t.id, messageId: m.id, eventType: 'message_processed', priceEurCents: 14, operatorCostEurCents: 6, idempotencyKey: `${base}-${m.id}`, source: 'test', createdAt: at } })
    }
    await syncEarnings(op.id)
    await db.invoice.create({ data: { tenantId: t.id, periodStart: new Date(Date.now() - 30 * D), periodEnd: new Date(Date.now() - 3 * D), status: 'ISSUED', number: `T-${base}`, billingModel: 'PER_MESSAGE', lines: [], subtotalEurCents: 70, vatRatePercent: 22, vatEurCents: 15, totalEurCents: 85, createdByUserId: 'x' } })

    const r = await computeExecutive(new Date(Date.now() - 10 * D), new Date())
    const row = r.clients.find((c) => c.tenantId === t.id)!
    expect(row).toMatchObject({ billableMessages: 5, billedEurCents: 70, operatorOwedEurCents: 30, marginEurCents: 40, marginPercent: 57.1, invoicedOutstandingEurCents: 85, operators: 1, activeConversations: 1, industry: 'GAMING' })
    expect(r.totals.revenueEurCents).toBeGreaterThanOrEqual(70)
    expect(r.capacity.totalSlots).toBeGreaterThanOrEqual(3)
    expect(r.series.length).toBeGreaterThan(0)
    expect(r.projection.projectedMonthRevenueEurCents).toBeGreaterThanOrEqual(0)
    // outside the period the client shows nothing
    const empty = (await computeExecutive(new Date(Date.now() - 60 * D), new Date(Date.now() - 40 * D))).clients.find((c) => c.tenantId === t.id)!
    expect(empty).toMatchObject({ billedEurCents: 0, operatorOwedEurCents: 0, marginPercent: null })

    const hits = await executiveSearch('Profit Co')
    expect(hits.map((h) => h.type)).toContain('client')
    expect(await executiveSearch('x')).toEqual([]) // too short
    expect((await executiveSearch(`T-${base}`))[0]).toMatchObject({ type: 'invoice' })
  })
})
