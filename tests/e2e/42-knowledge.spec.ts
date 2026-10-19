import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant } from './helpers'

test.describe('client knowledge: quick replies, articles, instructions', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { a = await seedIsolatedTenant('kba'); b = await seedIsolatedTenant('kbb') })
  test.afterAll(async () => {
    await db.knowledgeEntry.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId)
  })

  test('managers maintain it; operators read their own client\'s, filtered by language; nobody crosses clients', async () => {
    expect((await a.operatorCtx.post('/api/v1/knowledge', { data: { kind: 'QUICK_REPLY', title: 'Hi', body: 'Hello!' } })).status()).toBe(403)
    expect((await a.clientCtx.get('/api/v1/knowledge')).status()).toBe(403)
    const mk = (ctx: typeof a.managerCtx, d: object) => ctx.post('/api/v1/knowledge', { data: d })
    const greet = await mk(a.managerCtx, { kind: 'QUICK_REPLY', title: 'Greeting', body: 'Hello, how can I help?', tags: ['Intro'] })
    expect(greet.status()).toBe(200)
    await mk(a.managerCtx, { kind: 'QUICK_REPLY', title: 'Saludo', body: 'Hola, ¿en qué puedo ayudarte?', language: 'es' })
    await mk(a.managerCtx, { kind: 'INSTRUCTION', title: 'Refund policy', body: 'Refunds within 14 days only.' })
    await mk(b.managerCtx, { kind: 'INSTRUCTION', title: 'SECRET of client B', body: 'never visible to A' })
    expect((await mk(a.managerCtx, { kind: 'QUICK_REPLY', title: 'Bad', body: 'x', language: '12' })).status()).toBe(400)
    expect((await mk(a.managerCtx, { kind: 'QUICK_REPLY', title: 'Bad', body: 'x', tenantId: b.tenantId })).status()).toBe(403)

    const en = (await (await a.operatorCtx.get('/api/v1/operators/me/knowledge?language=en')).json()).data as { title: string; kind: string }[]
    expect(en.map((e) => e.title)).toEqual(['Refund policy', 'Greeting']) // instruction first, Spanish reply hidden
    const es = (await (await a.operatorCtx.get('/api/v1/operators/me/knowledge?language=es')).json()).data as { title: string }[]
    expect(es.map((e) => e.title)).toContain('Saludo')
    const search = (await (await a.operatorCtx.get('/api/v1/operators/me/knowledge?language=en&q=intro')).json()).data as { title: string }[]
    expect(search.map((e) => e.title)).toEqual(['Greeting'])
    expect(JSON.stringify(en)).not.toContain('SECRET')
    expect((await a.managerCtx.get('/api/v1/operators/me/knowledge')).status()).toBe(403)

    const id = (await greet.json()).data.id
    expect((await b.managerCtx.patch(`/api/v1/knowledge/${id}`, { data: { archived: true } })).status()).toBeGreaterThanOrEqual(403)
    expect((await a.managerCtx.patch(`/api/v1/knowledge/${id}`, { data: { body: 'Hi there, how can I help?' } })).status()).toBe(200)
    expect((await a.managerCtx.patch(`/api/v1/knowledge/${id}`, { data: { archived: true } })).status()).toBe(200)
    const after = (await (await a.operatorCtx.get('/api/v1/operators/me/knowledge?language=en')).json()).data as { title: string }[]
    expect(after.map((e) => e.title)).toEqual(['Refund policy'])
  })
})
