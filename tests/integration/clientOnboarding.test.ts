import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { createLead } from '@/lib/crm/leads'
import {
  provisionOnboarding, runOnboarding, issueInvitation, acceptInvitation, confirmItem, goLive, computeChecklist, clientView, adminView,
  sha256, OnboardingError,
} from '@/lib/onboarding/service'

// Client onboarding on the real database: idempotent provisioning, recovery after partial success,
// single-use invitations, checklist-gated go-live, and secret hygiene. The handoff (tenant) is set up
// directly - no worker involved.
describe('client onboarding', () => {
  const base = `onb-${Date.now()}`
  const leadIds: string[] = []
  const tenantIds: string[] = []
  let admin: string

  const setup = async (tag: string, notes?: string) => {
    const { lead } = await createLead({ companyName: `[TEST] ${tag}`, contactName: `Contact ${tag}`, email: `${base}-${tag}@test.gco`, notes, actorUserId: admin })
    leadIds.push(lead.id)
    const tenant = await db.tenant.create({ data: { name: `[TEST] ${tag}`, slug: `${base}-${tag}`.toLowerCase() } })
    tenantIds.push(tenant.id)
    await db.bpoHandoff.create({ data: { leadId: lead.id, eventId: `h-${lead.id}`, payload: {}, status: 'SUCCEEDED', tenantId: tenant.id } })
    return { lead, tenant, email: lead.email }
  }
  const count = (leadId: string) => db.clientOnboarding.count({ where: { leadId } })

  beforeAll(async () => {
    admin = (await db.user.create({ data: { email: `${base}-admin@test.gco`, passwordHash: 'x', role: 'CEO_ADMIN', displayName: '[TEST] admin' } })).id
  })
  afterAll(async () => {
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.clientOnboarding.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: admin }] } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.systemEvent.deleteMany({ where: { category: 'onboarding', metadata: { path: ['leadId'], string_contains: '' } } }).catch(() => null)
    await db.bpoHandoff.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.lead.deleteMany({ where: { id: { in: leadIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  describe('provisioning', () => {
    it('refuses to start before the handoff has succeeded', async () => {
      const { lead } = await createLead({ companyName: '[TEST] early', contactName: 'E', email: `${base}-early@test.gco`, actorUserId: admin })
      leadIds.push(lead.id)
      await expect(provisionOnboarding(lead.id)).rejects.toMatchObject({ status: 409, code: 'HANDOFF_NOT_READY' })
    })

    it('creates one onboarding record and one INACTIVE CLIENT user in the right tenant, with a pilot profile', async () => {
      const { lead, tenant, email } = await setup('first', 'Interested in: Chat Moderation\nLanguages: Italian, French\nCoverage needed: Business hours')
      const ob = await provisionOnboarding(lead.id)
      expect(ob.status).toBe('SETUP')
      expect(ob.requestedProfile).toMatchObject({ services: ['Chat Moderation'], languages: ['Italian', 'French'], coverage: 'Business hours' })
      const user = await db.user.findUniqueOrThrow({ where: { id: ob.clientUserId! } })
      expect(user).toMatchObject({ email, role: 'CLIENT', tenantId: tenant.id, isActive: false })
      expect(await bcrypt.compare('', user.passwordHash)).toBe(false) // unusable password, nobody knows it
    })

    it('is idempotent: re-running (even concurrently) never duplicates user, record or audit events', async () => {
      const { lead, tenant } = await setup('idem')
      await Promise.all(Array.from({ length: 6 }, () => provisionOnboarding(lead.id).catch(() => null)))
      await provisionOnboarding(lead.id)
      await provisionOnboarding(lead.id)
      expect(await count(lead.id)).toBe(1)
      expect(await db.user.count({ where: { tenantId: tenant.id } })).toBe(1)
      expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.started' } })).toBe(1)
      expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.user_created' } })).toBe(1)
    })

    it('recovers from partial success: record exists without a user -> retry creates only the missing user', async () => {
      const { lead, tenant, email } = await setup('partial')
      await db.clientOnboarding.create({ data: { leadId: lead.id, tenantId: tenant.id, contactEmail: email, contactName: 'x', status: 'FAILED', lastError: 'boom' } })
      const ob = await provisionOnboarding(lead.id)
      expect(await count(lead.id)).toBe(1)
      expect(ob.clientUserId).toBeTruthy()
      expect(ob.lastError).toBeNull()
      expect(ob.status).toBe('SETUP') // FAILED is cleared by a successful run
    })

    it('recovers when the user already exists in this tenant (e.g. crash between user creation and linking, or admin-created)', async () => {
      const { lead, tenant, email } = await setup('existing')
      const u = await db.user.create({ data: { email, passwordHash: 'x', role: 'CLIENT', tenantId: tenant.id, displayName: 'pre', isActive: false } })
      const ob = await provisionOnboarding(lead.id)
      expect(ob.clientUserId).toBe(u.id)
      expect(await db.user.count({ where: { email } })).toBe(1)
      expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.user_created' } })).toBe(0) // not created by us
    })

    it('never adopts an account that belongs to someone else; failure is recorded visibly without leaking the address', async () => {
      const { lead, tenant, email } = await setup('conflict')
      await db.user.create({ data: { email, passwordHash: 'x', role: 'OPERATOR', tenantId: null, displayName: 'someone else' } })
      await expect(runOnboarding(lead.id)).rejects.toMatchObject({ status: 409, code: 'EMAIL_IN_USE' })
      const ob = await db.clientOnboarding.findUniqueOrThrow({ where: { leadId: lead.id } })
      expect(ob.status).toBe('FAILED')
      expect(ob.lastError).toMatch(/already belongs/)
      expect(ob.lastError).not.toContain(email)
      const ev = await db.systemEvent.findFirst({ where: { category: 'onboarding', metadata: { path: ['leadId'], equals: lead.id } } })
      expect(ev?.severity).toBe('error')
      expect(JSON.stringify(ev?.metadata)).not.toContain(email)
      expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.failed' } })).toBe(1)
      expect(await db.user.count({ where: { tenantId: tenant.id } })).toBe(0)
      // resolve the conflict, retry -> converges
      await db.user.deleteMany({ where: { email } })
      expect((await provisionOnboarding(lead.id)).status).toBe('SETUP')
    })
  })

  describe('invitation security', () => {
    const token = (url: string) => url.split('#token=')[1]!

    it('stores only a hash; the link carries the token in the fragment; nothing sensitive reaches audit rows', async () => {
      const { lead, tenant } = await setup('invite')
      const ob = await provisionOnboarding(lead.id)
      const { setupUrl, expiresAt } = await issueInvitation(ob.id, admin)
      const t = token(setupUrl)
      expect(t).toMatch(/^[0-9a-f]{64}$/)
      expect(setupUrl).toContain('/accept-invitation#token=')
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 86_400_000)
      const row = await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })
      expect(row.inviteTokenHash).toBe(sha256(t))
      expect(JSON.stringify(row)).not.toContain(t)
      const audits = await db.auditLog.findMany({ where: { tenantId: tenant.id } })
      expect(JSON.stringify(audits)).not.toContain(t)
      expect(JSON.stringify(audits)).not.toContain(sha256(t))
      expect(JSON.stringify(await adminView(ob.id))).not.toContain(sha256(t))
    })

    it('single use, expiring, generic failures; a re-issue invalidates the previous link', async () => {
      const { lead } = await setup('single')
      const ob = await provisionOnboarding(lead.id)
      const first = token((await issueInvitation(ob.id, admin)).setupUrl)
      const second = token((await issueInvitation(ob.id, admin)).setupUrl)
      await expect(acceptInvitation(first, 'a-long-enough-password')).rejects.toMatchObject({ status: 400 }) // superseded
      for (const bad of ['', 'x', 'g'.repeat(64), '0'.repeat(64)]) {
        await expect(acceptInvitation(bad, 'a-long-enough-password')).rejects.toThrow('invalid or has expired')
      }
      // 6 concurrent accepts of the valid token -> exactly one wins
      const res = await Promise.allSettled(Array.from({ length: 6 }, () => acceptInvitation(second, 'a-long-enough-password')))
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      await expect(acceptInvitation(second, 'another-long-password')).rejects.toBeInstanceOf(OnboardingError) // replay
      const user = await db.user.findUniqueOrThrow({ where: { id: ob.clientUserId! } })
      expect(user.isActive).toBe(true)
      expect(await bcrypt.compare('a-long-enough-password', user.passwordHash)).toBe(true)
      const after = await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })
      expect(after.inviteTokenHash).toBeNull()
      expect(after.inviteAcceptedAt).not.toBeNull()
      await expect(issueInvitation(ob.id, admin)).rejects.toMatchObject({ status: 409, code: 'ALREADY_ACTIVE' })
    })

    it('an expired invitation is rejected and the user stays inactive', async () => {
      const { lead } = await setup('expired')
      const ob = await provisionOnboarding(lead.id)
      const t = token((await issueInvitation(ob.id, admin)).setupUrl)
      await db.clientOnboarding.update({ where: { id: ob.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } })
      await expect(acceptInvitation(t, 'a-long-enough-password')).rejects.toMatchObject({ status: 400 })
      expect((await db.user.findUniqueOrThrow({ where: { id: ob.clientUserId! } })).isActive).toBe(false)
    })

    it('an invitation cannot be issued before the user exists', async () => {
      const { lead, tenant, email } = await setup('nouser')
      const ob = await db.clientOnboarding.create({ data: { leadId: lead.id, tenantId: tenant.id, contactEmail: email, contactName: 'x' } })
      await expect(issueInvitation(ob.id, admin)).rejects.toMatchObject({ status: 409, code: 'USER_NOT_CREATED' })
    })
  })

  describe('checklist and go-live', () => {
    it('go-live is blocked until every required item is true, then activates staged integrations exactly once', async () => {
      const { lead, tenant } = await setup('golive')
      const ob = await provisionOnboarding(lead.id)
      await expect(goLive(ob.id, admin)).rejects.toMatchObject({ status: 409, code: 'CHECKLIST_INCOMPLETE' })
      expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })).status).not.toBe('LIVE')

      // client accepts
      await acceptInvitation((await issueInvitation(ob.id, admin)).setupUrl.split('#token=')[1]!, 'a-long-enough-password')
      // integration staged DISABLED, with a secret (presence only is checked), an unregistered adapter does not count
      await db.integration.create({ data: { tenantId: tenant.id, adapterKey: 'not-registered', name: 'bad', status: 'DISABLED', config: {}, webhookSecret: 'x'.repeat(40) } })
      expect((await computeChecklist(ob.id)).items.find((i) => i.key === 'integration_configured')!.done).toBe(false)
      const integ = await db.integration.create({ data: { tenantId: tenant.id, adapterKey: 'dev-mock', name: 'Main', status: 'DISABLED', config: {}, webhookSecret: 'y'.repeat(40) } })
      // operator
      const opUser = await db.user.create({ data: { email: `${base}-op@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId: tenant.id, displayName: 'op' } })
      await db.operator.create({ data: { userId: opUser.id, tenantId: tenant.id, capacity: 2 } })
      for (const item of ['languages', 'coverage'] as const) await confirmItem(ob.id, item, admin)
      await expect(goLive(ob.id, admin)).rejects.toMatchObject({ code: 'CHECKLIST_INCOMPLETE' }) // supervisor still unconfirmed
      expect((await computeChecklist(ob.id)).items.filter((i) => !i.done).map((i) => i.key)).toEqual(['supervisor_confirmed'])
      await confirmItem(ob.id, 'supervisor', admin)
      await confirmItem(ob.id, 'supervisor', admin) // idempotent
      expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('READY_FOR_GO_LIVE')
      expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.confirmed' } })).toBe(3)
      expect((await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).status).toBe('DISABLED') // still not live

      const res = await Promise.all(Array.from({ length: 4 }, () => goLive(ob.id, admin)))
      expect(res.filter((r) => !r.alreadyLive)).toHaveLength(1)
      expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('LIVE')
      expect((await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).status).toBe('ACTIVE')
      expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.live' } })).toBe(1)
      // re-provisioning a LIVE client changes nothing
      expect((await provisionOnboarding(lead.id)).status).toBe('LIVE')
    })

    it('the client-facing view exposes progress only: no contact data, ids, secrets or internal steps', async () => {
      const { lead, tenant } = await setup('clientview')
      await provisionOnboarding(lead.id)
      const v = await clientView(tenant.id)
      expect(v!.steps.map((s) => s.key)).toEqual(['tenant_created', 'invitation_accepted', 'integration_configured', 'languages_confirmed', 'coverage_confirmed'])
      const json = JSON.stringify(v)
      for (const forbidden of ['webhook', 'operator', 'supervisor', 'email', 'leadId', 'lastError', 'commission', 'test.gco']) expect(json).not.toContain(forbidden)
      expect(await clientView('does-not-exist')).toBeNull()
    })
  })
})
