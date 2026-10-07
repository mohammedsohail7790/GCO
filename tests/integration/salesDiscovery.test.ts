import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { createLead } from '@/lib/crm/leads'
import { updateLeadDiscovery, followUpsDue, lastActivityByLead } from '@/lib/crm/discovery'

// Discovery record, qualification, next action and follow-ups on the real database.
describe('sales discovery + follow-ups', () => {
  const base = `sd-${Date.now()}`
  const leadIds: string[] = []
  let hunter = ''
  let other = ''
  let manager = ''
  const mk = async (tag: string, extra: Record<string, unknown> = {}) => {
    const { lead } = await createLead({ companyName: `[TEST] ${tag}`, contactName: tag, email: `${base}-${tag}@test.gco`, actorUserId: hunter })
    leadIds.push(lead.id)
    if (Object.keys(extra).length) await db.lead.update({ where: { id: lead.id }, data: extra as any })
    return lead
  }
  const user = (tag: string, role: 'HUNTER' | 'MANAGER') => db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role, displayName: `[TEST] ${tag}` } }).then((u) => u.id)

  beforeAll(async () => {
    hunter = await user('hunter', 'HUNTER')
    other = await user('other', 'HUNTER')
    manager = await user('manager', 'MANAGER')
  })
  afterAll(async () => {
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.lead.deleteMany({ where: { id: { in: leadIds } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: [hunter, other, manager] } } })
    await db.user.deleteMany({ where: { id: { in: [hunter, other, manager] } } })
  })

  it('stores qualification, next action and discovery answers; sections merge; empty string clears a field', async () => {
    const l = await mk('store', { ownerId: hunter })
    await updateLeadDiscovery(l.id, hunter, { qualification: 'NEEDS_FOLLOW_UP', nextAction: 'Send proposal', nextActionAt: '2026-10-20T09:00:00.000Z', discovery: { business: { company: 'Acme', pain: 'slow replies' } } })
    await updateLeadDiscovery(l.id, hunter, { discovery: { technical: { channelProvider: 'in-app chat' }, business: { pain: '' } } })
    const after = await db.lead.findUniqueOrThrow({ where: { id: l.id } })
    expect(after).toMatchObject({ qualification: 'NEEDS_FOLLOW_UP', nextAction: 'Send proposal' })
    expect(after.nextActionAt?.toISOString()).toBe('2026-10-20T09:00:00.000Z')
    expect(after.discovery).toEqual({ business: { company: 'Acme' }, technical: { channelProvider: 'in-app chat' } })
    await updateLeadDiscovery(l.id, hunter, { qualification: null, nextAction: null, nextActionAt: null })
    expect(await db.lead.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ qualification: null, nextAction: null, nextActionAt: null })
  })

  it('history and audit hold FIELD NAMES only, never the answers', async () => {
    const l = await mk('names', { ownerId: hunter })
    await updateLeadDiscovery(l.id, hunter, { nextAction: 'call the CTO about SECRETIVE-PLAN', discovery: { business: { decisionMaker: 'Jane the CFO' } } })
    const h = await db.leadHistoryEntry.findFirstOrThrow({ where: { leadId: l.id, action: 'discovery_updated' } })
    const json = JSON.stringify([h, await db.auditLog.findMany({ where: { resourceId: l.id, action: 'lead.discovery_updated' } })])
    expect(json).toContain('nextAction')
    expect(json).not.toMatch(/SECRETIVE-PLAN|Jane the CFO/)
  })

  it('recording discovery on your OWN lead extends the 30-day lock; a Manager updating it does not touch ownership', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000)
    const l = await mk('lock', { ownerId: hunter, ownershipStartedAt: new Date(), ownershipExpiresAt: soon })
    await updateLeadDiscovery(l.id, manager, { nextAction: 'x' })
    expect((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).ownershipExpiresAt?.getTime()).toBe(soon.getTime())
    await updateLeadDiscovery(l.id, hunter, { nextAction: 'y' })
    const days = ((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).ownershipExpiresAt!.getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(30)
  })

  it.each([
    ['nextAction', { nextAction: 'api_key: sk-live-1234567890abcdef' }],
    ['business.pain', { discovery: { business: { pain: 'password: hunter2hunter2' } } }],
    ['technical.authMethod', { discovery: { technical: { authMethod: 'Bearer abc123def456' } } }],
    ['technical.apiDocumentation', { discovery: { technical: { apiDocumentation: 'https://docs.example.com/x?token=abcdef123456' } } }],
    ['commercial.nextStep', { discovery: { commercial: { nextStep: '-----BEGIN PRIVATE KEY-----' } } }],
  ])('refuses a credential in %s and saves nothing', async (field, input) => {
    const l = await mk(`secret-${field.replace(/\W/g, '')}`, { ownerId: hunter })
    await expect(updateLeadDiscovery(l.id, hunter, input as never)).rejects.toMatchObject({ status: 400, code: 'LOOKS_LIKE_SECRET' })
    const after = await db.lead.findUniqueOrThrow({ where: { id: l.id } })
    expect(after.discovery).toBeNull()
    expect(after.nextAction).toBeNull()
    expect(await db.leadHistoryEntry.count({ where: { leadId: l.id, action: 'discovery_updated' } })).toBe(0)
  })

  it('ordinary long URLs and prose are accepted (no false positives on normal sales notes)', async () => {
    const l = await mk('prose', { ownerId: hunter })
    await updateLeadDiscovery(l.id, hunter, { discovery: { business: { website: 'https://www.linkedin.com/company/an-extremely-long-company-name-that-goes-on-and-on/about', pain: 'Replies take hours at night; two agents cover 24/7.' } } })
    expect(((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).discovery as any).business.pain).toMatch(/two agents/)
  })

  describe('follow-ups due', () => {
    it('lists open leads whose next action has arrived (or whose lock is expiring), scoped by owner, oldest first; excludes future, closed and unrelated leads', async () => {
      const past = new Date(Date.now() - 3 * 86_400_000)
      const due = await mk('fu-due', { ownerId: hunter, nextAction: 'Chase', nextActionAt: past, ownershipExpiresAt: new Date(Date.now() + 20 * 86_400_000) })
      const future = await mk('fu-future', { ownerId: hunter, nextActionAt: new Date(Date.now() + 5 * 86_400_000), ownershipExpiresAt: new Date(Date.now() + 20 * 86_400_000) })
      const closed = await mk('fu-closed', { ownerId: hunter, pipelineStage: 'CLOSED_LOST', nextActionAt: past })
      const lock = await mk('fu-lock', { ownerId: hunter, ownershipExpiresAt: new Date(Date.now() + 2 * 86_400_000) })
      const foreign = await mk('fu-foreign', { ownerId: other, nextActionAt: past })
      const mine = await followUpsDue({ ownerId: hunter, limit: 200 })
      const ids = mine.map((f) => f.leadId)
      expect(ids).toContain(due.id)
      expect(ids).toContain(lock.id)
      for (const id of [future.id, closed.id, foreign.id]) expect(ids).not.toContain(id)
      expect(mine.find((f) => f.leadId === due.id)).toMatchObject({ reason: 'next_action_due', nextAction: 'Chase', ownerId: hunter })
      expect(mine.find((f) => f.leadId === lock.id)!.reason).toBe('lock_expiring')
      const team = (await followUpsDue({ limit: 200 })).map((f) => f.leadId)
      expect(team).toContain(foreign.id) // the team view includes everyone's
    })

    it('days since contact comes from real history; a lead with no history falls back to its creation date', async () => {
      const l = await mk('contact', { ownerId: hunter })
      const map = await lastActivityByLead([l.id])
      expect(map.get(l.id)).toBeUndefined() // only `created` exists and that is not a contact: callers fall back to the creation date
      await db.leadHistoryEntry.create({ data: { leadId: l.id, actorUserId: hunter, action: 'activity_logged', metadata: { note: 'called' }, createdAt: new Date(Date.now() - 4 * 86_400_000) } })
      const last = (await lastActivityByLead([l.id])).get(l.id)!
      expect(Date.now() - last.getTime()).toBeLessThan(5 * 86_400_000)
      expect((await lastActivityByLead([])).size).toBe(0)
    })
  })
})
