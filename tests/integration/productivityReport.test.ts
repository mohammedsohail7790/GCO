import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { productivityReport } from '@/lib/reports/productivity'

describe('productivity report (real database)', () => {
  const base = `prod-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    await db.moderationItem.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.aiGeneration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('measures reply time from the latest customer message, splits by AI draft, counts tickets and moderation, scoped to the client and team', async () => {
    const mkTenant = async (tag: string) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}` } }); tenantIds.push(t.id); return t.id }
    const t = await mkTenant('a'); const other = await mkTenant('b')
    const mkOp = async (tenantId: string, tag: string) => {
      const u = await db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId, displayName: tag } }); userIds.push(u.id)
      return db.operator.create({ data: { userId: u.id, tenantId } })
    }
    const op1 = await mkOp(t, 'op1'); const op2 = await mkOp(t, 'op2'); const opOther = await mkOp(other, 'op3')
    const t0 = new Date(Date.now() - 2 * 86_400_000)
    const at = (s: number) => new Date(t0.getTime() + s * 1000)
    const exchange = async (tenantId: string, operatorId: string, replySecs: number, draft: 'accepted' | 'edited' | null, opts: { resolved?: boolean } = {}) => {
      const c = await db.conversation.create({ data: { tenantId, externalUserId: `${base}-${Math.random()}`, state: opts.resolved ? 'CLOSED' : 'ACTIVE', closedAt: opts.resolved ? at(500) : null, firstClosedAt: opts.resolved ? at(500) : null } })
      // An earlier customer message must not be used: the reply answers the LATEST one before it
      await db.message.create({ data: { tenantId, conversationId: c.id, direction: 'INBOUND', status: 'RECEIVED', content: 'first', externalMessageId: `${base}-${Math.random()}`, createdAt: at(-600) } })
      await db.message.create({ data: { tenantId, conversationId: c.id, direction: 'INBOUND', status: 'RECEIVED', content: 'q', externalMessageId: `${base}-${Math.random()}`, createdAt: at(0) } })
      const gen = draft ? await db.aiGeneration.create({ data: { tenantId, conversationId: c.id, provider: 'mock', model: 'mock', suggestedReply: 'x', status: draft, createdAt: at(1), tokenUsage: { promptTokens: 2000, completionTokens: 350 } } }) : null
      await db.message.create({ data: { tenantId, conversationId: c.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'a', operatorId, aiGenerationId: gen?.id ?? null, createdAt: at(replySecs) } })
    }
    await exchange(t, op1.id, 30, 'accepted', { resolved: true })
    await exchange(t, op1.id, 50, 'edited')
    await exchange(t, op1.id, 120, null, { resolved: true })
    await exchange(t, op2.id, 200, null)
    await exchange(other, opOther.id, 5, 'accepted', { resolved: true }) // another client: never counted
    await db.aiGeneration.create({ data: { tenantId: t, conversationId: (await db.conversation.findFirstOrThrow({ where: { tenantId: t } })).id, provider: 'mock', model: 'mock', suggestedReply: 'unused', status: 'generated', createdAt: at(2) } })
    await db.moderationItem.create({ data: { tenantId: t, kind: 'MESSAGE', externalItemId: `${base}-m1`, subjectExternalId: 's', status: 'DECIDED', decidedAt: at(10), assignedOperatorId: op2.id } })

    const from = new Date(t0.getTime() - 86_400_000); const to = new Date()
    const r = await productivityReport(t, from, to)
    expect(r.operators.map((o) => o.operatorId).sort()).toEqual([op1.id, op2.id].sort())
    const o1 = r.operators.find((o) => o.operatorId === op1.id)!
    expect(o1).toMatchObject({ replies: 3, repliesWithDraft: 2, medianReplySeconds: 50, medianReplySecondsWithDraft: 40, medianReplySecondsWithoutDraft: 120, moderatedItems: 0 })
    expect(r.operators.find((o) => o.operatorId === op2.id)).toMatchObject({ replies: 1, moderatedItems: 1, repliesPerScheduledHour: null })
    expect(r.totals).toMatchObject({ replies: 4, completedTickets: 2, moderatedItems: 1, medianReplySecondsWithDraft: 40, medianReplySecondsWithoutDraft: 160, secondsSavedPerReply: null }) // too few replies to compare
    expect(r.aiDrafts).toMatchObject({ generated: 3, usedUnchanged: 1, edited: 1, notUsed: 1, failed: 0, tokens: { prompt: 4000, completion: 700, draftsWithUsage: 2 } })
    // Cost estimate at the default gpt-4o-mini prices: (4000 x 0.15 + 700 x 0.60) / 1e6 over the two drafts that recorded token use
    expect(r.aiDrafts.estimatedCostUsd).toBeCloseTo(0.00102, 6)
    expect(r.aiDrafts.estimatedCostPerDraftUsd).toBeCloseTo(0.00051, 6)

    // A supervisor's team filter limits the operators and the replies counted
    const team = await productivityReport(t, from, to, [op2.id])
    expect(team.operators).toHaveLength(1)
    expect(team.totals.replies).toBe(1)
  })
})
