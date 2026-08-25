import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, loginAs, sharedAdminContext, cleanupTenant } from './helpers'

// TEST 12 - RBAC. Verify each role only has its intended access, via real
// HTTP calls against the running API (not just the unit-tested permission
// matrix in lib/auth/rbac.ts - this proves the routes actually enforce it).
test.describe('RBAC boundaries', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('rbac')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('CLIENT cannot access any admin API', async () => {
    const targets = [
      { method: 'get' as const, path: '/api/v1/admin/tenants' },
      { method: 'get' as const, path: '/api/v1/admin/audit-logs' },
      { method: 'get' as const, path: '/api/v1/admin/system-health' },
      { method: 'post' as const, path: '/api/v1/admin/users', data: { email: 'x@x.com', password: 'password123', displayName: 'x', role: 'CEO_ADMIN' } },
      { method: 'post' as const, path: '/api/v1/admin/recovery/requeue-dead-letter', data: { jobId: 'fake' } },
    ]
    for (const t of targets) {
      const res = t.method === 'get' ? await tenant.clientCtx.get(t.path) : await tenant.clientCtx.post(t.path, { data: t.data })
      expect(res.status(), `${t.method} ${t.path}`).toBe(403)
    }
  })

  test('CLIENT cannot access operator-only endpoints', async () => {
    const workspaceRes = await tenant.clientCtx.get('/api/v1/operators/me/workspace')
    expect(workspaceRes.status()).toBe(403)

    const statusRes = await tenant.clientCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })
    expect(statusRes.status()).toBe(403)

    const sendRes = await tenant.clientCtx.post('/api/v1/messages/send', { data: { conversationId: 'fake', content: 'hi' } })
    expect(sendRes.status()).toBe(403)
  })

  test('OPERATOR cannot access manager/global analytics or operator roster', async () => {
    const rosterRes = await tenant.operatorCtx.get('/api/v1/operators')
    expect(rosterRes.status()).toBe(403)

    const auditRes = await tenant.operatorCtx.get('/api/v1/admin/audit-logs')
    expect(auditRes.status()).toBe(403)
  })

  test('MANAGER cannot perform CEO_ADMIN-only operations', async () => {
    const createTenantRes = await tenant.managerCtx.post('/api/v1/admin/tenants', { data: { name: 'x', slug: `x-${Date.now()}` } })
    expect(createTenantRes.status()).toBe(403)

    const createUserRes = await tenant.managerCtx.post('/api/v1/admin/users', {
      data: { email: 'x2@x.com', password: 'password123', displayName: 'x', role: 'OPERATOR', tenantId: tenant.tenantId },
    })
    expect(createUserRes.status()).toBe(403)

    const auditRes = await tenant.managerCtx.get('/api/v1/admin/audit-logs')
    expect(auditRes.status()).toBe(403)
  })

  test('MANAGER CAN view operator roster and analytics for their own tenant', async () => {
    const rosterRes = await tenant.managerCtx.get('/api/v1/operators')
    expect(rosterRes.ok()).toBe(true)

    const overviewRes = await tenant.managerCtx.get('/api/v1/analytics/overview')
    expect(overviewRes.ok()).toBe(true)
  })

  test('ASSISTANT can be created without a tenantId (global operational role) and reach system health', async () => {
    const admin = await sharedAdminContext()
    const email = `assistant-${Date.now()}@e2e.gco`
    const createRes = await admin.post('/api/v1/admin/users', {
      data: { email, password: 'DemoPassword123!', displayName: '[E2E] Assistant', role: 'ASSISTANT' },
    })
    expect(createRes.ok()).toBe(true)
    const created = (await createRes.json()).data
    expect(created.tenantId).toBeNull()

    const assistantCtx = await loginAs(email)
    const healthRes = await assistantCtx.get('/api/v1/admin/system-health')
    expect(healthRes.ok()).toBe(true)

    // But an ASSISTANT still cannot do CEO_ADMIN-only tenant management.
    const tenantMgmtRes = await assistantCtx.post('/api/v1/admin/tenants', { data: { name: 'x', slug: `x-${Date.now()}` } })
    expect(tenantMgmtRes.status()).toBe(403)

    const { db } = await import('@/lib/db/client')
    await db.session.deleteMany({ where: { userId: created.id } })
    await db.auditLog.deleteMany({ where: { actorUserId: created.id } })
    await db.user.delete({ where: { id: created.id } })
  })

  test('unauthenticated requests are rejected across the board', async () => {
    const { anonymousContext } = await import('./helpers')
    const anon = await anonymousContext()
    const endpoints = ['/api/v1/conversations', '/api/v1/operators/me/workspace', '/api/v1/admin/tenants', '/api/v1/analytics/overview']
    for (const path of endpoints) {
      const res = await anon.get(path)
      expect(res.status(), path).toBe(401)
    }
    await anon.dispose()
  })
})
