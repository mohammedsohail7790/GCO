import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, cleanupTenant, sharedAdminContext } from './helpers'

// P0-5 over HTTP: environment defaults to SANDBOX, only INTEGRATION_MANAGE can change it, promotion needs the typed confirmation,
// and the integration list shows the environment and the (initially empty) check history.
test.describe('integration environment', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { t = await seedIsolatedTenant('intenv') })
  test.afterAll(async () => { await cleanupTenant(t.tenantId) })

  test('defaults to SANDBOX, is protected by permission and confirmation, and is audited', async () => {
    const admin = await sharedAdminContext()
    const created = await admin.post('/api/v1/admin/integrations', { data: { tenantId: t.tenantId, adapterKey: 'gco-webhook', name: 'Env test', status: 'DISABLED', config: { callbackUrl: 'https://client.example.com/hooks/gco' } } })
    expect(created.status()).toBe(201)
    const integ = (await created.json()).data
    expect(integ.environment).toBe('SANDBOX')
    expect(JSON.stringify(integ)).not.toContain('totp') // (shape sanity) only safe fields besides the one-time secret

    const list = (await (await admin.get(`/api/v1/admin/integrations?tenantId=${t.tenantId}`)).json()).data
    expect(list.find((i: { id: string }) => i.id === integ.id)).toMatchObject({ environment: 'SANDBOX', recentChecks: [], verified: false })
    // the seeded development integration is a SANDBOX simulation and is labelled as not production-capable
    expect(list.find((i: { adapterKey: string }) => i.adapterKey === 'dev-mock')).toMatchObject({ environment: 'SANDBOX', productionCapable: false })

    for (const [who, ctx] of [['manager', t.managerCtx], ['operator', t.operatorCtx], ['client', t.clientCtx]] as const) {
      expect((await ctx.patch(`/api/v1/admin/integrations/${integ.id}/environment`, { data: { environment: 'PRODUCTION', confirm: 'production' } })).status(), who).toBe(403)
    }
    expect((await admin.patch(`/api/v1/admin/integrations/${integ.id}/environment`, { data: { environment: 'PRODUCTION' } })).status()).toBe(400)
    expect((await admin.patch(`/api/v1/admin/integrations/${integ.id}/environment`, { data: { environment: 'PRODUCTION', confirm: 'production' } })).status()).toBe(200)
    const after = (await (await admin.get(`/api/v1/admin/integrations?tenantId=${t.tenantId}`)).json()).data.find((i: { id: string }) => i.id === integ.id)
    expect(after.environment).toBe('PRODUCTION')

    const logs = await (await admin.get(`/api/v1/admin/audit-logs?tenantId=${t.tenantId}&pageSize=100`)).text()
    expect(logs).toContain('integration.environment_changed')
    expect(logs).toContain(integ.id)
  })
})
