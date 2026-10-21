import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { createDraftInvoice, issueInvoice, markInvoicePaid, voidInvoice, updateBillingSettings, reconcile, BillingError } from '@/lib/billing/service'

describe('invoices and reconciliation (real database)', () => {
  const base = `bi-${Date.now()}`
  const tenantIds: string[] = []
  const D = 86_400_000
  const mkTenant = async (tag: string, extra: object = {}) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}`, ...extra } }); tenantIds.push(t.id); return t.id }
  const usage = async (tenantId: string, n: number, at: Date, price = 14) => {
    const conv = await db.conversation.create({ data: { tenantId, externalUserId: `${base}-${Math.random()}`, state: 'ACTIVE' } })
    for (let i = 0; i < n; i++) {
      const m = await db.message.create({ data: { tenantId, conversationId: conv.id, direction: 'INBOUND', status: 'RECEIVED', content: 'x', externalMessageId: `${base}-${Math.random()}`, createdAt: at } })
      await db.usageRecord.create({ data: { tenantId, messageId: m.id, eventType: 'message_processed', priceEurCents: price, operatorCostEurCents: 6, idempotencyKey: `${base}-${m.id}`, source: 'test', createdAt: at } })
    }
  }

  afterAll(async () => {
    await db.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.usageRecord.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('bills the usage ledger, rejects overlaps and empty periods, and keeps history when the price changes', async () => {
    const t = await mkTenant('a')
    const start = new Date(Date.now() - 20 * D); const mid = new Date(Date.now() - 10 * D); const end = new Date(Date.now() - 1 * D)
    await usage(t, 5, new Date(start.getTime() + D))
    await expect(createDraftInvoice({ tenantId: t, periodStart: mid, periodEnd: end, actorUserId: 'u' })).rejects.toMatchObject({ status: 409 }) // nothing to bill there
    const inv = await createDraftInvoice({ tenantId: t, periodStart: start, periodEnd: mid, actorUserId: 'u' })
    expect(inv).toMatchObject({ status: 'DRAFT', number: null, subtotalEurCents: 70, vatEurCents: 15, totalEurCents: 85, vatRatePercent: 22 })
    await expect(createDraftInvoice({ tenantId: t, periodStart: new Date(start.getTime() + D), periodEnd: end, actorUserId: 'u' })).rejects.toMatchObject({ status: 409 }) // overlaps
    await updateBillingSettings(t, { pricePerMessageEurCents: 99 }, 'u')
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).subtotalEurCents).toBe(70) // the invoice is a snapshot
    await expect(createDraftInvoice({ tenantId: t, periodStart: start, periodEnd: new Date(Date.now() + 5 * D), actorUserId: 'u' })).rejects.toBeInstanceOf(BillingError) // future
  })

  it('numbers invoices gap-free on issue, even when issued concurrently; lifecycle rules hold', async () => {
    const t = await mkTenant('b'); const t2 = await mkTenant('b2')
    const s = new Date(Date.now() - 30 * D); const e = new Date(Date.now() - 15 * D)
    await usage(t, 2, new Date(s.getTime() + D)); await usage(t2, 2, new Date(s.getTime() + D))
    const [i1, i2] = await Promise.all([createDraftInvoice({ tenantId: t, periodStart: s, periodEnd: e, actorUserId: 'u' }), createDraftInvoice({ tenantId: t2, periodStart: s, periodEnd: e, actorUserId: 'u' })])
    const issued = await Promise.all([issueInvoice({ id: i1.id, actorUserId: 'u' }), issueInvoice({ id: i2.id, actorUserId: 'u' })])
    const nums = issued.map((x) => Number(x.number!.split('-')[2])).sort((a, b) => a - b)
    expect(nums[1]! - nums[0]!).toBe(1) // consecutive
    expect(issued[0]!.dueAt!.getTime()).toBeGreaterThan(issued[0]!.issuedAt!.getTime())
    await expect(issueInvoice({ id: i1.id, actorUserId: 'u' })).rejects.toMatchObject({ status: 409 }) // already issued; counter not consumed
    const after = await issueInvoice({ id: (await createDraftInvoice({ tenantId: t, periodStart: new Date(e.getTime()), periodEnd: new Date(Date.now() - 2 * D), actorUserId: 'u' }).catch(() => null))?.id ?? 'none', actorUserId: 'u' }).catch(() => null)
    expect(after).toBeNull() // (no usage in that window: nothing to bill)
    await markInvoicePaid({ id: i1.id, reference: 'SEPA-1', actorUserId: 'u' })
    await expect(markInvoicePaid({ id: i1.id, actorUserId: 'u' })).rejects.toMatchObject({ status: 409 })
    await expect(voidInvoice({ id: i1.id, reason: 'paid invoices are credited, not voided', actorUserId: 'u' })).rejects.toMatchObject({ status: 409 })
    await expect(voidInvoice({ id: i2.id, reason: 'x', actorUserId: 'u' })).rejects.toBeInstanceOf(BillingError) // reason too short
    const v = await voidInvoice({ id: i2.id, reason: 'issued to the wrong period', actorUserId: 'u' })
    expect(v.status).toBe('VOID'); expect(v.number).toBe(issued.find((x) => x.id === i2.id)!.number) // number is kept, never reused
    // the voided period can be billed again
    await expect(createDraftInvoice({ tenantId: t2, periodStart: s, periodEnd: e, actorUserId: 'u' })).resolves.toMatchObject({ status: 'DRAFT' })
  })

  it('other billing models need their price; monthly and per-ticket bill correctly', async () => {
    const t = await mkTenant('c', { billingModel: 'MONTHLY_FLAT' })
    const s = new Date(Date.now() - 40 * D); const e = new Date(Date.now() - 10 * D)
    await expect(createDraftInvoice({ tenantId: t, periodStart: s, periodEnd: e, actorUserId: 'u' })).rejects.toThrow(/monthly fee/i)
    await updateBillingSettings(t, { monthlyFeeEurCents: 100000, vatRatePercent: 0, vatNote: 'Reverse charge' }, 'u')
    const inv = await createDraftInvoice({ tenantId: t, periodStart: s, periodEnd: e, actorUserId: 'u' })
    expect(inv).toMatchObject({ subtotalEurCents: 100000, vatEurCents: 0, totalEurCents: 100000, vatNote: 'Reverse charge' })
    const t2 = await mkTenant('d', { billingModel: 'PER_TICKET', pricePerTicketEurCents: 300 })
    const creator = await db.user.create({ data: { email: `${base}-tk@test.gco`, passwordHash: 'x', role: 'CLIENT', tenantId: t2, displayName: 'c' } })
    for (const status of ['RESOLVED', 'CLOSED', 'OPEN'] as const) await db.ticket.create({ data: { tenantId: t2, creatorUserId: creator.id, type: 'FEEDBACK', status, subject: 's', description: 'd' } })
    const inv2 = await createDraftInvoice({ tenantId: t2, periodStart: new Date(Date.now() - 2 * D), periodEnd: new Date(Date.now() + 0.5 * D), actorUserId: 'u' })
    expect(inv2.subtotalEurCents).toBe(600) // two resolved/closed tickets
    await db.invoice.deleteMany({ where: { tenantId: t2 } }); await db.ticket.deleteMany({ where: { tenantId: t2 } }); await db.user.delete({ where: { id: creator.id } })
  })

  it('reconciliation exposes customer messages that were received but never billed (operator replies are not billed per message)', async () => {
    const t = await mkTenant('r')
    const s = new Date(Date.now() - 10 * D); const e = new Date(Date.now() - 1 * D)
    await usage(t, 3, new Date(s.getTime() + D))
    const conv = await db.conversation.create({ data: { tenantId: t, externalUserId: `${base}-r`, state: 'ACTIVE' } })
    await db.message.create({ data: { tenantId: t, conversationId: conv.id, direction: 'INBOUND', status: 'RECEIVED', content: 'unbilled', externalMessageId: `${base}-unb`, createdAt: new Date(s.getTime() + D) } })
    await db.message.create({ data: { tenantId: t, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'an operator reply', externalMessageId: `${base}-reply`, createdAt: new Date(s.getTime() + D) } }) // never expected to have a usage record
    const r = await reconcile(t, s, e)
    expect(r.activity).toEqual({ billableMessages: 3, customerMessagesReceived: 4 })
    expect(r.clientBilling.billedPerUsageEurCents).toBe(42)
    expect(r.mismatches.receivedWithoutUsageRecord).toBe(1) // exactly the unbilled customer message, not the reply
    expect(r.mismatches.usageVsInvoiceDifferenceEurCents).toBeNull()
  })
})
