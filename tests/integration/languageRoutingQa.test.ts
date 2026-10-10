import { describe, it, expect, vi, afterAll } from 'vitest'
vi.mock('@/lib/queue/jobs', () => ({ scheduleAssignmentTimeoutCheck: async () => undefined, cancelAssignmentTimeoutCheck: async () => undefined }))
vi.mock('@/lib/realtime/publish', () => ({ publishRealtimeEvent: async () => undefined }))

import { db } from '@/lib/db/client'
import { tryAssignConversation } from '@/lib/assignment/engine'
import { qaQueue, submitQaReview, qaSummary, QaError } from '@/lib/qa/reviews'

describe('language routing and quality review (real database)', () => {
  const base = `lq-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async (tag: string) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}` } }); tenantIds.push(t.id); return t.id }
  const mkOp = async (tenantId: string, tag: string, languages: string[], capacity = 5) => {
    const u = await db.user.create({ data: { email: `${base}-${tenantId.slice(-6)}-${tag}@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId, displayName: tag } })
    userIds.push(u.id)
    return (await db.operator.create({ data: { userId: u.id, tenantId, capacity, status: 'AVAILABLE', languages } })).id
  }
  const mkConv = (tenantId: string, tag: string, language: string | null) => db.conversation.create({ data: { tenantId, externalUserId: `${base}-${tag}`, state: 'QUEUED', language } }).then((c) => c.id)
  const owner = async (convId: string) => (await db.assignment.findFirst({ where: { conversationId: convId, status: 'ACTIVE' } }))?.operatorId ?? null

  afterAll(async () => {
    await db.qaReview.deleteMany({ where: { tenantId: { in: tenantIds } } })
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

  it('a Spanish conversation goes only to a Spanish-capable operator, even under concurrency', async () => {
    const t = await mkTenant('route')
    const en = await mkOp(t, 'en', ['en'])
    const es = await mkOp(t, 'es', ['es'])
    const any = await mkOp(t, 'any', []) // unrestricted
    const convs = await Promise.all(Array.from({ length: 6 }, (_, i) => mkConv(t, `es${i}`, 'es')))
    await Promise.all(convs.map((c) => tryAssignConversation(c)))
    for (const c of convs) expect([es, any]).toContain(await owner(c))
    expect(await db.assignment.count({ where: { operatorId: en } })).toBe(0)
  })

  it('with no covering operator the conversation waits instead of going to the wrong language, then is assigned once coverage exists', async () => {
    const t = await mkTenant('wait')
    const en = await mkOp(t, 'en', ['en'])
    const conv = await mkConv(t, 'fr', 'fr')
    expect(await tryAssignConversation(conv)).toBe(false)
    expect(await owner(conv)).toBeNull()
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv } })).state).toBe('QUEUED')
    await db.operator.update({ where: { id: en }, data: { languages: ['en', 'fr'] } })
    expect(await tryAssignConversation(conv)).toBe(true)
    expect(await owner(conv)).toBe(en)
  })

  it('conversations without a language still go to any available operator (previous behaviour)', async () => {
    const t = await mkTenant('nolang')
    const op = await mkOp(t, 'x', ['es'])
    const conv = await mkConv(t, 'none', null)
    expect(await tryAssignConversation(conv)).toBe(true)
    expect(await owner(conv)).toBe(op)
  })

  async function sentReply(tenantId: string, operatorId: string | null, tag: string, status: 'DELIVERED' | 'PENDING_REVIEW' = 'DELIVERED') {
    const conv = await mkConv(tenantId, `qa-${tag}`, 'es')
    await db.message.create({ data: { tenantId, conversationId: conv, direction: 'INBOUND', status: 'RECEIVED', content: 'Hola, ayuda con mi pedido', externalMessageId: `${base}-${tag}-in` } })
    return (await db.message.create({ data: { tenantId, conversationId: conv, direction: 'OUTBOUND', status, content: 'Claro, con gusto.', externalMessageId: `${base}-${tag}-out`, operatorId, sentAt: new Date() } })).id
  }

  it('QA: queue lists sent replies with the customer message, a review removes it, summary uses real reviews only', async () => {
    const t = await mkTenant('qa')
    const opId = await mkOp(t, 'qa-op', ['es'])
    const reviewer = (await db.user.create({ data: { email: `${base}-mgr@test.gco`, passwordHash: 'x', role: 'MANAGER', tenantId: t, displayName: 'mgr' } })).id
    userIds.push(reviewer)
    const m = await sentReply(t, opId, 'a')
    const draft = await sentReply(t, opId, 'b', 'PENDING_REVIEW')
    const q = await qaQueue(t)
    expect(q.map((i) => i.messageId)).toContain(m)
    expect(q.map((i) => i.messageId)).not.toContain(draft) // unsent replies are not reviewable
    expect(q.find((i) => i.messageId === m)).toMatchObject({ customerMessage: 'Hola, ayuda con mi pedido', language: 'es' })
    expect((await qaSummary(t)).totalReviews).toBe(0) // no invented scores

    const r = await submitQaReview({ tenantId: t, reviewerUserId: reviewer, messageId: m, accuracy: 5, tone: 4, resolution: 4, flags: [], note: 'Great tone' })
    expect(r.outcome).toBe('PASS')
    expect((await qaQueue(t)).map((i) => i.messageId)).not.toContain(m)
    const s = await qaSummary(t)
    expect(s.totalReviews).toBe(1)
    expect(s.operators[0]).toMatchObject({ reviews: 1, accuracy: 5, pass: 1 })
    await expect(submitQaReview({ tenantId: t, reviewerUserId: reviewer, messageId: m, accuracy: 3, tone: 3, resolution: 3, flags: [] })).rejects.toMatchObject({ status: 409 })
    await expect(submitQaReview({ tenantId: t, reviewerUserId: reviewer, messageId: draft, accuracy: 3, tone: 3, resolution: 3, flags: [] })).rejects.toMatchObject({ status: 409 })
    const audit = await db.auditLog.findMany({ where: { tenantId: t, action: 'qa.review_submitted' } })
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit)).not.toContain('Great tone')
    expect(JSON.stringify(audit)).not.toContain('Claro')
  })

  it('QA: a reviewer cannot review or see another tenant\'s replies', async () => {
    const a = await mkTenant('qa-a'); const b = await mkTenant('qa-b')
    const opB = await mkOp(b, 'qa-b-op', [])
    const mB = await sentReply(b, opB, 'b2')
    await expect(submitQaReview({ tenantId: a, reviewerUserId: 'x', messageId: mB, accuracy: 4, tone: 4, resolution: 4, flags: [] })).rejects.toBeInstanceOf(QaError)
    expect((await qaQueue(a)).map((i) => i.messageId)).not.toContain(mB)
  })

  // Last in the file: it replaces db.operator.findMany for one call.
  it('a language edit between the pre-check and the transaction is honoured (re-checked under the lock)', async () => {
    const t = await mkTenant('race')
    const op = await mkOp(t, 'r', ['es'])
    const conv = await mkConv(t, 'r', 'es')
    const realFind = db.operator.findMany.bind(db.operator)
    const spy = vi.spyOn(db.operator, 'findMany').mockImplementationOnce(((args: unknown) =>
      realFind(args as never).then(async (rows: unknown) => { await db.operator.update({ where: { id: op }, data: { languages: ['en'] } }); return rows })) as never)
    expect(await tryAssignConversation(conv)).toBe(false)
    spy.mockRestore()
    expect(await owner(conv)).toBeNull()
  })

})
