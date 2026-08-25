import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 2 (duplicate webhook), TEST 3 (forged webhook), TEST 14 (usage idempotency).
test.describe('webhook integrity', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('webhook-integrity')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('forged signature is rejected with 401 and persists nothing', async () => {
    const res = await sendWebhook(
      tenant.integrationId,
      [{ event_id: 'ev-forged-1', message_id: 'msg-forged-1', user_id: 'user-forged', text: 'attacker payload' }],
      { badSignature: true },
    )
    expect(res.status()).toBe(401)

    const event = await db.webhookEvent.findFirst({ where: { tenantId: tenant.tenantId, externalEventId: 'ev-forged-1' } })
    expect(event).toBeNull()

    const message = await db.message.findFirst({ where: { tenantId: tenant.tenantId, externalMessageId: 'msg-forged-1' } })
    expect(message).toBeNull()

    const conversation = await db.conversation.findFirst({ where: { tenantId: tenant.tenantId, externalUserId: 'user-forged' } })
    expect(conversation).toBeNull()
  })

  test('exact duplicate delivery produces exactly one message, one usage record, no duplicate conversation', async () => {
    const events = [{ event_id: 'ev-dup-1', message_id: 'msg-dup-1', user_id: 'user-dup', text: 'duplicate me' }]

    const first = await sendWebhook(tenant.integrationId, events)
    expect(first.status()).toBe(202)

    await waitFor(async () => (await db.message.count({ where: { tenantId: tenant.tenantId, externalMessageId: 'msg-dup-1' } })) === 1)

    const second = await sendWebhook(tenant.integrationId, events) // identical body -> identical signature -> same dedup hash
    expect(second.status()).toBe(200)
    expect((await second.json()).data.deduplicated).toBe(true)

    // Give any (incorrect) second processing attempt time to happen if the dedup were broken.
    await new Promise((r) => setTimeout(r, 500))

    // Note: the dev-mock envelope has no top-level event_id (only nested
    // per-event inside `events[]`), so the webhook route's dedup key for
    // this adapter falls back to a hash of the raw body (see
    // app/api/v1/webhooks/[integrationId]/route.ts) - both deliveries share
    // one WebhookEvent row keyed by that hash, not by 'ev-dup-1' literally.
    const allEventsForTenant = await db.webhookEvent.findMany({ where: { tenantId: tenant.tenantId } })
    expect(allEventsForTenant.length).toBe(1)

    const messages = await db.message.findMany({ where: { tenantId: tenant.tenantId, externalMessageId: 'msg-dup-1' } })
    expect(messages.length).toBe(1)

    const conversations = await db.conversation.findMany({ where: { tenantId: tenant.tenantId, externalUserId: 'user-dup' } })
    expect(conversations.length).toBe(1)

    const usage = await db.usageRecord.findMany({ where: { tenantId: tenant.tenantId, messageId: messages[0]!.id } })
    expect(usage.length).toBe(1)
  })
})
