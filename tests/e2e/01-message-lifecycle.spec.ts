import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 1 - full normal message flow, DB-verified at every step.
test.describe('normal message lifecycle', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('lifecycle')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('webhook -> message -> conversation -> assignment -> AI suggestion -> operator edit -> send -> delivery -> usage', async () => {
    const webhookRes = await sendWebhook(tenant.integrationId, [
      { event_id: 'ev-lifecycle-1', message_id: 'msg-lifecycle-1', user_id: 'user-lifecycle-1', text: 'Hello, is anyone there?' },
    ])
    expect(webhookRes.status()).toBe(202)

    const conversation = await waitForConversation(tenant.tenantId, 'user-lifecycle-1')
    expect(conversation).toBeTruthy()
    expect(conversation!.state).toBe('ACTIVE')
    expect(conversation!.currentAssignmentId).toBeTruthy()

    const message = await db.message.findFirst({ where: { conversationId: conversation!.id, direction: 'INBOUND' } })
    expect(message?.externalMessageId).toBe('msg-lifecycle-1')
    expect(message?.status).toBe('RECEIVED')

    const assignment = await db.assignment.findUnique({ where: { id: conversation!.currentAssignmentId! } })
    expect(assignment?.status).toBe('ACTIVE')
    expect(assignment?.respondsBy.getTime()).toBeGreaterThan(Date.now())

    const generation = await waitForGeneration(conversation!.id)
    expect(generation).toBeTruthy()
    expect(generation!.status).toBe('generated')
    expect(generation!.suggestedReply.length).toBeGreaterThan(0)

    // Operator reads the suggestion through the real API (not directly from DB).
    const suggestionRes = await tenant.operatorCtx.get(`/api/v1/conversations/${conversation!.id}/suggestion`)
    expect(suggestionRes.ok()).toBe(true)
    const suggestionBody = (await suggestionRes.json()).data.generation
    expect(suggestionBody.suggestedReply).toBe(generation!.suggestedReply)

    // Operator edits and sends a DIFFERENT reply than the suggestion.
    const editedReply = 'Yes! Thanks for reaching out - how can I help?'
    expect(editedReply).not.toBe(generation!.suggestedReply)
    const sendRes = await tenant.operatorCtx.post('/api/v1/messages/send', {
      data: { conversationId: conversation!.id, content: editedReply, aiGenerationId: generation!.id },
    })
    expect(sendRes.ok()).toBe(true)
    const sentMessage = (await sendRes.json()).data.message
    expect(sentMessage.content).toBe(editedReply)

    const delivered = await waitFor(async () => {
      const m = await db.message.findUnique({ where: { id: sentMessage.id } })
      return m?.status === 'DELIVERED'
    })
    expect(delivered).toBe(true)

    const finalGeneration = await db.aiGeneration.findUnique({ where: { id: generation!.id } })
    expect(finalGeneration?.status).toBe('edited')

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

async function waitForGeneration(conversationId: string) {
  let generation = null
  await waitFor(async () => {
    generation = await db.aiGeneration.findFirst({ where: { conversationId }, orderBy: { createdAt: 'desc' } })
    return generation !== null
  })
  return generation as Awaited<ReturnType<typeof db.aiGeneration.findFirst>>
}
