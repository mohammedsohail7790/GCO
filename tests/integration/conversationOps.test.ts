import { describe, it, expect, vi, afterAll } from 'vitest'
vi.mock('@/lib/queue/jobs', () => ({ scheduleAssignmentTimeoutCheck: async () => undefined, cancelAssignmentTimeoutCheck: async () => undefined }))
vi.mock('@/lib/realtime/publish', () => ({ publishRealtimeEvent: async () => undefined }))

import { db } from '@/lib/db/client'
import { tryAssignConversation } from '@/lib/assignment/engine'
import { resolveConversation, reopenConversation, addConversationNote, LifecycleError } from '@/lib/conversations/lifecycle'
import { searchConversations, conversationTranscript } from '@/lib/conversations/search'
import { computeAlerts } from '@/lib/ops/alerts'
import { clientReport } from '@/lib/reports/client'

describe('conversation lifecycle, search, alerts and client report (real database)', () => {
  const base = `ops-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async (tag: string, extra: object = {}) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}`, ...extra } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string | null, role: 'OPERATOR' | 'MANAGER' | 'CEO_ADMIN', tag: string) => {
    const u = await db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: tag } }); userIds.push(u.id); return u
  }
  const mkOp = async (tenantId: string, tag: string, languages: string[] = [], status: 'AVAILABLE' | 'OFFLINE' = 'AVAILABLE') => {
    const u = await mkUser(tenantId, 'OPERATOR', tag)
    const op = await db.operator.create({ data: { userId: u.id, tenantId, capacity: 5, status, languages } })
    return { user: u, op }
  }
  const mkConv = async (tenantId: string, tag: string, o: { state?: 'QUEUED' | 'CLOSED' | 'ACTIVE'; language?: string | null } = {}) =>
    (await db.conversation.create({ data: { tenantId, externalUserId: `${base}-${tag}`, state: o.state ?? 'QUEUED', language: o.language ?? null } })).id
  const asActor = (u: { id: string; role: any; tenantId: string | null }) => ({ userId: u.id, role: u.role, tenantId: u.tenantId })

  afterAll(async () => {
    await db.qaReview.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.escalationEvent.deleteMany({ where: { escalation: { tenantId: { in: tenantIds } } } })
    await db.escalation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.note.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId: { in: tenantIds } } } })
    await db.conversation.updateMany({ where: { tenantId: { in: tenantIds } }, data: { currentAssignmentId: null } })
    await db.assignment.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('an operator resolves their own conversation: it closes, the assignment completes, capacity frees; others cannot', async () => {
    const t = await mkTenant('res')
    const a = await mkOp(t, 'a'); const b = await mkOp(t, 'b')
    const conv = await mkConv(t, 'c1')
    await db.operator.update({ where: { id: b.op.id }, data: { status: 'OFFLINE' } })
    expect(await tryAssignConversation(conv)).toBe(true)
    // another operator in the same tenant cannot see it (404, not 403)
    await expect(resolveConversation(conv, asActor(b.user))).rejects.toMatchObject({ status: 404 })
    const r = await resolveConversation(conv, asActor(a.user))
    expect(r.state).toBe('CLOSED')
    const after = await db.conversation.findUniqueOrThrow({ where: { id: conv }, include: { assignments: true } })
    expect(after.state).toBe('CLOSED'); expect(after.closedAt).not.toBeNull(); expect(after.currentAssignmentId).toBeNull()
    expect(after.assignments[0]!.status).toBe('COMPLETED')
    expect(await db.assignment.count({ where: { operatorId: a.op.id, status: 'ACTIVE' } })).toBe(0)
    await expect(resolveConversation(conv, asActor(a.user))).rejects.toMatchObject({ status: 409 }) // already resolved
    const audit = await db.auditLog.findMany({ where: { tenantId: t, action: 'conversation.resolved' } })
    expect(audit).toHaveLength(1)
  })

  it('cannot resolve while an escalation is open; tenant isolation; reopen returns it to the queue and assigns it', async () => {
    const t = await mkTenant('esc'); const other = await mkTenant('esc-other')
    const a = await mkOp(t, 'ea'); const mgr = await mkUser(t, 'MANAGER', 'emgr'); const otherMgr = await mkUser(other, 'MANAGER', 'omgr')
    const conv = await mkConv(t, 'c2')
    await tryAssignConversation(conv)
    await db.escalation.create({ data: { tenantId: t, conversationId: conv, reason: 'DECISION_NEEDED', summary: 'x', raisedByUserId: a.user.id } })
    await expect(resolveConversation(conv, asActor(mgr))).rejects.toMatchObject({ status: 409 })
    await db.escalation.updateMany({ where: { conversationId: conv }, data: { status: 'RESOLVED' } })
    await expect(resolveConversation(conv, asActor(otherMgr))).rejects.toMatchObject({ status: 404 })
    await resolveConversation(conv, asActor(mgr))
    await expect(reopenConversation(conv, asActor(otherMgr))).rejects.toMatchObject({ status: 404 })
    const reopened = await reopenConversation(conv, asActor(mgr))
    expect(['ACTIVE', 'QUEUED']).toContain(reopened.state)
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv } })).closedAt).toBeNull()
    await expect(reopenConversation(conv, asActor(mgr))).rejects.toMatchObject({ status: 409 }) // not closed any more
  })

  it('notes: operators may only note their own conversations; validation; audit has ids only', async () => {
    const t = await mkTenant('note')
    const a = await mkOp(t, 'na'); const b = await mkOp(t, 'nb', [], 'OFFLINE')
    const conv = await mkConv(t, 'c3'); await tryAssignConversation(conv)
    await expect(addConversationNote(conv, asActor(b.user), 'hello')).rejects.toMatchObject({ status: 404 })
    await expect(addConversationNote(conv, asActor(a.user), '   ')).rejects.toBeInstanceOf(LifecycleError)
    await expect(addConversationNote(conv, asActor(a.user), 'x'.repeat(2001))).rejects.toMatchObject({ status: 400 })
    await addConversationNote(conv, asActor(a.user), 'Customer prefers email follow-up')
    expect(await db.note.count({ where: { conversationId: conv } })).toBe(1)
    const audit = await db.auditLog.findMany({ where: { tenantId: t, action: 'conversation.note_added' } })
    expect(JSON.stringify(audit)).not.toContain('email follow-up')
  })

  it('search: matches customer and message text, filters by state/language, is tenant-scoped; transcript is tenant-scoped', async () => {
    const t = await mkTenant('srch'); const other = await mkTenant('srch-other')
    const c1 = await mkConv(t, 'alice', { language: 'es' }); const c2 = await mkConv(t, 'bob', { state: 'CLOSED', language: 'en' })
    const cx = await mkConv(other, 'alice-other', { language: 'es' })
    await db.message.create({ data: { tenantId: t, conversationId: c1, direction: 'INBOUND', status: 'RECEIVED', content: 'Where is my parcel 98765?' } })
    await db.message.create({ data: { tenantId: other, conversationId: cx, direction: 'INBOUND', status: 'RECEIVED', content: 'parcel 98765 other tenant' } })
    const byText = await searchConversations({ tenantId: t, q: 'parcel 98765', page: 1, pageSize: 20 })
    expect(byText.items.map((i) => i.id)).toEqual([c1]) // other tenant's match is not returned
    expect((await searchConversations({ tenantId: t, q: 'ALICE', page: 1, pageSize: 20 })).total).toBe(1)
    expect((await searchConversations({ tenantId: t, state: 'CLOSED', page: 1, pageSize: 20 })).items.map((i) => i.id)).toEqual([c2])
    expect((await searchConversations({ tenantId: t, language: 'ES', page: 1, pageSize: 20 })).items.map((i) => i.id)).toEqual([c1])
    expect((await searchConversations({ tenantId: t, q: "%' OR 1=1 --", page: 1, pageSize: 20 })).total).toBe(0) // not an injection vector
    expect(await conversationTranscript(t, c1)).toMatchObject({ customer: `${base}-alice` })
    expect(await conversationTranscript(t, cx)).toBeNull()
  })

  it('alerts: language gap, no operators, overdue responses, unclaimed escalations; downgraded outside operating hours', async () => {
    const t = await mkTenant('alert')
    await mkOp(t, 'en-only', ['en'])
    await mkConv(t, 'fr1', { language: 'fr' })
    const gap = await computeAlerts(t)
    expect(gap.find((a) => a.id === 'language-fr')).toMatchObject({ severity: 'critical', count: 1 })
    const t2 = await mkTenant('alert2'); await mkConv(t2, 'q1')
    expect((await computeAlerts(t2)).find((a) => a.id === 'no-operators')?.severity).toBe('critical')
    // closed for the whole week -> info, not critical
    await db.tenant.update({ where: { id: t2 }, data: { operatingHours: { mon: { open: '09:00', close: '09:01' } } } })
    expect((await computeAlerts(t2, new Date('2026-10-17T12:00:00Z'))).find((a) => a.id === 'no-operators')?.severity).toBe('info')
    // overdue response + stale escalation
    const t3 = await mkTenant('alert3'); const o = await mkOp(t3, 'o3'); const c = await mkConv(t3, 'late', { state: 'ACTIVE' })
    await db.assignment.create({ data: { tenantId: t3, conversationId: c, operatorId: o.op.id, slaSeconds: 60, respondsBy: new Date(Date.now() - 30_000) } })
    await db.escalation.create({ data: { tenantId: t3, conversationId: c, reason: 'DECISION_NEEDED', summary: 's', raisedByUserId: o.user.id, createdAt: new Date(Date.now() - 20 * 60_000) } })
    const ids = (await computeAlerts(t3)).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['sla-overdue', 'escalation-unclaimed']))
    expect((await computeAlerts(await mkTenant('quiet'))).length).toBe(0)
  })

  it('client report: counts only the tenant, no internal data, computed from real rows', async () => {
    const t = await mkTenant('rep'); const other = await mkTenant('rep-other')
    const o = await mkOp(t, 'ro'); const c = await mkConv(t, 'r1', { state: 'CLOSED', language: 'es' }); await mkConv(other, 'r-other')
    await db.conversation.update({ where: { id: c }, data: { closedAt: new Date() } })
    await db.message.create({ data: { tenantId: t, conversationId: c, direction: 'INBOUND', status: 'RECEIVED', content: 'hola' } })
    await db.message.create({ data: { tenantId: t, conversationId: c, direction: 'OUTBOUND', status: 'DELIVERED', content: 'claro', operatorId: o.op.id } })
    const assignedAt = new Date(Date.now() - 40_000)
    await db.assignment.create({ data: { tenantId: t, conversationId: c, operatorId: o.op.id, status: 'COMPLETED', slaSeconds: 120, assignedAt, respondsBy: new Date(assignedAt.getTime() + 120_000), respondedAt: new Date(assignedAt.getTime() + 30_000) } })
    await db.qaReview.create({ data: { tenantId: t, conversationId: c, messageId: 'm1', reviewerUserId: 'u', accuracy: 4, tone: 5, resolution: 3, outcome: 'COACHING', note: 'secret coaching note', flags: ['tone'] } })
    const r = await clientReport(t, 7)
    expect(r.totals).toMatchObject({ conversationsStarted: 1, conversationsResolved: 1, messagesReceived: 1, repliesSent: 1 })
    expect(r.responseTime.averageSeconds).toBe(30)
    expect(r.slaCompliance).toMatchObject({ percent: 100, answered: 1 })
    expect(r.quality).toMatchObject({ reviews: 1, accuracy: 4, tone: 5, resolution: 3 })
    expect(r.languages).toEqual([{ language: 'es', conversations: 1 }])
    expect(r.conversationsPerDay).toHaveLength(7)
    const json = JSON.stringify(r)
    expect(json).not.toContain('secret coaching note'); expect(json).not.toContain(base) // no operator/customer identifiers
  })
})
