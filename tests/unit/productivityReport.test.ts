import { describe, it, expect } from 'vitest'
import { median, timeSavedPerReply, MIN_SAMPLE } from '@/lib/reports/productivity'

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
})
