import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { anonymousContext, cleanupTenant, seedIsolatedTenant, sendWebhook, waitFor } from './helpers'

// Runs only against a stack where AI is DISABLED (the default/deployed configuration). On a stack that opted in to the MOCK provider for
// the AI specs (01, 08) it skips itself, so the suite proves both: AI paths work when explicitly enabled, and are inert otherwise.
test.describe('AI disabled stack', () => {
  let skip = false
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => {
    const h = await (await (await anonymousContext()).get('/api/v1/health')).json()
    skip = h.data.ai.enabled === true
    if (!skip) a = await seedIsolatedTenant('aioff')
  })
  test.afterAll(async () => { if (!skip) await cleanupTenant(a.tenantId) })

  test('health reports AI disabled and exposes nothing else about it', async () => {
    test.skip(skip, 'stack has AI enabled (mock opt-in)')
    const h = (await (await (await anonymousContext()).get('/api/v1/health')).json()).data
    expect(h.ai).toEqual({ enabled: false, mode: 'disabled' })
  })

  test('a full message lifecycle produces no AI generation, no suggestion and no memory', async () => {
    test.skip(skip, 'stack has AI enabled (mock opt-in)')
    await sendWebhook(a.integrationId, [{ event_id: `ai-${Date.now()}`, message_id: `aim-${Date.now()}`, user_id: 'ai-off-user', text: 'Hi, my name is Dana and I live in Oslo' }])
    expect(await waitFor(async () => (await db.assignment.count({ where: { tenantId: a.tenantId, status: 'ACTIVE' } })) === 1)).toBe(true) // the human flow still works
    await new Promise((r) => setTimeout(r, 3000)) // time for any (wrongly) queued AI job to run
    expect(await db.aiGeneration.count({ where: { tenantId: a.tenantId } })).toBe(0)
    expect(await db.aiMemory.count({ where: { tenantId: a.tenantId } })).toBe(0)
    const conv = await db.conversation.findFirstOrThrow({ where: { tenantId: a.tenantId } })
    const s = await a.operatorCtx.get(`/api/v1/conversations/${conv.id}/suggestion`)
    expect(s.status()).toBe(200); expect((await s.json()).data.generation).toBeNull()
    const ws = await (await a.operatorCtx.get('/api/v1/operators/me/workspace')).json()
    expect(JSON.stringify(ws)).not.toMatch(/suggestedReply|aiSuggest/i)
  })

  test('the human-only lifecycle works end to end: operator writes and sends, delivery is confirmed, usage is recorded, nothing AI is attached', async () => {
    test.skip(skip, 'stack has AI enabled (mock opt-in)')
    const conv = await db.conversation.findFirstOrThrow({ where: { tenantId: a.tenantId } })
    const sent = await a.operatorCtx.post('/api/v1/messages/send', { data: { conversationId: conv.id, content: 'Hi Dana, happy to help - what do you need?' } }) // no aiGenerationId: there is none
    expect(sent.ok()).toBe(true)
    const id = (await sent.json()).data.message.id
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id } }))?.status === 'DELIVERED')).toBe(true)
    expect((await db.message.findUniqueOrThrow({ where: { id } })).aiGenerationId).toBeNull()
    expect(await db.usageRecord.count({ where: { tenantId: a.tenantId } })).toBe(1)
    expect(await db.aiGeneration.count({ where: { tenantId: a.tenantId } })).toBe(0)
  })
})
