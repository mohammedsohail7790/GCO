import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { createLead } from '@/lib/crm/leads'
import { provisionOnboarding, computeChecklist, goLive, confirmItem, acceptInvitation, issueInvitation } from '@/lib/onboarding/service'
import { recordVerification, clearVerification } from '@/lib/integrations/verification'

// Go-live is the last human gate before real traffic: states/reasons must be exact, and no concurrent change may let a
// client go live (or leave an integration activated) in an inconsistent way. Production default: dev flag OFF.
describe('go-live checklist states and race safety', () => {
  const base = `glr-${Date.now()}`
  const leadIds: string[] = []
  const tenantIds: string[] = []
  let admin = ''
  const setup = async (tag: string, o: { accept?: boolean } = {}) => {
    const { lead } = await createLead({ companyName: `[TEST] ${tag}`, contactName: tag, email: `${base}-${tag}@test.gco`, actorUserId: admin })
    leadIds.push(lead.id)
    const tenant = await db.tenant.create({ data: { name: `[TEST] ${tag}`, slug: `${base}-${tag}` } })
    tenantIds.push(tenant.id)
    await db.bpoHandoff.create({ data: { leadId: lead.id, eventId: `h-${lead.id}`, payload: {}, status: 'SUCCEEDED', tenantId: tenant.id } })
    const ob = await provisionOnboarding(lead.id)
    if (o.accept !== false) await acceptInvitation((await issueInvitation(ob.id, admin)).setupUrl.split('#token=')[1]!, 'a-long-enough-password')
    return { ob, tenant }
  }
  const readyTenant = async (tag: string) => {
    const { ob, tenant } = await setup(tag)
    const op = await db.user.create({ data: { email: `${base}-${tag}-op@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId: tenant.id, displayName: 'op' } })
    await db.operator.create({ data: { userId: op.id, tenantId: tenant.id, capacity: 2 } })
    for (const i of ['languages', 'coverage', 'supervisor'] as const) await confirmItem(ob.id, i, admin)
    const integ = await db.integration.create({ data: { tenantId: tenant.id, adapterKey: 'gco-webhook', name: tag, status: 'DISABLED', config: { callbackUrl: `https://${tag}.example.com/gco` }, webhookSecret: tag.padEnd(64, 'x') } })
    await recordVerification(integ.id, 'outbound')
    await recordVerification(integ.id, 'inbound')
    return { ob, tenant, integ }
  }
  const item = async (obId: string, key: string) => (await computeChecklist(obId)).items.find((i) => i.key === key)!

  beforeAll(async () => {
    delete process.env.ALLOW_DEV_ADAPTERS
    admin = (await db.user.create({ data: { email: `${base}-admin@test.gco`, passwordHash: 'x', role: 'CEO_ADMIN', displayName: '[TEST] admin' } })).id
  })
  afterAll(async () => {
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.clientOnboarding.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: admin }] } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.bpoHandoff.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.lead.deleteMany({ where: { id: { in: leadIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('every item is PASS / FAIL / BLOCKED with a reason that tells the CEO what to do', async () => {
    const { ob, tenant } = await setup('states', { accept: false })
    expect(await item(ob.id, 'invitation_accepted')).toMatchObject({ state: 'fail', detail: expect.stringMatching(/No valid setup link/) })
    await issueInvitation(ob.id, admin)
    expect(await item(ob.id, 'invitation_accepted')).toMatchObject({ state: 'blocked', detail: expect.stringMatching(/Waiting for the client/) })
    expect(await item(ob.id, 'integration_configured')).toMatchObject({ state: 'fail', detail: expect.stringMatching(/No integration exists/) })
    expect(await item(ob.id, 'integration_verified')).toMatchObject({ state: 'fail' })
    for (const k of ['supervisor_confirmed', 'languages_confirmed', 'coverage_confirmed']) expect(await item(ob.id, k)).toMatchObject({ state: 'fail', detail: expect.stringMatching(/confirmation/) })
    expect(await item(ob.id, 'operator_assigned')).toMatchObject({ state: 'fail' })

    await db.integration.create({ data: { tenantId: tenant.id, adapterKey: 'dev-mock', name: 'dev', status: 'DISABLED', config: {}, webhookSecret: 'd'.repeat(64) } })
    expect((await item(ob.id, 'integration_configured')).detail).toMatch(/development adapters exist \(dev-mock\).*never go live/)

    const g = await db.integration.create({ data: { tenantId: tenant.id, adapterKey: 'gco-webhook', name: 'g', status: 'DEGRADED', config: { callbackUrl: 'https://g.example.com/h' }, webhookSecret: 'g'.repeat(64) } })
    expect((await item(ob.id, 'integration_configured')).detail).toMatch(/DEGRADED/)
    await db.integration.update({ where: { id: g.id }, data: { status: 'DISABLED' } })
    expect(await item(ob.id, 'integration_configured')).toMatchObject({ state: 'pass' })
    expect(await item(ob.id, 'callback_url_valid')).toMatchObject({ state: 'pass' })
    expect(await item(ob.id, 'integration_verified')).toMatchObject({ state: 'fail', detail: expect.stringMatching(/outbound verification/) })
    await recordVerification(g.id, 'outbound')
    expect(await item(ob.id, 'integration_verified')).toMatchObject({ state: 'blocked', detail: expect.stringMatching(/Waiting for the client to send a signed test ping/) })
    await recordVerification(g.id, 'inbound')
    expect(await item(ob.id, 'integration_verified')).toMatchObject({ state: 'pass' })
    // destination edited after verification -> stale
    await db.integration.update({ where: { id: g.id }, data: { config: { ...((await db.integration.findUniqueOrThrow({ where: { id: g.id } })).config as object), callbackUrl: 'https://moved.example.com/h' } } })
    expect(await item(ob.id, 'integration_verified')).toMatchObject({ state: 'fail', detail: expect.stringMatching(/changed after verification/) })
    expect(JSON.stringify((await computeChecklist(ob.id)).items)).not.toMatch(/g{64}|webhookSecret/)
  })

  it('an unsafe callback URL fails the checklist even if it was "verified"', async () => {
    const { ob, integ } = await readyTenant('unsafe')
    await db.integration.update({ where: { id: integ.id }, data: { config: { callbackUrl: 'http://10.0.0.5/hook' } } })
    await recordVerification(integ.id, 'outbound')
    await recordVerification(integ.id, 'inbound')
    expect(await item(ob.id, 'callback_url_valid')).toMatchObject({ state: 'fail' })
    await expect(goLive(ob.id, admin)).rejects.toMatchObject({ status: 409, code: 'CHECKLIST_INCOMPLETE' })
    expect((await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).status).toBe('DISABLED')
  })

  it('8 concurrent go-live requests: exactly one performs it, the integration is activated once, one audit event', async () => {
    const { ob, tenant, integ } = await readyTenant('concurrent')
    const res = await Promise.allSettled(Array.from({ length: 8 }, () => goLive(ob.id, admin)))
    const fulfilled = res.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof goLive>>>[]
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)
    expect(fulfilled.filter((r) => !r.value.alreadyLive)).toHaveLength(1)
    for (const r of res) if (r.status === 'rejected') expect((r.reason as { status?: number }).status).toBe(409)
    expect((await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).status).toBe('ACTIVE')
    expect((await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('LIVE')
    expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'onboarding.live' } })).toBe(1)
  })

  it('RACE: go-live vs secret rotation / operator removal never leaves a LIVE client on an unverified integration or an activated integration on a non-LIVE client', async () => {
    for (let n = 0; n < 10; n++) {
      const { ob, integ } = await readyTenant(`race${n}`)
      const op = await db.operator.findFirstOrThrow({ where: { tenant: { onboarding: { id: ob.id } } } })
      const interfere = n % 2 === 0 ? clearVerification(integ.id) : db.user.update({ where: { id: op.userId }, data: { isActive: false } })
      await Promise.allSettled([goLive(ob.id, admin), interfere])
      const status = (await db.clientOnboarding.findUniqueOrThrow({ where: { id: ob.id } })).status
      const integration = (await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).status
      // invariant: LIVE <=> integration ACTIVE (activation and the LIVE flag commit atomically)
      expect(integration === 'ACTIVE', `trial ${n}: ${status}/${integration}`).toBe(status === 'LIVE')
    }
  }, 120_000)
})
