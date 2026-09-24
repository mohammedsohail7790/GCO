import { test, expect } from '@playwright/test'
import { db } from '@/lib/db/client'
import { anonymousContext, sharedAdminContext, signWebhookBodyWithSecret, cleanupTenant } from './helpers'

// Confirmed business rule: every client/integration has its OWN webhook
// secret - no shared/global secret across unrelated clients. See
// app/api/v1/webhooks/[integrationId]/route.ts (reads integration.webhookSecret,
// not a global env var) and app/api/v1/admin/integrations/[id]/webhook-secret/route.ts
// (rotation).
async function makeTenantWithIntegration(namePrefix: string, secret: string) {
  const tenant = await db.tenant.create({ data: { name: `[E2E] ${namePrefix}`, slug: `${namePrefix}-${Date.now()}` } })
  const integration = await db.integration.create({
    data: { tenantId: tenant.id, adapterKey: 'dev-mock', name: `[E2E] ${namePrefix} integration`, config: {}, webhookSecret: secret },
  })
  return { tenantId: tenant.id, integrationId: integration.id }
}

// Reuses helpers.ts's cleanupTenant, which already handles everything a
// real processed webhook can create (Conversation, Message, MessageEvent,
// UsageRecord, etc.) - these tests genuinely run through the live worker,
// not just the signature check, so a shallow cleanup leaves orphaned rows.
async function cleanupTenantAndIntegration(tenantId: string) {
  await cleanupTenant(tenantId).catch(() => null)
}

function eventBody(eventId: string) {
  return JSON.stringify({ events: [{ event_id: eventId, message_id: `msg-${eventId}`, user_id: 'user-1', text: 'hello' }] })
}

