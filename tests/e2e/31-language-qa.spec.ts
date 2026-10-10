import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, loginAs, seedIsolatedTenant, sendWebhook, waitFor } from './helpers'

// Language routing + quality review through the real API, worker and database.
test.describe('language routing', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { t = await seedIsolatedTenant('lang') })
  test.afterAll(async () => { await db.qaReview.deleteMany({ where: { tenantId: t.tenantId } }); await cleanupTenant(t.tenantId) })

  test('a manager sets operator languages; invalid codes are rejected; other tenants cannot touch the operator', async () => {
    const op = await db.operator.findFirstOrThrow({ where: { tenantId: t.tenantId } })
    expect((await t.managerCtx.patch(`/api/v1/operators/${op.id}/languages`, { data: { languages: ['English', 'es'] } })).status()).toBe(400)
    expect((await t.managerCtx.patch(`/api/v1/operators/${op.id}/languages`, { data: { languages: ['en'], extra: 1 } })).status()).toBe(400)
    const ok = await t.managerCtx.patch(`/api/v1/operators/${op.id}/languages`, { data: { languages: ['EN', 'es-MX', 'es'] } })
    expect(ok.status()).toBe(200)
    expect((await ok.json()).data.languages).toEqual(['en', 'es'])

    const other = await seedIsolatedTenant('lang-other')
    try {
      expect((await other.managerCtx.patch(`/api/v1/operators/${op.id}/languages`, { data: { languages: ['fr'] } })).status()).toBe(403)
      expect((await db.operator.findUniqueOrThrow({ where: { id: op.id } })).languages).toEqual(['en', 'es'])
    } finally { await cleanupTenant(other.tenantId) }

    for (const ctx of [t.operatorCtx, t.clientCtx]) expect((await ctx.patch(`/api/v1/operators/${op.id}/languages`, { data: { languages: ['en'] } })).status()).toBe(403)
    expect((await t.managerCtx.get('/api/v1/operators')).status()).toBe(200)
  })

  test('a Spanish message is routed only to the Spanish-capable operator and the language reaches the conversation', async () => {
    const op = await db.operator.findFirstOrThrow({ where: { tenantId: t.tenantId } })
    // The only operator handles English: a Spanish conversation must wait, not be mis-routed.
    await db.operator.update({ where: { id: op.id }, data: { languages: ['en'] } })
    const res = await sendWebhook(t.integrationId, [{ event_id: 'lang-ev-1', message_id: 'lang-m-1', user_id: 'lang-user-es', text: 'Hola, necesito ayuda', ...({ lang: 'es-MX' } as object) } as never])
    expect(res.status()).toBe(202)
    await waitFor(async () => (await db.conversation.count({ where: { tenantId: t.tenantId, externalUserId: 'lang-user-es' } })) === 1)
    await new Promise((r) => setTimeout(r, 1500))
    const conv = await db.conversation.findFirstOrThrow({ where: { tenantId: t.tenantId, externalUserId: 'lang-user-es' } })
    expect(conv.language).toBe('es')
    expect(conv.currentAssignmentId).toBeNull()
    expect(conv.state).toBe('QUEUED')

    const cov = await (await t.managerCtx.get('/api/v1/operators/language-coverage')).json()
    expect(cov.data.languages.find((l: { code: string }) => l.code === 'es')).toMatchObject({ queued: 1, covered: false })

    // Adding Spanish to the operator assigns the waiting conversation automatically.
    expect((await t.managerCtx.patch(`/api/v1/operators/${op.id}/languages`, { data: { languages: ['en', 'es'] } })).status()).toBe(200)
    const after = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })
    expect(after.currentAssignmentId).not.toBeNull()
    const cov2 = await (await t.managerCtx.get('/api/v1/operators/language-coverage')).json()
    expect(cov2.data.languages.find((l: { code: string }) => l.code === 'es')).toMatchObject({ queued: 0, covered: true })
  })

  test('quality review: queue, validation, submit, summary, and role/tenant protection', async () => {
    const conv = await db.conversation.findFirstOrThrow({ where: { tenantId: t.tenantId, externalUserId: 'lang-user-es' } })
    const op = await db.operator.findFirstOrThrow({ where: { tenantId: t.tenantId } })
    const out = await db.message.create({ data: { tenantId: t.tenantId, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'Claro, con gusto le ayudo.', externalMessageId: `qa-e2e-${Date.now()}`, operatorId: op.id, sentAt: new Date() } })

    const q = await (await t.managerCtx.get('/api/v1/qa/queue')).json()
    expect(q.data.find((i: { messageId: string }) => i.messageId === out.id)).toMatchObject({ language: 'es', customerMessage: 'Hola, necesito ayuda' })

    const post = (data: Record<string, unknown>) => t.managerCtx.post('/api/v1/qa/reviews', { data })
    expect((await post({ messageId: out.id, accuracy: 6, tone: 4, resolution: 4 })).status()).toBe(400)
    expect((await post({ messageId: out.id, accuracy: 4, tone: 4, resolution: 4, outcome: 'PASS' })).status()).toBe(400) // outcome is derived, not client-set
    const done = await post({ messageId: out.id, accuracy: 4, tone: 5, resolution: 4, flags: ['tone'], note: 'Warm and clear' })
    expect(done.status()).toBe(201)
    expect((await done.json()).data.outcome).toBe('PASS')
    expect((await post({ messageId: out.id, accuracy: 4, tone: 4, resolution: 4 })).status()).toBe(409)
    const sum = await (await t.managerCtx.get('/api/v1/qa/summary')).json()
    expect(sum.data.totalReviews).toBe(1)

    const stranger = await seedIsolatedTenant('qa-other')
    try {
      expect((await stranger.managerCtx.post('/api/v1/qa/reviews', { data: { messageId: out.id, accuracy: 1, tone: 1, resolution: 1 } })).status()).toBe(404)
      const theirs = await (await stranger.managerCtx.get('/api/v1/qa/queue')).json()
      expect(theirs.data.map((i: { messageId: string }) => i.messageId)).not.toContain(out.id)
    } finally { await cleanupTenant(stranger.tenantId) }

    const msg = await db.message.findUniqueOrThrow({ where: { id: out.id } })
    expect(msg.status).toBe('DELIVERED')
    for (const ctx of [t.operatorCtx, t.clientCtx, await loginAs('hunter1@demo.gco')]) {
      expect((await ctx.get('/api/v1/qa/queue')).status()).toBe(403)
      expect((await ctx.get('/api/v1/qa/summary')).status()).toBe(403)
      expect((await ctx.post('/api/v1/qa/reviews', { data: { messageId: out.id, accuracy: 5, tone: 5, resolution: 5 } })).status()).toBe(403)
    }
    expect(await db.qaReview.count({ where: { tenantId: t.tenantId } })).toBe(1)
  })
})
