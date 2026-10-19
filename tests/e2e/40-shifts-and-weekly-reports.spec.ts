import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant } from './helpers'

// Shift planning, handovers and weekly reports over real HTTP: roles, tenant isolation and the review/freeze flow.
test.describe('shifts, handovers and weekly reports', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let opId = ''
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('shfa'); b = await seedIsolatedTenant('shfb')
    opId = (await db.operator.findFirstOrThrow({ where: { tenantId: a.tenantId } })).id
  })
  test.afterAll(async () => {
    await db.shiftHandover.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await db.shift.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await db.absence.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await db.operatorWeeklyReport.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('only planners create shifts, within their own client', async () => {
    const start = new Date(Date.now() + 25 * 3_600_000).toISOString(); const end = new Date(Date.now() + 33 * 3_600_000).toISOString()
    const body = { operatorId: opId, startsAt: start, endsAt: end }
    expect((await a.operatorCtx.post('/api/v1/shifts', { data: body })).status()).toBe(403)
    expect((await a.clientCtx.post('/api/v1/shifts', { data: body })).status()).toBe(403)
    expect((await b.managerCtx.post('/api/v1/shifts', { data: body })).status()).toBe(404) // another client's operator
    const created = await a.managerCtx.post('/api/v1/shifts', { data: body })
    expect(created.status()).toBe(200)
    expect((await a.managerCtx.post('/api/v1/shifts', { data: body })).status()).toBe(409) // overlap
    const mine = await (await a.operatorCtx.get('/api/v1/operators/me/shifts')).json()
    expect(mine.data.shifts).toHaveLength(1)
    expect((await b.managerCtx.get('/api/v1/shifts')).status()).toBe(200)
    expect((await (await b.managerCtx.get('/api/v1/shifts')).json()).data).toEqual([]) // tenant B sees nothing of A
    const id = (await created.json()).data.id
    expect((await b.managerCtx.delete(`/api/v1/shifts/${id}`)).status()).toBeGreaterThanOrEqual(403)
    expect((await a.managerCtx.delete(`/api/v1/shifts/${id}`)).status()).toBe(200)
    const cov = await (await a.managerCtx.get('/api/v1/shifts/coverage')).json()
    expect(cov.data.slots).toHaveLength(24)
  })

  test('handover notes reach the team and are acknowledged once', async () => {
    const h = await a.operatorCtx.post('/api/v1/handovers', { data: { body: 'Queue is calm, one refund pending', conversationIds: [] } })
    expect(h.status()).toBe(200)
    const id = (await h.json()).data.id
    expect((await a.managerCtx.get('/api/v1/handovers')).status()).toBe(200)
    expect((await b.operatorCtx.post(`/api/v1/handovers/${id}/ack`, { data: {} })).status()).toBe(404) // another client
    expect((await a.managerCtx.post(`/api/v1/handovers/${id}/ack`, { data: {} })).status()).toBe(200)
    expect((await a.managerCtx.post(`/api/v1/handovers/${id}/ack`, { data: {} })).status()).toBe(409)
    expect((await a.clientCtx.get('/api/v1/handovers')).status()).toBe(403)
  })

  test('weekly reports: managers review and freeze them, the operator then sees the feedback, others are refused', async () => {
    expect((await a.operatorCtx.get('/api/v1/reports/weekly')).status()).toBe(403)
    expect((await a.clientCtx.get('/api/v1/reports/weekly')).status()).toBe(403)
    expect((await a.managerCtx.get('/api/v1/reports/weekly?week=not-a-date')).status()).toBe(400)
    const list = await a.managerCtx.get('/api/v1/reports/weekly')
    expect(list.status()).toBe(200)
    const reports = (await list.json()).data.reports as { id: string; operator: { id: string }; status: string }[]
    const mine = reports.find((r) => r.operator.id === opId)!
    expect(mine.status).toBe('DRAFT')
    expect((await b.managerCtx.patch(`/api/v1/reports/weekly/${mine.id}`, { data: { feedback: 'x' } })).status()).toBe(403) // another client's manager
    expect((await a.operatorCtx.patch(`/api/v1/reports/weekly/${mine.id}`, { data: { feedback: 'x' } })).status()).toBe(403)
    expect((await a.managerCtx.patch(`/api/v1/reports/weekly/${mine.id}`, { data: { feedback: 'Solid week, keep the tone up' } })).status()).toBe(200)
    expect((await a.managerCtx.patch(`/api/v1/reports/weekly/${mine.id}`, { data: { feedback: 'again' } })).status()).toBe(409)
    const own = (await (await a.operatorCtx.get('/api/v1/operators/me/reports')).json()).data
    expect(own.current.metrics).toHaveProperty('earningsEurCents')
    expect(own.history.map((r: { managerFeedback: string }) => r.managerFeedback)).toContain('Solid week, keep the tone up')
    expect((await a.managerCtx.get('/api/v1/operators/me/reports')).status()).toBe(403)
  })
})
