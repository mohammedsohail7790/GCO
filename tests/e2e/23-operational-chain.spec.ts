import { test, expect } from '@playwright/test'
import { anonymousContext, seedHunter, cleanupHunter, cleanupLead, loginAs, sharedAdminContext, waitFor } from './helpers'
import { db } from '@/lib/db/client'

// Phase D: the whole commercial chain through the real API + worker, in one flow:
// website pilot -> unassigned lead -> Hunter claim -> pipeline -> approval -> Closed Won -> BPO handoff ->
// first payment -> exactly one 10% commission -> visibility - plus the role/ownership boundaries along it.
test.describe.configure({ mode: 'serial' })
test.describe('operational chain: pilot -> CRM -> Hunter -> closure -> payment -> commission -> BPO', () => {
  const email = `chain-${Date.now()}@e2e.gco`
  let hunter: Awaited<ReturnType<typeof seedHunter>>
  let rival: Awaited<ReturnType<typeof seedHunter>>
  let leadId = ''
  let approvalId = ''
  let manager: Awaited<ReturnType<typeof loginAs>>
  let client: Awaited<ReturnType<typeof loginAs>>
  let operator: Awaited<ReturnType<typeof loginAs>>

  test.beforeAll(async () => {
    hunter = await seedHunter('chain-owner', 25) // stored 25% rate must be ignored
    rival = await seedHunter('chain-rival')
    manager = await loginAs('manager@demo.gco')
    client = await loginAs('client@demo.gco')
    operator = await loginAs('operator1@demo.gco')
  })
  test.afterAll(async () => {
    if (leadId) await cleanupLead(leadId)
    await cleanupHunter(hunter.userId)
    await cleanupHunter(rival.userId)
  })

  test('website pilot submission creates one unassigned, attributed lead and exposes nothing back', async () => {
    const anon = await anonymousContext()
    const r = await anon.post('/api/v1/public/contact', {
      data: { intent: 'pilot', email, company: 'Chain Co', service: 'Chat moderation', volume: '10,000 – 50,000', languages: 'Italian, French', coverage: 'Around the clock' },
      headers: { 'x-forwarded-for': `chain-${Date.now()}` },
    })
    expect(r.status()).toBe(201)
    expect((await r.json()).data).toEqual({ received: true }) // no lead id / internal data returned to the public
    const lead = await db.lead.findUniqueOrThrow({ where: { email } })
    leadId = lead.id
    expect(lead.ownerId).toBeNull()
    expect(lead.pipelineStage).toBe('NEW')
    expect(lead.source).toBe('website_pilot_form')
    expect(await db.leadHistoryEntry.count({ where: { leadId, action: 'created' } })).toBe(1)
  })

  test('the same email in different letter case is the SAME lead (history appended, owner/stage untouched)', async () => {
    const anon = await anonymousContext()
    const r = await anon.post('/api/v1/public/contact', {
      data: { intent: 'pilot', email: email.toUpperCase(), company: 'Chain Co Again' },
      headers: { 'x-forwarded-for': `chain-up-${Date.now()}` },
    })
    expect(r.status()).toBe(201)
    expect(await db.lead.count({ where: { email: { equals: email, mode: 'insensitive' } } })).toBe(1)
    expect(await db.leadHistoryEntry.count({ where: { leadId, action: 'pilot_request_received' } })).toBe(1)
  })

  test('Hunters see it in the unassigned pool; one claim wins, the rival is refused', async () => {
    const pool = await (await hunter.ctx.get('/api/v1/crm/leads?unassigned=true&pageSize=100')).json()
    expect(pool.data.some((l: any) => l.id === leadId)).toBe(true)
    expect((await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/claim`)).status()).toBe(200)
    expect((await rival.ctx.post(`/api/v1/crm/leads/${leadId}/claim`)).status()).toBe(409)
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.ownerId).toBe(hunter.userId)
    expect(lead.ownershipExpiresAt!.getTime() - lead.ownershipStartedAt!.getTime()).toBe(30 * 86_400_000)
  })

  test("another Hunter cannot touch the owner's lead (stage, release, activity, submit)", async () => {
    expect((await rival.ctx.patch(`/api/v1/crm/leads/${leadId}/stage`, { data: { stage: 'CONTACTED' } })).status()).toBe(403)
    expect((await rival.ctx.post(`/api/v1/crm/leads/${leadId}/release`)).status()).toBe(403)
    expect((await rival.ctx.post(`/api/v1/crm/leads/${leadId}/activities`, { data: { note: 'x' } })).status()).toBeGreaterThanOrEqual(400)
    expect((await rival.ctx.post(`/api/v1/crm/leads/${leadId}/submit-approval`, { data: {} })).status()).toBeGreaterThanOrEqual(400)
    const own = await (await rival.ctx.get('/api/v1/crm/leads?pageSize=100')).json()
    expect(own.data.some((l: any) => l.id === leadId)).toBe(false)
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).ownerId).toBe(hunter.userId)
  })

  test('the Hunter cannot jump stages or force Closed Won; the approval path is the only way', async () => {
    for (const stage of ['CLOSED_WON', 'PROPOSAL', 'QUALIFIED']) {
      const res = await hunter.ctx.patch(`/api/v1/crm/leads/${leadId}/stage`, { data: { stage } })
      expect(res.status(), stage).toBe(400) // skip-ahead rejected; CLOSED_WON is not even a valid input
    }
    expect((await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/submit-approval`, { data: {} })).status()).toBe(400) // not at PROPOSAL yet
    for (const stage of ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']) {
      expect((await hunter.ctx.patch(`/api/v1/crm/leads/${leadId}/stage`, { data: { stage } })).status()).toBe(200)
    }
    const hist = await db.leadHistoryEntry.count({ where: { leadId, action: 'stage_changed' } })
    expect(hist).toBe(5)
  })

  test('submit for approval: double submit creates one approval; the Hunter cannot decide it', async () => {
    const [a, b] = await Promise.all([
      hunter.ctx.post(`/api/v1/crm/leads/${leadId}/submit-approval`, { data: { reason: 'ready' } }),
      hunter.ctx.post(`/api/v1/crm/leads/${leadId}/submit-approval`, { data: { reason: 'ready' } }),
    ])
    expect([a.status(), b.status()].filter((s) => s < 300)).toHaveLength(1)
    expect(await db.approval.count({ where: { leadId } })).toBe(1)
    approvalId = (await db.approval.findFirstOrThrow({ where: { leadId } })).id
    expect((await hunter.ctx.post(`/api/v1/crm/approvals/${approvalId}/decide`, { data: { decision: 'APPROVED' } })).status()).toBe(403)
    expect((await rival.ctx.post(`/api/v1/crm/approvals/${approvalId}/decide`, { data: { decision: 'APPROVED' } })).status()).toBe(403)
  })

  test('Manager approval: Closed Won, BPO handoff succeeds, still NO commission and NO revenue', async () => {
    const res = await manager.post(`/api/v1/crm/approvals/${approvalId}/decide`, { data: { decision: 'APPROVED', reviewNotes: 'ok' } })
    expect(res.status()).toBe(200)
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).pipelineStage).toBe('CLOSED_WON')
    expect(await waitFor(async () => (await db.bpoHandoff.findUnique({ where: { leadId } }))?.status === 'SUCCEEDED', 15000)).toBe(true)
    expect(await db.commission.count({ where: { leadId } })).toBe(0)
    const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
    expect(handoff.tenantId).toBeTruthy()
    expect(await db.revenueRecord.count({ where: { tenantId: handoff.tenantId! } })).toBe(0)
    // the won lead can no longer be walked back, released or re-approved
    expect((await hunter.ctx.patch(`/api/v1/crm/leads/${leadId}/stage`, { data: { stage: 'CLOSED_LOST' } })).status()).toBe(400)
    expect((await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/release`)).status()).toBeGreaterThanOrEqual(400)
    expect((await manager.post(`/api/v1/crm/approvals/${approvalId}/decide`, { data: { decision: 'APPROVED' } })).status()).toBe(409)
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).ownerId).toBe(hunter.userId)
  })

  test('payment confirmation: Hunter/Operator/Client refused; Manager creates exactly one 10% commission + revenue record', async () => {
    for (const [who, ctx] of [['hunter', hunter.ctx], ['operator', operator], ['client', client]] as const) {
      expect((await ctx.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: 100_000 } })).status(), who).toBeGreaterThanOrEqual(401)
    }
    expect(await db.commission.count({ where: { leadId } })).toBe(0)

    const amount = 250_000
    const results = await Promise.all(Array.from({ length: 4 }, () => manager.post(`/api/v1/crm/leads/${leadId}/confirm-payment`, { data: { amountEurCents: amount } })))
    expect(results.filter((r) => r.status() === 201)).toHaveLength(1)
    for (const r of results) if (r.status() !== 201) expect(r.status()).toBe(409)

    const commissions = await db.commission.findMany({ where: { leadId } })
    expect(commissions).toHaveLength(1)
    const c = commissions[0]!
    expect(Number(c.percentage)).toBe(10) // not the Hunter's stored 25%
    expect(c.amountEurCents).toBe(25_000)
    expect(c.status).toBe('PENDING')
    expect(c.hunterId).toBe(hunter.userId)
    const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
    expect(c.tenantId).toBe(handoff.tenantId)
    const rev = await db.revenueRecord.findMany({ where: { leadId } })
    expect(rev).toHaveLength(1)
    expect(rev[0]!.amountEurCents).toBe(amount)
    expect(rev[0]!.tenantId).toBe(handoff.tenantId)
    // audit trail records the actions without exposing anything sensitive
    const audits = await db.auditLog.findMany({ where: { resourceId: { in: [leadId, c.id] }, action: { in: ['payment.first_confirmed', 'commission.generated'] } } })
    expect(audits.map((a) => a.action).sort()).toEqual(['commission.generated', 'payment.first_confirmed'])
  })

  test('commission visibility: owner Hunter and Manager see it; the rival Hunter, Operator and Client do not', async () => {
    const mine = await (await hunter.ctx.get('/api/v1/crm/commissions')).json()
    expect(mine.data.some((c: any) => c.leadId === leadId)).toBe(true)
    const theirs = await (await rival.ctx.get('/api/v1/crm/commissions')).json()
    expect(theirs.data.some((c: any) => c.leadId === leadId)).toBe(false)
    const team = await (await manager.get('/api/v1/crm/commissions?pageSize=100')).json()
    expect(team.data.some((c: any) => c.leadId === leadId)).toBe(true)
    for (const ctx of [operator, client]) expect((await ctx.get('/api/v1/crm/commissions')).status()).toBeGreaterThanOrEqual(401)
  })

  test('payout lifecycle is CEO-only: Hunter and Manager cannot change commission status; CEO can approve', async () => {
    const c = await db.commission.findFirstOrThrow({ where: { leadId } })
    expect((await hunter.ctx.patch(`/api/v1/crm/commissions/${c.id}/status`, { data: { status: 'PAID' } })).status()).toBe(403)
    expect((await manager.patch(`/api/v1/crm/commissions/${c.id}/status`, { data: { status: 'PAID' } })).status()).toBe(403)
    expect((await db.commission.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('PENDING')
    const admin = await sharedAdminContext()
    expect((await admin.patch(`/api/v1/crm/commissions/${c.id}/status`, { data: { status: 'APPROVED' } })).status()).toBe(200)
  })

  test('internal sales/finance endpoints are closed to Client and Operator roles; anonymous gets 401', async () => {
    const paths = ['/api/v1/crm/leads', '/api/v1/crm/approvals', '/api/v1/crm/commissions', '/api/v1/crm/dashboard/ceo', '/api/v1/crm/dashboard/manager']
    const writeOnly = ['/api/v1/crm/revenue', '/api/v1/crm/fulfillment-costs'] // POST-only: there is no read endpoint
    const anon = await anonymousContext()
    for (const p of writeOnly) {
      for (const [who, ctx] of [['client', client], ['operator', operator], ['hunter', hunter.ctx]] as const) {
        const s = (await ctx.post(p, { data: { tenantId: 'x', amountEurCents: 1 } })).status()
        expect(s, `${who} POST ${p}`).toBe(403)
      }
      expect((await anon.post(p, { data: {} })).status(), `anon POST ${p}`).toBe(401)
    }
    for (const p of paths) {
      for (const [who, ctx] of [['client', client], ['operator', operator]] as const) {
        const s = (await ctx.get(p)).status()
        expect(s, `${who} ${p}`).toBeGreaterThanOrEqual(401)
        expect(s, `${who} ${p}`).toBeLessThan(500)
      }
      expect((await anon.get(p)).status(), `anon ${p}`).toBe(401)
    }
  })

  test('Hunter dashboards and endpoints exclude manager/CEO data', async () => {
    for (const p of ['/api/v1/crm/dashboard/ceo', '/api/v1/crm/dashboard/manager', '/api/v1/crm/approvals']) {
      expect((await hunter.ctx.get(p)).status(), p).toBe(403)
    }
  })
})
