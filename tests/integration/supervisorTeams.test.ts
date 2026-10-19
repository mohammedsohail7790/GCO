import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { listEscalations, getEscalation, transitionEscalation, EscalationError } from '@/lib/escalation/service'
import { qaQueue } from '@/lib/qa/reviews'
import { assertOperatorInTeam, operatorTeamFilter, supervisorTeam } from '@/lib/auth/teamScope'
import { ForbiddenError } from '@/lib/auth/tenantGuard'

describe('supervisor team scoping (real database)', () => {
  const base = `st-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async (tag: string) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}` } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string, tag: string, role: 'OPERATOR' | 'SUPERVISOR') => {
    const u = await db.user.create({ data: { email: `${base}-${tenantId.slice(-6)}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: tag } })
    userIds.push(u.id)
    return u
  }
  const mkOp = async (tenantId: string, tag: string, supervisorUserId: string | null) => {
    const u = await mkUser(tenantId, tag, 'OPERATOR')
    return { userId: u.id, id: (await db.operator.create({ data: { userId: u.id, tenantId, status: 'AVAILABLE', supervisorUserId } })).id }
  }

  afterAll(async () => {
    await db.escalationEvent.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.escalation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('a supervisor reaches only their own team, in the tenant filter, assertion and team lookup', async () => {
    const t = await mkTenant('team')
    const sup = await mkUser(t, 'sup', 'SUPERVISOR'); const otherSup = await mkUser(t, 'sup2', 'SUPERVISOR')
    const mine = await mkOp(t, 'mine', sup.id); const theirs = await mkOp(t, 'theirs', otherSup.id); const nobody = await mkOp(t, 'nobody', null)
    const session = { sub: sup.id, role: 'SUPERVISOR' as const }
    expect((await db.operator.findMany({ where: { tenantId: t, ...operatorTeamFilter(session) } })).map((o) => o.id)).toEqual([mine.id])
    await expect(assertOperatorInTeam(session, mine.id)).resolves.toBeUndefined()
    await expect(assertOperatorInTeam(session, theirs.id)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(assertOperatorInTeam(session, nobody.id)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(assertOperatorInTeam(session, null)).rejects.toBeInstanceOf(ForbiddenError)
    // managers and CEO are unaffected
    await expect(assertOperatorInTeam({ sub: 'm', role: 'MANAGER' }, theirs.id)).resolves.toBeUndefined()
    expect(operatorTeamFilter({ sub: 'm', role: 'MANAGER' })).toEqual({})
    expect((await supervisorTeam(sup.id, t)).operatorIds).toEqual([mine.id])
  })

  it('escalations: a supervisor sees and acts only on those raised by their own team, and never across tenants', async () => {
    const t = await mkTenant('esc'); const t2 = await mkTenant('esc2')
    const sup = await mkUser(t, 'sup', 'SUPERVISOR'); const otherSup = await mkUser(t, 'sup2', 'SUPERVISOR')
    const mine = await mkOp(t, 'mine', sup.id); const theirs = await mkOp(t, 'theirs', otherSup.id); const foreign = await mkOp(t2, 'foreign', null)
    const mk = async (tenantId: string, raisedBy: string, tag: string) => {
      const c = await db.conversation.create({ data: { tenantId, externalUserId: `${base}-${tag}`, state: 'ACTIVE' } })
      return (await db.escalation.create({ data: { tenantId, conversationId: c.id, reason: 'DECISION_NEEDED', summary: tag, raisedByUserId: raisedBy } })).id
    }
    const eMine = await mk(t, mine.userId, 'mine'); const eTheirs = await mk(t, theirs.userId, 'theirs'); const eForeign = await mk(t2, foreign.userId, 'foreign')
    const actor = { sub: sup.id, role: 'SUPERVISOR' as const, tenantId: t }
    expect((await listEscalations(actor, {})).map((e) => e.id)).toEqual([eMine])
    await expect(getEscalation(actor, eMine)).resolves.toBeTruthy()
    for (const id of [eTheirs, eForeign]) {
      await expect(getEscalation(actor, id)).rejects.toMatchObject({ status: 404 })
      await expect(transitionEscalation(actor, id, { action: 'claim' })).rejects.toBeInstanceOf(EscalationError)
    }
    await expect(transitionEscalation(actor, eMine, { action: 'claim' })).resolves.toBeTruthy()
    // a manager of the tenant still sees the whole tenant, unchanged
    const mgr = { sub: 'mgr', role: 'MANAGER' as const, tenantId: t }
    expect((await listEscalations(mgr, {})).map((e) => e.id).sort()).toEqual([eMine, eTheirs].sort())
  })

  it('quality-review queue can be limited to a team', async () => {
    const t = await mkTenant('qa'); const sup = await mkUser(t, 'sup', 'SUPERVISOR')
    const mine = await mkOp(t, 'mine', sup.id); const other = await mkOp(t, 'other', null)
    const c = await db.conversation.create({ data: { tenantId: t, externalUserId: `${base}-qa`, state: 'ACTIVE' } })
    for (const op of [mine, other]) await db.message.create({ data: { tenantId: t, conversationId: c.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'hi', operatorId: op.id, externalMessageId: `${base}-${op.id}` } })
    expect(await qaQueue(t)).toHaveLength(2)
    const team = await qaQueue(t, 20, (await supervisorTeam(sup.id, t)).operatorIds)
    expect(team).toHaveLength(1)
    expect(await qaQueue(t, 20, [])).toHaveLength(0) // a supervisor with no team sees nothing, not everything
  })
})
