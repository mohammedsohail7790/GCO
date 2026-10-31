import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// P0-8: an operator must be able to see whether each reply reached the client's platform, including after the conversation has left
// their screen. The workspace returns the operator's own replies of the last 24 hours with their delivery state.
test.describe('operator recently sent replies and delivery status', () => {
  let t: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let other: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { t = await seedIsolatedTenant('recent'); other = await seedIsolatedTenant('recent-other') })
  test.afterAll(async () => { await cleanupTenant(t.tenantId); await cleanupTenant(other.tenantId) })

  const workspace = async (ctx: typeof t.operatorCtx) => (await (await ctx.get('/api/v1/operators/me/workspace')).json()).data

  test('a sent reply appears with its delivery state, a failed one is shown as failed, and nobody else sees it', async () => {
    expect((await sendWebhook(t.integrationId, [{ event_id: 'ev-recent-1', message_id: 'msg-recent-1', user_id: 'user-recent-1', text: 'Is anyone there?' }])).status()).toBe(202)
    let convId = ''
    await waitFor(async () => {
      const c = await db.conversation.findFirst({ where: { tenantId: t.tenantId, externalUserId: 'user-recent-1' } })
      convId = c?.id ?? ''
      return !!c?.currentAssignmentId
    })
    const sent = await t.operatorCtx.post('/api/v1/messages/send', { data: { conversationId: convId, content: 'Yes, how can I help you today?' } })
    expect(sent.ok()).toBe(true)
    const messageId: string = (await sent.json()).data.message.id

    // delivered through the dev-mock adapter
    expect(await waitFor(async () => (await workspace(t.operatorCtx)).recentReplies.some((r: { id: string; status: string }) => r.id === messageId && r.status === 'DELIVERED'))).toBe(true)
    const ws = await workspace(t.operatorCtx)
    expect(ws.conversations.find((c: { conversation: { id: string } }) => c.conversation.id === convId)).toBeUndefined() // the conversation has left the screen...
    expect(ws.recentReplies[0]).toMatchObject({ id: messageId, conversationId: convId, status: 'DELIVERED', preview: 'Yes, how can I help you today?' }) // ...but the reply is still visible

    // a failed delivery must be visible, without exposing the internal failure reason
    await db.message.update({ where: { id: messageId }, data: { status: 'FAILED', failedReason: 'upstream said: secret-internal-detail' } })
    const failed = (await workspace(t.operatorCtx)).recentReplies.find((r: { id: string }) => r.id === messageId)
    expect(failed.status).toBe('FAILED')
    expect(JSON.stringify(failed)).not.toContain('secret-internal-detail')

    // another operator (different client) never sees it
    const otherWs = await workspace(other.operatorCtx)
    expect(otherWs.recentReplies.some((r: { id: string }) => r.id === messageId)).toBe(false)
  })

  test('replies older than 24 hours are not listed', async () => {
    const op = await db.operator.findFirstOrThrow({ where: { tenantId: t.tenantId } })
    const conv = await db.conversation.findFirstOrThrow({ where: { tenantId: t.tenantId } })
    const old = await db.message.create({ data: { tenantId: t.tenantId, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'old reply', externalMessageId: `out_old_${Date.now()}`, operatorId: op.id, createdAt: new Date(Date.now() - 26 * 3600 * 1000) } })
    expect((await workspace(t.operatorCtx)).recentReplies.some((r: { id: string }) => r.id === old.id)).toBe(false)
  })
})
