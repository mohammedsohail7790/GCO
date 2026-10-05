import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/observability/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) },
}))

import { OpenAiProvider } from '@/lib/ai/providers/openai'
import { logger } from '@/lib/observability/logger'
import {
  AI_MAX_MESSAGE_CHARS,
  AI_TRUNCATION_MARKER,
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_TIMEOUT_MS_DEFAULT,
  SUGGESTION_MAX_OUTPUT_TOKENS,
} from '@/lib/ai/limits'
import type { ConversationContext } from '@/lib/ai/types'

const REPLY = JSON.stringify({
  suggested_reply: 'ok',
  language: 'en',
  confidence: 0.9,
  reasoning_summary: 'r',
  flags: [],
  requires_review: false,
})

function completion(content: string, finish = 'stop') {
  return { choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
}

function makeProvider(create: (...a: any[]) => any) {
  return new OpenAiProvider({ chat: { completions: { create } } } as any)
}

const ctx = (over: Partial<ConversationContext> = {}): ConversationContext => ({
  conversationId: 'conv-1',
  tenantId: 'tenant-1',
  recentMessages: [{ id: 'm1', direction: 'INBOUND', content: 'synthetic hello', createdAt: new Date(0) }],
  extractedFacts: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.AI_EXTRACTION_TIMEOUT_MS
})

describe('suggestion prompt + limits', () => {
  it('uses the GCO wording and no dating-app wording', async () => {
    const create = vi.fn().mockResolvedValue(completion(REPLY))
    await makeProvider(create).generateReply(ctx())
    const system = create.mock.calls[0]![0].messages[0].content as string
    expect(system).toContain('conversation copilot for a managed messaging operations platform')
    expect(system.toLowerCase()).not.toContain('dating')
  })

  it('requests the suggestion output cap and keeps the model/format', async () => {
    const create = vi.fn().mockResolvedValue(completion(REPLY))
    await makeProvider(create).generateReply(ctx())
    const params = create.mock.calls[0]![0]
    expect(params.max_completion_tokens).toBe(SUGGESTION_MAX_OUTPUT_TOKENS)
    expect(SUGGESTION_MAX_OUTPUT_TOKENS).toBe(400)
    expect(params.model).toBe('gpt-4o-mini')
    expect(params.response_format).toEqual({ type: 'json_object' })
  })

  it('truncates over-long message content for the provider and sends only the last 12 messages', async () => {
    const create = vi.fn().mockResolvedValue(completion(REPLY))
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      direction: 'INBOUND' as const,
      content: i === 29 ? 'z'.repeat(AI_MAX_MESSAGE_CHARS + 500) : `msg ${i}`,
      createdAt: new Date(i),
    }))
    await makeProvider(create).generateReply(ctx({ recentMessages: many }))
    const sent = create.mock.calls[0]![0].messages
    expect(sent).toHaveLength(13) // system + 12
    const last = sent[sent.length - 1].content as string
    expect(last.length).toBe(AI_MAX_MESSAGE_CHARS + AI_TRUNCATION_MARKER.length)
    expect(many[29]!.content.length).toBe(AI_MAX_MESSAGE_CHARS + 500) // source untouched
  })

  it('treats finish_reason=length as a (logged) failure instead of parsing partial JSON', async () => {
    const create = vi.fn().mockResolvedValue(completion('{"suggested_reply":"cut off', 'length'))
    await expect(makeProvider(create).generateReply(ctx())).rejects.toThrow(/truncated/)
    expect((logger.warn as any).mock.calls[0][0].category).toBe('truncated')
  })
})

describe('extraction request', () => {
  it('requests the extraction output cap and uses the default 18s deadline', async () => {
    const create = vi.fn().mockResolvedValue(completion('{"facts":[]}'))
    await makeProvider(create).extractMemory(ctx())
    expect(create.mock.calls[0]![0].max_completion_tokens).toBe(EXTRACTION_MAX_OUTPUT_TOKENS)
    expect(EXTRACTION_MAX_OUTPUT_TOKENS).toBe(600)
    expect(create.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
    expect(EXTRACTION_TIMEOUT_MS_DEFAULT).toBeGreaterThanOrEqual(15000)
    expect(EXTRACTION_TIMEOUT_MS_DEFAULT).toBeLessThanOrEqual(20000)
  })

  it('aborts a hung extraction at the deadline and logs a content-free timeout', async () => {
    process.env.AI_EXTRACTION_TIMEOUT_MS = '40'
    const create = vi.fn((_p: any, opts: { signal: AbortSignal }) =>
      new Promise((_res, rej) => {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('Request was aborted.')
          e.name = 'APIUserAbortError'
          rej(e)
        })
      }),
    )
    const started = Date.now()
    await expect(makeProvider(create).extractMemory(ctx())).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2000)
    const logged = (logger.warn as any).mock.calls[0][0]
    expect(logged).toMatchObject({ operation: 'extract', category: 'timeout', tenantId: 'tenant-1', conversationId: 'conv-1', provider: 'openai' })
  })

  it('suggestion deadline is independent of the extraction deadline', async () => {
    process.env.AI_EXTRACTION_TIMEOUT_MS = '5'
    const create = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30)) // slower than the extraction deadline
      return completion(REPLY)
    })
    await expect(makeProvider(create).generateReply(ctx())).resolves.toMatchObject({ provider: 'openai' })
  })
})

