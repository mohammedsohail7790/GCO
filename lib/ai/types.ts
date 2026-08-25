import { z } from 'zod'

export const SuggestedReplySchema = z.object({
  suggested_reply: z.string(),
  language: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning_summary: z.string().max(400), // safe, concise metadata only - never raw chain-of-thought
  flags: z.array(z.string()).default([]),
  requires_review: z.boolean().default(true),
})
export type SuggestedReply = z.infer<typeof SuggestedReplySchema>

export const ExtractedFactSchema = z.object({
  type: z.enum([
    'LOCATION',
    'AGE',
    'OCCUPATION',
    'INTEREST',
    'PREFERENCE',
    'FACT',
    'COMMITMENT',
    'STATUS',
    'OTHER',
  ]),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source_message_id: z.string(),
})
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>

export interface ConversationContext {
  conversationId: string
  tenantId: string
  language?: string | null
  recentMessages: Array<{ direction: 'INBOUND' | 'OUTBOUND'; content: string; createdAt: Date }>
  summary?: string | null
  extractedFacts: Array<{ type: string; value: string }>
  clientInstructions?: string | null
  operatorInstructions?: string | null
}

export interface AiGenerationResult {
  reply: SuggestedReply
  provider: string
  model: string
  latencyMs: number
  tokenUsage?: { promptTokens: number; completionTokens: number }
}

export interface AiProvider {
  name: string
  generateReply(context: ConversationContext): Promise<AiGenerationResult>
  extractMemory(context: ConversationContext): Promise<ExtractedFact[]>
  summarizeConversation(context: ConversationContext): Promise<string>
  classifyMessage(content: string): Promise<{ label: string; confidence: number }>
}
