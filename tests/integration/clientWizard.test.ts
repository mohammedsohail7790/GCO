import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { runWizard, type WizardInput } from '@/lib/onboarding/wizard'
import { acceptStaffInvitation } from '@/lib/onboarding/staffInvites'

describe('client setup wizard (real database)', () => {
  const base = `cw-${Date.now()}`
  const input = (tag: string, over: Partial<WizardInput> = {}): WizardInput => ({
    company: { name: `[TEST] ${base} ${tag}`, slug: `${base}-${tag}` }, industry: 'GAMING', services: ['CHAT_MODERATION', 'COMMUNITY_MODERATION'], languages: ['en', 'sv'], timezone: 'Europe/Stockholm', operatingHours: null,
    responseSlaSeconds: 60, operatorCapacity: 4, messageCap: 5000,
    billing: { model: 'PER_MESSAGE', pricePerMessageEurCents: 12, pricePerTicketEurCents: null, pricePerHourEurCents: null, monthlyFeeEurCents: null, vatRatePercent: 22, vatNote: null },
    operatorPay: { amountEurCents: 5, basis: 'APPROVED' }, aiMode: 'HUMAN_ONLY', requireOperatorApproval: true,
    clientContact: { email: `${base}-${tag}-client@test.gco`, name: 'Client Contact' },
    staff: [{ email: `${base}-${tag}-mgr@test.gco`, name: 'Mia Manager', role: 'MANAGER' }, { email: `${base}-${tag}-sup@test.gco`, name: 'Sam Supervisor', role: 'SUPERVISOR' }, { email: `${base}-${tag}-op@test.gco`, name: 'Olga Operator', role: 'OPERATOR', languages: ['sv'] }, { email: `${base}-${tag}-op2@test.gco`, name: 'Otto Operator', role: 'OPERATOR' }],
    ...over,
  })
  const slugs: string[] = []

  afterAll(async () => {
    const tenants = await db.tenant.findMany({ where: { slug: { in: slugs } }, select: { id: true } })
    const ids = tenants.map((t) => t.id)
    await db.staffInvitation.deleteMany({ where: { tenantId: { in: ids } } })
    await db.operatorRateCard.deleteMany({ where: { tenantId: { in: ids } } })
    await db.tenantService.deleteMany({ where: { tenantId: { in: ids } } })
    await db.operator.deleteMany({ where: { tenantId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
    await db.user.deleteMany({ where: { tenantId: { in: ids } } })
    await db.tenant.deleteMany({ where: { id: { in: ids } } })
  })

  it('creates the client, template, services, pay rate, AI mode and one-time invitations in one go', async () => {
    const i = input('full'); slugs.push(i.company.slug)
    const r = await runWizard(i, 'actor')
    expect(r.warnings).toEqual([])
    expect(r.invitations).toHaveLength(5)
    expect(r.workspace.modules).toEqual(expect.arrayContaining(['moderation_queue', 'community_reports']))
    const t = await db.tenant.findUniqueOrThrow({ where: { id: r.tenantId }, include: { services: true } })
    expect(t).toMatchObject({ industry: 'GAMING', aiMode: 'HUMAN_ONLY', requireOperatorApproval: true, defaultResponseSlaSeconds: 60, defaultOperatorCapacity: 4, messageCap: 5000, pricePerMessageEurCents: 12, timezone: 'Europe/Stockholm' })
    expect(t.services.filter((s) => s.enabled).map((s) => s.serviceType).sort()).toEqual(['CHAT_MODERATION', 'COMMUNITY_MODERATION'])
    expect(await db.operatorRateCard.findFirst({ where: { tenantId: r.tenantId } })).toMatchObject({ amountEurCents: 5, basis: 'APPROVED' })
    const ops = await db.operator.findMany({ where: { tenantId: r.tenantId }, orderBy: { createdAt: 'asc' } })
    expect(ops.map((o) => [...o.languages].sort())).toEqual([['sv'], ['en', 'sv']]) // explicit languages, else the client's
    expect(ops.every((o) => o.capacity === 4 && o.status === 'OFFLINE')).toBe(true)
    const roles = (await db.user.findMany({ where: { tenantId: r.tenantId } })).map((u) => [u.role, u.isActive]).sort()
    expect(roles).toEqual([['CLIENT', false], ['MANAGER', false], ['OPERATOR', false], ['OPERATOR', false], ['SUPERVISOR', false]])

    // the client contact's one-time link works exactly once and activates a CLIENT account of this tenant only
    const link = r.invitations.find((x) => x.role === 'CLIENT')!
    const token = link.setupUrl.split('#token=')[1]!
    await acceptStaffInvitation(token, 'Harbor-Quiet-Lantern-2026')
    const client = await db.user.findUniqueOrThrow({ where: { email: link.email } })
    expect(client).toMatchObject({ role: 'CLIENT', isActive: true, tenantId: r.tenantId })
    expect(await acceptStaffInvitation(token, 'Harbor-Quiet-Lantern-2027')).toBeNull() // a used link no longer exists
    // no tokens or links in the audit trail
    const audit = JSON.stringify(await db.auditLog.findMany({ where: { tenantId: r.tenantId } }))
    expect(audit).not.toContain(token); expect(audit).not.toContain('accept-invitation')
  })

  it('validates everything first: nothing is created for an invalid, duplicate or taken request', async () => {
    const i = input('dup'); slugs.push(i.company.slug)
    await runWizard({ ...i, staff: [], clientContact: null }, 'actor')
    const before = await db.tenant.count()
    await expect(runWizard({ ...i, staff: [], clientContact: null }, 'actor')).rejects.toThrow(/already used/) // slug taken
    const j = input('bad'); slugs.push(j.company.slug)
    await expect(runWizard({ ...j, aiMode: 'AI_PLUS_HUMAN' }, 'actor')).rejects.toThrow(/not available yet/)
    await expect(runWizard({ ...j, staff: [{ email: `${base}-dup-client@test.gco`, name: 'x', role: 'OPERATOR' }], clientContact: { email: `${base}-dup-client@test.gco`, name: 'x' } }, 'actor')).rejects.toThrow(/twice/)
    expect(await db.tenant.count()).toBe(before)
    // an email that already has an account blocks the whole request before anything is written
    const k = input('taken'); slugs.push(k.company.slug)
    const first = input('taken0'); slugs.push(first.company.slug)
    await runWizard({ ...first, staff: [{ email: `${base}-shared@test.gco`, name: 'x', role: 'OPERATOR' }], clientContact: null }, 'actor')
    await expect(runWizard({ ...k, staff: [{ email: `${base}-shared@test.gco`, name: 'x', role: 'OPERATOR' }], clientContact: null }, 'actor')).rejects.toThrow(/already exists/)
    expect(await db.tenant.findUnique({ where: { slug: k.company.slug } })).toBeNull()
  })

  it('warns instead of silently leaving operators unpriced', async () => {
    const i = input('nopay', { operatorPay: null, staff: [], clientContact: null }); slugs.push(i.company.slug)
    const r = await runWizard(i, 'actor')
    expect(r.warnings.join()).toMatch(/No operator pay rate/)
  })
})
