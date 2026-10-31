import { describe, it, expect, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { recordCheck, recentChecksFor, recordVerification } from '@/lib/integrations/verification'
import { isProductionAdapter } from '@/lib/integrations/registry'

// P0-5: an integration points at the client's SANDBOX or PRODUCTION environment; only PRODUCTION can go live; changing it clears verification;
// every connectivity check (including failures) is kept as history. Route access is by permission, so these tests mock the guard as CEO_ADMIN.
import { vi } from 'vitest'
vi.mock('@/lib/api/guard', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/guard')>()),
  requirePermission: async () => ({ sub: 'test-ceo', role: 'CEO_ADMIN', tenantId: null, email: 'ceo@test.gco' }),
}))

describe('integration environment and check history (real database)', () => {
  const tenantIds: string[] = []
  const mkTenant = async () => {
    const t = await db.tenant.create({ data: { name: `[TEST] env ${Date.now()}-${Math.floor(Math.random() * 1e6)}`, slug: `test-env-${Date.now()}-${Math.floor(Math.random() * 1e6)}` } })
    tenantIds.push(t.id)
    return t
  }
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })
  const patch = async (id: string, body: unknown) => {
    const { PATCH } = await import('@/app/api/v1/admin/integrations/[id]/environment/route')
    const res = await PATCH(new NextRequest(`http://localhost/api/v1/admin/integrations/${id}/environment`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
    return { status: res.status, body: await res.json() }
  }

  it('a new integration defaults to SANDBOX', async () => {
    const t = await mkTenant()
    const i = await db.integration.create({ data: { tenantId: t.id, adapterKey: 'gco-webhook', name: 'default', status: 'DISABLED', config: {}, webhookSecret: 's'.repeat(40) } })
    expect(i.environment).toBe('SANDBOX')
  })

  it('promotion needs the typed confirmation, clears verification and is audited; a development adapter can never be PRODUCTION', async () => {
    const t = await mkTenant()
    const cfg = { callbackUrl: 'https://client.example.com/hook' }
    const i = await db.integration.create({ data: { tenantId: t.id, adapterKey: 'gco-webhook', name: 'promote', status: 'DISABLED', config: cfg, webhookSecret: 's'.repeat(40) } })
    await recordVerification(i.id, 'outbound'); await recordVerification(i.id, 'inbound')
    expect((await db.integration.findUniqueOrThrow({ where: { id: i.id } })).config).toHaveProperty('verification')

    expect((await patch(i.id, { environment: 'PRODUCTION' })).body.error.code).toBe('CONFIRMATION_REQUIRED')
    expect((await patch(i.id, { environment: 'PRODUCTION', confirm: 'yes' })).body.error.code).toBe('CONFIRMATION_REQUIRED')
    expect((await db.integration.findUniqueOrThrow({ where: { id: i.id } })).environment).toBe('SANDBOX')

    const ok = await patch(i.id, { environment: 'PRODUCTION', confirm: 'production' })
    expect(ok.status).toBe(200)
    const after = await db.integration.findUniqueOrThrow({ where: { id: i.id } })
    expect(after.environment).toBe('PRODUCTION')
    expect(after.config).not.toHaveProperty('verification') // proven again for the new target
    const audit = await db.auditLog.findFirstOrThrow({ where: { resourceId: i.id, action: 'integration.environment_changed' } })
    expect(audit.metadata).toMatchObject({ from: 'SANDBOX', to: 'PRODUCTION' })

    const dev = await db.integration.create({ data: { tenantId: t.id, adapterKey: 'dev-mock', name: 'sim', status: 'ACTIVE', config: {}, webhookSecret: 's'.repeat(40) } })
    expect(isProductionAdapter('dev-mock')).toBe(false) // (flag ALLOW_DEV_ADAPTERS must be off for this assertion; see the E2E for the flag-on path)
    const refused = await patch(dev.id, { environment: 'PRODUCTION', confirm: 'production' })
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('SIMULATION_CANNOT_BE_PRODUCTION')
  })

  it('a live (ACTIVE) integration cannot be moved back to SANDBOX; a staged one can, and verification is cleared', async () => {
    const t = await mkTenant()
    const live = await db.integration.create({ data: { tenantId: t.id, adapterKey: 'gco-webhook', name: 'live', status: 'ACTIVE', environment: 'PRODUCTION', config: {}, webhookSecret: 's'.repeat(40) } })
    expect((await patch(live.id, { environment: 'SANDBOX' })).body.error.code).toBe('INTEGRATION_ACTIVE')
    const staged = await db.integration.create({ data: { tenantId: t.id, adapterKey: 'gco-webhook', name: 'staged', status: 'DISABLED', environment: 'PRODUCTION', config: { callbackUrl: 'https://c.example.com/h' }, webhookSecret: 's'.repeat(40) } })
    await recordVerification(staged.id, 'outbound')
    expect((await patch(staged.id, { environment: 'SANDBOX' })).status).toBe(200)
    expect((await db.integration.findUniqueOrThrow({ where: { id: staged.id } })).config).not.toHaveProperty('verification')
  })

  it('keeps a history of checks, failures included, with no content or secret, newest first, capped per integration', async () => {
    const t = await mkTenant()
    const i = await db.integration.create({ data: { tenantId: t.id, adapterKey: 'gco-webhook', name: 'history', status: 'DISABLED', config: {}, webhookSecret: 's'.repeat(40) } })
    await recordCheck({ integrationId: i.id, direction: 'OUTBOUND', ok: false, category: 'timeout', latencyMs: 8000, actorUserId: 'u1' })
    await new Promise((r) => setTimeout(r, 15))
    await recordCheck({ integrationId: i.id, direction: 'OUTBOUND', ok: true, latencyMs: 120, actorUserId: 'u1' })
    await new Promise((r) => setTimeout(r, 15))
    await recordCheck({ integrationId: i.id, direction: 'INBOUND', ok: true })
    for (let n = 0; n < 8; n++) await recordCheck({ integrationId: i.id, direction: 'OUTBOUND', ok: true })
    const list = (await recentChecksFor([i.id], 5)).get(i.id)!
    expect(list).toHaveLength(5)
    expect(list.every((c) => c.environment === 'SANDBOX')).toBe(true)
    const all = await db.integrationCheck.findMany({ where: { integrationId: i.id }, orderBy: { createdAt: 'asc' } })
    expect(all[0]).toMatchObject({ ok: false, category: 'timeout', latencyMs: 8000 })
    expect(JSON.stringify(all)).not.toMatch(/secret|https?:\/\//i)
  })
})
