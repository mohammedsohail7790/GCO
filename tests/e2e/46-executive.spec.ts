import { test, expect } from '@playwright/test'
import { cleanupTenant, seedIsolatedTenant, sharedAdminContext } from './helpers'

test.describe('executive dashboard data', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { a = await seedIsolatedTenant('exec') })
  test.afterAll(async () => { await cleanupTenant(a.tenantId) })

  test('company-wide figures and search are CEO only', async () => {
    for (const ctx of [a.managerCtx, a.operatorCtx, a.clientCtx]) {
      expect((await ctx.get('/api/v1/admin/executive/overview')).status()).toBe(403)
      expect((await ctx.get('/api/v1/admin/executive/search?q=test')).status()).toBe(403)
    }
    const admin = await sharedAdminContext()
    const res = await admin.get('/api/v1/admin/executive/overview')
    expect(res.status()).toBe(200)
    const d = (await res.json()).data
    expect(d.totals).toHaveProperty('revenueEurCents'); expect(d.clients.some((c: { tenantId: string }) => c.tenantId === a.tenantId)).toBe(true)
    expect((await admin.get('/api/v1/admin/executive/overview?from=bad')).status()).toBe(400)
    expect((await admin.get('/api/v1/admin/executive/search?q=e2e')).status()).toBe(200)
  })
})
