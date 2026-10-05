// Input/output bounds for calls to the AI provider. These apply only to what is
// SENT to / requested from the provider - stored messages are never altered.

/** Max characters of any single message sent to the provider. */
export const AI_MAX_MESSAGE_CHARS = 4000
export const AI_TRUNCATION_MARKER = '…[truncated]'

/** Output caps (completion tokens) per feature. */
export const SUGGESTION_MAX_OUTPUT_TOKENS = 400
export const EXTRACTION_MAX_OUTPUT_TOKENS = 600

/** Default overall deadline (ms) for one memory-extraction provider call. */
export const EXTRACTION_TIMEOUT_MS_DEFAULT = 18000

/**
 * Deterministic truncation: keeps the first `max` characters (never splitting a
 * surrogate pair) and appends a fixed marker. Text at or under `max` is returned
 * unchanged.
 */
export function truncateForAi(text: string, max: number = AI_MAX_MESSAGE_CHARS): string {
  if (text.length <= max) return text
  let end = max
  const last = text.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1 // don't cut a surrogate pair in half
  return text.slice(0, end) + AI_TRUNCATION_MARKER
}

export function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
