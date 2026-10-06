import { test, expect, type APIRequestContext } from '@playwright/test'
import { anonymousContext, seedHunter, cleanupHunter, cleanupLead, loginAs, sharedAdminContext, waitFor } from './helpers'
import { db } from '@/lib/db/client'

// Phase E: Closed Won -> BPO handoff -> client onboarding (user, invitation, checklist, go-live) -> first payment
// (EUR contract) -> commission, through the real API and worker. One client, one flow, one final state.
// NOTE: the only registered adapter is the dev-mock, which production go-live rejects; run the web server with
// ALLOW_DEV_ADAPTERS=true (local/CI only) so this spec can exercise go-live. The default behaviour is covered in
// tests/integration/clientOnboarding.test.ts.
test.describe.configure({ mode: 'serial' })
test.describe('client onboarding: handoff -> invitation -> checklist -> go-live; payment contract', () => {
  const email = `onb-${Date.now()}@e2e.gco`
  const password = 'A-Long-Client-Passw0rd!'
  let hunter: Awaited<ReturnType<typeof seedHunter>>
  let admin: APIRequestContext
  let manager: APIRequestContext
  let operator: APIRequestContext
  let demoClient: APIRequestContext
  let leadId = ''
  let tenantId = ''
  let onboardingId = ''
  let token = ''
  let integrationSecret = ''
  let createdOperatorId = ''
  const api = (p: string) => `/api/v1${p}`

  test.beforeAll(async () => {
    hunter = await seedHunter('onb-owner', 25)
    admin = await sharedAdminContext()
    manager = await loginAs('manager@demo.gco')
    operator = await loginAs('operator1@demo.gco')
    demoClient = await loginAs('client@demo.gco')
  })
  test.afterAll(async () => {
    if (createdOperatorId) await db.user.updateMany({ where: { id: createdOperatorId }, data: { isActive: false } })
    if (leadId) await cleanupLead(leadId)
    await cleanupHunter(hunter.userId)
  })

  test('Closed Won -> handoff -> onboarding is provisioned by the worker: one record, one INACTIVE CLIENT user, tenant defaults, pilot profile', async () => {
    const anon = await anonymousContext()
    const r = await anon.post(api('/public/contact'), {
      data: { intent: 'pilot', email, company: 'Onboarding Co', service: 'Chat Moderation', languages: 'Italian, German', coverage: 'Around the clock', volume: '1,000 – 10,000' },
      headers: { 'x-forwarded-for': `onb-${Date.now()}` },
    })
    expect(r.status()).toBe(201)
    leadId = (await db.lead.findUniqueOrThrow({ where: { email } })).id
    expect((await hunter.ctx.post(api(`/crm/leads/${leadId}/claim`))).status()).toBe(200)
    for (const stage of ['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL']) {
      expect((await hunter.ctx.patch(api(`/crm/leads/${leadId}/stage`), { data: { stage } })).status()).toBe(200)
    }
    const sub = await hunter.ctx.post(api(`/crm/leads/${leadId}/submit-approval`), { data: {} })
    const approvalId = (await sub.json()).data.id
    expect((await manager.post(api(`/crm/approvals/${approvalId}/decide`), { data: { decision: 'APPROVED' } })).status()).toBe(200)

    expect(await waitFor(async () => (await db.clientOnboarding.findUnique({ where: { leadId } }))?.status === 'SETUP', 20000)).toBe(true)
    const ob = await db.clientOnboarding.findUniqueOrThrow({ where: { leadId } })
    onboardingId = ob.id
    tenantId = ob.tenantId
    expect(await db.commission.count({ where: { leadId } })).toBe(0) // still no commission
    const users = await db.user.findMany({ where: { tenantId } })
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ role: 'CLIENT', email, isActive: false })
    expect(ob.requestedProfile).toMatchObject({ services: ['Chat Moderation'], languages: ['Italian', 'German'], coverage: 'Around the clock', volume: '1,000 – 10,000' })
    expect(await db.integration.count({ where: { tenantId } })).toBe(0) // integrations are never auto-created
    for (const action of ['onboarding.started', 'onboarding.user_created']) expect(await db.auditLog.count({ where: { tenantId, action } })).toBe(1)
  })

  test('the client cannot sign in before accepting the invitation', async () => {
    const anon = await anonymousContext()
    for (const pw of ['', 'password', password, 'DemoPassword123!']) {
      const res = await anon.post(api('/auth/login'), { data: { email, password: pw || 'x' }, headers: { 'x-forwarded-for': `onb-login-${Math.random()}` } })
      expect(res.status()).toBe(401)
    }
  })

  test('RBAC: only CEO/Assistant reach onboarding; Hunter, Manager, Operator, Client and anonymous do not', async () => {
    const anon = await anonymousContext()
    const calls: Array<[string, string, unknown?]> = [
      ['get', api('/admin/onboarding')],
      ['get', api(`/admin/onboarding/${onboardingId}`)],
      ['post', api(`/admin/onboarding/${onboardingId}/retry`), {}],
      ['post', api(`/admin/onboarding/${onboardingId}/invitation`), {}],
      ['post', api(`/admin/onboarding/${onboardingId}/confirm`), { item: 'languages' }],
      ['post', api(`/admin/onboarding/${onboardingId}/go-live`), {}],
    ]
    for (const [who, ctx, expected] of [['anon', anon, 401], ['hunter', hunter.ctx, 403], ['manager', manager, 403], ['operator', operator, 403], ['client', demoClient, 403]] as const) {
      for (const [method, url, data] of calls) {
        const res = method === 'get' ? await ctx.get(url) : await ctx.post(url, { data })
        expect(res.status(), `${who} ${method} ${url}`).toBe(expected)
      }
    }
    expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: onboardingId } })).status).toBe('SETUP')
    expect((await anon.post(api('/admin/onboarding/x/go-live'), { data: {} })).status()).toBe(401)
  })

  test('admin list/detail expose the checklist and never a token hash, secret or password', async () => {
    const list = await (await admin.get(api('/admin/onboarding'))).json()
    expect(list.data.some((o: any) => o.id === onboardingId)).toBe(true)
    const res = await admin.get(api(`/admin/onboarding/${onboardingId}`))
    expect(res.status()).toBe(200)
    const d = (await res.json()).data
    expect(d.status).toBe('SETUP')
    expect(d.ready).toBe(false)
    expect(d.clientUser.isActive).toBe(false)
    expect(d.checklist.map((i: any) => i.key)).toEqual(['tenant_created', 'client_user_created', 'invitation_accepted', 'integration_configured', 'integration_verified', 'webhook_secret_issued', 'operator_assigned', 'supervisor_confirmed', 'languages_confirmed', 'coverage_confirmed'])
    expect(JSON.stringify(d)).not.toMatch(/passwordHash|inviteTokenHash|webhookSecret|"secret"/)
    expect((await admin.get(api('/admin/onboarding/does-not-exist'))).status()).toBe(404)
  })

  test('invitation: one-time link, validated password, single use, then the client can sign in (own tenant only)', async () => {
    const issued = await admin.post(api(`/admin/onboarding/${onboardingId}/invitation`), { data: {} })
    expect(issued.status()).toBe(200)
    const { setupUrl } = (await issued.json()).data
    expect(setupUrl).toMatch(/\/accept-invitation#token=[0-9a-f]{64}$/)
    token = setupUrl.split('#token=')[1]
    const stored = await db.clientOnboarding.findUniqueOrThrow({ where: { id: onboardingId } })
    expect(JSON.stringify(stored)).not.toContain(token)
    // the token is not retrievable again through the API
    expect(JSON.stringify(await (await admin.get(api(`/admin/onboarding/${onboardingId}`))).json())).not.toContain(token)

    const anon = await anonymousContext()
    const ip = () => ({ 'x-forwarded-for': `onb-acc-${Math.random()}` })
    expect((await anon.post(api('/auth/accept-invitation'), { data: { token, password: 'short' }, headers: ip() })).status()).toBe(400)
    expect((await anon.post(api('/auth/accept-invitation'), { data: { token: 'f'.repeat(64), password }, headers: ip() })).status()).toBe(400)
    expect((await anon.post(api('/auth/accept-invitation'), { data: { token: 'not-a-token', password }, headers: ip() })).status()).toBe(400)
    expect((await db.user.findFirstOrThrow({ where: { tenantId, role: 'CLIENT' } })).isActive).toBe(false)

    const results = await Promise.all(Array.from({ length: 4 }, () => anon.post(api('/auth/accept-invitation'), { data: { token, password }, headers: ip() })))
    expect(results.filter((x) => x.status() === 200)).toHaveLength(1)
    expect((await anon.post(api('/auth/accept-invitation'), { data: { token, password: 'Another-Passw0rd!!' }, headers: ip() })).status()).toBe(400) // replay
    expect((await admin.post(api(`/admin/onboarding/${onboardingId}/invitation`), { data: {} })).status()).toBe(409) // already active
    expect(await db.auditLog.count({ where: { tenantId, action: 'onboarding.invitation_accepted' } })).toBe(1)

    const client = await loginAs(email, password)
    const me = await (await client.get(api('/auth/me'))).json()
    expect(me.data.role ?? me.data.user?.role).toBe('CLIENT')
  })

  test('client view: own onboarding progress only; no admin, CRM or finance; another tenant sees nothing', async () => {
    const client = await loginAs(email, password)
    const res = await client.get(api('/onboarding/status'))
    expect(res.status()).toBe(200)
    const v = (await res.json()).data
    expect(v.live).toBe(false)
    expect(v.steps.find((s: any) => s.key === 'invitation_accepted').done).toBe(true)
    const json = JSON.stringify(v)
    for (const forbidden of ['webhook', 'operator', 'supervisor', email, 'leadId', 'tenantId', 'passwordHash']) expect(json).not.toContain(forbidden)
    for (const p of ['/admin/onboarding', `/admin/onboarding/${onboardingId}`, '/crm/leads', '/crm/commissions', '/crm/dashboard/ceo', '/admin/integrations', '/admin/tenants']) {
      expect((await client.get(api(p))).status(), p).toBe(403)
    }
    expect((await client.post(api('/admin/users'), { data: { email: 'x@e2e.gco', password: 'Long-Enough-Pw1!', displayName: 'x', role: 'CEO_ADMIN' } })).status()).toBe(403)
    // a different tenant's client never sees this onboarding
    const other = await (await demoClient.get(api('/onboarding/status'))).json()
    expect(JSON.stringify(other)).not.toContain('Onboarding Co')
    expect((await anonymousContext().then((a) => a.get(api('/onboarding/status')))).status()).toBe(401)
    for (const [who, ctx] of [['hunter', hunter.ctx], ['operator', operator]] as const) expect((await ctx.get(api('/onboarding/status'))).status(), who).toBe(403)
  })

  test('retry is idempotent and restricted: still one record and one user afterwards', async () => {
    expect((await hunter.ctx.post(api(`/admin/onboarding/${onboardingId}/retry`), { data: {} })).status()).toBe(403)
    const before = await db.auditLog.count({ where: { tenantId, action: 'onboarding.user_created' } })
    for (let i = 0; i < 2; i++) {
      expect((await admin.post(api(`/admin/onboarding/${onboardingId}/retry`), { data: {} })).status()).toBe(200)
      await new Promise((r) => setTimeout(r, 1500))
    }
    expect(await db.clientOnboarding.count({ where: { leadId } })).toBe(1)
    expect(await db.user.count({ where: { tenantId } })).toBe(1)
    expect(await db.auditLog.count({ where: { tenantId, action: 'onboarding.user_created' } })).toBe(before)
    expect(await db.auditLog.count({ where: { tenantId, action: 'onboarding.started' } })).toBe(1)
    expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: onboardingId } })).status).toBe('SETUP')
  })

  test('go-live is refused while the checklist is incomplete, and nothing is activated', async () => {
    const res = await admin.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })
    expect(res.status()).toBe(409)
    expect(JSON.stringify(await res.json())).toMatch(/integration_configured/)
    expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: onboardingId } })).status).not.toBe('LIVE')
  })

  test('complete the checklist through existing admin APIs + confirmations; Manager cannot go live; CEO can, once', async () => {
    // integration staged DISABLED (existing admin API) - the secret is returned once by that API and is never stored in audit rows
    const integ = await admin.post(api('/admin/integrations'), { data: { tenantId, adapterKey: 'dev-mock', name: 'Main', status: 'DISABLED' } })
    expect(integ.status()).toBe(201)
    const body = (await integ.json()).data
    integrationSecret = body.secret ?? body.webhookSecret ?? ''
    // operator in the tenant (existing admin API)
    const opEmail = `onb-op-${Date.now()}@e2e.gco`
    const op = await admin.post(api('/admin/users'), { data: { email: opEmail, password: 'Operator-Passw0rd!!', displayName: '[E2E] Onboarding Op', role: 'OPERATOR', tenantId } })
    expect(op.status()).toBe(201)
    createdOperatorId = (await op.json()).data.id
    for (const item of ['languages', 'coverage', 'supervisor']) {
      expect((await admin.post(api(`/admin/onboarding/${onboardingId}/confirm`), { data: { item } })).status()).toBe(200)
    }
    expect((await admin.post(api(`/admin/onboarding/${onboardingId}/confirm`), { data: { item: 'bogus' } })).status()).toBe(400)
    const d = (await (await admin.get(api(`/admin/onboarding/${onboardingId}`))).json()).data
    expect(d.status).toBe('READY_FOR_GO_LIVE')
    expect(d.ready).toBe(true)

    expect((await manager.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })).status()).toBe(403)
    expect((await db.integration.findFirstOrThrow({ where: { tenantId } })).status).toBe('DISABLED') // still staged
    const live = await admin.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })
    expect(live.status()).toBe(200)
    expect((await live.json()).data).toMatchObject({ status: 'LIVE', activatedIntegrations: 1, alreadyLive: false })
    const again = await (await admin.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })).json()
    expect(again.data).toMatchObject({ status: 'LIVE', activatedIntegrations: 0, alreadyLive: true })
    expect((await db.integration.findFirstOrThrow({ where: { tenantId } })).status).toBe('ACTIVE')
    expect(await db.auditLog.count({ where: { tenantId, action: 'onboarding.live' } })).toBe(1)
    const client = await loginAs(email, password)
    expect((await (await client.get(api('/onboarding/status'))).json()).data.live).toBe(true)
  })

  test('payment contract: EUR cents only, positive, bounded - invalid input never reaches the database', async () => {
    const bad: unknown[] = [
      { amountEurCents: 0 }, { amountEurCents: -100 }, { amountEurCents: 1.5 }, { amountEurCents: '1000' }, { amountEurCents: 100_000_001 },
      { amountEurCents: 100_000, currency: 'USD' }, { amountEurCents: 100_000, currency: 'AED' }, { amountEurCents: 100_000, currency: 'eur' }, {},
    ]
    for (const data of bad) expect((await manager.post(api(`/crm/leads/${leadId}/confirm-payment`), { data: data as any })).status(), JSON.stringify(data)).toBe(400)
    expect(await db.commission.count({ where: { leadId } })).toBe(0)
    expect(await db.revenueRecord.count({ where: { leadId } })).toBe(0)
  })

  test('first payment: 10% of the amount collected, exactly one commission + one revenue record under concurrency', async () => {
    const amount = 190_000 // EUR 1,900.00
    const results = await Promise.all(Array.from({ length: 6 }, () => manager.post(api(`/crm/leads/${leadId}/confirm-payment`), { data: { amountEurCents: amount, currency: 'EUR' } })))
    expect(results.filter((r) => r.status() === 201)).toHaveLength(1)
    for (const r of results) if (r.status() !== 201) expect(r.status()).toBe(409)
    const c = await db.commission.findMany({ where: { leadId } })
    expect(c).toHaveLength(1)
    expect(Number(c[0]!.percentage)).toBe(10)
    expect(c[0]!.amountEurCents).toBe(19_000)
    expect(c[0]!.status).toBe('PENDING') // payout not approved automatically
    expect(c[0]!.tenantId).toBe(tenantId)
    const rev = await db.revenueRecord.findMany({ where: { leadId } })
    expect(rev).toHaveLength(1)
    expect(rev[0]).toMatchObject({ amountEurCents: amount, tenantId, source: 'DEAL_CLOSED' })
    // a retry after the fact is a deterministic conflict, not a second record
    expect((await manager.post(api(`/crm/leads/${leadId}/confirm-payment`), { data: { amountEurCents: amount } })).status()).toBe(409)
    expect(await db.commission.count({ where: { leadId } })).toBe(1)
  })

  test('month-2+ revenue: validated, recorded, never creates a commission; reporting reflects it', async () => {
    const start = new Date(Date.now() + 30 * 86_400_000)
    const period = { periodStart: start.toISOString(), periodEnd: new Date(start.getTime() + 30 * 86_400_000).toISOString() }
    for (const data of [{ amountEurCents: 0 }, { amountEurCents: -5 }, { amountEurCents: 100_000_001 }, { amountEurCents: 5000, currency: 'USD' }]) {
      expect((await manager.post(api('/crm/revenue'), { data: { tenantId, ...period, ...data } })).status(), JSON.stringify(data)).toBe(400)
    }
    expect((await manager.post(api('/crm/revenue'), { data: { tenantId, amountEurCents: 5000, periodStart: period.periodEnd, periodEnd: period.periodStart } })).status()).toBe(400)
    expect((await manager.post(api('/crm/revenue'), { data: { tenantId: 'no-such-tenant', amountEurCents: 5000, ...period } })).status()).toBe(404)
    expect((await manager.post(api('/crm/revenue'), { data: { tenantId, amountEurCents: 190_000, ...period } })).status()).toBe(201)
    expect(await db.commission.count({ where: { tenantId } })).toBe(1) // still just the first-month commission
    const ceo = (await (await admin.get(api('/crm/dashboard/ceo'))).json()).data
    expect(ceo.awaitingPaymentConfirmation.some((l: any) => l.id === leadId)).toBe(false)
    expect(ceo.totalRevenueEurCents).toBeGreaterThanOrEqual(380_000)
    // the Hunter's wallet shows the one commission; the client sees nothing financial
    const mine = (await (await hunter.ctx.get(api('/crm/commissions'))).json()).data.filter((x: any) => x.leadId === leadId)
    expect(mine).toHaveLength(1)
  })

  test('no secret, token or password ever reaches audit logs or system events', async () => {
    const audits = JSON.stringify(await db.auditLog.findMany({ where: { tenantId } }))
    const events = JSON.stringify(await db.systemEvent.findMany({ where: { category: { in: ['onboarding', 'queue'] }, createdAt: { gte: new Date(Date.now() - 600_000) } } }))
    for (const secret of [token, password, integrationSecret].filter((s) => s && s.length >= 12)) {
      expect(audits).not.toContain(secret)
      expect(events).not.toContain(secret)
    }
    expect(audits).not.toMatch(/passwordHash|inviteTokenHash/)
  })
})
