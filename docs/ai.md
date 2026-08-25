# AI

## Provider abstraction

`lib/ai/types.ts` defines `AiProvider` with four methods: `generateReply`, `extractMemory`, `summarizeConversation`, `classifyMessage`. Two implementations ship:

- `lib/ai/providers/mock.ts` - deterministic, no external calls, used by default (`AI_PROVIDER=mock`). Lets the entire pipeline run in dev/CI without an API key.
- `lib/ai/providers/openai.ts` - real provider, selected via `AI_PROVIDER=openai` + `OPENAI_API_KEY`.

Swap or add a provider by implementing `AiProvider` and updating `lib/ai/provider.ts::getAiProvider`. No other code changes.

## Structured output

`generateReply` returns a `SuggestedReply` validated against a Zod schema:

```json
{
  "suggested_reply": "...",
  "language": "en",
  "confidence": 0.82,
  "reasoning_summary": "short, safe explanation - never raw chain-of-thought",
  "flags": [],
  "requires_review": true
}
```

The API (`/conversations/:id/suggestion`) only ever returns these fields - no prompt, no internal reasoning trace.

## Context building

`lib/ai/service.ts::buildConversationContext` sends the provider a trimmed context (last 20 messages, extracted facts, tenant/operator instructions) - never the whole database.

## Failure handling

`generateSuggestionForMessage` never throws to its caller. A provider failure is recorded as an `AiGeneration` row with `status: "failed"` and the operator UI falls back to "AI unavailable - respond manually." AI is explicitly never a single point of failure for the communication loop (spec section 47).

## Human oversight

The AI never sends a message in V1. `operatorSendMessage` (`lib/messages/send.ts`) is the only path that creates an OUTBOUND message, and it records whether the operator's final text matched the AI suggestion verbatim (`accepted`) or diverged (`edited`) on the linked `AiGeneration` row, enabling later AI quality review.

## Memory extraction

`AiMemory` rows always carry `sourceMessageId`, `confidence`, and timestamps. The mock and OpenAI providers are both instructed to extract only explicitly-stated facts, never infer. Facts are correctable/deletable (`correctedValue`, `isDeleted`) and are never treated as ground truth elsewhere in the system.
