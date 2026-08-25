import OpenAI from 'openai'
import type { AiProvider, ConversationContext, AiGenerationResult, ExtractedFact } from '../types'
import { SuggestedReplySchema, ExtractedFactSchema } from '../types'
import { z } from 'zod'

// Real provider. Only reachable when AI_PROVIDER=openai and OPENAI_API_KEY is set
// (see lib/ai/provider.ts). Sends only the trimmed context passed in - never the
// entire database - and validates model output against the structured schema
// before it is trusted anywhere downstream.
export class OpenAiProvider implements AiProvider {
  name = 'openai'
  private client: OpenAI
  private model: string
  private timeoutMs: number

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai')
    this.client = new OpenAI({ apiKey })
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    this.timeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '8000', 10)
  }

  private buildSystemPrompt(context: ConversationContext): string {
    return [
      'You are a conversation copilot for a dating-app operations platform.',
      'You draft a suggested reply for a HUMAN OPERATOR to review and edit - you never send anything yourself.',
      context.clientInstructions ? `Client instructions: ${context.clientInstructions}` : '',
      context.operatorInstructions ? `Operator/service instructions: ${context.operatorInstructions}` : '',
      'Respond ONLY with strict JSON matching this shape: {"suggested_reply": string, "language": string, "confidence": number 0-1, "reasoning_summary": string (max ~2 sentences, no chain-of-thought), "flags": string[], "requires_review": boolean}.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  async generateReply(context: ConversationContext): Promise<AiGenerationResult> {
    const start = Date.now()
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt(context) },
      ...context.recentMessages.slice(-12).map((m) => ({
        role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.4,
        },
        { signal: controller.signal },
      )
      clearTimeout(timeout)

      const raw = completion.choices[0]?.message?.content ?? '{}'
      const parsed = SuggestedReplySchema.parse(JSON.parse(raw))

      return {
        reply: parsed,
        provider: this.name,
        model: this.model,
        latencyMs: Date.now() - start,
        tokenUsage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
            }
          : undefined,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  async extractMemory(context: ConversationContext): Promise<ExtractedFact[]> {
    const prompt = [
      'Extract only facts EXPLICITLY stated by the user in these messages. Never infer or invent.',
      'Return strict JSON: {"facts": [{"type": one of LOCATION|AGE|OCCUPATION|INTEREST|PREFERENCE|FACT|COMMITMENT|STATUS|OTHER, "value": string, "confidence": number 0-1, "source_message_id": string}]}',
      'If nothing is explicitly stated, return {"facts": []}.',
    ].join('\n')

    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        ...context.recentMessages.slice(-20).map((m) => ({
          role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0,
    })

    const raw = completion.choices[0]?.message?.content ?? '{"facts":[]}'
    const parsed = z.object({ facts: z.array(ExtractedFactSchema) }).parse(JSON.parse(raw))
    return parsed.facts
  }

  async summarizeConversation(context: ConversationContext): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'Summarize this conversation in 2-3 sentences, factually, no speculation.' },
        ...context.recentMessages.map((m) => ({
          role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
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
        { role: 'user', content },
      ],
      temperature: 0,
    })
    const raw = completion.choices[0]?.message?.content ?? '{"label":"unknown","confidence":0}'
    return z.object({ label: z.string(), confidence: z.number() }).parse(JSON.parse(raw))
  }
}
