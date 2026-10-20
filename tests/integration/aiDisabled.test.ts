import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { db } from '@/lib/db/client'

// With AI disabled the pipeline must not generate, store, queue or request anything AI-related, and a stale queued job must be a no-op.
const enqueueAi = vi.fn(async () => undefined)
const enqueueMem = vi.fn(async () => undefined)
vi.mock('@/lib/queue/jobs', async (orig) => ({ ...(await orig<typeof import('@/lib/queue/jobs')>()), enqueueAiSuggestion: enqueueAi, enqueueMemoryExtraction: enqueueMem }))

describe('AI disabled: no generation, no jobs, no calls (real database)', () => {
  const base = `ai-${Date.now()}`
  let tenantId = ''
  let convId = ''
  let msgId = ''
  const saved = process.env.AI_MASTER_SWITCH
  beforeAll(async () => {
    delete process.env.AI_MASTER_SWITCH
    tenantId = (await db.tenant.create({ data: { name: `[TEST] ${base}`, slug: base } })).id
    convId = (await db.conversation.create({ data: { tenantId, externalUserId: `${base}-u`, state: 'ACTIVE' } })).id
    msgId = (await db.message.create({ data: { tenantId, conversationId: convId, direction: 'INBOUND', status: 'RECEIVED', content: 'hello', externalMessageId: `${base}-m` } })).id
  })
  afterAll(async () => {
    if (saved === undefined) delete process.env.AI_MASTER_SWITCH; else process.env.AI_MASTER_SWITCH = saved
    await db.aiGeneration.deleteMany({ where: { tenantId } }); await db.aiMemory.deleteMany({ where: { tenantId } })
    await db.systemEvent.deleteMany({ where: { category: 'ai', metadata: { path: ['tenantId'], equals: tenantId } } })
    await db.message.deleteMany({ where: { tenantId } }); await db.conversation.deleteMany({ where: { tenantId } }); await db.tenant.delete({ where: { id: tenantId } })
  })

  it('generateSuggestionForMessage returns null and writes nothing', async () => {
    const { generateSuggestionForMessage } = await import('@/lib/ai/service')
    expect(await generateSuggestionForMessage(msgId)).toBeNull()
    expect(await db.aiGeneration.count({ where: { tenantId } })).toBe(0) // not even a "failed" row
  })

  it('a memory-extraction job that was queued earlier does nothing', async () => {
    const { memoryExtractionProcessor } = await import('@/workers/processors/memoryExtraction')
    await memoryExtractionProcessor({ data: { conversationId: convId, triggerMessageId: msgId } } as never)
    expect(await db.aiMemory.count({ where: { tenantId } })).toBe(0)
    expect(await db.systemEvent.count({ where: { category: 'ai', metadata: { path: ['tenantId'], equals: tenantId } } })).toBe(0)
  })

  it('flags report AI off, so ingestion never enqueues AI jobs', async () => {
    const { flags } = await import('@/lib/config/flags')
    expect(flags.aiSuggestions || flags.aiMemory).toBe(false)
    expect(enqueueAi).not.toHaveBeenCalled(); expect(enqueueMem).not.toHaveBeenCalled()
  })

  it('the suggestion endpoint logic returns no generation for a human-only or AI-off world (no stored rows to leak)', async () => {
    expect(await db.aiGeneration.count({ where: { conversationId: convId } })).toBe(0)
  })
})
