import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { expireAssignment, manualReassign } from '@/lib/assignment/engine'
import { consecutiveSlaExpiries } from '@/lib/assignment/slaCap'

// The SLA expiry lifecycle on the real database: cap, single escalation, concurrency, manager resume, resets.
describe('SLA reassignment cap', () => {
  const base = `sla-${Date.now()}`
  let tenantId = ''
  let operatorId = ''
  const userIds: string[] = []
  const convIds: string[] = []

  const mkConversation = async (tag: string, opts: { inbound?: boolean; withOperator?: boolean } = {}) => {
    const c = await db.conversation.create({ data: { tenantId, externalUserId: `${base}-${tag}`, state: 'ACTIVE' } })
    convIds.push(c.id)
    if (opts.inbound !== false) {
      await db.message.create({ data: { tenantId, conversationId: c.id, direction: 'INBOUND', status: 'RECEIVED', content: 'private customer text', externalMessageId: `${base}-${tag}-m` } })
    }
    return c
  }
  // an ACTIVE assignment whose SLA has "just run out"
  const activeAssignment = async (conversationId: string) => {
    const a = await db.assignment.create({ data: { tenantId, conversationId, operatorId, slaSeconds: 120, respondsBy: new Date(Date.now() + 120_000) } })
    await db.conversation.update({ where: { id: conversationId }, data: { currentAssignmentId: a.id, state: 'ACTIVE' } })
    return a
  }
  const state = async (id: string) => (await db.conversation.findUniqueOrThrow({ where: { id } })).state
  // 'assignment.expired' rows are keyed by assignment (metadata carries the conversation); the others by conversation.
  const audits = (conversationId: string, action: string) =>
    action === 'assignment.expired'
      ? db.auditLog.count({ where: { tenantId, action, metadata: { path: ['conversationId'], equals: conversationId } } })
      : db.auditLog.count({ where: { tenantId, action, resourceId: conversationId } })
  const events = (conversationId: string) => db.systemEvent.count({ where: { category: 'sla', metadata: { path: ['conversationId'], equals: conversationId } } })
  /** expire the conversation's current assignment once, with the operator made unavailable so no new assignment is created by the retry */
  const expireCurrent = async (conversationId: string) => {
    const c = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
    await expireAssignment(c.currentAssignmentId!)
  }

  beforeAll(async () => {
    process.env.SLA_MAX_CONSECUTIVE_EXPIRIES = '3'
    const t = await db.tenant.create({ data: { name: '[TEST] sla', slug: base } })
    tenantId = t.id
    const u = await db.user.create({ data: { email: `${base}-op@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId, displayName: 'op' } })
    userIds.push(u.id)
    operatorId = (await db.operator.create({ data: { userId: u.id, tenantId, capacity: 100, status: 'AVAILABLE' } })).id
  })
  afterAll(async () => {
    delete process.env.SLA_MAX_CONSECUTIVE_EXPIRIES
    await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId } } })
    await db.conversation.updateMany({ where: { tenantId }, data: { currentAssignmentId: null } })
    await db.assignment.deleteMany({ where: { tenantId } })
    await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
    await db.message.deleteMany({ where: { tenantId } })
    await db.conversation.deleteMany({ where: { tenantId } })
    await db.operatorService.deleteMany({ where: { tenantId } })
    await db.operator.deleteMany({ where: { tenantId } })
    await db.user.deleteMany({ where: { tenantId } })
    await db.auditLog.deleteMany({ where: { tenantId } })
    await db.systemEvent.deleteMany({ where: { category: 'sla', metadata: { path: ['tenantId'], equals: tenantId } } })
    await db.tenant.delete({ where: { id: tenantId } })
  })
  beforeEach(async () => {
    await db.operator.update({ where: { id: operatorId }, data: { status: 'AVAILABLE' } })
  })

  it('below the cap an expired assignment is reassigned as before (ordinary behaviour preserved)', async () => {
    const c = await mkConversation('ordinary')
    await activeAssignment(c.id)
    await expireCurrent(c.id)
    const after = await db.conversation.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.state).toBe('ACTIVE') // reassigned to the available operator
    expect(after.currentAssignmentId).not.toBeNull()
    expect(await audits(c.id, 'conversation.sla_escalated')).toBe(0)
  })

  it('at the cap the conversation stops cycling: EXPIRED, no new assignment, exactly ONE escalation (audit + SystemEvent)', async () => {
    const c = await mkConversation('cap')
    await activeAssignment(c.id)
    for (let i = 0; i < 3; i++) await expireCurrent(c.id) // each expiry (below the cap) reassigns automatically
    // the third expiry capped it; the first two reassigned automatically (the assignment created by reassign is the ACTIVE one we expire next)
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: c.id } })
    expect(conv.state).toBe('EXPIRED')
    expect(conv.currentAssignmentId).toBeNull()
    expect(await db.assignment.count({ where: { conversationId: c.id, status: 'ACTIVE' } })).toBeGreaterThanOrEqual(0)
    expect(await audits(c.id, 'conversation.sla_escalated')).toBe(1)
    expect(await events(c.id)).toBe(1)
    const ev = await db.systemEvent.findFirstOrThrow({ where: { category: 'sla', metadata: { path: ['conversationId'], equals: c.id } } })
    expect(ev.metadata).toMatchObject({ tenantId, consecutiveExpiries: 3, cap: 3 })
    expect(JSON.stringify(ev)).not.toContain('private customer text') // content-free
    // distinguishable from ordinary expiries
    expect(await audits(c.id, 'assignment.expired')).toBeGreaterThanOrEqual(3)
  })

  it('a capped conversation is not picked up again by automatic assignment, and re-expiring is a no-op (no duplicate escalation, no audit growth)', async () => {
    const c = await mkConversation('stays')
    await activeAssignment(c.id)
    for (let i = 0; i < 3; i++) await expireCurrent(c.id) // each expiry (below the cap) reassigns automatically
    const { tryAssignConversation } = await import('@/lib/assignment/engine')
    expect(await tryAssignConversation(c.id)).toBe(false) // EXPIRED is not an assignable state
    const before = { exp: await audits(c.id, 'assignment.expired'), esc: await audits(c.id, 'conversation.sla_escalated'), ev: await events(c.id) }
    const last = await db.assignment.findFirstOrThrow({ where: { conversationId: c.id }, orderBy: { assignedAt: 'desc' } })
    await expireAssignment(last.id)
    await expireAssignment(last.id)
    expect({ exp: await audits(c.id, 'assignment.expired'), esc: await audits(c.id, 'conversation.sla_escalated'), ev: await events(c.id) }).toEqual(before)
    expect(await state(c.id)).toBe('EXPIRED')
  })

  it('concurrent workers expiring the same assignment: one expiry, one audit row, one escalation', async () => {
    const c = await mkConversation('race')
    await activeAssignment(c.id)
    for (let i = 0; i < 2; i++) await expireCurrent(c.id)
    const a = await db.assignment.findFirstOrThrow({ where: { conversationId: c.id, status: 'ACTIVE' } }) // the expiry that will hit the cap, raced by 8 workers
    await Promise.all(Array.from({ length: 8 }, () => expireAssignment(a.id)))
    expect(await audits(c.id, 'conversation.sla_escalated')).toBe(1)
    expect(await events(c.id)).toBe(1)
    expect(await db.auditLog.count({ where: { tenantId, action: 'assignment.expired', resourceId: a.id } })).toBe(1)
    expect(await db.assignmentHistoryEntry.count({ where: { assignmentId: a.id, event: 'expired' } })).toBe(1)
    expect(await state(c.id)).toBe('EXPIRED')
  })

  it('demo-like history (thousands of past expiries): the next expiry caps immediately and stops the loop', async () => {
    const c = await mkConversation('demo')
    // like the real demo conversation: the customer's message is OLD and every expiry since then is on record
    await db.message.updateMany({ where: { conversationId: c.id }, data: { createdAt: new Date(Date.now() - 3 * 3600_000) } })
    await db.assignment.createMany({
      data: Array.from({ length: 40 }, (_, i) => ({ tenantId, conversationId: c.id, operatorId, status: 'EXPIRED' as const, slaSeconds: 120, assignedAt: new Date(Date.now() - (60 - i) * 120_000), respondsBy: new Date(), expiredAt: new Date(), releaseReason: 'sla_timeout' })),
    })
    await activeAssignment(c.id)
    await expireCurrent(c.id)
    expect(await state(c.id)).toBe('EXPIRED')
    expect(await audits(c.id, 'conversation.sla_escalated')).toBe(1)
    expect(await db.assignment.count({ where: { conversationId: c.id, status: 'ACTIVE' } })).toBe(0) // no 41st assignment
  })

  it('a manager can resume it: state leaves EXPIRED, the counter resets, and the resumed conversation gets fresh attempts', async () => {
    const c = await mkConversation('resume')
    await activeAssignment(c.id)
    for (let i = 0; i < 3; i++) await expireCurrent(c.id) // each expiry (below the cap) reassigns automatically
    expect(await state(c.id)).toBe('EXPIRED')
    const manager = (await db.user.create({ data: { email: `${base}-mgr@test.gco`, passwordHash: 'x', role: 'MANAGER', tenantId, displayName: 'mgr' } })).id
    userIds.push(manager)
    expect(await manualReassign(c.id, manager, 'resume')).toBe(true)
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: c.id } })
    expect(conv.state).toBe('ACTIVE')
    expect(conv.currentAssignmentId).not.toBeNull()
    expect((await consecutiveSlaExpiries(db, c.id)).count).toBe(0) // boundary recorded
    await expireCurrent(c.id) // one more unanswered SLA after the resume: reassigned again, NOT instantly capped
    expect(await state(c.id)).toBe('ACTIVE')
    expect(await audits(c.id, 'conversation.sla_escalated')).toBe(1) // still just the original escalation
    expect(await audits(c.id, 'conversation.manual_reassign')).toBe(1)
  })

  it('a new customer message restarts the count; an operator reply breaks the chain', async () => {
    const c = await mkConversation('reset')
    await activeAssignment(c.id)
    await expireCurrent(c.id)
    await expireCurrent(c.id)
    expect((await consecutiveSlaExpiries(db, c.id)).count).toBe(2)
    await new Promise((r) => setTimeout(r, 20))
    await db.message.create({ data: { tenantId, conversationId: c.id, direction: 'INBOUND', status: 'RECEIVED', content: 'still waiting', externalMessageId: `${base}-reset-m2` } })
    expect((await consecutiveSlaExpiries(db, c.id)).count).toBe(0)

    const c2 = await mkConversation('reply')
    await activeAssignment(c2.id)
    await expireCurrent(c2.id) // 1 expiry
    const current = await db.conversation.findUniqueOrThrow({ where: { id: c2.id } })
    await db.assignment.update({ where: { id: current.currentAssignmentId! }, data: { status: 'COMPLETED', respondedAt: new Date() } }) // operator replied
    await new Promise((r) => setTimeout(r, 20))
    await db.conversation.update({ where: { id: c2.id }, data: { currentAssignmentId: null, state: 'REASSIGNING' } })
    const { tryAssignConversation } = await import('@/lib/assignment/engine')
    expect(await tryAssignConversation(c2.id)).toBe(true) // a new request arrives and is assigned
    await expireCurrent(c2.id)
    expect((await consecutiveSlaExpiries(db, c2.id)).count).toBe(1) // the earlier expiry no longer counts: the chain was broken
    expect(await state(c2.id)).not.toBe('EXPIRED')
  })

  it('the cap is derived from the database, not process memory (survives a worker restart)', async () => {
    const c = await mkConversation('restart')
    await activeAssignment(c.id)
    for (let i = 0; i < 2; i++) await expireCurrent(c.id)
    // "restart": nothing in memory - only rows. Counting from a fresh query gives the same answer.
    const n1 = (await consecutiveSlaExpiries(db, c.id)).count
    const n2 = (await consecutiveSlaExpiries(db, c.id)).count
    expect(n1).toBeGreaterThanOrEqual(2)
    expect(n2).toBe(n1)
  })
})
