import { test, expect } from '@playwright/test'
import { anonymousContext, seedHunter, cleanupHunter, cleanupLead, seedIsolatedTenant, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

// Repeat website submissions for an email that is already a lead: ONE lead, owner preserved,
// the new request recorded (history + notes), only empty safe fields filled, nothing overwritten.
test.describe('repeat pilot submission (existing lead)', () => {
  const email = `repeat-pilot-${Date.now()}@e2e.gco`
  let hunter: Awaited<ReturnType<typeof seedHunter>>
  let other: Awaited<ReturnType<typeof seedHunter>>
  let tenant: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let leadId: string
  const post = async (data: Record<string, unknown>, ip: string) => {
    const anon = await anonymousContext()
    return anon.post('/api/v1/public/contact', { data, headers: { 'x-forwarded-for': ip } })
  }

  test.beforeAll(async () => {
    hunter = await seedHunter('repeat-owner')
    other = await seedHunter('repeat-other')
    tenant = await seedIsolatedTenant('repeat-tenant')
  })
  test.afterAll(async () => {
    if (leadId) await cleanupLead(leadId)
    await cleanupHunter(hunter.userId)
    await cleanupHunter(other.userId)
    await cleanupTenant(tenant.tenantId)
  })

  test('first submission creates one unassigned lead', async () => {
    const r = await post({ intent: 'pilot', email, company: 'Repeat Co', service: 'Chat moderation', country: 'Italy' }, `rp-1-${Date.now()}`)
    expect(r.status()).toBe(201)
    const lead = await db.lead.findUniqueOrThrow({ where: { email } })
    leadId = lead.id
    expect(lead.source).toBe('website_pilot_form')
    expect(lead.ownerId).toBeNull()
    expect(lead.website).toBeNull()
  })

  test('a hunter claims it; a second pilot request is recorded without duplicating or changing ownership', async () => {
    expect((await hunter.ctx.post(`/api/v1/crm/leads/${leadId}/claim`)).status()).toBe(200)
    const before = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(before.ownerId).toBe(hunter.userId)

    const r = await post(
      { intent: 'pilot', email, company: 'Repeat Co (renamed)', companyWebsite: 'repeat.example', service: 'Multilingual chat operations', volume: '10,000 – 50,000', languages: 'Italian, French', coverage: 'Around the clock', country: 'France', message: 'Second request, bigger scope' },
      `rp-2-${Date.now()}`,
    )
    expect(r.status()).toBe(201)
    expect((await r.json()).data).toEqual({ received: true })

    expect(await db.lead.count({ where: { email } })).toBe(1) // no duplicate lead
    const after = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(after.ownerId).toBe(hunter.userId) // ownership preserved
    expect(after.ownershipExpiresAt?.getTime()).toBe(before.ownershipExpiresAt?.getTime()) // timers untouched
    expect(after.pipelineStage).toBe(before.pipelineStage)
    expect(after.companyName).toBe('Repeat Co') // never overwritten
    expect(after.country).toBe('Italy') // existing value kept
    expect(after.website).toBe('repeat.example') // empty safe field filled
    expect(after.domain).toBe(before.domain) // already derived from the email at creation - never overwritten
    expect(after.notes).toContain('Repeat 7-day pilot request received')
    expect(after.notes).toContain('Multilingual chat operations')
    expect(after.notes).toContain('Request: 7-day pilot') // original note preserved
  })

  test('history preserves every submission, in order, with the full details', async () => {
    await post({ intent: 'pilot', email, company: 'Repeat Co', message: 'Third request' }, `rp-3-${Date.now()}`)
    const entries = await db.leadHistoryEntry.findMany({ where: { leadId, action: 'pilot_request_received' }, orderBy: { createdAt: 'asc' } })
    expect(entries).toHaveLength(2)
    expect(entries[0]!.actorUserId).toBeNull()
    expect((entries[0]!.metadata as any).fields).toMatchObject({ service: 'Multilingual chat operations', languages: 'Italian, French', coverage: 'Around the clock', volume: '10,000 – 50,000' })
    expect((entries[1]!.metadata as any).fields.message).toBe('Third request')
    expect(await db.lead.count({ where: { email } })).toBe(1)
  })

  test('a plain contact-form repeat is recorded as a contact request', async () => {
    await post({ name: 'Priya', company: 'Repeat Co', email, message: 'Contact form again' }, `rp-4-${Date.now()}`)
    expect(await db.leadHistoryEntry.count({ where: { leadId, action: 'contact_request_received' } })).toBe(1)
  })

  test('the history is visible to the owning hunter and CRM team roles, and not to other hunters or client/operator users', async () => {
    const own = await hunter.ctx.get(`/api/v1/crm/leads/${leadId}`)
    expect(own.status()).toBe(200)
    const history = (await own.json()).data.history
    expect(history.filter((h: any) => h.action === 'pilot_request_received')).toHaveLength(2)

    expect((await other.ctx.get(`/api/v1/crm/leads/${leadId}`)).status()).toBe(403) // another hunter
    // Leads are GCO's own sales CRM (not tenant data). Client and operator users have no CRM access.
    for (const ctx of [tenant.clientCtx, tenant.operatorCtx]) {
      expect((await ctx.get(`/api/v1/crm/leads/${leadId}`)).status()).toBe(403)
    }
    // Pre-existing RBAC (unchanged): the MANAGER role holds LEAD_VIEW_TEAM.
    expect((await tenant.managerCtx.get(`/api/v1/crm/leads/${leadId}`)).status()).toBe(200)
  })

  test('CRM duplicate rules for Hunter-created leads are unchanged (still a hard block)', async () => {
    const res = await hunter.ctx.post('/api/v1/crm/leads', { data: { companyName: 'Dup Via Hunter', contactName: 'X', email } })
    expect(res.status()).toBe(409)
  })
})
