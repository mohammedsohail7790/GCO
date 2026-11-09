import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant } from './helpers'

// Operator time zones over real HTTP: who may set one, validation, tenant isolation, and the zones reaching the shift views.
test.describe('operator time zones', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let opId = ''
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('tza'); b = await seedIsolatedTenant('tzb')
    opId = (await db.operator.findFirstOrThrow({ where: { tenantId: a.tenantId } })).id
  })
  test.afterAll(async () => {
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('only planners of the same client set it; invalid zones are refused; the canonical name is stored and audited', async () => {
    const url = `/api/v1/operators/${opId}/timezone`
    expect((await a.operatorCtx.patch(url, { data: { timezone: 'Asia/Kolkata' } })).status()).toBe(403)
    expect((await a.clientCtx.patch(url, { data: { timezone: 'Asia/Kolkata' } })).status()).toBe(403)
    expect((await b.managerCtx.patch(url, { data: { timezone: 'Asia/Kolkata' } })).status()).toBeGreaterThanOrEqual(403) // another client's operator
    expect((await a.managerCtx.patch(url, { data: { timezone: 'Mars/Olympus' } })).status()).toBe(400)
    expect((await a.managerCtx.patch(url, { data: { timezone: 'Asia/Kolkata', extra: 1 } })).status()).toBe(400)
    expect((await db.operator.findUniqueOrThrow({ where: { id: opId } })).timezone).toBeNull()

    // The case is corrected for a listed zone; a valid current name is kept as given (not turned into a legacy alias)
    const lower = await a.managerCtx.patch(url, { data: { timezone: 'europe/rome' } })
    expect((await lower.json()).data.timezone).toBe('Europe/Rome')
    const set = await a.managerCtx.patch(url, { data: { timezone: 'Asia/Kolkata' } })
    expect(set.status()).toBe(200)
    expect((await set.json()).data.timezone).toBe('Asia/Kolkata')
    expect((await db.operator.findUniqueOrThrow({ where: { id: opId } })).timezone).toBe('Asia/Kolkata')
    expect(await db.auditLog.count({ where: { action: 'operator.timezone_set', resourceId: opId } })).toBe(2)

    const roster = (await (await a.managerCtx.get('/api/v1/operators')).json()).data
    expect(roster.find((o: { id: string }) => o.id === opId).timezone).toBe('Asia/Kolkata')
    const cov = (await (await a.managerCtx.get('/api/v1/shifts/coverage')).json()).data
    expect(typeof cov.timezone).toBe('string')
    const mine = (await (await a.operatorCtx.get('/api/v1/operators/me/shifts')).json()).data
    expect(mine.timezone).toBe('Asia/Kolkata')
    expect(mine.clientTimezone).toBe(cov.timezone)

    expect((await a.managerCtx.patch(url, { data: { timezone: null } })).status()).toBe(200)
    expect((await db.operator.findUniqueOrThrow({ where: { id: opId } })).timezone).toBeNull()
  })
})
