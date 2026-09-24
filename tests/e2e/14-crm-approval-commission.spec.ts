import { test, expect } from '@playwright/test'
import { seedHunter, cleanupHunter, cleanupLead, sharedAdminContext, waitFor } from './helpers'
import { db } from '@/lib/db/client'

// Confirmed business rule: commission is 10%, ONE-TIME, on the first month's
// ACTUALLY COLLECTED revenue - Closed Won by itself must never make a
// commission payable. See lib/crm/approvals.ts::decideApproval (no longer
// creates a Commission) and ::confirmFirstPayment (the only place that does).
async function createAndSubmit(ctx: any, hunterUserId: string) {
  const createRes = await ctx.post('/api/v1/crm/leads', {
    data: { companyName: '[E2E] Approval Co', contactName: 'Priya', email: `approval-${Date.now()}-${Math.random()}@e2e.gco` },
  })
  const leadId = (await createRes.json()).data.lead.id
  await ctx.post(`/api/v1/crm/leads/${leadId}/claim`)
  for (const stage of ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']) {
    await ctx.patch(`/api/v1/crm/leads/${leadId}/stage`, { data: { stage } })
  }
  const submitRes = await ctx.post(`/api/v1/crm/leads/${leadId}/submit-approval`, { data: { reason: 'ready' } })
  const approvalId = (await submitRes.json()).data.id
  return { leadId, approvalId }
}

/** Approves the lead (Closed Won) and waits for the BPO handoff to succeed -
 *  confirmFirstPayment requires that, since payment confirmation logically
 *  follows client onboarding. */
async function approveAndOnboard(admin: any, approvalId: string, leadId: string) {
  const decideRes = await admin.post(`/api/v1/crm/approvals/${approvalId}/decide`, {
    data: { decision: 'APPROVED', reviewNotes: 'Looks solid' },
  })
  expect(decideRes.status()).toBe(200)
  const onboarded = await waitFor(async () => {
    const h = await db.bpoHandoff.findUnique({ where: { leadId } })
    return h?.status === 'SUCCEEDED'
  })
  expect(onboarded).toBe(true)
}

