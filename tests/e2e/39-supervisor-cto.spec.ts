import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { hashPassword } from '../../lib/auth/password'
import { upsertStaffAccount } from '../../lib/auth/staffAccounts'
import { cleanupTenant, loginAs, seedIsolatedTenant } from './helpers'

// SUPERVISOR (tenant + team scoped) and CTO (global technical, no money/conversation access) over real HTTP.
test.describe('supervisor and CTO roles', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const stamp = Date.now()
  const PASSWORD = 'Harbor-Quiet-Lantern-2026'
  const emails = { sup: `sup-${stamp}@e2e.gco`, sup2: `sup2-${stamp}@e2e.gco`, op1: `team-op1-${stamp}@e2e.gco`, op2: `team-op2-${stamp}@e2e.gco`, cto: `cto-${stamp}@e2e.gco` }
  let op1Id = '', op2Id = '', bOpId = '', supId = ''
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('supa'); b = await seedIsolatedTenant('supb')
    const hash = await hashPassword(PASSWORD)
    const slugA = (await db.tenant.findUniqueOrThrow({ where: { id: a.tenantId } })).slug
    await upsertStaffAccount(db, { email: emails.sup, displayName: 'Sup One', role: 'SUPERVISOR', tenantSlug: slugA, passwordHash: hash })
    await upsertStaffAccount(db, { email: emails.sup2, displayName: 'Sup Two', role: 'SUPERVISOR', tenantSlug: slugA, passwordHash: hash })
    await upsertStaffAccount(db, { email: emails.op1, displayName: 'Team Op 1', role: 'OPERATOR', tenantSlug: slugA, passwordHash: hash })
    await upsertStaffAccount(db, { email: emails.op2, displayName: 'Team Op 2', role: 'OPERATOR', tenantSlug: slugA, passwordHash: hash })
    await upsertStaffAccount(db, { email: emails.cto, displayName: 'The CTO', role: 'CTO', passwordHash: hash })
    supId = (await db.user.findUniqueOrThrow({ where: { email: emails.sup } })).id
    op1Id = (await db.operator.findFirstOrThrow({ where: { user: { email: emails.op1 } } })).id
    op2Id = (await db.operator.findFirstOrThrow({ where: { user: { email: emails.op2 } } })).id
    bOpId = (await db.operator.findFirstOrThrow({ where: { tenantId: b.tenantId } })).id
  })
  test.afterAll(async () => {
    const ctoUser = await db.user.findUnique({ where: { email: emails.cto } })
    if (ctoUser) { await db.session.deleteMany({ where: { userId: ctoUser.id } }); await db.auditLog.deleteMany({ where: { actorUserId: ctoUser.id } }); await db.user.delete({ where: { id: ctoUser.id } }) }
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('a manager builds the team; the supervisor sees and manages only that team', async () => {
    const mgr = a.managerCtx
    // team assignment: only a same-client active SUPERVISOR is accepted
    expect((await mgr.patch(`/api/v1/operators/${op1Id}/team`, { data: { supervisorUserId: supId } })).status()).toBe(200)
    expect((await mgr.patch(`/api/v1/operators/${op1Id}/team`, { data: { supervisorUserId: (await db.user.findUniqueOrThrow({ where: { email: a.operatorEmail } })).id } })).status()).toBe(400) // not a supervisor
    expect((await a.operatorCtx.patch(`/api/v1/operators/${op1Id}/team`, { data: { supervisorUserId: supId } })).status()).toBe(403) // operators cannot

    const sup = await loginAs(emails.sup, PASSWORD)
    expect((await sup.get('/api/v1/auth/me').then((r) => r.json())).data.user).toMatchObject({ role: 'SUPERVISOR', tenantId: a.tenantId })
    const roster = (await (await sup.get('/api/v1/operators')).json()).data as { id: string }[]
    expect(roster.map((o) => o.id)).toEqual([op1Id]) // not op2, not the fixture operator
    expect((await (await mgr.get('/api/v1/operators')).json()).data.length).toBeGreaterThanOrEqual(3) // the manager still sees everyone

    expect((await sup.patch(`/api/v1/operators/${op1Id}/languages`, { data: { languages: ['en'] } })).status()).toBe(200)
    expect((await sup.patch(`/api/v1/operators/${op2Id}/languages`, { data: { languages: ['en'] } })).status()).toBe(403) // same client, not their team
    expect((await sup.patch(`/api/v1/operators/${bOpId}/languages`, { data: { languages: ['en'] } })).status()).toBe(403) // another client
    expect((await sup.get(`/api/v1/operators?tenantId=${b.tenantId}`)).status()).toBe(403)
  })

  // KNOWN GAP (pre-existing, not asserted here): GET /api/v1/usage/summary has no permission check, so any signed-in role can read
  // its tenant's message count and billed total. See the security review notes in the session summary.
  test('a supervisor has no money, sales, onboarding, account or system access', async () => {
    const sup = await loginAs(emails.sup2, PASSWORD)
    for (const path of ['/api/v1/admin/earnings/overview', '/api/v1/admin/earnings/rate-cards', '/api/v1/operators/me/earnings', '/api/v1/crm/dashboard/manager', '/api/v1/admin/onboarding', '/api/v1/admin/audit-logs', '/api/v1/admin/system-health']) {
      expect([401, 403], path).toContain((await sup.get(path)).status())
    }
    expect((await sup.post('/api/v1/admin/users', { data: { email: `x-${Date.now()}@e2e.gco`, password: 'Harbor-Quiet-Lantern-2026', displayName: 'x', role: 'CEO_ADMIN' } })).status()).toBe(403) // cannot create accounts
    expect((await sup.get('/api/v1/operators')).status()).toBe(200)
    expect((await (await sup.get('/api/v1/operators')).json()).data).toEqual([]) // no team yet: sees nothing, not everyone
    expect((await sup.get('/api/v1/qa/queue')).status()).toBe(200)
    expect((await (await sup.get('/api/v1/qa/queue')).json()).data).toEqual([])
    expect((await sup.get('/api/v1/escalations')).status()).toBe(200)
  })

  test('the CTO reaches technical views only', async () => {
    const cto = await loginAs(emails.cto, PASSWORD)
    expect((await cto.get('/api/v1/auth/me').then((r) => r.json())).data.user).toMatchObject({ role: 'CTO', tenantId: null })
    for (const path of ['/api/v1/admin/system-health', '/api/v1/admin/audit-logs', `/api/v1/ops/alerts?tenantId=${a.tenantId}`]) expect((await cto.get(path)).status(), path).toBe(200)
    for (const path of ['/api/v1/admin/earnings/overview', '/api/v1/admin/earnings/payouts', '/api/v1/crm/dashboard/ceo', '/api/v1/admin/tenants', '/api/v1/conversations/search?q=a', '/api/v1/operators', '/api/v1/escalations', '/api/v1/admin/onboarding']) {
      expect([401, 403], path).toContain((await cto.get(path)).status())
    }
    expect((await cto.post('/api/v1/admin/earnings/sync')).status()).toBe(403)
    expect((await cto.post('/api/v1/admin/users', { data: { email: `y-${Date.now()}@e2e.gco`, password: 'Harbor-Quiet-Lantern-2026', displayName: 'y', role: 'CEO_ADMIN' } })).status()).toBe(403)
  })
})
