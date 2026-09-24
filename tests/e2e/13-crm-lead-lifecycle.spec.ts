import { test, expect } from '@playwright/test'
import { seedHunter, cleanupHunter, cleanupLead } from './helpers'

// Exercises the Hunter-facing lead lifecycle end to end: create -> claim
// (including a genuine concurrent double-claim, only one winner) -> log
// activity (extends the 30-day lock) -> walk the pipeline stage transitions
// -> submit for approval. See lib/crm/leads.ts for the underlying logic.
test.describe('CRM lead lifecycle', () => {
  test('create, claim, activity, and stage progression through to submit-for-approval', async () => {
    const hunter = await seedHunter('lifecycle')
    const leadIds: string[] = []

    try {
      const createRes = await hunter.ctx.post('/api/v1/crm/leads', {
        data: {
          companyName: '[E2E] Lifecycle Co',
          contactName: 'Nora',
          email: `lifecycle-${Date.now()}@e2e.gco`,
          estimatedValueEurCents: 500_00,
        },
      })
      expect(createRes.status()).toBe(201)
      const { lead, domainWarning } = (await createRes.json()).data
      leadIds.push(lead.id)
      expect(domainWarning).toBeNull()
      expect(lead.pipelineStage).toBe('NEW')
      expect(lead.ownerId).toBeNull()

      const claimRes = await hunter.ctx.post(`/api/v1/crm/leads/${lead.id}/claim`)
      expect(claimRes.status()).toBe(200)
      const claimed = (await claimRes.json()).data
      expect(claimed.ownerId).toBe(hunter.userId)
      expect(claimed.ownershipExpiresAt).toBeTruthy()
      const expiresAt = new Date(claimed.ownershipExpiresAt).getTime()
      const startedAt = new Date(claimed.ownershipStartedAt).getTime()
      // 30-day lock, allow a small margin for request latency.
      expect(expiresAt - startedAt).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
      expect(expiresAt - startedAt).toBeLessThan(31 * 24 * 60 * 60 * 1000)

      const activityRes = await hunter.ctx.post(`/api/v1/crm/leads/${lead.id}/activities`, {
        data: { note: 'Had a great intro call.' },
      })
      expect(activityRes.status()).toBe(200)

      const stages = ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']
      for (const stage of stages) {
        const stageRes = await hunter.ctx.patch(`/api/v1/crm/leads/${lead.id}/stage`, { data: { stage } })
        expect(stageRes.status()).toBe(200)
        const updated = (await stageRes.json()).data
        expect(updated.pipelineStage).toBe(stage)
      }

      // Skipping a stage is rejected (PROPOSAL -> ENGAGED is not a valid forward move).
      const invalidRes = await hunter.ctx.patch(`/api/v1/crm/leads/${lead.id}/stage`, { data: { stage: 'ENGAGED' } })
      expect(invalidRes.status()).toBe(400)

      const submitRes = await hunter.ctx.post(`/api/v1/crm/leads/${lead.id}/submit-approval`, {
        data: { reason: 'Client verbally agreed to terms.' },
      })
      expect(submitRes.status()).toBe(201)
      const approval = (await submitRes.json()).data
      expect(approval.status).toBe('PENDING')

      const finalLeadRes = await hunter.ctx.get(`/api/v1/crm/leads?stage=PENDING_APPROVAL`)
      const finalLeads = (await finalLeadRes.json()).data
      expect(finalLeads.some((l: any) => l.id === lead.id)).toBe(true)
    } finally {
      for (const id of leadIds) await cleanupLead(id)
      await cleanupHunter(hunter.userId)
    }
  })

  test('only one of two concurrent claim requests on the same lead succeeds', async () => {
    const hunterA = await seedHunter('claim-a')
    const hunterB = await seedHunter('claim-b')
    let leadId = ''

    try {
      const createRes = await hunterA.ctx.post('/api/v1/crm/leads', {
        data: { companyName: '[E2E] Contested Co', contactName: 'Omar', email: `contested-${Date.now()}@e2e.gco` },
      })
      leadId = (await createRes.json()).data.lead.id

      const [resA, resB] = await Promise.all([
        hunterA.ctx.post(`/api/v1/crm/leads/${leadId}/claim`),
        hunterB.ctx.post(`/api/v1/crm/leads/${leadId}/claim`),
      ])
      const statuses = [resA.status(), resB.status()].sort()
      expect(statuses).toEqual([200, 409])
    } finally {
      if (leadId) await cleanupLead(leadId)
      await cleanupHunter(hunterA.userId)
      await cleanupHunter(hunterB.userId)
    }
  })
})
