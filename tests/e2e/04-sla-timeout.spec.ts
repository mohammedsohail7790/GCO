import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 5 (SLA timeout -> requeue -> reassign) and TEST 6 (repeated timeouts stay consistent).
test.describe('SLA timeout and reassignment', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('sla')
    await db.tenant.update({ where: { id: tenant.tenantId }, data: { defaultResponseSlaSeconds: 3 } })
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('an unanswered assignment expires, requeues, and reassigns automatically - repeatedly, with no duplicate active assignments', async () => {
    const res = await sendWebhook(tenant.integrationId, [
      { event_id: 'ev-sla-1', message_id: 'msg-sla-1', user_id: 'user-sla', text: 'please respond' },
    ])
    expect(res.status()).toBe(202)

    const conversation = await waitFor2(tenant.tenantId, 'user-sla')
    expect(conversation).toBeTruthy()

    // Wait through two full SLA cycles (3s SLA + reassignment latency) without ever sending a reply.
    const sawTwoExpiries = await waitFor(async () => {
      const count = await db.assignmentHistoryEntry.count({
        where: { assignment: { conversationId: conversation!.id }, event: 'expired' },
      })
      return count >= 2
    }, 20_000, 500)
    expect(sawTwoExpiries).toBe(true)

    const allAssignments = await db.assignment.findMany({
      where: { conversationId: conversation!.id },
      orderBy: { assignedAt: 'asc' },
    })
    expect(allAssignments.length).toBeGreaterThanOrEqual(3) // 2 expired + at least 1 currently active

    const expired = allAssignments.filter((a) => a.status === 'EXPIRED')
    for (const a of expired) {
      expect(a.releaseReason).toBe('sla_timeout')
      expect(a.expiredAt).toBeTruthy()
    }

    // Invariant: at any point in time, at most one assignment for this conversation is ACTIVE.
    const activeOnes = allAssignments.filter((a) => a.status === 'ACTIVE')
    expect(activeOnes.length).toBeLessThanOrEqual(1)

    const freshConversation = await db.conversation.findUnique({ where: { id: conversation!.id } })
    if (activeOnes.length === 1) {
      expect(freshConversation?.currentAssignmentId).toBe(activeOnes[0]!.id)
    }

    // Every history entry traces back to the conversation via its assignment - full audit trail exists.
    const historyEntries = await db.assignmentHistoryEntry.findMany({
      where: { assignment: { conversationId: conversation!.id } },
      orderBy: { createdAt: 'asc' },
    })
    const events = historyEntries.map((h) => h.event)
    expect(events.filter((e) => e === 'created').length).toBeGreaterThanOrEqual(3)
    expect(events.filter((e) => e === 'expired').length).toBeGreaterThanOrEqual(2)
  })
})

async function waitFor2(tenantId: string, externalUserId: string) {
  let conversation = null
  await waitFor(async () => {
    conversation = await db.conversation.findFirst({ where: { tenantId, externalUserId } })
    return conversation !== null
  })
  return conversation as Awaited<ReturnType<typeof db.conversation.findFirst>>
}