test.describe('CRM approval (no commission at decide time)', () => {
  test('a Hunter cannot decide their own submission', async () => {
    const hunter = await seedHunter('self-decide')
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      const res = await hunter.ctx.post(`/api/v1/crm/approvals/${approvalId}/decide`, {
        data: { decision: 'APPROVED' },
      })
      expect(res.status()).toBe(403)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('Closed Won does not create a payable commission', async () => {
    const hunter = await seedHunter('closed-won-no-commission', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid

      const decideRes = await admin.post(`/api/v1/crm/approvals/${approvalId}/decide`, {
        data: { decision: 'APPROVED' },
      })
      expect(decideRes.status()).toBe(200)
      const result = (await decideRes.json()).data
      expect(result.commission).toBeUndefined() // decide response no longer returns one at all

      const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
      expect(lead.pipelineStage).toBe('CLOSED_WON')

      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(0) // no commission until payment is confirmed
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('only one of many concurrent decide calls on the same approval succeeds', async () => {
    // Regression test for a confirmed, previously-fixed race (see git history
    // of lib/crm/approvals.ts) - kept here against the current (commission-
    // free) decide path so it can never silently regress either.
    const hunter = await seedHunter('concurrent-decide')
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid

      const CONCURRENCY = 10
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () => admin.post(`/api/v1/crm/approvals/${approvalId}/decide`, { data: { decision: 'APPROVED' } })),
      )
      const statuses = await Promise.all(results.map(async (r) => (r.status === 'fulfilled' ? r.value.status() : -1)))
      expect(statuses.filter((s) => s === 200)).toHaveLength(1)
      expect(statuses.filter((s) => s === 409)).toHaveLength(CONCURRENCY - 1)

      const handoffCount = await db.bpoHandoff.count({ where: { leadId } })
      expect(handoffCount).toBe(1)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('rejection reverts the lead to PROPOSAL and creates no commission', async () => {
    const hunter = await seedHunter('reject-flow')
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid

      const decideRes = await admin.post(`/api/v1/crm/approvals/${approvalId}/decide`, {
        data: { decision: 'REJECTED', reviewNotes: 'Not qualified enough yet' },
      })
      expect(decideRes.status()).toBe(200)

      const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
      expect(lead.pipelineStage).toBe('PROPOSAL')

      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(0)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })
})

test.describe('First-payment confirmation -> commission', () => {
  test('payment not received -> no commission exists', async () => {
    const hunter = await seedHunter('no-payment-yet', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)

      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(0)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('confirming payment before Closed Won is rejected', async () => {
    const hunter = await seedHunter('confirm-too-early', 10)
    let leadId = ''
    try {
      const createRes = await hunter.ctx.post('/api/v1/crm/leads', {
        data: { companyName: '[E2E] Too Early Co', contactName: 'Early', email: `tooearly-${Date.now()}@e2e.gco` },
      })
      leadId = (await createRes.json()).data.lead.id
      const admin = await sharedAdminContext()
      const res = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 100_00 } })
      expect(res.status()).toBe(409)
      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(0)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('payment received -> exactly one 10% commission, tenant-scoped, hunter-owned, audited', async () => {
    const hunter = await seedHunter('payment-confirmed', 10) // 10%, matches the confirmed business rule
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)

      // Example from the spec: first-month collected revenue = EUR 1500 -> commission = EUR 150.
      const confirmRes = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1500_00 } })
      expect(confirmRes.status()).toBe(201)
      const body = (await confirmRes.json()).data
      expect(body.commission.amountEurCents).toBe(150_00)
      expect(body.commission.hunterId).toBe(hunter.userId)
      expect(body.commission.status).toBe('PENDING')
      expect(body.revenueRecord.amountEurCents).toBe(1500_00)
      expect(body.revenueRecord.source).toBe('DEAL_CLOSED')

      const commission = await db.commission.findUniqueOrThrow({ where: { leadId } })
      expect(commission.tenantId).toBeTruthy() // tenant-scoped
      expect(commission.hunterId).toBe(hunter.userId) // hunter-owned

      const auditEntries = await db.auditLog.findMany({
        where: { action: { in: ['payment.first_confirmed', 'commission.generated'] }, resourceId: { in: [leadId, commission.id] } },
      })
      expect(auditEntries.length).toBeGreaterThanOrEqual(2)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('a Hunter with a different stored profile rate still gets exactly the universal 10%', async () => {
    // Regression test for a real conflict found and fixed: HunterProfile.
    // commissionPercentage predates Cristian's confirmed flat-10% V1 rule
    // (it was originally built for a prior, separate "dynamic % per Hunter"
    // instruction) and used to be read directly in the commission
    // calculation - a HunterProfile stored at e.g. 15% would have silently
    // produced a 15% commission, violating the confirmed rule.
    // confirmFirstPayment now always uses V1_COMMISSION_PERCENTAGE (10%)
    // regardless of what's stored on the profile.
    const hunter = await seedHunter('non-universal-rate-ignored', 25) // stored profile rate deliberately NOT 10%
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)

      const confirmRes = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      expect(confirmRes.status()).toBe(201)
      const body = (await confirmRes.json()).data
      // 10% of EUR 1000, not 25% - the stored profile rate is ignored.
      expect(body.commission.amountEurCents).toBe(100_00)
      expect(Number(body.commission.percentage)).toBe(10)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('payment confirmation retry does not create a duplicate commission', async () => {
    const hunter = await seedHunter('retry-payment', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)

      const first = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      expect(first.status()).toBe(201)

      const retry = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      expect(retry.status()).toBe(409)

      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(1)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('concurrent payment confirmation: exactly one commission, the rest conflict safely', async () => {
    const hunter = await seedHunter('concurrent-payment', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)

      const CONCURRENCY = 8
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () =>
          admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1500_00 } }),
        ),
      )
      const statuses = await Promise.all(results.map(async (r) => (r.status === 'fulfilled' ? r.value.status() : -1)))
      expect(statuses.filter((s) => s === 201)).toHaveLength(1)
      expect(statuses.filter((s) => s === 409)).toHaveLength(CONCURRENCY - 1)

      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(1)
      const commission = await db.commission.findUniqueOrThrow({ where: { leadId } })
      expect(commission.amountEurCents).toBe(150_00)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('second-month (and later) revenue does not create an additional Hunter commission', async () => {
    const hunter = await seedHunter('second-month-no-commission', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)
      await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1500_00 } })

      const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
      // Simulate month 2's recurring revenue being recorded the normal way.
      const now = new Date()
      const nextMonth = new Date(now)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const revRes = await admin.post('/api/v1/crm/revenue', {
        data: {
          tenantId: handoff.tenantId,
          amountEurCents: 1500_00,
          periodStart: nextMonth.toISOString(),
          periodEnd: new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).toISOString(),
        },
      })
      expect(revRes.status()).toBe(201)

      const commissionCount = await db.commission.count({ where: { leadId } })
      expect(commissionCount).toBe(1) // still just the one from first-month confirmation
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('a Hunter (not CEO/Manager) cannot confirm payment', async () => {
    const hunter = await seedHunter('hunter-cannot-confirm', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)

      const res = await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      expect(res.status()).toBe(403)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })
})

test.describe('Payout lifecycle', () => {
  test('Pending -> Approved -> Paid', async () => {
    const hunter = await seedHunter('payout-lifecycle', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)
      const confirmRes = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      const commissionId = (await confirmRes.json()).data.commission.id

      expect((await db.commission.findUniqueOrThrow({ where: { id: commissionId } })).status).toBe('PENDING')

      const approveRes = await admin.patch(`/api/v1/crm/commissions/${commissionId}/status`, { data: { status: 'APPROVED' } })
      expect(approveRes.status()).toBe(200)
      expect((await approveRes.json()).data.status).toBe('APPROVED')

      const paidRes = await admin.patch(`/api/v1/crm/commissions/${commissionId}/status`, { data: { status: 'PAID' } })
      expect(paidRes.status()).toBe(200)
      expect((await paidRes.json()).data.status).toBe('PAID')
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('cancellation', async () => {
    const hunter = await seedHunter('payout-cancel', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)
      const confirmRes = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      const commissionId = (await confirmRes.json()).data.commission.id

      const cancelRes = await admin.patch(`/api/v1/crm/commissions/${commissionId}/status`, { data: { status: 'CANCELLED' } })
      expect(cancelRes.status()).toBe(200)
      expect((await cancelRes.json()).data.status).toBe('CANCELLED')
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })

  test('only CEO_ADMIN can change payout status, not Manager', async () => {
    const hunter = await seedHunter('payout-rbac', 10)
    const admin = await sharedAdminContext()
    let leadId = ''
    try {
      const { leadId: lid, approvalId } = await createAndSubmit(hunter.ctx, hunter.userId)
      leadId = lid
      await approveAndOnboard(admin, approvalId, leadId)
      const confirmRes = await admin.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 1000_00 } })
      const commissionId = (await confirmRes.json()).data.commission.id

      const { loginAs } = await import('./helpers')
      const managerCtx = await loginAs('manager@demo.gco')
      const res = await managerCtx.patch(`/api/v1/crm/commissions/${commissionId}/status`, { data: { status: 'APPROVED' } })
      expect(res.status()).toBe(403)
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunter.userId)
    }
  })
})
