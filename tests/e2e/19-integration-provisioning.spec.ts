import { test, expect } from '@playwright/test'
import { db } from '@/lib/db/client'
import { anonymousContext, sharedAdminContext, loginAs, cleanupTenant } from './helpers'

// Phase 11: CEO_ADMIN-only Integration provisioning API
// (app/api/v1/admin/integrations/route.ts) - replaces the previous
// database-only creation path this test file itself used to require
// (see helpers.ts::seedIsolatedTenant, now updated to use this same API).

async function makeBareTenant(namePrefix: string) {
  const admin = await sharedAdminContext()
  const unique = `${namePrefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const slug = unique.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const res = await admin.post('/api/v1/admin/tenants', { data: { name: `[E2E] ${unique}`, slug } })
  if (!res.ok()) throw new Error(`tenant create failed: ${await res.text()}`)
  const tenant = (await res.json()).data
  return tenant.id as string
}

test.describe('Integration provisioning API', () => {
  test('CEO_ADMIN can create an integration', async () => {
    const tenantId = await makeBareTenant('prov-ceo')
    try {
      const admin = await sharedAdminContext()
      const res = await admin.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: '[E2E] Provisioned Integration' },
      })
      expect(res.status()).toBe(201)
      const body = (await res.json()).data
      expect(body.id).toBeTruthy()
      expect(body.tenantId).toBe(tenantId)
      expect(body.adapterKey).toBe('dev-mock')
      expect(body.status).toBe('ACTIVE')
      // The one-time creation-response disclosure boundary - secret is
      // returned exactly here, and only here.
      expect(typeof body.webhookSecret).toBe('string')
      expect(body.webhookSecret.length).toBeGreaterThanOrEqual(16)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('Manager cannot create an integration', async () => {
    const tenantId = await makeBareTenant('prov-mgr')
    try {
      const admin = await sharedAdminContext()
      const userRes = await admin.post('/api/v1/admin/users', {
        data: { email: `mgr-${Date.now()}@e2e.gco`, password: 'DemoPassword123!', displayName: '[E2E] Manager', role: 'MANAGER', tenantId },
      })
      const managerEmail = (await userRes.json()).data.email
      const managerCtx = await loginAs(managerEmail, 'DemoPassword123!')
      const res = await managerCtx.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: 'Should be forbidden' },
      })
      expect(res.status()).toBe(403)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('Hunter cannot create an integration', async () => {
    const tenantId = await makeBareTenant('prov-hunter')
    try {
      const hunterCtx = await loginAs('hunter1@demo.gco')
      const res = await hunterCtx.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: 'Should be forbidden' },
      })
      expect(res.status()).toBe(403)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('Operator cannot create an integration', async () => {
    const tenantId = await makeBareTenant('prov-operator')
    try {
      const admin = await sharedAdminContext()
      const userRes = await admin.post('/api/v1/admin/users', {
        data: { email: `op-${Date.now()}@e2e.gco`, password: 'DemoPassword123!', displayName: '[E2E] Operator', role: 'OPERATOR', tenantId },
      })
      const operatorEmail = (await userRes.json()).data.email
      const operatorCtx = await loginAs(operatorEmail, 'DemoPassword123!')
      const res = await operatorCtx.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: 'Should be forbidden' },
      })
      expect(res.status()).toBe(403)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('Client cannot create an integration', async () => {
    const tenantId = await makeBareTenant('prov-client')
    try {
      const admin = await sharedAdminContext()
      const userRes = await admin.post('/api/v1/admin/users', {
        data: { email: `client-${Date.now()}@e2e.gco`, password: 'DemoPassword123!', displayName: '[E2E] Client', role: 'CLIENT', tenantId },
      })
      const clientEmail = (await userRes.json()).data.email
      const clientCtx = await loginAs(clientEmail, 'DemoPassword123!')
      const res = await clientCtx.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: 'Should be forbidden' },
      })
      expect(res.status()).toBe(403)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('unauthenticated request is rejected', async () => {
    const anon = await anonymousContext()
    const res = await anon.post('/api/v1/admin/integrations', {
      data: { tenantId: 'irrelevant', adapterKey: 'dev-mock', name: 'Should be forbidden' },
    })
    expect(res.status()).toBe(401)
  })

  test('invalid tenant is rejected', async () => {
    const admin = await sharedAdminContext()
    const res = await admin.post('/api/v1/admin/integrations', {
      data: { tenantId: 'not-a-real-tenant-id', adapterKey: 'dev-mock', name: '[E2E] Bad tenant' },
    })
    expect(res.status()).toBe(404)
  })

  test('invalid/unregistered adapterKey is rejected', async () => {
    const tenantId = await makeBareTenant('prov-badadapter')
    try {
      const admin = await sharedAdminContext()
      const res = await admin.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'whatsapp-not-actually-built', name: '[E2E] Bad adapter' },
      })
      expect(res.status()).toBe(400)
      const count = await db.integration.count({ where: { tenantId } })
      expect(count).toBe(0)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('the webhook secret is never returned by GET (list)', async () => {
    const tenantId = await makeBareTenant('prov-noleak')
    try {
      const admin = await sharedAdminContext()
      const createRes = await admin.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: '[E2E] No leak on GET' },
      })
      const created = (await createRes.json()).data
      const secret: string = created.webhookSecret
      expect(secret).toBeTruthy()

      const listRes = await admin.get(`/api/v1/admin/integrations?tenantId=${tenantId}`)
      expect(listRes.status()).toBe(200)
      const listText = await listRes.text()
      expect(listText).not.toContain(secret)
      const list = (await JSON.parse(listText)).data
      expect(list.find((i: any) => i.id === created.id)).toBeTruthy()
      expect(list[0].webhookSecret).toBeUndefined()
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('a created integration can immediately receive a valid, verified webhook', async () => {
    const tenantId = await makeBareTenant('prov-webhook')
    try {
      const admin = await sharedAdminContext()
      const createRes = await admin.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: '[E2E] Webhook-ready' },
      })
      const created = (await createRes.json()).data
      const { signWebhookBodyWithSecret } = await import('./helpers')
      const body = JSON.stringify({ events: [{ event_id: `evt-${Date.now()}`, message_id: 'm1', user_id: 'u1', text: 'hello' }] })

      const anon = await anonymousContext()
      const valid = await anon.post(`/api/v1/webhooks/${created.id}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, created.webhookSecret) },
      })
      expect(valid.status()).toBe(202)

      const invalid = await anon.post(`/api/v1/webhooks/${created.id}`, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': signWebhookBodyWithSecret(body, 'wrong-secret') },
      })
      expect(invalid.status()).toBe(401)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })

  test('tenant isolation: tenant B cannot see tenant A integration via list filter', async () => {
    const tenantA = await makeBareTenant('prov-isoA')
    const tenantB = await makeBareTenant('prov-isoB')
    try {
      const admin = await sharedAdminContext()
      const createA = await admin.post('/api/v1/admin/integrations', {
        data: { tenantId: tenantA, adapterKey: 'dev-mock', name: '[E2E] Tenant A integration' },
      })
      const integrationA = (await createA.json()).data

      const listB = await admin.get(`/api/v1/admin/integrations?tenantId=${tenantB}`)
      const listBData = (await listB.json()).data
      expect(listBData.find((i: any) => i.id === integrationA.id)).toBeUndefined()
    } finally {
      await cleanupTenant(tenantA).catch(() => null)
      await cleanupTenant(tenantB).catch(() => null)
    }
  })

  test('audit log records creation without the secret value', async () => {
    const tenantId = await makeBareTenant('prov-audit')
    try {
      const admin = await sharedAdminContext()
      const res = await admin.post('/api/v1/admin/integrations', {
        data: { tenantId, adapterKey: 'dev-mock', name: '[E2E] Audit check' },
      })
      const created = (await res.json()).data
      const secret: string = created.webhookSecret

      const auditEntry = await db.auditLog.findFirst({
        where: { action: 'integration.create', resourceId: created.id },
      })
      expect(auditEntry).toBeTruthy()
      expect(auditEntry!.tenantId).toBe(tenantId)
      expect(JSON.stringify(auditEntry!.metadata)).not.toContain(secret)
    } finally {
      await cleanupTenant(tenantId).catch(() => null)
    }
  })
})
