import { describe, it, expect } from 'vitest'
import { formatInZone, rangeInZone, timeInZone, zoneOffsetLabel } from '@/lib/shifts/zones'

// 9 Nov 2026 is in winter time for Europe (Rome = UTC+1); India has no daylight saving (UTC+5:30).
const start = '2026-11-09T08:00:00.000Z'
const end = '2026-11-09T16:00:00.000Z'

describe('shift time zones', () => {
  it('reads one UTC instant in each zone', () => {
    expect(timeInZone(start, 'Europe/Rome')).toBe('09:00')
    expect(timeInZone(start, 'Asia/Kolkata')).toBe('13:30')
    expect(timeInZone(start, 'UTC')).toBe('08:00')
    expect(formatInZone(start, 'Europe/Rome')).toBe('Mon 9 Nov, 09:00')
  })

  it('labels zones by offset, including half hours', () => {
    expect(zoneOffsetLabel(start, 'Europe/Rome')).toBe('GMT+1')
    expect(zoneOffsetLabel(start, 'Asia/Kolkata')).toBe('GMT+5:30')
    // Summer time is taken from the date, not assumed
    expect(zoneOffsetLabel('2026-07-01T08:00:00.000Z', 'Europe/Rome')).toBe('GMT+2')
  })

  it('names the zone on every range and dates the end when it falls on another day', () => {
    expect(rangeInZone(start, end, 'Europe/Rome')).toBe('Mon 9 Nov, 09:00–17:00 (Europe/Rome, GMT+1)')
    // The same shift in India ends after midnight local time - the end carries its own date
    expect(rangeInZone('2026-11-09T16:00:00.000Z', '2026-11-09T22:00:00.000Z', 'Asia/Kolkata')).toBe('Mon 9 Nov, 21:30 – Tue 10 Nov, 03:30 (Asia/Kolkata, GMT+5:30)')
  })
})
