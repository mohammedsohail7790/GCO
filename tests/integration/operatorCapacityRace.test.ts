import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// Queue/realtime are stubbed: these tests are about the database-level capacity guarantee.
const schedule = vi.fn(async () => undefined)
vi.mock('@/lib/queue/jobs', () => ({
  scheduleAssignmentTimeoutCheck: (...a: unknown[]) => (schedule as (...x: unknown[]) => unknown)(...a),
  cancelAssignmentTimeoutCheck: async () => undefined,
}))
vi.mock('@/lib/realtime/publish', () => ({ publishRealtimeEvent: async () => undefined }))

import { db } from '@/lib/db/client'
import { tryAssignConversation } from '@/lib/assignment/engine'

// Regression: capacity was checked from a count read BEFORE the transaction, so concurrent assignments of different
// conversations to the same operator could all pass and exceed capacity. The count is now re-checked under a
// per-operator advisory lock inside the transaction.
describe('operator capacity under concurrent assignment', () => {
  const base = `cap-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []

  async function mkTenant(tag: string) {
    const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}` } })
    tenantIds.push(t.id)
    return t.id
  }
  async function mkOperator(tenantId: string, tag: string, capacity: number, status: 'AVAILABLE' | 'OFFLINE' = 'AVAILABLE') {
    const u = await db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId, displayName: tag } })
    userIds.push(u.id)
    return (await db.operator.create({ data: { userId: u.id, tenantId, capacity, status } })).id
  }
  async function mkQueued(tenantId: string, n: number, tag: string) {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      ids.push((await db.conversation.create({ data: { tenantId, externalUserId: `${base}-${tag}-${i}`, state: 'QUEUED' } })).id)
    }
    return ids
  }
  const activeCount = (operatorId: string) => db.assignment.count({ where: { operatorId, status: 'ACTIVE' } })
  const assignedConversations = (ids: string[]) => db.conversation.count({ where: { id: { in: ids }, currentAssignmentId: { not: null } } })

  beforeEach(() => schedule.mockClear())
  afterAll(async () => {
    await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId: { in: tenantIds } } } })
    await db.conversation.updateMany({ where: { tenantId: { in: tenantIds } }, data: { currentAssignmentId: null } })
    await db.assignment.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  for (const capacity of [1, 2]) {
    it(`capacity ${capacity}: 12 conversations assigned concurrently to ONE operator never exceed capacity (repeated)`, async () => {
      for (let round = 0; round < 5; round++) {
        const tenantId = await mkTenant(`c${capacity}r${round}`)
        const operatorId = await mkOperator(tenantId, `c${capacity}r${round}`, capacity)
        const convs = await mkQueued(tenantId, 12, `c${capacity}r${round}`)
        const results = await Promise.all(convs.map((id) => tryAssignConversation(id)))
        expect(await activeCount(operatorId)).toBe(capacity)
        expect(results.filter(Boolean)).toHaveLength(capacity)
        expect(await assignedConversations(convs)).toBe(capacity)
        // the rest are untouched and still queued
        expect(await db.conversation.count({ where: { id: { in: convs }, currentAssignmentId: null, state: 'QUEUED' } })).toBe(12 - capacity)
      }
    }, 120_000)
  }

  it('different operators in the same tenant: load is spread, each stays within its own capacity', async () => {
    const tenantId = await mkTenant('multi')
    const small = await mkOperator(tenantId, 'multi-small', 1)
    const big = await mkOperator(tenantId, 'multi-big', 2)
    const convs = await mkQueued(tenantId, 10, 'multi')
    await Promise.all(convs.map((id) => tryAssignConversation(id)))
    expect(await activeCount(small)).toBeLessThanOrEqual(1)
    expect(await activeCount(big)).toBeLessThanOrEqual(2)
    // total capacity is 3 and there is demand for more: it must be fully used (the 'full' operator falls through to the next)
    expect((await activeCount(small)) + (await activeCount(big))).toBe(3)
    expect(await assignedConversations(convs)).toBe(3)
  }, 60_000)

  it('does not assign to an operator of another tenant, and an unavailable operator is skipped', async () => {
    const tenantA = await mkTenant('isoA')
    const tenantB = await mkTenant('isoB')
    const opB = await mkOperator(tenantB, 'isoB', 5)
    await mkOperator(tenantA, 'isoA-off', 5, 'OFFLINE')
    const convs = await mkQueued(tenantA, 3, 'isoA')
    const results = await Promise.all(convs.map((id) => tryAssignConversation(id)))
    expect(results.every((r) => r === false)).toBe(true)
    expect(await activeCount(opB)).toBe(0)
    expect(await assignedConversations(convs)).toBe(0)
  })

  it('the same conversation attempted concurrently is assigned exactly once', async () => {
    const tenantId = await mkTenant('same')
    const op = await mkOperator(tenantId, 'same', 5)
    const [conv] = await mkQueued(tenantId, 1, 'same')
    const results = await Promise.all(Array.from({ length: 8 }, () => tryAssignConversation(conv!)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await activeCount(op)).toBe(1)
    expect(await db.assignment.count({ where: { conversationId: conv } })).toBe(1)
  })

  it('retries are safe: re-running assignment over everything neither duplicates nor exceeds capacity', async () => {
    const tenantId = await mkTenant('retry')
    const op = await mkOperator(tenantId, 'retry', 2)
    const convs = await mkQueued(tenantId, 6, 'retry')
    await Promise.all(convs.map((id) => tryAssignConversation(id)))
    await Promise.all([...convs, ...convs].map((id) => tryAssignConversation(id)))
    expect(await activeCount(op)).toBe(2)
    expect(await db.assignment.count({ where: { tenantId } })).toBe(2)
  })

  it('a failed transaction leaves no partial assignment and does not consume capacity; a retry succeeds', async () => {
    const tenantId = await mkTenant('txfail')
    const op = await mkOperator(tenantId, 'txfail', 1)
    const [a, b] = await mkQueued(tenantId, 2, 'txfail')
    const spy = vi.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('simulated deadlock/serialization failure'))
    await expect(tryAssignConversation(a!)).rejects.toThrow('simulated')
    spy.mockRestore()
    expect(await activeCount(op)).toBe(0)
    expect((await db.conversation.findUniqueOrThrow({ where: { id: a! } })).currentAssignmentId).toBeNull()
    expect(await tryAssignConversation(a!)).toBe(true)
    expect(await tryAssignConversation(b!)).toBe(false) // capacity 1 now used
    expect(await activeCount(op)).toBe(1)
  })

  it('a failure AFTER the commit (timeout scheduling) keeps the assignment counted - capacity is still respected', async () => {
    const tenantId = await mkTenant('postfail')
    const op = await mkOperator(tenantId, 'postfail', 1)
    const [a, b] = await mkQueued(tenantId, 2, 'postfail')
    schedule.mockRejectedValueOnce(new Error('redis down'))
    await expect(tryAssignConversation(a!)).rejects.toThrow('redis down')
    expect(await activeCount(op)).toBe(1)
    expect(await tryAssignConversation(b!)).toBe(false)
    expect(await activeCount(op)).toBe(1)
  })

  it('an operator that goes AVAILABLE -> OFFLINE between the pre-check and the transaction is not assigned', async () => {
    const tenantId = await mkTenant('offline')
    const op = await mkOperator(tenantId, 'offline', 3)
    const [conv] = await mkQueued(tenantId, 1, 'offline')
    // make the stale pre-check think the operator is available, then flip it before the transaction runs
    const realFind = db.operator.findMany.bind(db.operator)
    const spy = vi.spyOn(db.operator, 'findMany').mockImplementationOnce(((args: unknown) =>
      realFind(args as never).then(async (rows: unknown) => {
        await db.operator.update({ where: { id: op }, data: { status: 'OFFLINE' } })
        return rows
      })) as never)
    const result = await tryAssignConversation(conv!)
    spy.mockRestore()
    expect(result).toBe(false)
    expect(await activeCount(op)).toBe(0)
  })
})
