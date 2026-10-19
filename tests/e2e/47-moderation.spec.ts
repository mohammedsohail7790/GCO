import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, seedIsolatedTenant, sharedAdminContext, signWebhookBody, anonymousContext } from './helpers'

// Moderation over real HTTP: signed ingest, claim/decide, escalation, appeals, roles and isolation between clients.
test.describe('moderation module', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const post = async (integrationId: string, body: object, bad = false) => {
    const raw = JSON.stringify(body)
    return (await anonymousContext()).post(`/api/v1/moderation/ingest/${integrationId}`, { data: raw, headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': bad ? 'deadbeef'.repeat(8) : signWebhookBody(raw) } })
  }
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('moda'); b = await seedIsolatedTenant('modb')
    const admin = await sharedAdminContext()
    expect((await admin.put(`/api/v1/tenant/services`, { data: { tenantId: a.tenantId, industry: 'GAMING', services: ['CHAT_MODERATION', 'COMMUNITY_MODERATION'] } })).status()).toBe(200)
  })
  test.afterAll(async () => {
    for (const t of [a.tenantId, b.tenantId]) {
      await db.moderationAppeal.deleteMany({ where: { tenantId: t } }); await db.moderationAction.deleteMany({ where: { tenantId: t } }); await db.moderationDecision.deleteMany({ where: { tenantId: t } }); await db.moderationItem.deleteMany({ where: { tenantId: t } }); await db.tenantService.deleteMany({ where: { tenantId: t } })
      await cleanupTenant(t)
    }
  })

  test('signed ingest is idempotent; forged, oversized-shape and module-off requests are refused', async () => {
    const items = [{ kind: 'COMMENT', externalItemId: 'k1', subjectExternalId: 'u-1', content: 'hello there', flagReason: 'user report' }, { kind: 'IMAGE', externalItemId: 'k2', subjectExternalId: 'u-2', mediaUrl: 'https://cdn.example.com/p.png' }]
    expect((await post(a.integrationId, { items }, true)).status()).toBe(401)
    expect((await post(a.integrationId, { items: [] })).status()).toBe(400)
    expect((await post(a.integrationId, { items: [{ ...items[0], mediaUrl: 'http://plain.example/x.png' }] })).status()).toBe(400)
    const first = await post(a.integrationId, { items })
    expect(first.status()).toBe(200); expect((await first.json()).data).toMatchObject({ created: 2, duplicates: 0 })
    expect((await (await post(a.integrationId, { items })).json()).data).toMatchObject({ created: 0, duplicates: 2 })
    expect((await post(b.integrationId, { items })).status()).toBe(409) // client B has not bought moderation
    expect((await post('does-not-exist', { items })).status()).toBe(404)
  })

  test('operator claims, decides and escalates; manager resolves; roles and clients are separated', async () => {
    await post(a.integrationId, { items: [{ kind: 'POST', externalItemId: 'k3', subjectExternalId: 'u-3', content: 'borderline post' }] })
    for (const ctx of [a.managerCtx, a.clientCtx]) expect((await ctx.post('/api/v1/moderation/claim', { data: {} })).status()).toBe(403)
    expect((await b.operatorCtx.post('/api/v1/moderation/claim', { data: {} })).status()).toBe(409) // module off for B
    const claimed = (await (await a.operatorCtx.post('/api/v1/moderation/claim', { data: {} })).json()).data as { id: string; content: string | null; subjectExternalId: string }[]
    expect(claimed.length).toBe(3)
    const mine = (await (await a.operatorCtx.get('/api/v1/moderation/mine')).json()).data
    expect(mine.categories).toContain('harassment')
    const byExt = (s: string) => claimed.find((c) => c.subjectExternalId === s)!
    const approve = byExt('u-1'), image = byExt('u-2'), post3 = byExt('u-3')
    expect((await a.operatorCtx.post(`/api/v1/moderation/items/${approve.id}/decide`, { data: { verdict: 'APPROVE' } })).status()).toBe(200)
    expect((await a.operatorCtx.post(`/api/v1/moderation/items/${image.id}/decide`, { data: { verdict: 'REJECT' } })).status()).toBe(400) // needs a category
    expect((await a.operatorCtx.post(`/api/v1/moderation/items/${image.id}/decide`, { data: { verdict: 'REJECT', category: 'nudity' } })).status()).toBe(200)
    expect((await a.operatorCtx.post(`/api/v1/moderation/items/${post3.id}/decide`, { data: { verdict: 'ESCALATE', note: 'cannot tell if sarcasm' } })).status()).toBe(200)
    expect((await b.operatorCtx.post(`/api/v1/moderation/items/${approve.id}/decide`, { data: { verdict: 'APPROVE' } })).status()).toBeGreaterThanOrEqual(404) // not B's item

    const ov = await (await a.managerCtx.get('/api/v1/moderation/overview')).json()
    expect(ov.data.queue.escalated).toBe(1); expect(ov.data.escalated[0].id).toBe(post3.id)
    expect((await a.operatorCtx.get('/api/v1/moderation/overview')).status()).toBe(403)
    expect((await b.managerCtx.get(`/api/v1/moderation/overview?tenantId=${a.tenantId}`)).status()).toBe(403)
    expect((await a.operatorCtx.post(`/api/v1/moderation/items/${post3.id}/resolve`, { data: { verdict: 'APPROVE' } })).status()).toBe(403)
    expect((await b.managerCtx.post(`/api/v1/moderation/items/${post3.id}/resolve`, { data: { verdict: 'APPROVE' } })).status()).toBeGreaterThanOrEqual(403)
    expect((await a.managerCtx.post(`/api/v1/moderation/items/${post3.id}/resolve`, { data: { verdict: 'REJECT', category: 'harassment', note: 'abusive in context' } })).status()).toBe(200)

    // warning request: operator asks, manager confirms, never the same person
    const act = await a.operatorCtx.post('/api/v1/moderation/actions', { data: { subjectExternalId: 'u-2', kind: 'WARNING', itemId: image.id, reason: 'second image this week' } })
    expect(act.status()).toBe(200)
    const actionId = (await act.json()).data.id
    expect((await a.operatorCtx.post(`/api/v1/moderation/actions/${actionId}/decide`, { data: { applied: true } })).status()).toBe(403)
    expect((await a.managerCtx.post(`/api/v1/moderation/actions/${actionId}/decide`, { data: { applied: true } })).status()).toBe(200)
    const hist = (await (await a.operatorCtx.get('/api/v1/moderation/history?subject=u-2')).json()).data
    expect(hist.items[0].decisions[0]).toMatchObject({ verdict: 'REJECT', category: 'nudity' }); expect(hist.actions[0].status).toBe('APPLIED')
    expect((await b.operatorCtx.get('/api/v1/moderation/history?subject=u-2').then((r) => r.json())).data.items).toEqual([]) // other clients see nothing
  })

  test('appeals come from the client and are decided by someone who did not decide the item', async () => {
    const appeal = await a.clientCtx.post('/api/v1/client/moderation/appeals', { data: { kind: 'IMAGE', externalItemId: 'k2', reason: 'This is a product photo, not nudity' } })
    expect(appeal.status()).toBe(200)
    expect((await b.clientCtx.post('/api/v1/client/moderation/appeals', { data: { kind: 'IMAGE', externalItemId: 'k2', reason: 'trying another client\'s item' } })).status()).toBe(409)
    expect((await a.operatorCtx.post('/api/v1/client/moderation/appeals', { data: { kind: 'IMAGE', externalItemId: 'k2', reason: 'operators cannot file' } })).status()).toBe(403)
    const id = (await appeal.json()).data.id
    expect((await a.operatorCtx.post(`/api/v1/moderation/appeals/${id}/decide`, { data: { outcome: 'UPHELD' } })).status()).toBe(403) // decided the item himself
    expect((await a.managerCtx.post(`/api/v1/moderation/appeals/${id}/decide`, { data: { outcome: 'OVERTURNED', note: 'it is a product photo' } })).status()).toBe(200)
    const summary = (await (await a.clientCtx.get('/api/v1/client/moderation/summary')).json()).data
    expect(summary.items.DECIDED).toBeGreaterThanOrEqual(3); expect(summary.appeals.OVERTURNED).toBe(1)
    expect(JSON.stringify(summary)).not.toContain('operator'); expect((await b.clientCtx.get('/api/v1/client/moderation/summary').then((r) => r.json())).data.items).toEqual({})
  })
})
