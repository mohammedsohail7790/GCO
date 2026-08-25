import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { processWebhookEvent } from '@/lib/messages/ingest'

// Requires a running Postgres reachable via DATABASE_URL (see .env / docker-compose.yml)
// and `npx prisma migrate deploy` already applied. Run with: npm run test:integration
describe('webhook ingestion idempotency', () => {
  let tenantId: string
  let integrationId: string

  beforeAll(async () => {
    const tenant = await db.tenant.create({ data: { name: '[TEST] Tenant', slug: `test-${Date.now()}` } })
    tenantId = tenant.id
    const integration = await db.integration.create({
      data: { tenantId, adapterKey: 'dev-mock', name: '[TEST] Integration', config: {} },
    })
    integrationId = integration.id
  })

  afterAll(async () => {
    // Delete children before the parent tenant - no cascading deletes are
    // configured on these FKs (deliberately, to avoid silently losing audit
    // trail data in production), so tests must clean up in FK order too.
    // Note: if a real worker is running against the same Redis/DB (as in local
    // dev), it may race this test and asynchronously create AiGeneration/AiMemory
    // rows for the message this test ingests - clean those up too. Give it a
    // moment to finish, then delete messageEvent twice (see the identical
    // note in tests/e2e/helpers.ts::cleanupTenant for why).
    await new Promise((r) => setTimeout(r, 500))
    await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
    await db.usageRecord.deleteMany({ where: { tenantId } })
    await db.aiGeneration.deleteMany({ where: { tenantId } })
    await db.aiMemory.deleteMany({ where: { tenantId } })
    await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId } } })
    await db.conversation.updateMany({ where: { tenantId }, data: { currentAssignmentId: null } })
    await db.assignment.deleteMany({ where: { tenantId } })
    await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
    await db.message.deleteMany({ where: { tenantId } })
    await db.conversation.deleteMany({ where: { tenantId } })
    await db.webhookEvent.deleteMany({ where: { tenantId } })
    await db.integration.deleteMany({ where: { tenantId } })
    await db.tenant.deleteMany({ where: { id: tenantId } })
    await db.$disconnect()
  })

  it('processes a webhook event exactly once even if the job runs twice', async () => {
    const event = await db.webhookEvent.create({
      data: {
        tenantId,
        integrationId,
        externalEventId: 'evt-1',
        payloadHash: 'hash-1',
        rawPayload: {
          events: [{ event_id: 'evt-1', message_id: 'msg-1', user_id: 'user-1', text: 'hello' }],
        },
      },
    })

    await processWebhookEvent(event.id)
    await processWebhookEvent(event.id) // simulate a retried/duplicate job

    const messages = await db.message.findMany({ where: { tenantId, externalMessageId: 'msg-1' } })
    expect(messages).toHaveLength(1)

    const usageRecords = await db.usageRecord.findMany({ where: { tenantId } })
    expect(usageRecords).toHaveLength(1) // no double billing
  })
})