describe('extraction: customer vs operator and source attribution', () => {
  const convo = ctx({
    recentMessages: [
      { id: 'cust-1', direction: 'INBOUND', content: 'I live in Berlin', createdAt: new Date(1) },
      { id: 'op-1', direction: 'OUTBOUND', content: 'I am a nurse by the way', createdAt: new Date(2) },
      { id: 'cust-2', direction: 'INBOUND', content: 'I am 31', createdAt: new Date(3) },
    ],
  })

  it('labels speakers, supplies real ids, and tells the model to ignore OPERATOR lines', async () => {
    const create = vi.fn().mockResolvedValue(completion('{"facts":[]}'))
    await makeProvider(create).extractMemory(convo)
    const [system, user] = create.mock.calls[0]![0].messages
    expect(system.content).toMatch(/OPERATOR lines are context only/)
    expect(user.content).toContain('[CUSTOMER id=cust-1] I live in Berlin')
    expect(user.content).toContain('[OPERATOR id=op-1] I am a nurse by the way')
    expect(user.content).toContain('[CUSTOMER id=cust-2] I am 31')
  })

  it('keeps facts citing a customer message, drops operator-sourced / unknown / invented ids', async () => {
    const facts = [
      { type: 'LOCATION', value: 'Berlin', confidence: 0.9, source_message_id: 'cust-1' },
      { type: 'OCCUPATION', value: 'nurse', confidence: 0.9, source_message_id: 'op-1' },
      { type: 'AGE', value: '31', confidence: 0.9, source_message_id: 'cust-2' },
      { type: 'INTEREST', value: 'x', confidence: 0.5, source_message_id: 'unknown' },
      { type: 'INTEREST', value: 'y', confidence: 0.5, source_message_id: 'made-up-id' },
    ]
    const create = vi.fn().mockResolvedValue(completion(JSON.stringify({ facts })))
    const out = await makeProvider(create).extractMemory(convo)
    expect(out.map((f) => f.source_message_id)).toEqual(['cust-1', 'cust-2'])
  })

  it('when no ids were supplied (legacy callers) returns facts unfiltered', async () => {
    const facts = [{ type: 'LOCATION', value: 'Berlin', confidence: 0.9, source_message_id: 'unknown' }]
    const create = vi.fn().mockResolvedValue(completion(JSON.stringify({ facts })))
    const noIds = ctx({ recentMessages: [{ direction: 'INBOUND', content: 'I live in Berlin', createdAt: new Date(0) }] })
    expect(await makeProvider(create).extractMemory(noIds)).toHaveLength(1)
  })

  it('sends only the last 20 messages', async () => {
    const create = vi.fn().mockResolvedValue(completion('{"facts":[]}'))
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, direction: 'INBOUND' as const, content: `c${i}`, createdAt: new Date(i) }))
    await makeProvider(create).extractMemory(ctx({ recentMessages: many }))
    const lines = (create.mock.calls[0]![0].messages[1].content as string).split('\n')
    expect(lines).toHaveLength(20)
    expect(lines[0]).toContain('id=m20')
  })
})

describe('observability: failures are content-free', () => {
  it('logs category/ids/latency for a 429 and never the prompt, message text or error message', async () => {
    const err = Object.assign(new Error('429 You exceeded your quota; echo: SECRET-CUSTOMER-TEXT'), { status: 429, request_id: 'req_123' })
    const create = vi.fn().mockRejectedValue(err)
    await expect(makeProvider(create).generateReply(ctx({ recentMessages: [{ id: 'm', direction: 'INBOUND', content: 'SECRET-CUSTOMER-TEXT', createdAt: new Date(0) }] }))).rejects.toBe(err)
    const logged = (logger.warn as any).mock.calls[0][0]
    expect(logged).toMatchObject({ operation: 'suggest', category: 'rate_limited', httpStatus: 429, requestId: 'req_123', model: 'gpt-4o-mini' })
    expect(typeof logged.latencyMs).toBe('number')
    const everything = JSON.stringify((logger.warn as any).mock.calls) + JSON.stringify((logger.info as any).mock.calls)
    expect(everything).not.toContain('SECRET-CUSTOMER-TEXT')
  })

  it('logs usage (tokens, model, ids) on success with no content', async () => {
    const create = vi.fn().mockResolvedValue({ ...completion(REPLY), _request_id: 'req_ok' })
    await makeProvider(create).generateReply(ctx())
    const logged = (logger.info as any).mock.calls[0][0]
    expect(logged).toMatchObject({ operation: 'suggest', promptTokens: 10, completionTokens: 5, requestId: 'req_ok', tenantId: 'tenant-1' })
    expect(JSON.stringify(logged)).not.toContain('synthetic hello')
  })
})
