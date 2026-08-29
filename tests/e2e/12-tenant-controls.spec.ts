import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 16 - V1 tenant controls. Verifies the agreed V1 MUST-HAVE "Tenant.status
// enforcement" and "message-volume cap" end-to-end through the real webhook
// entry point: a suspended tenant's inbound traffic is dropped (409), and an
// over-cap tenant is rate-limited without persisting anything (429).
test.describe('tenant controls (suspension + message cap)', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('tenant-controls')
    // Set a tight message cap through Prisma (no admin PATCH endpoint in V1).
    await db.tenant.update({ where: { id: tenant.tenantId }, data: { status: 'ACTIVE', messageCap: 1 } })
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('a webhook from an over-cap tenant is rejected with 429 and persists nothing', async () => {
    // messageCap is 1, so the first accepted message consumes it; the second
    // delivery from the same tenant must be rejected with 429.
    const first = await sendWebhook(tenant.integrationId, [
      { event_id: 'tc-cap-1', message_id: 'tc-msg-1', user_id: 'tc-user', text: 'first message' },
    ])
    expect(first.status()).toBe(202)

    await waitFor(async () => (await db.message.count({ where: { tenantId: tenant.tenantId, externalMessageId: 'tc-msg-1' } })) === 1)

    const second = await sendWebhook(tenant.integrationId, [
      { event_id: 'tc-cap-2', message_id: 'tc-msg-2', user_id: 'tc-user-2', text: 'second message over cap' },
    ])
    expect(second.status()).toBe(429)

    const overCapMessage = await db.message.findFirst({ where: { tenantId: tenant.tenantId, externalMessageId: 'tc-msg-2' } })
    expect(overCapMessage).toBeNull()
  })

  test('a webhook from a suspended tenant is rejected with 409 and persists nothing', async () => {
    await db.tenant.update({ where: { id: tenant.tenantId }, data: { status: 'SUSPENDED' } })

    const res = await sendWebhook(tenant.integrationId, [
      { event_id: 'tc-sus-1', message_id: 'tc-sus-msg', user_id: 'tc-sus-user', text: 'should be dropped' },
    ])
    expect(res.status()).toBe(409)

    const message = await db.message.findFirst({ where: { tenantId: tenant.tenantId, externalMessageId: 'tc-sus-msg' } })
    expect(message).toBeNull()

    const conversation = await db.conversation.findFirst({ where: { tenantId: tenant.tenantId, externalUserId: 'tc-sus-user' } })
    expect(conversation).toBeNull()
  })

  test('a tenant-scoped user cannot log into a suspended tenant (no leak)', async () => {
    const { anonymousContext } = await import('./helpers')
    await db.tenant.update({ where: { id: tenant.tenantId }, data: { status: 'SUSPENDED' } })

    // Login must fail identically to a bad password (401) - never reveal that
    // the tenant is suspended.
    const anon = await anonymousContext()
    const res = await anon.post('/api/v1/auth/login', {
      data: { email: tenant.clientEmail, password: 'DemoPassword123!' },
    })
    expect(res.status()).toBe(401)
    expect((await res.json()).error.message).toBe('Invalid credentials')
    await anon.dispose()
  })
})
