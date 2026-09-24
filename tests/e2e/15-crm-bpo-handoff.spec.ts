import { test, expect } from '@playwright/test'
import { db } from '@/lib/db/client'
import { bpoHandoffQueue } from '@/lib/queue/queues'
import { seedHunter, cleanupHunter, cleanupLead, sharedAdminContext } from './helpers'

// BPO handoff = GCO's own internal Sales -> Operations handoff (see
// workers/processors/bpoHandoff.ts). Verifies: Closed-Won enqueues exactly
// one handoff which creates exactly one Tenant; a permanently failing job
// lands in dead-letter and is recoverable once the underlying problem is fixed.
test.describe('CRM BPO handoff', () => {
  test('Closed-Won approval creates exactly one Tenant via the handoff', async () => {
    const hunter = await seedHunter('handoff-happy')
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const createRes = await hunter.ctx.post('/api/v1/crm/leads', {
        data: { companyName: '[E2E] Handoff Happy Co', contactName: 'Quinn', email: `handoff-happy-${Date.now()}@e2e.gco` },
      })
      leadId = (await createRes.json()).data.lead.id
      await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/claim`)
      for (const stage of ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']) {
        await hunter.ctx.patch(`/api/v1/crm/leads/${leadId}/stage`, { data: { stage } })
      }
      const submitRes = await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/submit-approval`, { data: {} })
      const approvalId = (await submitRes.json()).data.id

      const decideRes = await admin.post(`/api/v1/crm/approvals/${approvalId}/decide`, {
        data: { decision: 'APPROVED' },
      })
      expect(decideRes.status()).toBe(200)

      const succeeded = await waitFor(async () => {
        const h = await db.bpoHandoff.findUnique({ where: { leadId } })
        return h?.status === 'SUCCEEDED'
      })
      expect(succeeded).toBe(true)

      const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
      expect(handoff.tenantId).toBeTruthy()

      const tenantCount = await db.tenant.count({ where: { slug: `lead-${leadId}`.toLowerCase() } })
      expect(tenantCount).toBe(1)

      // Idempotent: re-decide is rejected server-side, so re-processing can never happen for this approval.
      const secondDecide = await admin.post(`/api/v1/crm/approvals/${approvalId}/decide`, {
        data: { decision: 'APPROVED' },
      })
      expect(secondDecide.status()).toBe(409)

      const handoffCount = await db.bpoHandoff.count({ where: { leadId } })
      expect(handoffCount).toBe(1)

      await db.tenant.delete({ where: { id: handoff.tenantId! } }).catch(() => null)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('a permanently failing handoff job lands in dead-letter', async () => {
    // Force a deterministic, real failure: enqueue a BPO_HANDOFF job whose
    // leadId has no corresponding BpoHandoff row at all (e.g. a stale/
    // duplicate job for a record that was since cleaned up).
    // bpoHandoffProcessor's very first `db.bpoHandoff.findUniqueOrThrow`
    // throws on every attempt, so the job exhausts retries and moves to
    // dead-letter - mirrors the pattern in 09-dead-letter-recovery.spec.ts.
    const bogusLeadId = `dlr-lead-${Date.now()}`

    await bpoHandoffQueue.add(
      'handoff',
      { leadId: bogusLeadId },
      { jobId: `bpo-handoff-${bogusLeadId}`, attempts: 2, backoff: { type: 'fixed', delay: 300 } },
    )

    const landedInDeadLetter = await waitFor(async () => {
      const count = await db.systemEvent.count({
        where: { category: 'queue', metadata: { path: ['data', 'leadId'], equals: bogusLeadId } },
      })
      return count > 0
    }, 15_000)
    expect(landedInDeadLetter).toBe(true)

    const admin = await sharedAdminContext()
    const healthRes = await admin.get('/api/v1/admin/system-health')
    const health = (await healthRes.json()).data
    expect(health.queues.deadLetter.waiting).toBeGreaterThan(0)
  })

  test('a dead-lettered handoff is recoverable via the retry endpoint', async () => {
    // Recovery scenario: the correct Lead + BpoHandoff records exist (the
    // underlying data problem from the previous test's scenario has been
    // fixed), and an ops user re-triggers processing via the CRM retry
    // endpoint - the same endpoint an operator would click after seeing a
    // handoff stuck at FAILED/DEAD_LETTERED in the CEO dashboard.
    const admin = await sharedAdminContext()
    const leadId = `recover-lead-${Date.now()}`

    await db.lead.create({
      data: { id: leadId, companyName: '[E2E] Recovered Co', contactName: 'Rae', email: `recovered-${Date.now()}@e2e.gco` },
    })
    const handoff = await db.bpoHandoff.create({
      data: { leadId, eventId: `handoff-${leadId}`, payload: { leadId }, status: 'DEAD_LETTERED' },
    })

    try {
      const retryRes = await admin.post(`/api/v1/crm/bpo-handoffs/${handoff.id}/retry`)
      expect(retryRes.status()).toBe(200)

      const recovered = await waitFor(async () => {
        const h = await db.bpoHandoff.findUnique({ where: { leadId } })
        return h?.status === 'SUCCEEDED'
      })
      expect(recovered).toBe(true)

      const tenantCount = await db.tenant.count({ where: { slug: `lead-${leadId}`.toLowerCase() } })
      expect(tenantCount).toBe(1)

      // Retrying an already-succeeded handoff is rejected, not reprocessed.
      const secondRetryRes = await admin.post(`/api/v1/crm/bpo-handoffs/${handoff.id}/retry`)
      expect(secondRetryRes.status()).toBe(409)

      const finalHandoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
      if (finalHandoff.tenantId) await db.tenant.delete({ where: { id: finalHandoff.tenantId } }).catch(() => null)
    } finally {
      await cleanupLead(leadId)
    }
  })
})

async function waitFor(check: () => Promise<boolean>, timeoutMs = 8000, intervalMs = 250) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}
