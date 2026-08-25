import type { AiProvider, ConversationContext, AiGenerationResult, ExtractedFact } from '../types'

// Deterministic, dependency-free provider used by default (AI_PROVIDER=mock).
// Lets the whole pipeline (assignment -> AI suggestion -> operator review ->
// send) be exercised in dev/tests without any external API key.
export class MockAiProvider implements AiProvider {
  name = 'mock'

  async generateReply(context: ConversationContext): Promise<AiGenerationResult> {
    const start = Date.now()
    const lastInbound = [...context.recentMessages].reverse().find((m) => m.direction === 'INBOUND')
    const reply = lastInbound
      ? `Thanks for your message! I'd love to hear more about that - ${truncate(lastInbound.content, 40)}`
      : 'Hi! Thanks for reaching out - how can I help today?'

    return {
      reply: {
        suggested_reply: reply,
        language: context.language ?? 'en',
        confidence: 0.72,
        reasoning_summary: 'Mock provider: templated acknowledgement based on last inbound message.',
        flags: [],
        requires_review: true,
      },
      provider: this.name,
      model: 'mock-v1',
      latencyMs: Date.now() - start,
    }
  }

  async extractMemory(context: ConversationContext): Promise<ExtractedFact[]> {
    // Mock extraction never invents facts - returns empty unless obviously present.
    const facts: ExtractedFact[] = []
    const last = context.recentMessages[context.recentMessages.length - 1]
    if (last && /\b(from|live in|based in)\s+([A-Z][a-z]+)/.test(last.content)) {
      const match = last.content.match(/\b(?:from|live in|based in)\s+([A-Z][a-z]+)/)
      if (match && match[1]) {
        facts.push({
          type: 'LOCATION',
          value: match[1],
          confidence: 0.55,
          source_message_id: 'unknown',
        })
      }
    }
    return facts
  }

  async summarizeConversation(context: ConversationContext): Promise<string> {
    return `Conversation with ${context.recentMessages.length} recent messages.`
  }

  async classifyMessage(content: string): Promise<{ label: string; confidence: number }> {
    const label = /\?$/.test(content.trim()) ? 'question' : 'statement'
    return { label, confidence: 0.6 }
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '...' : s
}
