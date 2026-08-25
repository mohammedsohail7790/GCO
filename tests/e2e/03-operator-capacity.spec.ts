import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// TEST 4 - operator capacity enforcement (default capacity = 2, single operator in this tenant).
test.describe('operator capacity', () => {
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>

  test.beforeAll(async () => {
    tenant = await seedIsolatedTenant('capacity')
  })

  test.afterAll(async () => {
    await cleanupTenant(tenant.tenantId)
  })

  test('a third conversation stays queued once the sole operator is at capacity (2)', async () => {
    const operator = await db.operator.findFirst({ where: { tenantId: tenant.tenantId } })
    expect(operator?.capacity).toBe(2)

    for (const n of [1, 2, 3]) {
      const res = await sendWebhook(tenant.integrationId, [
        { event_id: `ev-cap-${n}`, message_id: `msg-cap-${n}`, user_id: `user-cap-${n}`, text: `message ${n}` },
      ])
      expect(res.status()).toBe(202)
    }

    await waitFor(async () => {
      const count = await db.conversation.count({ where: { tenantId: tenant.tenantId } })
      return count === 3
    })
    // let assignment attempts settle
    await new Promise((r) => setTimeout(r, 1000))

    const conversations = await db.conversation.findMany({
      where: { tenantId: tenant.tenantId, externalUserId: { in: ['user-cap-1', 'user-cap-2', 'user-cap-3'] } },
      orderBy: { createdAt: 'asc' },
    })
    expect(conversations.length).toBe(3)

    const activeCount = conversations.filter((c) => c.currentAssignmentId !== null).length
    const queuedCount = conversations.filter((c) => c.currentAssignmentId === null).length

    // Exactly `capacity` conversations got assigned; the rest stay queued - no over-assignment.
    expect(activeCount).toBe(2)
    expect(queuedCount).toBe(1)

    const activeAssignments = await db.assignment.count({
      where: { operatorId: operator!.id, status: 'ACTIVE' },
    })
    expect(activeAssignments).toBeLessThanOrEqual(2)

    const stillQueued = conversations.find((c) => c.currentAssignmentId === null)
    expect(stillQueued?.state).toBe('QUEUED')
  })
})
