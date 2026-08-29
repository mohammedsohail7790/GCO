import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { isTenantActive, isMessageCapReached, assertTenantActive, TenantInactiveError } from '@/lib/tenant/activity'
import { processWebhookEvent } from '@/lib/messages/ingest'

// V1 hardening (see docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md §18): Tenant.status
// enforcement + per-tenant message-volume cap. Requires the same real
// Postgres/Redis the other integration tests use (npm run test:integration).
describe('tenant controls: status enforcement + message cap', () => {
  let activeTenantId: string
  let suspendedTenantId: string
  let cappedTenantId: string
  const integrations: Record<string, string> = {}

  beforeAll(async () => {
    const base = `tc-${Date.now()}`
    const active = await db.tenant.create({ data: { name: '[TEST] Active', slug: `${base}-active` } })
    activeTenantId = active.id
    const suspended = await db.tenant.create({ data: { name: '[TEST] Suspended', slug: `${base}-sus` } })
    suspendedTenantId = suspended.id
    const capped = await db.tenant.create({ data: { name: '[TEST] Capped', slug: `${base}-cap`, messageCap: 2 } })
    cappedTenantId = capped.id

    for (const t of [active, suspended, capped]) {
      integrations[t.id] = (
        await db.integration.create({ data: { tenantId: t.id, adapterKey: 'dev-mock', name: '[TEST] Integration', config: {} } })
      ).id
    }
  })

  afterAll(async () => {
    for (const t of [activeTenantId, suspendedTenantId, cappedTenantId]) {
      await db.messageEvent.deleteMany({ where: { message: { tenantId: t } } })
      await db.usageRecord.deleteMany({ where: { tenantId: t } })
      await db.aiGeneration.deleteMany({ where: { tenantId: t } })
      await db.aiMemory.deleteMany({ where: { tenantId: t } })
      await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId: t } } })
      await db.conversation.updateMany({ where: { tenantId: t }, data: { currentAssignmentId: null } })
      await db.assignment.deleteMany({ where: { tenantId: t } })
      await db.messageEvent.deleteMany({ where: { message: { tenantId: t } } })
      await db.message.deleteMany({ where: { tenantId: t } })
      await db.conversation.deleteMany({ where: { tenantId: t } })
      await db.webhookEvent.deleteMany({ where: { tenantId: t } })
      await db.integration.deleteMany({ where: { tenantId: t } })
      await db.tenant.deleteMany({ where: { id: t } })
    }
    await db.$disconnect()
  })

  it('isTenantActive is true for ACTIVE, false for SUSPENDED', async () => {
    expect(await isTenantActive(activeTenantId)).toBe(true)
    await db.tenant.update({ where: { id: suspendedTenantId }, data: { status: 'SUSPENDED' } })
    expect(await isTenantActive(suspendedTenantId)).toBe(false)
  })

  it('assertTenantActive throws TenantInactiveError for a suspended tenant', async () => {
    await expect(assertTenantActive(activeTenantId)).resolves.toBeUndefined()
    await expect(assertTenantActive(suspendedTenantId)).rejects.toBeInstanceOf(TenantInactiveError)
  })

  it('isMessageCapReached is true once usage records reach the cap, false under it', async () => {
    // Build a real Message + UsageRecord chain (UsageRecord.messageId is an FK
    // to Message, so the ledger fixtures must be real rows).
    const conv = await db.conversation.create({
      data: { tenantId: cappedTenantId, externalUserId: 'cap-user' },
    })
    async function addBillableMessage(i: number) {
      const msg = await db.message.create({
        data: {
          tenantId: cappedTenantId,
          conversationId: conv.id,
          direction: 'INBOUND',
          status: 'RECEIVED',
          content: `cap ${i}`,
          externalMessageId: `cap-msg-${Date.now()}-${i}`,
        },
      })
      await db.usageRecord.create({
        data: {
          tenantId: cappedTenantId,
          messageId: msg.id,
          eventType: 'message_processed',
          priceEurCents: 14,
          operatorCostEurCents: 6,
          idempotencyKey: `cap-ik-${Date.now()}-${i}`,
          source: 'webhook',
        },
      })
      return msg
    }

    expect(await isMessageCapReached(cappedTenantId)).toBe(false)
    await addBillableMessage(1)
    expect(await isMessageCapReached(cappedTenantId)).toBe(false) // 1 < 2
    await addBillableMessage(2)
    expect(await isMessageCapReached(cappedTenantId)).toBe(true) // 2 >= 2
    await db.usageRecord.deleteMany({ where: { tenantId: cappedTenantId } })
    await db.message.deleteMany({ where: { conversationId: conv.id } })
    await db.conversation.deleteMany({ where: { id: conv.id } })
  })

  it('a suspended tenant\'s already-queued webhook event is dropped, not processed', async () => {
    await db.tenant.update({ where: { id: suspendedTenantId }, data: { status: 'SUSPENDED' } })
    const integrationId = integrations[suspendedTenantId]!
    const event = await db.webhookEvent.create({
      data: {
        tenantId: suspendedTenantId,
        integrationId,
        externalEventId: `evt-sus-${Date.now()}`,
        payloadHash: 'hash-sus',
        rawPayload: { events: [{ event_id: 's1', message_id: 'm1', user_id: 'u1', text: 'hi' }] },
      },
    })
    await processWebhookEvent(event.id)

    const messages = await db.message.findMany({ where: { tenantId: suspendedTenantId } })
    expect(messages).toHaveLength(0) // no message created for a suspended tenant
    const usage = await db.usageRecord.findMany({ where: { tenantId: suspendedTenantId } })
    expect(usage).toHaveLength(0) // no billable usage
    // The event itself is marked processed (terminal no-op, not retried).
    const updated = await db.webhookEvent.findUnique({ where: { id: event.id } })
    expect(updated?.processed).toBe(true)
  })
})
