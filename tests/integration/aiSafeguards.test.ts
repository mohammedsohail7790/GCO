import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { getAppRedisConnection } from '@/lib/queue/connection'

// AI safeguards with the mock provider (AI_MASTER_SWITCH=enabled, AI_PROVIDER=mock; no external call): masking per client, the
// client's standing instructions in the context, and the per-client daily call cap on both the draft and the memory paths.
describe('AI safeguards (real database and Redis, mock provider)', () => {
  const base = `aisg-${Date.now()}`
  const tenantIds: string[] = []
  const mk = async (tag: string, extra: object = {}) => {
    const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}`, aiMode: 'AI_ASSISTED', ...extra } })
    tenantIds.push(t.id)
    const c = await db.conversation.create({ data: { tenantId: t.id, externalUserId: `${base}-${tag}`, state: 'ACTIVE', language: 'it' } })
    const m = await db.message.create({ data: { tenantId: t.id, conversationId: c.id, direction: 'INBOUND', status: 'RECEIVED', content: 'Ciao, sono anna@example.com, tel. +39 347 123 4567, ordine 98765432', externalMessageId: `${base}-${tag}` } })
    return { tenantId: t.id, convId: c.id, msgId: m.id }
  }
  const saved = { sw: process.env.AI_MASTER_SWITCH, prov: process.env.AI_PROVIDER }
  beforeAll(() => { process.env.AI_MASTER_SWITCH = 'enabled'; process.env.AI_PROVIDER = 'mock' })
  afterAll(async () => {
    process.env.AI_MASTER_SWITCH = saved.sw; process.env.AI_PROVIDER = saved.prov
    for (const t of tenantIds) await db.systemEvent.deleteMany({ where: { category: 'ai', metadata: { path: ['tenantId'], equals: t } } })
    await db.knowledgeEntry.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.messageEvent.deleteMany({ where: { message: { tenantId: { in: tenantIds } } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.aiGeneration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.aiMemory.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('masks personal data when the client has masking on (the default), and not when it is off', async () => {
    const { buildConversationContext } = await import('@/lib/ai/service')
    const on = await mk('mask-on')
    const ctx = await buildConversationContext(on.convId, on.tenantId)
    expect(ctx.recentMessages[0]!.content).toMatch(/^Ciao, sono \[email\], tel\. \[phone\], ordine \[(phone|number)\]$/) // an 8+ digit number may be labelled either way; it is masked
    expect(JSON.stringify(ctx)).not.toMatch(/anna@example\.com|347 123 4567|98765432/)
    const off = await mk('mask-off', { aiMaskPersonalData: false })
    expect((await buildConversationContext(off.convId, off.tenantId)).recentMessages[0]!.content).toContain('anna@example.com')
  })

  it("includes the client's own standing instructions for the conversation's language only", async () => {
    const { buildConversationContext, INSTRUCTIONS_MAX_CHARS } = await import('@/lib/ai/service')
    const a = await mk('kb'); const other = await mk('kb-other')
    const entry = (tenantId: string, o: { kind?: 'INSTRUCTION' | 'ARTICLE' | 'QUICK_REPLY'; title: string; language?: string | null; archived?: boolean }) =>
      db.knowledgeEntry.create({ data: { tenantId, kind: o.kind ?? 'INSTRUCTION', title: o.title, body: `body of ${o.title}`, language: o.language ?? null, archivedAt: o.archived ? new Date() : null, createdByUserId: 'u' } })
    await entry(a.tenantId, { title: 'Tone' }) // any language
    await entry(a.tenantId, { title: 'Refunds IT', language: 'it' })
    await entry(a.tenantId, { title: 'Refunds DE', language: 'de' }) // another language
    await entry(a.tenantId, { title: 'Old rule', archived: true })
    await entry(a.tenantId, { kind: 'ARTICLE', title: 'Article' }) // articles are not instructions
    await entry(other.tenantId, { title: 'Other client secret' })
    const ctx = await buildConversationContext(a.convId, a.tenantId)
    expect(ctx.clientInstructions).toContain('Tone: body of Tone')
    expect(ctx.clientInstructions).toContain('Refunds IT')
    expect(ctx.clientInstructions).not.toMatch(/Refunds DE|Old rule|Article|Other client secret/)
    // Bounded, so instructions cannot crowd out the conversation
    await db.knowledgeEntry.create({ data: { tenantId: a.tenantId, kind: 'INSTRUCTION', title: 'Long', body: 'x'.repeat(10_000), createdByUserId: 'u' } })
    expect((await buildConversationContext(a.convId, a.tenantId)).clientInstructions!.length).toBeLessThanOrEqual(INSTRUCTIONS_MAX_CHARS)
    // A client without instructions sends none
    expect((await buildConversationContext(other.convId, other.tenantId)).clientInstructions).toContain('Other client secret')
    const none = await mk('kb-none')
    expect((await buildConversationContext(none.convId, none.tenantId)).clientInstructions).toBeNull()
  })

  it('the daily cap counts per client per UTC day and records one alert when first exceeded', async () => {
    const { takeAiCall } = await import('@/lib/ai/budget')
    const { tenantId } = await mk('cap')
    const at = new Date('2026-11-09T10:00:00Z')
    const results = [] as boolean[]
    for (let i = 0; i < 5; i++) results.push(await takeAiCall(tenantId, 3, at))
    expect(results).toEqual([true, true, true, false, false])
    expect(await db.systemEvent.count({ where: { category: 'ai', metadata: { path: ['tenantId'], equals: tenantId } } })).toBe(1)
    expect(await takeAiCall(tenantId, 3, new Date('2026-11-10T00:00:01Z'))).toBe(true) // a new UTC day starts again
    const other = await mk('cap-other')
    expect(await takeAiCall(other.tenantId, 3, at)).toBe(true) // another client has its own count
    await getAppRedisConnection().del(`gco:ai-calls:${tenantId}:${Math.floor(at.getTime() / 86_400_000)}`)
  })

  it('a client at its limit gets no draft and no memory extraction; under it, drafts work', async () => {
    const { generateSuggestionForMessage } = await import('@/lib/ai/service')
    const { memoryExtractionProcessor } = await import('@/workers/processors/memoryExtraction')
    const blocked = await mk('zero', { aiDailyCallLimit: 0 })
    expect(await generateSuggestionForMessage(blocked.msgId)).toBeNull()
    await memoryExtractionProcessor({ data: { conversationId: blocked.convId, triggerMessageId: blocked.msgId } } as never)
    expect(await db.aiGeneration.count({ where: { tenantId: blocked.tenantId } })).toBe(0)
    expect(await db.aiMemory.count({ where: { tenantId: blocked.tenantId } })).toBe(0)
    const open = await mk('open')
    const gen = await generateSuggestionForMessage(open.msgId)
    expect(gen?.status).toBe('generated')
  })
})
