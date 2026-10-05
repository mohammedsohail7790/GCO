import { describe, it, expect } from 'vitest'
import { AI_MAX_MESSAGE_CHARS, AI_TRUNCATION_MARKER, truncateForAi, parseTimeoutMs } from '@/lib/ai/limits'

describe('truncateForAi', () => {
  it('leaves text at or under the limit untouched (boundary)', () => {
    const exact = 'a'.repeat(AI_MAX_MESSAGE_CHARS)
    expect(truncateForAi(exact)).toBe(exact)
    expect(truncateForAi('')).toBe('')
  })

  it('truncates one character over the limit, deterministically', () => {
    const over = 'a'.repeat(AI_MAX_MESSAGE_CHARS + 1)
    const out = truncateForAi(over)
    expect(out).toBe('a'.repeat(AI_MAX_MESSAGE_CHARS) + AI_TRUNCATION_MARKER)
    expect(truncateForAi(over)).toBe(out)
  })

  it('never splits a surrogate pair at the cut point', () => {
    const text = 'a'.repeat(9) + '😀' + 'b'.repeat(20) // emoji occupies indices 9-10
    const out = truncateForAi(text, 10)
    expect(out).toBe('a'.repeat(9) + AI_TRUNCATION_MARKER)
  })

  it('does not mutate its input (stored messages are never altered)', () => {
    const original = 'x'.repeat(AI_MAX_MESSAGE_CHARS * 2)
    const copy = original.slice()
    truncateForAi(original)
    expect(original).toBe(copy)
  })
})

describe('parseTimeoutMs', () => {
  it('falls back for missing/invalid/non-positive values', () => {
    expect(parseTimeoutMs(undefined, 18000)).toBe(18000)
    expect(parseTimeoutMs('abc', 18000)).toBe(18000)
    expect(parseTimeoutMs('0', 18000)).toBe(18000)
    expect(parseTimeoutMs('2500', 18000)).toBe(2500)
  })
})
