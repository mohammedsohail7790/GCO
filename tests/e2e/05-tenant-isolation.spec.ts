import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 11 - tenant A must never reach tenant B's data, through any of: query
// params, path params, manipulated IDs, or direct API requests. This is the
// test suite that would have caught the IDOR fixed in
// docs/production-readiness-audit.md section 2.2/2.1.
test.describe('tenant isolation', () => {
  let tenantA: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let tenantB: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let conversationBId: string
  let messageBId: string

  test.beforeAll(async () => {
    tenantA = await seedIsolatedTenant('iso-a')
    tenantB = await seedIsolatedTenant('iso-b')

    const res = await sendWebhook(tenantB.integrationId, [
      { event_id: 'ev-iso-b-1', message_id: 'msg-iso-b-1', user_id: 'user-iso-b', text: 'tenant B private message' },
    ])
    expect(res.status()).toBe(202)

    await waitFor(async () => {
      const conv = await db.conversation.findFirst({ where: { tenantId: tenantB.tenantId, externalUserId: 'user-iso-b' } })
      if (!conv) return false
      conversationBId = conv.id
      return true
    })
    await waitFor(async () => {
      const msg = await db.message.findFirst({ where: { conversationId: conversationBId } })
      if (!msg) return false
      messageBId = msg.id
      return true
    })
  })

  test.afterAll(async () => {
    await cleanupTenant(tenantA.tenantId)
    await cleanupTenant(tenantB.tenantId)
  })

  test("tenant A's client cannot read tenant B's usage via a manipulated tenantId query param", async () => {
    const res = await tenantA.clientCtx.get(`/api/v1/usage/summary?tenantId=${tenantB.tenantId}`)
    expect(res.ok()).toBe(true)
    const data = (await res.json()).data
    // Must be silently pinned back to tenant A's own id, never tenant B's.
    expect(data.tenantId).toBe(tenantA.tenantId)
    expect(data.tenantId).not.toBe(tenantB.tenantId)
  })

  test("tenant A's manager cannot list tenant B's conversations via tenantId param", async () => {
    // A tenant-scoped MANAGER requesting a foreign tenantId is rejected
    // outright (403) by resolveTenantScope, rather than silently substituting
    // their own tenant - see lib/auth/tenantGuard.ts.
    const res = await tenantA.managerCtx.get(`/api/v1/conversations?tenantId=${tenantB.tenantId}`)
    expect(res.status()).toBe(403)

    // Omitting tenantId (or passing their own) still works normally.
    const ownRes = await tenantA.managerCtx.get('/api/v1/conversations')
    expect(ownRes.ok()).toBe(true)
    const data = (await ownRes.json()).data as Array<{ tenantId: string }>
    for (const c of data) expect(c.tenantId).toBe(tenantA.tenantId)
  })

  test("tenant A's operator cannot read tenant B's AI suggestion by guessing the conversation id", async () => {
    const res = await tenantA.operatorCtx.get(`/api/v1/conversations/${conversationBId}/suggestion`)
    expect(res.status()).toBe(403)
  })

  test("tenant A's operator cannot send a message into tenant B's conversation", async () => {
    const res = await tenantA.operatorCtx.post('/api/v1/messages/send', {
      data: { conversationId: conversationBId, content: 'injected from tenant A' },
    })
    expect(res.status()).toBe(403)

    const messages = await db.message.findMany({ where: { conversationId: conversationBId, direction: 'OUTBOUND' } })
    expect(messages.length).toBe(0)
  })

  test("tenant A's client cannot fetch tenant B's ticket by id", async () => {
    const ticketRes = await tenantB.clientCtx.post('/api/v1/tickets', {
      data: { type: 'FEEDBACK', subject: 'B only', description: 'should not leak to tenant A' },
    })
    expect(ticketRes.ok()).toBe(true)
    const ticketId = (await ticketRes.json()).data.id

    const leakAttempt = await tenantA.clientCtx.get(`/api/v1/tickets/${ticketId}`)
    expect(leakAttempt.status()).toBe(403)
  })

  test("tenant A's client cannot see tenant B's message content through the conversations list", async () => {
    const res = await tenantA.clientCtx.get('/api/v1/conversations')
    expect(res.ok()).toBe(true)
    const data = (await res.json()).data as Array<{ id: string }>
    expect(data.find((c) => c.id === conversationBId)).toBeUndefined()
  })

  test("a CLIENT never receives operator identity fields, even for its own tenant's conversations", async () => {
    const res = await sendWebhook(tenantA.integrationId, [
      { event_id: 'ev-iso-a-op', message_id: 'msg-iso-a-op', user_id: 'user-iso-a-op', text: 'assign me' },
    ])
    expect(res.status()).toBe(202)
    await waitFor(async () => (await db.conversation.count({ where: { tenantId: tenantA.tenantId, externalUserId: 'user-iso-a-op' } })) === 1)

    const listRes = await tenantA.clientCtx.get('/api/v1/conversations')
    expect(listRes.ok()).toBe(true)
    const data = (await listRes.json()).data as Array<{ currentAssignment: unknown }>
    const withAssignment = data.find((c: any) => c.currentAssignment)
    if (withAssignment) {
      expect((withAssignment as any).currentAssignment.operator).toBeUndefined()
    }

    const managerListRes = await tenantA.managerCtx.get('/api/v1/conversations')
    const managerData = (await managerListRes.json()).data as any[]
    const managerWithAssignment = managerData.find((c) => c.currentAssignment)
    if (managerWithAssignment) {
      expect(managerWithAssignment.currentAssignment.operator).toBeTruthy()
    }
  })
})
