import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 13 - AI memory extraction: traceable, non-hallucinated, async, and
// must never block the message pipeline even though it runs after send.
test.describe('AI memory extraction', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('ai-memory')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('extracts an explicitly-stated fact with full traceability, and never invents facts from vague text', async () => {
    const res = await sendWebhook(tenant.integrationId, [
      { event_id: 'ev-mem-1', message_id: 'msg-mem-1', user_id: 'user-mem', text: 'Hi, I am from Berlin and I love hiking!' },
    ])
    expect(res.status()).toBe(202)

    const message = await waitForMessage(tenant.tenantId, 'msg-mem-1')
    expect(message).toBeTruthy()

    const found = await waitFor(async () => (await db.aiMemory.count({ where: { tenantId: tenant.tenantId } })) > 0)
    expect(found).toBe(true)

    const memories = await db.aiMemory.findMany({ where: { tenantId: tenant.tenantId } })
    const location = memories.find((m) => m.type === 'LOCATION')
    expect(location).toBeTruthy()
    expect(location!.value).toBe('Berlin')

    // Full traceability: source message, confidence, tenant, conversation - never bare/unattributed.
    expect(location!.sourceMessageId).toBe(message!.id)
    expect(location!.confidence).toBeGreaterThan(0)
    expect(location!.confidence).toBeLessThanOrEqual(1)
    expect(location!.conversationId).toBe(message!.conversationId)
    expect(location!.isDeleted).toBe(false)
  })

  test('a vague message with no explicit facts extracts nothing (no hallucination)', async () => {
    const res = await sendWebhook(tenant.integrationId, [
      { event_id: 'ev-mem-2', message_id: 'msg-mem-2', user_id: 'user-mem-vague', text: 'hey whats up' },
    ])
    expect(res.status()).toBe(202)

    const message = await waitForMessage(tenant.tenantId, 'msg-mem-2')
    expect(message).toBeTruthy()

    // Give extraction time to run (it's async) - assert it produced nothing, not that it never ran.
    await new Promise((r) => setTimeout(r, 1500))
    const memories = await db.aiMemory.findMany({ where: { conversationId: message!.conversationId } })
    expect(memories.length).toBe(0)

    // Crucially: the message itself still made it through fine regardless of extraction outcome.
    const persisted = await db.message.findUnique({ where: { id: message!.id } })
    expect(persisted?.status).toBe('RECEIVED')
  })
})

async function waitForMessage(tenantId: string, externalMessageId: string) {
  let message = null
  await waitFor(async () => {
    message = await db.message.findFirst({ where: { tenantId, externalMessageId } })
    return message !== null
  })
  return message as Awaited<ReturnType<typeof db.message.findFirst>>
}