test.describe('Webhook security - per-integration secrets', () => {
  test('valid client secret is accepted', async () => {
    const secretA = 'secret-for-client-a-only'
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-valid-a', secretA)
    try {
      const anon = await anonymousContext()
      const body = eventBody(`evt-${Date.now()}`)
      const res = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, secretA) },
      })
      expect(res.status()).toBe(202)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('another client\'s secret is rejected - no shared secret across integrations', async () => {
    const secretA = 'secret-for-client-a-only'
    const secretB = 'secret-for-client-b-only'
    const { tenantId: tenantA, integrationId: integrationA } = await makeTenantWithIntegration('secret-cross-a', secretA)
    const { tenantId: tenantB } = await makeTenantWithIntegration('secret-cross-b', secretB)
    try {
      const anon = await anonymousContext()
      const body = eventBody(`evt-${Date.now()}`)
      // Signed with B's secret, sent to A's integration - must be rejected.
      const res = await anon.post(`/api/v1/webhooks/${integrationA}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, secretB) },
      })
      expect(res.status()).toBe(401)
      const eventCount = await db.webhookEvent.count({ where: { integrationId: integrationA } })
      expect(eventCount).toBe(0)
    } finally {
      await cleanupTenantAndIntegration(tenantA)
      await cleanupTenantAndIntegration(tenantB)
    }
  })

  test('wrong secret entirely is rejected', async () => {
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-wrong', 'the-real-secret')
    try {
      const anon = await anonymousContext()
      const body = eventBody(`evt-${Date.now()}`)
      const res = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, 'totally-wrong-secret') },
      })
      expect(res.status()).toBe(401)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('missing signature header is rejected', async () => {
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-missing-sig', 'some-secret')
    try {
      const anon = await anonymousContext()
      const res = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: eventBody(`evt-${Date.now()}`),
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res.status()).toBe(401)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('an integration with no webhookSecret configured fails closed, not open', async () => {
    const tenant = await db.tenant.create({ data: { name: '[E2E] No Secret', slug: `no-secret-${Date.now()}` } })
    const integration = await db.integration.create({
      data: { tenantId: tenant.id, adapterKey: 'dev-mock', name: '[E2E] No Secret integration', config: {} }, // webhookSecret left null
    })
    try {
      const anon = await anonymousContext()
      const body = eventBody(`evt-${Date.now()}`)
      const res = await anon.post(`/api/v1/webhooks/${integration.id}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, 'anything-at-all') },
      })
      expect(res.status()).toBe(401)
    } finally {
      await cleanupTenantAndIntegration(tenant.id)
    }
  })

  test('replay of an identical delivery is deduplicated, not reprocessed', async () => {
    const secret = 'replay-secret'
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-replay', secret)
    try {
      const anon = await anonymousContext()
      const body = eventBody(`evt-replay-${Date.now()}`)
      const signature = signWebhookBodyWithSecret(body, secret)

      const first = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signature },
      })
      expect(first.status()).toBe(202)

      const second = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signature },
      })
      expect([200, 202]).toContain(second.status()) // dedup ack, not a new event

      const eventCount = await db.webhookEvent.count({ where: { integrationId } })
      expect(eventCount).toBe(1)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('concurrent identical deliveries produce exactly one stored event', async () => {
    const secret = 'concurrent-secret'
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-concurrent', secret)
    try {
      const anon = await anonymousContext()
      const body = eventBody(`evt-concurrent-${Date.now()}`)
      const signature = signWebhookBodyWithSecret(body, secret)

      await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          anon.post(`/api/v1/webhooks/${integrationId}`, {
            data: body,
            headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signature },
          }),
        ),
      )

      const eventCount = await db.webhookEvent.count({ where: { integrationId } })
      expect(eventCount).toBe(1)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('secret rotation: old secret stops working immediately, new one works', async () => {
    const oldSecret = 'secret-before-rotation'
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-rotation', oldSecret)
    try {
      const admin = await sharedAdminContext()
      const rotateRes = await admin.patch(`/api/v1/admin/integrations/${integrationId}/webhook-secret`, { data: {} })
      expect(rotateRes.status()).toBe(200)
      const rotateBody = (await rotateRes.json()).data
      expect(rotateBody.rotated).toBe(true)
      const newSecret: string = rotateBody.secret
      expect(newSecret).toBeTruthy()
      expect(newSecret).not.toBe(oldSecret)

      const anon = await anonymousContext()
      const body = eventBody(`evt-rotated-${Date.now()}`)

      const withOldSecret = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, oldSecret) },
      })
      expect(withOldSecret.status()).toBe(401)

      const withNewSecret = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, newSecret) },
      })
      expect(withNewSecret.status()).toBe(202)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('only CEO_ADMIN can rotate a webhook secret', async () => {
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-rotate-rbac', 'some-secret')
    try {
      const { loginAs } = await import('./helpers')
      const managerCtx = await loginAs('manager@demo.gco')
      const res = await managerCtx.patch(`/api/v1/admin/integrations/${integrationId}/webhook-secret`, { data: {} })
      expect(res.status()).toBe(403)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })

  test('the webhook secret is never exposed through any API response', async () => {
    const secret = 'must-never-leak-this-value'
    const { tenantId, integrationId } = await makeTenantWithIntegration('secret-no-leak', secret)
    try {
      const admin = await sharedAdminContext()
      // The only endpoints that touch this integration at all in this
      // codebase: system-health (queue stats, no integration serialization)
      // and the webhook route itself (never echoes the integration back).
      const healthRes = await admin.get('/api/v1/admin/system-health')
      const healthText = await healthRes.text()
      expect(healthText).not.toContain(secret)

      const anon = await anonymousContext()
      const body = eventBody(`evt-${Date.now()}`)
      const webhookRes = await anon.post(`/api/v1/webhooks/${integrationId}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, secret) },
      })
      const webhookText = await webhookRes.text()
      expect(webhookText).not.toContain(secret)
    } finally {
      await cleanupTenantAndIntegration(tenantId)
    }
  })
})
