import OpenAI from 'openai'
import type { AiProvider, ConversationContext, AiGenerationResult, ExtractedFact } from '../types'
import { SuggestedReplySchema, ExtractedFactSchema } from '../types'
import {
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_TIMEOUT_MS_DEFAULT,
  SUGGESTION_MAX_OUTPUT_TOKENS,
  parseTimeoutMs,
  truncateForAi,
} from '../limits'
import { AiOutputTruncatedError, logAiFailure, logAiUsage, type AiOperation } from '../observability'
import { z } from 'zod'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

// Real provider. Only reachable when AI_PROVIDER=openai and OPENAI_API_KEY is set
// (see lib/ai/provider.ts). Sends only the trimmed context passed in - never the
// entire database - and validates model output against the structured schema
// before it is trusted anywhere downstream.
export class OpenAiProvider implements AiProvider {
  name = 'openai'
  private client: OpenAI
  private model: string
  private timeoutMs: number
  private extractionTimeoutMs: number

  // `client` is injectable for tests only; production always builds the real one.
  constructor(client?: OpenAI) {
    if (client) {
      this.client = client
    } else {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai')
      this.client = new OpenAI({ apiKey })
    }
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    this.timeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '8000', 10)
    this.extractionTimeoutMs = parseTimeoutMs(process.env.AI_EXTRACTION_TIMEOUT_MS, EXTRACTION_TIMEOUT_MS_DEFAULT)
  }

  private buildSystemPrompt(context: ConversationContext): string {
    return [
      'You are a conversation copilot for a managed messaging operations platform.',
      'You draft a suggested reply for a HUMAN OPERATOR to review and edit - you never send anything yourself.',
      context.clientInstructions ? `Client instructions: ${context.clientInstructions}` : '',
      context.operatorInstructions ? `Operator/service instructions: ${context.operatorInstructions}` : '',
      'Respond ONLY with strict JSON matching this shape: {"suggested_reply": string, "language": string, "confidence": number 0-1, "reasoning_summary": string (max ~2 sentences, no chain-of-thought), "flags": string[], "requires_review": boolean}.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  /**
   * One bounded JSON-mode completion. The deadline (AbortController) covers the
   * whole call including any SDK-level retries. Failures are logged content-free
   * and re-thrown unchanged for the caller's existing error handling.
   */
  private async run<T>(
    operation: AiOperation,
    context: ConversationContext,
    o: {
      messages: ChatMessage[]
      temperature: number
      maxTokens: number
      timeoutMs: number
      emptyDefault: string
      parse: (raw: string) => T
    },
  ): Promise<{ value: T; latencyMs: number; promptTokens?: number; completionTokens?: number }> {
    const start = Date.now()
    const ids = {
      provider: this.name,
      model: this.model,
      operation,
      tenantId: context.tenantId,
      conversationId: context.conversationId,
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), o.timeoutMs)
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: o.messages,
          response_format: { type: 'json_object' },
          temperature: o.temperature,
          max_completion_tokens: o.maxTokens,
        },
        { signal: controller.signal },
      )
      const choice = completion.choices[0]
      if (choice?.finish_reason === 'length') throw new AiOutputTruncatedError()

      const value = o.parse(choice?.message?.content ?? o.emptyDefault)
      const latencyMs = Date.now() - start
      const promptTokens = completion.usage?.prompt_tokens
      const completionTokens = completion.usage?.completion_tokens
      logAiUsage({
        ...ids,
        latencyMs,
        promptTokens,
        completionTokens,
        requestId: (completion as { _request_id?: string | null })._request_id ?? undefined,
      })
      return { value, latencyMs, promptTokens, completionTokens }
    } catch (err) {
      logAiFailure({ ...ids, latencyMs: Date.now() - start, err })
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  async generateReply(context: ConversationContext): Promise<AiGenerationResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(context) },
      ...context.recentMessages.slice(-12).map((m) => ({
        role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: truncateForAi(m.content),
      })),
    ]

    const r = await this.run('suggest', context, {
      messages,
      temperature: 0.4,
      maxTokens: SUGGESTION_MAX_OUTPUT_TOKENS,
      timeoutMs: this.timeoutMs,
      emptyDefault: '{}',
      parse: (raw) => SuggestedReplySchema.parse(JSON.parse(raw)),
    })

    return {
      reply: r.value,
      provider: this.name,
      model: this.model,
      latencyMs: r.latencyMs,
      tokenUsage:
        r.promptTokens !== undefined && r.completionTokens !== undefined
          ? { promptTokens: r.promptTokens, completionTokens: r.completionTokens }
          : undefined,
    }
  }

  async extractMemory(context: ConversationContext): Promise<ExtractedFact[]> {
    const recent = context.recentMessages.slice(-20)
    // Only messages that carry a real id (and were written by the customer) are
    // valid fact sources. Ids are supplied to the model verbatim - never invented.
    const customerIds = new Set(
      recent.filter((m) => m.direction === 'INBOUND' && m.id).map((m) => m.id as string),
    )
    const idsSupplied = recent.some((m) => m.id)

    const transcript = recent
      .map((m) => {
        const who = m.direction === 'INBOUND' ? 'CUSTOMER' : 'OPERATOR'
        return `[${who}${m.id ? ` id=${m.id}` : ''}] ${truncateForAi(m.content)}`
      })
      .join('\n')

    const prompt = [
      'You extract facts about the CUSTOMER from a conversation transcript.',
      'Each transcript line starts with [CUSTOMER id=...] (written by the customer) or [OPERATOR id=...] (written by our operator).',
      'Extract only facts EXPLICITLY stated by the customer in CUSTOMER lines. OPERATOR lines are context only - never extract facts from them. Never infer or invent.',
      'Set source_message_id to the exact id of the CUSTOMER line that states the fact. Never make up an id.',
      'Return strict JSON: {"facts": [{"type": one of LOCATION|AGE|OCCUPATION|INTEREST|PREFERENCE|FACT|COMMITMENT|STATUS|OTHER, "value": string, "confidence": number 0-1, "source_message_id": string}]}',
      'If nothing is explicitly stated, return {"facts": []}.',
    ].join('\n')

    const r = await this.run('extract', context, {
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: transcript },
      ],
      temperature: 0,
      maxTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
      timeoutMs: this.extractionTimeoutMs,
      emptyDefault: '{"facts":[]}',
      parse: (raw) => z.object({ facts: z.array(ExtractedFactSchema) }).parse(JSON.parse(raw)).facts,
    })

    // Deterministic guard on top of the prompt: when ids were supplied, a fact
    // must cite a real CUSTOMER message id. Anything citing an operator message,
    // an unknown id, or no id is dropped rather than misattributed.
    return idsSupplied ? r.value.filter((f) => customerIds.has(f.source_message_id)) : r.value
  }

  async summarizeConversation(context: ConversationContext): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'Summarize this conversation in 2-3 sentences, factually, no speculation.' },
        ...context.recentMessages.map((m) => ({
          role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: truncateForAi(m.content),
        })),
      ],
      temperature: 0.2,
    })
    return completion.choices[0]?.message?.content ?? ''
  }

  async classifyMessage(content: string): Promise<{ label: string; confidence: number }> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Classify the message. Return strict JSON {"label": string, "confidence": number 0-1}.',
        },
        { role: 'user', content: truncateForAi(content) },
      ],
      temperature: 0,
    })
    const raw = completion.choices[0]?.message?.content ?? '{"label":"unknown","confidence":0}'
    return z.object({ label: z.string(), confidence: z.number() }).parse(JSON.parse(raw))
  }
}
