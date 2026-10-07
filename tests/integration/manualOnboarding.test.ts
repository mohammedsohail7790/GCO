import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { startManualOnboarding, retryOnboarding, updateClientProfile, adminView, issueInvitation, acceptInvitation, computeChecklist } from '@/lib/onboarding/service'

// Onboarding a client that did NOT come through the CRM: tenant + record + inactive client user, idempotent, audited,
// and an admin view that never exposes secrets.
describe('manual client onboarding', () => {
  const base = `mo-${Date.now()}`
  const tenantIds: string[] = []
  let admin = ''
  const start = async (tag: string) => {
    const ob = await startManualOnboarding({ name: `[TEST] ${tag}`, slug: `${base}-${tag}`, contactName: `Contact ${tag}`, contactEmail: `${base}-${tag}@Test.GCO` }, admin)
    tenantIds.push(ob.tenantId)
    return ob
  }

  beforeAll(async () => {
    delete process.env.ALLOW_DEV_ADAPTERS // production behaviour regardless of how the suite was launched
    admin = (await db.user.create({ data: { email: `${base}-admin@test.gco`, passwordHash: 'x', role: 'CEO_ADMIN', displayName: '[TEST] admin' } })).id
  })
  afterAll(async () => {
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.clientOnboarding.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: admin }] } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('creates the tenant (standard defaults), the onboarding record and an INACTIVE client user - no lead, no commission', async () => {
    const ob = await start('a')
    expect(ob.status).toBe('SETUP')
    expect(ob.leadId).toMatch(/^manual-/)
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: ob.tenantId } })
    expect(tenant).toMatchObject({ status: 'ACTIVE', defaultResponseSlaSeconds: 120, defaultOperatorCapacity: 2 })
    const user = await db.user.findUniqueOrThrow({ where: { id: ob.clientUserId! } })
    expect(user).toMatchObject({ role: 'CLIENT', tenantId: ob.tenantId, isActive: false, email: `${base}-a@test.gco` }) // normalised lower-case
    expect(await db.lead.count({ where: { OR: [{ email: `${base}-a@test.gco` }, { id: { startsWith: 'manual-' } }] } })).toBe(0) // no lead for this client (not a global count: other test files run in parallel)
    expect(await db.commission.count({ where: { tenantId: ob.tenantId } })).toBe(0)
    expect(await db.auditLog.count({ where: { tenantId: ob.tenantId, action: 'onboarding.started', actorUserId: admin } })).toBe(1)
  })

  it('refuses a contact email that belongs to any account, and a duplicate slug - creating nothing', async () => {
    await start('dup')
    const mine = () => db.tenant.count({ where: { slug: { startsWith: base } } }) // scoped: other test files create tenants in parallel
    const tenants = await mine()
    await expect(startManualOnboarding({ name: 'X', slug: `${base}-other`, contactName: 'X', contactEmail: `${base}-DUP@test.gco` }, admin)).rejects.toMatchObject({ status: 409, code: 'EMAIL_IN_USE' })
    await expect(startManualOnboarding({ name: 'X', slug: `${base}-dup`, contactName: 'X', contactEmail: `${base}-fresh@test.gco` }, admin)).rejects.toMatchObject({ status: 409, code: 'SLUG_IN_USE' })
    expect(await mine()).toBe(tenants)
    expect(await db.user.count({ where: { email: `${base}-fresh@test.gco` } })).toBe(0)
  })

  it('retry is inline for manual onboardings and idempotent (no second user, no extra audit)', async () => {
    const ob = await start('retry')
    for (let i = 0; i < 3; i++) expect(await retryOnboarding(ob.id)).toEqual({ queued: false })
    expect(await db.user.count({ where: { tenantId: ob.tenantId } })).toBe(1)
    expect(await db.auditLog.count({ where: { tenantId: ob.tenantId, action: 'onboarding.user_created' } })).toBe(1)
    await expect(retryOnboarding('missing')).rejects.toMatchObject({ status: 404 })
  })

  it('the invitation works for a manual client exactly as for a CRM client', async () => {
    const ob = await start('invite')
    const { setupUrl } = await issueInvitation(ob.id, admin)
    await acceptInvitation(setupUrl.split('#token=')[1]!, 'a-long-enough-password')
    expect((await db.user.findUniqueOrThrow({ where: { id: ob.clientUserId! } })).isActive).toBe(true)
    expect((await computeChecklist(ob.id)).items.find((i) => i.key === 'invitation_accepted')!.state).toBe('pass')
  })

  it('client profile: non-secret facts are stored/merged/cleared; credentials, unknown keys and long values are refused', async () => {
    const ob = await start('profile')
    expect(await updateClientProfile(ob.id, { channel: 'In-app chat', operatingHours: 'Mon-Fri 9-18 CET', technicalContact: 'Jane, jane@client.example.com' }, admin)).toEqual({
      channel: 'In-app chat', operatingHours: 'Mon-Fri 9-18 CET', technicalContact: 'Jane, jane@client.example.com',
    })
    expect(await updateClientProfile(ob.id, { operatingHours: '' , website: 'client.example.com' }, admin)).toEqual({ channel: 'In-app chat', technicalContact: 'Jane, jane@client.example.com', website: 'client.example.com' })
    await expect(updateClientProfile(ob.id, { channel: 'api_key: sk-live-abc123def456' }, admin)).rejects.toMatchObject({ status: 400, code: 'LOOKS_LIKE_SECRET' })
    await expect(updateClientProfile(ob.id, { technicalContact: 'x'.repeat(40) }, admin)).rejects.toMatchObject({ code: 'LOOKS_LIKE_SECRET' })
    await expect(updateClientProfile(ob.id, { channel: 'x'.repeat(81) }, admin)).rejects.toMatchObject({ status: 400 })
    await expect(updateClientProfile(ob.id, { apiKey: 'nope' } as never, admin)).rejects.toMatchObject({ status: 400 })
    // refused input left the stored profile untouched; audit holds field NAMES only
    expect(((await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })).requestedProfile as any).clientProfile).toMatchObject({ channel: 'In-app chat' })
    const audits = JSON.stringify(await db.auditLog.findMany({ where: { tenantId: ob.tenantId, action: 'onboarding.profile_updated' } }))
    expect(audits).toContain('channel')
    expect(audits).not.toContain('In-app chat')
    expect(audits).not.toContain('jane@client.example.com')
  })

  it('the admin view shows integrations and operators and never a secret, token or hash', async () => {
    const ob = await start('view')
    const secret = 'z'.repeat(64)
    await db.integration.create({ data: { tenantId: ob.tenantId, adapterKey: 'gco-webhook', name: 'Main', status: 'DISABLED', config: { callbackUrl: 'https://client.example.com/hooks/gco' }, webhookSecret: secret } })
    await db.integration.create({ data: { tenantId: ob.tenantId, adapterKey: 'dev-mock', name: 'Dev', status: 'DISABLED', config: {}, webhookSecret: 'y'.repeat(64) } })
    const op = await db.user.create({ data: { email: `${base}-op@test.gco`, passwordHash: 'hash-should-not-appear', role: 'OPERATOR', tenantId: ob.tenantId, displayName: 'Olivia' } })
    await db.operator.create({ data: { userId: op.id, tenantId: ob.tenantId, capacity: 2 } })
    await issueInvitation(ob.id, admin)
    const v = await adminView(ob.id)
    expect(v.manual).toBe(true)
    expect(v.integrations.map((i) => [i.adapter, i.productionCapable, i.usableForGoLive])).toEqual([['gco-webhook', true, true], ['dev-mock', false, false]])
    expect(v.integrations[0]).toMatchObject({ callbackUrl: 'https://client.example.com/hooks/gco', verified: false })
    expect(v.operators).toEqual([expect.objectContaining({ name: 'Olivia', active: true })])
    const json = JSON.stringify(v)
    for (const forbidden of [secret, 'y'.repeat(64), 'passwordHash', 'hash-should-not-appear', 'inviteTokenHash', 'webhookSecret']) expect(json).not.toContain(forbidden)
  })
})
