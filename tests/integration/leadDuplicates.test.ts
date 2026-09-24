import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { createLead, claimLead, LeadDuplicateError, LeadConflictError } from '@/lib/crm/leads'

// CRM duplicate-protection rules (see the approved plan's Data Model section):
// email/vatId are DB-constraint-backed hard blocks (race-safe even under
// concurrent inserts); domain is a soft warning only. Requires the same real
// Postgres the other integration tests use (npm run test:integration).
describe('lead duplicate protection', () => {
  const base = `ld-${Date.now()}`
  const leadIds: string[] = []
  let hunterUserId: string

  afterAll(async () => {
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.lead.deleteMany({ where: { id: { in: leadIds } } })
    if (hunterUserId) await db.user.delete({ where: { id: hunterUserId } }).catch(() => null)
  })

  it('sets up a fixture Hunter user', async () => {
    const user = await db.user.create({
      data: { email: `${base}-hunter@test.gco`, passwordHash: 'x', role: 'HUNTER', displayName: '[TEST] Hunter' },
    })
    hunterUserId = user.id
    expect(hunterUserId).toBeTruthy()
  })

  it('hard-blocks a second lead with the same email', async () => {
    const { lead } = await createLead({
      companyName: '[TEST] Acme Inc',
      contactName: 'Alice',
      email: `${base}-dup@test.gco`,
      actorUserId: hunterUserId,
    })
    leadIds.push(lead.id)

    await expect(
      createLead({
        companyName: '[TEST] Acme Inc Again',
        contactName: 'Bob',
        email: `${base}-dup@test.gco`,
        actorUserId: hunterUserId,
      })
    ).rejects.toBeInstanceOf(LeadDuplicateError)
  })

  it('hard-blocks a second lead with the same VAT ID', async () => {
    const { lead } = await createLead({
      companyName: '[TEST] Beta Ltd',
      contactName: 'Carl',
      email: `${base}-vat1@test.gco`,
      vatId: `${base}-VAT123`,
      actorUserId: hunterUserId,
    })
    leadIds.push(lead.id)

    await expect(
      createLead({
        companyName: '[TEST] Beta Ltd Copy',
        contactName: 'Dana',
        email: `${base}-vat2@test.gco`,
        vatId: `${base}-VAT123`,
        actorUserId: hunterUserId,
      })
    ).rejects.toBeInstanceOf(LeadDuplicateError)
  })

  it('allows multiple leads with no VAT ID (unique constraint tolerates multiple NULLs)', async () => {
    const a = await createLead({
      companyName: '[TEST] No VAT A',
      contactName: 'Eve',
      email: `${base}-novat-a@test.gco`,
      actorUserId: hunterUserId,
    })
    const b = await createLead({
      companyName: '[TEST] No VAT B',
      contactName: 'Frank',
      email: `${base}-novat-b@test.gco`,
      actorUserId: hunterUserId,
    })
    leadIds.push(a.lead.id, b.lead.id)
    expect(a.lead.id).not.toBe(b.lead.id)
  })

  it('only warns (does not block) on a matching domain', async () => {
    const first = await createLead({
      companyName: '[TEST] Gamma Corp',
      contactName: 'Grace',
      email: `${base}-domain1@gamma-test.gco`,
      website: 'https://gamma-test.gco',
      actorUserId: hunterUserId,
    })
    leadIds.push(first.lead.id)
    expect(first.domainWarning).toBeNull()

    const second = await createLead({
      companyName: '[TEST] Gamma Corp Subsidiary',
      contactName: 'Hank',
      email: `${base}-domain2@gamma-test.gco`,
      website: 'https://gamma-test.gco',
      actorUserId: hunterUserId,
    })
    leadIds.push(second.lead.id)
    expect(second.domainWarning).toContain('gamma-test.gco')
    expect(second.lead.id).toBeTruthy()
  })

  it('only one of two concurrent claims on the same lead wins', async () => {
    const { lead } = await createLead({
      companyName: '[TEST] Concurrent Claim Co',
      contactName: 'Ivy',
      email: `${base}-concurrent@test.gco`,
      actorUserId: hunterUserId,
    })
    leadIds.push(lead.id)

    const otherHunter = await db.user.create({
      data: { email: `${base}-hunter2@test.gco`, passwordHash: 'x', role: 'HUNTER', displayName: '[TEST] Hunter Two' },
    })

    const results = await Promise.allSettled([claimLead(lead.id, hunterUserId), claimLead(lead.id, otherHunter.id)])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(LeadConflictError)

    const final = await db.lead.findUniqueOrThrow({ where: { id: lead.id } })
    expect([hunterUserId, otherHunter.id]).toContain(final.ownerId)

    await db.user.delete({ where: { id: otherHunter.id } })
  })
})
