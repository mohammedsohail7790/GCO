import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 1b - the same lifecycle with AI off: no draft is created, and a human operator's reply is still sent and delivered.
test.describe('normal message lifecycle (AI off)', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('lifecycle-aioff')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('webhook -> message -> conversation -> assignment -> no AI draft -> operator reply -> send -> delivery -> usage', async () => {
    const webhookRes = await sendWebhook(tenant.integrationId, [
      { event_id: 'ev-lifecycle-aioff-1', message_id: 'msg-lifecycle-aioff-1', user_id: 'user-lifecycle-aioff-1', text: 'Hello, is anyone there?' },
    ])
    expect(webhookRes.status()).toBe(202)

    const conversation = await waitForConversation(tenant.tenantId, 'user-lifecycle-aioff-1')
    expect(conversation).toBeTruthy()
    expect(conversation!.state).toBe('ACTIVE')
    expect(conversation!.currentAssignmentId).toBeTruthy()

    const message = await db.message.findFirst({ where: { conversationId: conversation!.id, direction: 'INBOUND' } })
    expect(message?.externalMessageId).toBe('msg-lifecycle-aioff-1')
    expect(message?.status).toBe('RECEIVED')

    const assignment = await db.assignment.findUnique({ where: { id: conversation!.currentAssignmentId! } })
    expect(assignment?.status).toBe('ACTIVE')
    expect(assignment?.respondsBy.getTime()).toBeGreaterThan(Date.now())

    // With AI off no draft may exist, and the suggestion endpoint returns none.
    await new Promise((r) => setTimeout(r, 3000))
    expect(await db.aiGeneration.count({ where: { conversationId: conversation!.id } })).toBe(0)
    const suggestionRes = await tenant.operatorCtx.get(`/api/v1/conversations/${conversation!.id}/suggestion`)
    expect(suggestionRes.ok()).toBe(true)
    expect((await suggestionRes.json()).data.generation ?? null).toBeNull()

    const reply = 'Yes! Thanks for reaching out - how can I help?'
    const sendRes = await tenant.operatorCtx.post('/api/v1/messages/send', {
      data: { conversationId: conversation!.id, content: reply },
    })
    expect(sendRes.ok()).toBe(true)
    const sentMessage = (await sendRes.json()).data.message
    expect(sentMessage.content).toBe(reply)

    const delivered = await waitFor(async () => {
      const m = await db.message.findUnique({ where: { id: sentMessage.id } })
      return m?.status === 'DELIVERED'
    })
    expect(delivered).toBe(true)

    const finalAssignment = await db.assignment.findUnique({ where: { id: assignment!.id } })
    expect(finalAssignment?.status).toBe('COMPLETED')
    expect(finalAssignment?.respondedAt).toBeTruthy()

    const usageRecords = await db.usageRecord.findMany({ where: { tenantId: tenant.tenantId } })
    // Exactly one billable record per processed message - inbound only (per
    // lib/usage/ledger.ts, outbound sends aren't separately billed in V1).
    expect(usageRecords.length).toBe(1)
    expect(usageRecords[0]!.messageId).toBe(message!.id)
  })
})

async function waitForConversation(tenantId: string, externalUserId: string) {
  // Wait for assignment to actually complete, not just for the row to exist -
  // ingestOneMessage creates the Conversation row (state QUEUED) and only
  // flips it to ACTIVE moments later once tryAssignConversation commits.
  let conversation = null
  await waitFor(async () => {
    conversation = await db.conversation.findFirst({ where: { tenantId, externalUserId } })
    return conversation !== null && conversation.currentAssignmentId !== null
  })
  return conversation as Awaited<ReturnType<typeof db.conversation.findFirst>>
}

