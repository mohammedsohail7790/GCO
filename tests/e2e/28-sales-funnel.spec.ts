import { test, expect, type APIRequestContext } from '@playwright/test'
import { anonymousContext, seedHunter, cleanupHunter, cleanupLead, loginAs, sharedAdminContext, waitFor } from './helpers'
import { db } from '@/lib/db/client'

// Sales funnel (Phase I) through the real API + worker: website lead -> Hunter -> discovery/qualification/next action ->
// follow-ups -> funnel metrics -> Closed Won -> first payment -> commission -> BPO hand-off -> onboarding, with role
// boundaries and duplicate protection at every step. No production data; all fixtures are isolated and cleaned up.
test.describe.configure({ mode: 'serial' })
test.describe('sales funnel', () => {
  const api = (p: string) => `/api/v1${p}`
  const stamp = Date.now()
  const email = `sales-${stamp}@e2e.gco`
  const webEmail = `web-${stamp}@e2e.gco`
  let hunter: Awaited<ReturnType<typeof seedHunter>>
  let rival: Awaited<ReturnType<typeof seedHunter>>
  let admin: APIRequestContext
  let manager: APIRequestContext
  let client: APIRequestContext
  let operator: APIRequestContext
  let leadId = ''
  let webLeadId = ''
  let approvalId = ''

  test.beforeAll(async () => {
    hunter = await seedHunter('sales-owner')
    rival = await seedHunter('sales-rival')
    admin = await sharedAdminContext()
    manager = await loginAs('manager@demo.gco')
    client = await loginAs('client@demo.gco')
    operator = await loginAs('operator1@demo.gco')
    const created = await hunter.ctx.post(api('/crm/leads'), { data: { companyName: '[E2E] Sales Co', contactName: 'Sam Sales', email, source: 'calendly_booking' } })
    leadId = (await created.json()).data.lead.id
    await hunter.ctx.post(api(`/crm/leads/${leadId}/claim`))
  })
  test.afterAll(async () => {
    for (const id of [leadId, webLeadId]) if (id) await cleanupLead(id)
    await cleanupHunter(hunter.userId)
    await cleanupHunter(rival.userId)
  })

  test('RBAC: only the owning Hunter, a Manager or the CEO may change a stage - never a Client, Operator or another Hunter', async () => {
    const stage = { stage: 'CONTACTED' }
    expect((await (await anonymousContext()).patch(api(`/crm/leads/${leadId}/stage`), { data: stage })).status()).toBe(401)
    for (const [who, ctx] of [['client', client], ['operator', operator], ['rival hunter', rival.ctx]] as const) {
      expect((await ctx.patch(api(`/crm/leads/${leadId}/stage`), { data: stage })).status(), who).toBe(403)
    }
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).pipelineStage).toBe('NEW') // nothing moved
    expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/stage`), { data: stage })).status()).toBe(200)
  })

  test('website lead: lands unassigned with its source; duplicate email (any case) is one lead; a Hunter claims it; the lock is 30 days', async () => {
    const anon = await anonymousContext()
    const post = (e: string, ipTag: string) => anon.post(api('/public/contact'), { data: { intent: 'pilot', email: e, company: 'Web Prospect Co', service: 'Chat Moderation' }, headers: { 'x-forwarded-for': `sales-${ipTag}-${stamp}` } })
    expect((await post(webEmail, 'a')).status()).toBe(201)
    expect((await post(webEmail.toUpperCase(), 'b')).status()).toBe(201) // repeat submission: recorded on the same lead
    expect(await db.lead.count({ where: { email: { equals: webEmail, mode: 'insensitive' } } })).toBe(1)
    const lead = await db.lead.findFirstOrThrow({ where: { email: { equals: webEmail, mode: 'insensitive' } } })
    webLeadId = lead.id
    expect(lead).toMatchObject({ source: 'website_pilot_form', ownerId: null, pipelineStage: 'NEW' })
    // a manager sees it with source; a client does not see the CRM at all
    const rows = (await (await manager.get(api('/crm/leads?pageSize=100'))).json()).data
    expect(rows.find((r: any) => r.id === webLeadId)).toMatchObject({ source: 'website_pilot_form', owner: null, daysSinceContact: expect.any(Number) })
    expect((await client.get(api('/crm/leads'))).status()).toBe(403)
    expect((await hunter.ctx.post(api(`/crm/leads/${webLeadId}/claim`))).status()).toBe(200)
    expect((await rival.ctx.post(api(`/crm/leads/${webLeadId}/claim`))).status()).toBe(409)
    const claimed = await db.lead.findUniqueOrThrow({ where: { id: webLeadId } })
    expect(claimed.ownershipExpiresAt!.getTime() - claimed.ownershipStartedAt!.getTime()).toBe(30 * 86_400_000)
  })

  test('discovery + qualification + next action: saved by the owner, refused for everyone else, credentials refused, nothing leaks into history', async () => {
    const body = {
      qualification: 'NEEDS_FOLLOW_UP',
      nextAction: 'Send the pilot proposal',
      nextActionAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), // already due
      discovery: {
        business: { company: 'Sales Co', industry: 'SaaS', pain: 'Slow replies at night', decisionMaker: 'COO' },
        operations: { languages: 'English, Italian', operatingHours: '24/7', coverage: 'Around the clock' },
        technical: { channelProvider: 'In-app chat', webhookCapability: 'Yes', technicalContact: 'dev@client.example.com' },
        commercial: { pilot: '7-day free pilot', nextStep: 'Proposal' },
      },
    }
    for (const [who, ctx, status] of [['client', client, 403], ['operator', operator, 403], ['rival hunter', rival.ctx, 403]] as const) {
      expect((await ctx.patch(api(`/crm/leads/${leadId}/discovery`), { data: body })).status(), who).toBe(status)
    }
    expect((await (await anonymousContext()).patch(api(`/crm/leads/${leadId}/discovery`), { data: body })).status()).toBe(401)
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).qualification).toBeNull()

    const ok = await hunter.ctx.patch(api(`/crm/leads/${leadId}/discovery`), { data: body })
    expect(ok.status()).toBe(200)
    const saved = (await ok.json()).data
    expect(saved).toMatchObject({ qualification: 'NEEDS_FOLLOW_UP', nextAction: 'Send the pilot proposal' })
    expect(saved.discovery.business.pain).toBe('Slow replies at night')

    // strict payload, credentials refused, nothing changed
    for (const bad of [{ discovery: { business: { apiKey: 'x' } } }, { pipelineStage: 'CLOSED_WON' }, { qualification: 'MAYBE' }, { nextAction: 'x'.repeat(201) }]) {
      expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/discovery`), { data: bad as any })).status(), JSON.stringify(bad).slice(0, 50)).toBe(400)
    }
    for (const secret of [{ nextAction: 'api_key: sk-live-1234567890abcdef' }, { discovery: { technical: { authMethod: 'Bearer abc123def456' } } }, { discovery: { business: { pain: 'password: hunter2hunter2' } } }]) {
      const r = await hunter.ctx.patch(api(`/crm/leads/${leadId}/discovery`), { data: secret as any })
      expect(r.status()).toBe(400)
      expect(JSON.stringify(await r.json())).toContain('credential')
    }
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).nextAction).toBe('Send the pilot proposal')
    // the same guard protects notes, activity notes and approval notes
    expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}`), { data: { notes: 'client key: sk-live-1234567890abcdef' } })).status()).toBe(400)
    expect((await hunter.ctx.post(api(`/crm/leads/${leadId}/activities`), { data: { note: 'password: letmein12345' } })).status()).toBe(400)
    expect((await hunter.ctx.post(api(`/crm/leads/${leadId}/activities`), { data: { note: 'Discovery call held - see discovery tab' } })).status()).toBe(200)
    const history = JSON.stringify(await db.leadHistoryEntry.findMany({ where: { leadId, action: 'discovery_updated' } }))
    expect(history).not.toMatch(/Slow replies|dev@client|sk-live/)
    // a manager may also record discovery on the team's behalf
    expect((await manager.patch(api(`/crm/leads/${leadId}/discovery`), { data: { nextAction: 'Send the pilot proposal (manager reviewed)' } })).status()).toBe(200)
  })

  test('follow-ups: the due lead shows for its Hunter (not the rival), with days since contact; managers see the team view', async () => {
    const dash = (await (await hunter.ctx.get(api('/crm/dashboard/hunter'))).json()).data
    const mine = dash.followUps.find((f: any) => f.leadId === leadId)
    expect(mine).toMatchObject({ reason: 'next_action_due', nextAction: expect.stringContaining('pilot proposal'), daysSinceContact: expect.any(Number) })
    expect(dash.followUpsDue.some((l: any) => l.id === leadId)).toBe(true) // legacy field still populated
    const rivalDash = (await (await rival.ctx.get(api('/crm/dashboard/hunter'))).json()).data
    expect(rivalDash.followUps.some((f: any) => f.leadId === leadId)).toBe(false)
    const funnel = (await (await manager.get(api('/crm/dashboard/funnel'))).json()).data
    expect(funnel.followUps.items.some((f: any) => f.leadId === leadId && f.ownerName)).toBe(true)
  })

  test('funnel dashboard: counts come from real rows, unavailable metrics say so, finance is CEO-only, other roles are refused', async () => {
    const before = (await (await manager.get(api('/crm/dashboard/funnel'))).json()).data
    expect(before.finance).toBeNull() // a Manager does not see revenue/commission (unchanged privilege)
    expect(before.leads.total).toBeGreaterThanOrEqual(2)
    expect(before.leads.owned).toBeGreaterThanOrEqual(2)
    expect(before.leads.unassigned).toBe(before.leads.total - before.leads.owned)
    expect(before.qualification.NEEDS_FOLLOW_UP).toBeGreaterThanOrEqual(1)
    expect(before.calendlyBookings).toMatchObject({ available: false })
    expect(before.discovery.callsHeld).toMatchObject({ available: false })
    expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/discovery`), { data: { qualification: 'QUALIFIED' } })).status()).toBe(200)
    const after = (await (await manager.get(api('/crm/dashboard/funnel'))).json()).data
    expect(after.qualification.QUALIFIED).toBe(before.qualification.QUALIFIED + 1)
    expect(after.qualification.NEEDS_FOLLOW_UP).toBe(before.qualification.NEEDS_FOLLOW_UP - 1)
    const ceo = (await (await admin.get(api('/crm/dashboard/funnel'))).json()).data
    expect(ceo.finance).toEqual(expect.objectContaining({ totalRevenueEurCents: expect.any(Number), firstMonthRevenueEurCents: expect.any(Number), commissionPendingEurCents: expect.any(Number) }))
    for (const [who, ctx] of [['hunter', hunter.ctx], ['client', client], ['operator', operator]] as const) expect((await ctx.get(api('/crm/dashboard/funnel'))).status(), who).toBe(403)
    expect((await (await anonymousContext()).get(api('/crm/dashboard/funnel'))).status()).toBe(401)
  })

  test('pipeline to Closed Won: stages in order, a double submit is ONE approval, the owner cannot approve, a stale/duplicate decide is refused', async () => {
    for (const stage of ['ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']) expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/stage`), { data: { stage } })).status(), stage).toBe(200)
    expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/stage`), { data: { stage: 'CLOSED_WON' } })).status()).toBe(400) // never reachable here
    const [a, b] = await Promise.all([hunter.ctx.post(api(`/crm/leads/${leadId}/submit-approval`), { data: { reason: 'ready' } }), hunter.ctx.post(api(`/crm/leads/${leadId}/submit-approval`), { data: { reason: 'ready' } })])
    expect([a.status(), b.status()].filter((s) => s < 300)).toHaveLength(1)
    approvalId = (await db.approval.findFirstOrThrow({ where: { leadId } })).id
    expect(await db.approval.count({ where: { leadId } })).toBe(1)
    expect((await hunter.ctx.post(api(`/crm/approvals/${approvalId}/decide`), { data: { decision: 'APPROVED' } })).status()).toBe(403)
    const decides = await Promise.all(Array.from({ length: 4 }, () => manager.post(api(`/crm/approvals/${approvalId}/decide`), { data: { decision: 'APPROVED' } })))
    expect(decides.filter((r) => r.status() === 200)).toHaveLength(1)
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).pipelineStage).toBe('CLOSED_WON')
    expect(await db.commission.count({ where: { leadId } })).toBe(0) // Closed Won alone pays nothing
    expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/stage`), { data: { stage: 'CLOSED_LOST' } })).status()).toBe(400) // a won deal cannot be walked back
  })

  test('BPO hand-off: exactly one handoff, one tenant, one onboarding record with a client login; re-queueing creates no duplicates', async () => {
    expect(await waitFor(async () => (await db.bpoHandoff.findUnique({ where: { leadId } }))?.status === 'SUCCEEDED', 20000)).toBe(true)
    expect(await waitFor(async () => !!(await db.clientOnboarding.findUnique({ where: { leadId } }))?.clientUserId, 20000)).toBe(true) // record AND client login
    const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
    expect(await db.tenant.count({ where: { slug: `lead-${leadId}`.toLowerCase() } })).toBe(1)
    expect(await db.clientOnboarding.count({ where: { leadId } })).toBe(1)
    expect(await db.user.count({ where: { tenantId: handoff.tenantId!, role: 'CLIENT' } })).toBe(1)
    // CEO retries the handoff / onboarding: still one of each
    const ob = await db.clientOnboarding.findUniqueOrThrow({ where: { leadId } })
    expect((await admin.post(api(`/admin/onboarding/${ob.id}/retry`), { data: {} })).status()).toBe(200)
    expect((await admin.post(api(`/crm/bpo-handoffs/${handoff.id}/retry`), { data: {} })).status()).toBeLessThan(500)
    await new Promise((r) => setTimeout(r, 2500))
    expect(await db.bpoHandoff.count({ where: { leadId } })).toBe(1)
    expect(await db.clientOnboarding.count({ where: { leadId } })).toBe(1)
    expect(await db.user.count({ where: { tenantId: handoff.tenantId!, role: 'CLIENT' } })).toBe(1)
    expect(await db.tenant.count({ where: { slug: `lead-${leadId}`.toLowerCase() } })).toBe(1)
  })

  test('first payment: only Manager/CEO; concurrent confirmations create ONE 10% commission and ONE revenue record; the funnel shows it', async () => {
    const before = (await (await admin.get(api('/crm/dashboard/funnel'))).json()).data
    const amount = 200_000
    for (const [who, ctx] of [['hunter', hunter.ctx], ['client', client], ['operator', operator]] as const) {
      expect((await ctx.post(api(`/crm/leads/${leadId}/confirm-payment`), { data: { amountEurCents: amount } })).status(), who).toBeGreaterThanOrEqual(401)
    }
    expect(await db.commission.count({ where: { leadId } })).toBe(0)
    const results = await Promise.all(Array.from({ length: 5 }, () => manager.post(api(`/crm/leads/${leadId}/confirm-payment`), { data: { amountEurCents: amount, currency: 'EUR' } })))
    expect(results.filter((r) => r.status() === 201)).toHaveLength(1)
    const commissions = await db.commission.findMany({ where: { leadId } })
    expect(commissions).toHaveLength(1)
    expect(Number(commissions[0]!.percentage)).toBe(10)
    expect(commissions[0]!.amountEurCents).toBe(20_000)
    expect(commissions[0]!.status).toBe('PENDING')
    expect(await db.revenueRecord.count({ where: { leadId } })).toBe(1)
    const after = (await (await admin.get(api('/crm/dashboard/funnel'))).json()).data
    expect(after.finance.firstMonthRevenueEurCents).toBe(before.finance.firstMonthRevenueEurCents + amount)
    expect(after.finance.commissionPendingEurCents).toBe(before.finance.commissionPendingEurCents + 20_000)
    expect(after.closedWon).toBe(before.closedWon) // already counted when it was approved; payment does not change the stage
    expect(after.closedWon).toBeGreaterThanOrEqual(1)
    expect(after.onboarding.inProgress + after.onboarding.live).toBeGreaterThanOrEqual(1) // this client is being onboarded (counted since the hand-off)
    expect(after.onboarding.inProgress + after.onboarding.live).toBe(before.onboarding.inProgress + before.onboarding.live) // a payment does not create another onboarding
    // the Hunter sees it in their own wallet; the rival does not
    expect((await (await hunter.ctx.get(api('/crm/dashboard/hunter'))).json()).data.walletEurCents.pending).toBeGreaterThanOrEqual(20_000)
    expect((await (await rival.ctx.get(api('/crm/commissions'))).json()).data.some((c: any) => c.leadId === leadId)).toBe(false)
  })

  test('tenant isolation: the new client\'s own login and another tenant\'s client reach neither the CRM nor the funnel', async () => {
    const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId } })
    const user = await db.user.findFirstOrThrow({ where: { tenantId: handoff.tenantId!, role: 'CLIENT' } })
    expect(user.isActive).toBe(false) // cannot even sign in until the invitation is accepted
    for (const p of ['/crm/leads', '/crm/dashboard/funnel', '/crm/dashboard/ceo', '/crm/commissions', '/admin/onboarding']) {
      expect((await client.get(api(p))).status(), `demo client ${p}`).toBe(403)
      expect((await operator.get(api(p))).status(), `operator ${p}`).toBe(403)
    }
  })
})
