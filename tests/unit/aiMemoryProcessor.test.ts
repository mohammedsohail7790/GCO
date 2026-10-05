import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ memories: [] as any[], extract: vi.fn(), events: [] as any[], buildCtx: vi.fn(), failCreateAfter: -1 }))

vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/ai/provider', () => ({ getAiProvider: () => ({ name: 'openai', extractMemory: state.extract }) }))
vi.mock('@/lib/ai/service', () => ({ buildConversationContext: state.buildCtx }))
vi.mock('@/lib/db/client', () => {
  const matches = (m: any, w: any) => Object.entries(w).every(([k, v]) => m[k] === v)
  const aiMemory = {
    findFirst: async ({ where }: any) => state.memories.find((m) => matches(m, where)) ?? null,
    create: async ({ data }: any) => {
      if (state.failCreateAfter >= 0 && state.memories.length >= state.failCreateAfter) throw new Error('db down')
      state.memories.push({ ...data, id: `mem${state.memories.length}` })
    },
  }
  const db: any = {
    conversation: { findUniqueOrThrow: async () => ({ id: 'conv-A', tenantId: 'tenant-A', externalUserId: 'ext-1' }) },
    message: { findFirst: async ({ where }: any) => (where.id === 'trig' && where.conversationId === 'conv-A' && where.tenantId === 'tenant-A' ? { id: 'trig' } : null) },
    systemEvent: { create: async ({ data }: any) => state.events.push(data) },
    aiMemory,
    $transaction: async (fn: any) => {
      // Real transaction semantics for the failure test: roll back on throw.
      const snapshot = [...state.memories]
      try {
        return await fn({ $executeRaw: async () => 1, aiMemory })
      } catch (e) {
        state.memories = snapshot
        throw e
      }
    },
  }
  return { db }
})

import { memoryExtractionProcessor } from '@/workers/processors/memoryExtraction'

const job = (over: any = {}) => ({ data: { conversationId: 'conv-A', triggerMessageId: 'trig', ...over } }) as any
const fact = (value: string, src: string, type = 'LOCATION') => ({ type, value, confidence: 0.9, source_message_id: src })

beforeEach(() => {
  state.memories = []
  state.events = []
  state.failCreateAfter = -1
  state.extract.mockReset()
  state.buildCtx.mockReset().mockResolvedValue({})
})

describe('memory extraction processor', () => {
  it('stores multiple facts with the cited source message and tenant', async () => {
    state.extract.mockResolvedValue([fact('Berlin', 'cust-1'), fact('31', 'cust-2', 'AGE')])
    await memoryExtractionProcessor(job())
    expect(state.memories.map((m) => [m.value, m.sourceMessageId, m.tenantId])).toEqual([
      ['Berlin', 'cust-1', 'tenant-A'],
      ['31', 'cust-2', 'tenant-A'],
    ])
    expect(state.buildCtx).toHaveBeenCalledWith('conv-A', 'tenant-A')
  })

  it("falls back to the trigger message only for the provider's 'unknown' source", async () => {
    state.extract.mockResolvedValue([fact('Berlin', 'unknown')])
    await memoryExtractionProcessor(job())
    expect(state.memories[0].sourceMessageId).toBe('trig')
  })

  it('is idempotent: running the same extraction twice creates no duplicates', async () => {
    state.extract.mockResolvedValue([fact('Berlin', 'cust-1'), fact('31', 'cust-2', 'AGE')])
    await memoryExtractionProcessor(job())
    await memoryExtractionProcessor(job())
    expect(state.memories).toHaveLength(2)
  })

  it('a re-extraction over an overlapping window only adds the genuinely new fact', async () => {
    state.extract.mockResolvedValueOnce([fact('Berlin', 'cust-1')])
    await memoryExtractionProcessor(job())
    state.extract.mockResolvedValueOnce([fact('Berlin', 'cust-1'), fact('31', 'cust-2', 'AGE')])
    await memoryExtractionProcessor(job())
    expect(state.memories.map((m) => m.value)).toEqual(['Berlin', '31'])
  })

  it('retry after a partial insertion failure converges without duplicates', async () => {
    state.extract.mockResolvedValue([fact('Berlin', 'cust-1'), fact('31', 'cust-2', 'AGE')])
    state.failCreateAfter = 1 // second insert fails -> whole transaction rolls back, job is retried by BullMQ
    await expect(memoryExtractionProcessor(job())).rejects.toThrow('db down')
    expect(state.memories).toHaveLength(0)
    state.failCreateAfter = -1
    await memoryExtractionProcessor(job()) // BullMQ retry
    expect(state.memories).toHaveLength(2)
  })

  it('does not resurrect a soft-deleted fact', async () => {
    state.memories.push({ id: 'old', tenantId: 'tenant-A', conversationId: 'conv-A', sourceMessageId: 'cust-1', type: 'LOCATION', value: 'Berlin', isDeleted: true })
    state.extract.mockResolvedValue([fact('Berlin', 'cust-1')])
    await memoryExtractionProcessor(job())
    expect(state.memories).toHaveLength(1)
  })

  it('skips (no provider call) when the trigger message is not in this conversation/tenant', async () => {
    await memoryExtractionProcessor(job({ triggerMessageId: 'foreign-message' }))
    expect(state.extract).not.toHaveBeenCalled()
    expect(state.memories).toHaveLength(0)
  })

  it('provider failure is swallowed, records a content-free system event, and inserts nothing', async () => {
    const err = Object.assign(new Error('boom SECRET-CUSTOMER-TEXT'), { status: 500 })
    state.extract.mockRejectedValue(err)
    await expect(memoryExtractionProcessor(job())).resolves.toBeUndefined()
    expect(state.memories).toHaveLength(0)
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ category: 'ai', severity: 'warning' })
    expect(state.events[0].metadata).toMatchObject({ tenantId: 'tenant-A', conversationId: 'conv-A', category: 'provider_error' })
    expect(JSON.stringify(state.events)).not.toContain('SECRET-CUSTOMER-TEXT')
  })
})
