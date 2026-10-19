import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant } from './helpers'

// Training modules, scored tests, client approval and the "no conversations until trained" gate over real HTTP.
test.describe('training and qualifications', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let opId = ''
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('tra'); b = await seedIsolatedTenant('trb')
    opId = (await db.operator.findFirstOrThrow({ where: { tenantId: a.tenantId } })).id
  })
  test.afterAll(async () => {
    await db.trainingAssignment.deleteMany({ where: { operatorId: opId } })
    await db.trainingModule.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await db.qualification.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('a required test blocks going available until passed; answers never leak; another client is shut out', async () => {
    const questions = [
      { q: 'Do operators need manager approval for ordinary replies?', options: ['Yes', 'No'], correct: 1 },
      { q: 'May you share one client\'s data with another?', options: ['Never', 'Sometimes'], correct: 0 },
    ]
    expect((await a.operatorCtx.post('/api/v1/training/modules', { data: { title: 'x', kind: 'MATERIAL', body: '' } })).status()).toBe(403)
    expect((await a.clientCtx.get('/api/v1/training/overview')).status()).toBe(403)
    const created = await a.managerCtx.post('/api/v1/training/modules', { data: { title: 'Onboarding basics', kind: 'TEST', body: 'Read the guide first.', questions, passMarkPercent: 100, required: true } })
    expect(created.status()).toBe(200)
    const moduleId = (await created.json()).data.id
    expect((await a.managerCtx.post('/api/v1/training/modules', { data: { title: 'Bad', kind: 'TEST', body: '', questions: [{ q: 'Q?', options: ['a'], correct: 0 }] } })).status()).toBe(400)
    expect((await a.managerCtx.post('/api/v1/training/modules', { data: { title: 'Global', kind: 'MATERIAL', body: '', companyWide: true } })).status()).toBe(403) // CEO only

    // gate
    const blocked = await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })
    expect(blocked.status()).toBe(409)
    expect((await blocked.json()).error.code).toBe('TRAINING_REQUIRED')
    expect((await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'PAUSED' } })).status()).toBe(200) // only AVAILABLE is gated

    // operator view has no answers
    const mine = await (await a.operatorCtx.get('/api/v1/operators/me/training')).json()
    expect(JSON.stringify(mine)).not.toContain('"correct"')
    expect(mine.data.gate.cleared).toBe(false)
    expect((await b.operatorCtx.get('/api/v1/operators/me/training').then((r) => r.json())).data.modules).toEqual([]) // other client's module is invisible

    // fail then pass
    const fail = await (await a.operatorCtx.post(`/api/v1/operators/me/training/${moduleId}/submit`, { data: { answers: [0, 1] } })).json()
    expect(fail.data).toMatchObject({ passed: false, score: 0 })
    expect(Object.keys(fail.data).sort()).toEqual(['correct', 'passMarkPercent', 'passed', 'score', 'total']) // counts only, never which answers were right
    expect((await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(409)
    const pass = await (await a.operatorCtx.post(`/api/v1/operators/me/training/${moduleId}/submit`, { data: { answers: [1, 0] } })).json()
    expect(pass.data).toMatchObject({ passed: true, score: 100 })
    expect((await a.operatorCtx.post(`/api/v1/operators/me/training/${moduleId}/submit`, { data: { answers: [1, 0] } })).status()).toBe(409) // already passed
    expect((await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(200)

    // manager progress view
    const ov = await (await a.managerCtx.get('/api/v1/training/overview')).json()
    expect(ov.data.operators.find((o: { operatorId: string }) => o.operatorId === opId)).toMatchObject({ completed: 1, total: 1, requiredOutstanding: [] })
    expect((await b.managerCtx.post(`/api/v1/training/modules/${moduleId}/assign`, { data: { operatorIds: [opId] } })).status()).toBeGreaterThanOrEqual(403)
  })

  test('client approval gate: needs a manager-granted approval when the client requires it', async () => {
    const admin = (await import('./helpers')).sharedAdminContext
    expect((await (await admin()).patch('/api/v1/tenant/settings', { data: { tenantId: a.tenantId, requireOperatorApproval: true } })).status()).toBe(200)
    await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'OFFLINE' } })
    const blocked = await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })
    expect(blocked.status()).toBe(409)
    expect((await a.operatorCtx.post('/api/v1/training/qualifications', { data: { operatorId: opId, kind: 'CLIENT_APPROVAL' } })).status()).toBe(403)
    expect((await b.managerCtx.post('/api/v1/training/qualifications', { data: { operatorId: opId, kind: 'CLIENT_APPROVAL' } })).status()).toBeGreaterThanOrEqual(403)
    const granted = await a.managerCtx.post('/api/v1/training/qualifications', { data: { operatorId: opId, kind: 'CLIENT_APPROVAL', note: 'Passed onboarding call' } })
    expect(granted.status()).toBe(200)
    expect((await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(200)
    // revoking closes the gate again
    expect((await a.managerCtx.delete('/api/v1/training/qualifications', { data: { id: (await granted.json()).data.id } })).status()).toBe(200)
    await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'OFFLINE' } })
    expect((await a.operatorCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(409)
    expect((await a.managerCtx.post('/api/v1/training/qualifications', { data: { operatorId: opId, kind: 'LANGUAGE', language: '12' } })).status()).toBe(400)
  })
})
