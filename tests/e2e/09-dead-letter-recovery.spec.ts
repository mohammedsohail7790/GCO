import { test, expect } from '@playwright/test'
import { sharedAdminContext } from './helpers'
import { messageIngestQueue } from '@/lib/queue/queues'
import { db } from '@/lib/db/client'

// TEST 10 - dead-letter recovery, ACTUALLY exercised (not just code-reviewed):
// drive a real job to permanent failure, confirm it lands in dead-letter,
// confirm an authorized user can see and requeue it, and confirm the action
// is audited. This directly exercises workers/index.ts's `failed` listener
// and app/api/v1/admin/recovery/requeue-dead-letter/route.ts.
test.describe('dead-letter recovery', () => {
  test('a permanently failing job lands in dead-letter, is visible to an admin, and can be requeued with an audit trail', async () => {
    // A job referencing a webhookEventId that doesn't exist will fail every
    // attempt (processWebhookEvent does findUniqueOrThrow). Override attempts/
    // backoff to a small fixed count so the test doesn't wait through the
    // default 5-attempt exponential backoff (~30s+).
    const bogusId = `nonexistent-${Date.now()}`
    const job = await messageIngestQueue.add(
      'ingest',
      { webhookEventId: bogusId },
      { jobId: `dlr-test-${bogusId}`, attempts: 2, backoff: { type: 'fixed', delay: 300 } },
    )
    expect(job.id).toBeTruthy()

    // Wait for the worker to exhaust retries and move it to dead-letter (see
    // workers/index.ts's `worker.on('failed', ...)` handler).
    const landedInDeadLetter = await waitForCondition(async () => {
      const count = await db.systemEvent.count({
        where: {
          category: 'queue',
          metadata: { path: ['data', 'webhookEventId'], equals: bogusId },
        },
      })
      return count > 0
    }, 15_000)
    expect(landedInDeadLetter).toBe(true)

    const admin = await sharedAdminContext()
    const healthRes = await admin.get('/api/v1/admin/system-health')
    expect(healthRes.ok()).toBe(true)
    const health = (await healthRes.json()).data
    expect(health.queues.deadLetter.waiting).toBeGreaterThan(0)

    // Find the dead-letter job's BullMQ id for our specific failure (there
    // may be others from concurrent test runs / prior failures).
    const deadLetterJobs = await (await import('@/lib/queue/queues')).deadLetterQueue.getJobs(['waiting', 'delayed'])
    const ours = deadLetterJobs.find((j) => j.data?.data?.webhookEventId === bogusId)
    expect(ours).toBeTruthy()

    const auditCountBefore = await db.auditLog.count({ where: { action: 'recovery.requeue_dead_letter' } })

    const requeueRes = await admin.post('/api/v1/admin/recovery/requeue-dead-letter', {
      data: { jobId: ours!.id },
    })
    expect(requeueRes.ok()).toBe(true)
    const requeueBody = (await requeueRes.json()).data
    expect(requeueBody.requeued).toBe(true)
    expect(requeueBody.newJobId).toBeTruthy()

    // Audited: actor, action, resource, resourceId, result all recorded.
    const auditEntry = await db.auditLog.findFirst({
      where: { action: 'recovery.requeue_dead_letter', resourceId: ours!.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(auditEntry).toBeTruthy()
    expect(auditEntry!.actorUserId).toBeTruthy()
    expect((auditEntry!.metadata as any)?.newJobId).toBe(requeueBody.newJobId)

    const auditCountAfter = await db.auditLog.count({ where: { action: 'recovery.requeue_dead_letter' } })
    expect(auditCountAfter).toBe(auditCountBefore + 1)

    // The dead-letter entry itself is gone (removed on successful requeue).
    const stillThere = await (await import('@/lib/queue/queues')).deadLetterQueue.getJob(ours!.id!)
    expect(stillThere).toBeUndefined()

    // A CLIENT (no QUEUE_RECOVER permission) cannot perform this action at all.
    const { anonymousContext, loginAs } = await import('./helpers')
    void anonymousContext // keep import graph simple; not used directly here
    const clientCtx = await loginAs('client@demo.gco')
    const forbiddenRes = await clientCtx.post('/api/v1/admin/recovery/requeue-dead-letter', {
      data: { jobId: 'whatever' },
    })
    expect(forbiddenRes.status()).toBe(403)
  })
})

async function waitForCondition(check: () => Promise<boolean>, timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}
