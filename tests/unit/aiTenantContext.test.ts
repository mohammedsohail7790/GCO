import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = vi.hoisted(() => ({ gen: undefined as any, conv: [] as any[], msg: [] as any[], mem: [] as any[] }))

vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/config/flags', () => ({ flags: { aiSuggestions: true } }))
vi.mock('@/lib/ai/provider', () => ({ getAiProvider: () => ({ name: 'openai', generateReply: vi.fn().mockRejectedValue(Object.assign(new Error('SECRET-CUSTOMER-TEXT'), { status: 429 })) }) }))

// Two tenants' data in one fake store; the fake honours `where` like Postgres would.
const store = {
  conversations: [
    { id: 'conv-A', tenantId: 'tenant-A', language: 'en' },
    { id: 'conv-B', tenantId: 'tenant-B', language: 'en' },
  ],
  messages: [
    { id: 'mA', tenantId: 'tenant-A', conversationId: 'conv-A', direction: 'INBOUND', content: 'A-content', createdAt: new Date(1) },
    { id: 'mB', tenantId: 'tenant-B', conversationId: 'conv-B', direction: 'INBOUND', content: 'B-content', createdAt: new Date(1) },
  ],
  memories: [
    { id: 'kA', tenantId: 'tenant-A', conversationId: 'conv-A', type: 'LOCATION', value: 'A-city', isDeleted: false, createdAt: new Date(1) },
    { id: 'kB', tenantId: 'tenant-B', conversationId: 'conv-B', type: 'LOCATION', value: 'B-city', isDeleted: false, createdAt: new Date(1) },
  ],
}
const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v)

vi.mock('@/lib/db/client', () => ({
  db: {
    conversation: {
      findFirstOrThrow: async ({ where }: any) => {
        calls.conv.push(where)
        const r = store.conversations.find((c) => match(c, where))
        if (!r) throw new Error('not found')
        return r
      },
    },
    message: {
      findMany: async ({ where }: any) => { calls.msg.push(where); return store.messages.filter((m) => match(m, where)) },
      findUniqueOrThrow: async ({ where }: any) => store.messages.find((m) => m.id === where.id)!,
    },
    aiMemory: { findMany: async ({ where }: any) => { calls.mem.push(where); return store.memories.filter((m) => match(m, where)) } },
    aiGeneration: { create: async ({ data }: any) => { calls.gen = data; return data } },
    messageEvent: { create: async () => ({}) },
  },
}))

import { buildConversationContext, generateSuggestionForMessage } from '@/lib/ai/service'

beforeEach(() => { calls.conv.length = 0; calls.msg.length = 0; calls.mem.length = 0 })

describe('AI context is tenant-scoped', () => {
  it('builds tenant A context from tenant A rows only', async () => {
    const ctx = await buildConversationContext('conv-A', 'tenant-A')
    expect(ctx.tenantId).toBe('tenant-A')
    expect(ctx.recentMessages.map((m) => m.content)).toEqual(['A-content'])
    expect(ctx.recentMessages[0]!.id).toBe('mA')
    expect(ctx.extractedFacts).toEqual([{ type: 'LOCATION', value: 'A-city' }])
  })

  it("tenant A cannot pull tenant B's conversation (cross-tenant ids are rejected)", async () => {
    await expect(buildConversationContext('conv-B', 'tenant-A')).rejects.toThrow()
    await expect(buildConversationContext('conv-A', 'tenant-B')).rejects.toThrow()
  })

  it('every query (conversation, messages, memory) carries the tenantId filter', async () => {
    await buildConversationContext('conv-A', 'tenant-A')
    for (const where of [calls.conv[0], calls.msg[0], calls.mem[0]]) expect(where).toMatchObject({ tenantId: 'tenant-A' })
  })

  it('memory queries cannot cross tenants even for the same conversation id', async () => {
    store.memories.push({ id: 'leak', tenantId: 'tenant-B', conversationId: 'conv-A', type: 'AGE', value: 'LEAK', isDeleted: false, createdAt: new Date(2) })
    const ctx = await buildConversationContext('conv-A', 'tenant-A')
    expect(ctx.extractedFacts.map((f) => f.value)).not.toContain('LEAK')
    store.memories.pop()
  })

  it('the suggestion path derives tenantId from the stored message and records a content-free failure', async () => {
    const result = await generateSuggestionForMessage('mA')
    expect(result).toBeNull() // provider failure is swallowed
    expect(calls.conv[0]).toMatchObject({ id: 'conv-A', tenantId: 'tenant-A' })
    const failedRow = calls.gen
    expect(failedRow).toMatchObject({ tenantId: 'tenant-A', status: 'failed', errorMessage: 'rate_limited (HTTP 429)' })
    expect(JSON.stringify(failedRow)).not.toContain('SECRET-CUSTOMER-TEXT')
  })
})
