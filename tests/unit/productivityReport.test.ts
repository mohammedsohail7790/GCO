import { describe, it, expect } from 'vitest'
import { median, timeSavedPerReply, estimateAiCostUsd, MIN_SAMPLE } from '@/lib/reports/productivity'

describe('productivity maths', () => {
  it('median of odd, even and empty lists', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('time saved needs enough replies in both groups, then compares medians', () => {
    const fast = Array.from({ length: MIN_SAMPLE }, () => 40)
    const slow = Array.from({ length: MIN_SAMPLE }, () => 100)
    expect(timeSavedPerReply(fast, slow)).toBe(60)
    expect(timeSavedPerReply(fast.slice(1), slow)).toBeNull()
    expect(timeSavedPerReply(fast, slow.slice(1))).toBeNull()
    // Drafts that slow operators down show as a negative saving, not hidden
    expect(timeSavedPerReply(slow, fast)).toBe(-60)
  })
  it('AI cost estimate: gpt-4o-mini list prices by default, per-million-token prices can be overridden', () => {
    // 2,000 prompt + 350 completion tokens (a typical draft) = 2000*0.15/1e6 + 350*0.60/1e6
    expect(estimateAiCostUsd(2000, 350, 0.15, 0.6)).toBeCloseTo(0.00051, 8)
    expect(estimateAiCostUsd(0, 0, 0.15, 0.6)).toBe(0)
    expect(estimateAiCostUsd(1_000_000, 1_000_000, 2, 8)).toBe(10)
  })
})
