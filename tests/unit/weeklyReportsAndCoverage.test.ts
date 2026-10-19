import { describe, it, expect } from 'vitest'
import { weekStartOf, parseWeek, lastCompletedWeek, compareMetrics, type WeeklyMetrics } from '@/lib/reports/weekly'
import { coverageSlots, overlapHours } from '@/lib/shifts/coverage'

const m = (o: Partial<WeeklyMetrics['messages']> = {}, r: Partial<WeeklyMetrics['response']> = {}, earn = 0): WeeklyMetrics => ({
  messages: { written: 10, delivered: 9, failed: 1, approved: 5, rejected: 1, unreviewed: 3, ...o },
  quality: { reviews: 6, avgAccuracy: 4, avgTone: 4, avgResolution: 4, passRate: 80 },
  response: { conversationsHandled: 8, slaMissed: 1, avgResponseSeconds: 60, slaMetPct: 90, ...r },
  attendance: null,
  earningsEurCents: earn,
})

describe('weeks', () => {
  it('weeks start on Monday 00:00 UTC', () => {
    expect(weekStartOf(new Date('2026-10-19T15:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z') // a Monday
    expect(weekStartOf(new Date('2026-10-25T23:59:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z') // Sunday
    expect(weekStartOf(new Date('2026-10-26T00:00:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })
  it('parses a date to its week and rejects garbage', () => {
    expect(parseWeek('2026-10-22')!.toISOString()).toBe('2026-10-19T00:00:00.000Z')
    expect(parseWeek('22/10/2026')).toBeNull()
    expect(parseWeek('2026-13-40')).toBeNull()
    expect(parseWeek(null)).toBeNull()
  })
  it('the last completed week is the one before the current week', () => {
    expect(lastCompletedWeek(new Date('2026-10-21T10:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z')
  })
})

describe('week-over-week comparison', () => {
  it('computes deltas, and nulls where a value is unknown', () => {
    const c = compareMetrics(m({ written: 15 }, { avgResponseSeconds: null }, 500), m({ written: 10 }, { avgResponseSeconds: 60 }, 300))!
    expect(c.written).toBe(5)
    expect(c.avgResponseSeconds).toBeNull()
    expect(c.earningsEurCents).toBe(200)
  })
  it('no previous week means no comparison', () => expect(compareMetrics(m(), null)).toBeNull())
})

describe('coverage', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 19, h)) // Monday 19 Oct 2026
  const hours = { mon: { open: '08:00', close: '12:00' } }
  const base = { from: at(6), to: at(14), timezone: 'UTC', hours }
  it('flags open hours nobody is scheduled for, and ignores closed hours', () => {
    const slots = coverageSlots({ ...base, shifts: [{ operatorId: 'a', startsAt: at(8), endsAt: at(10) }], absences: [] })
    expect(slots.filter((s) => s.gap).map((s) => s.start.slice(11, 13))).toEqual(['10', '11'])
    expect(slots.filter((s) => !s.open)).toHaveLength(4) // 06,07,12,13
  })
  it('an absence removes the operator from the slots it covers', () => {
    const slots = coverageSlots({ ...base, shifts: [{ operatorId: 'a', startsAt: at(8), endsAt: at(12) }], absences: [{ operatorId: 'a', startsAt: at(9), endsAt: at(10) }] })
    expect(slots.filter((s) => s.gap).map((s) => s.start.slice(11, 13))).toEqual(['09'])
  })
  it('counts distinct operators once', () => {
    const slots = coverageSlots({ ...base, shifts: [{ operatorId: 'a', startsAt: at(8), endsAt: at(9) }, { operatorId: 'a', startsAt: at(8), endsAt: at(9) }, { operatorId: 'b', startsAt: at(8), endsAt: at(9) }], absences: [] })
    expect(slots.find((s) => s.start.slice(11, 13) === '08')!.staffed).toBe(2)
  })
  it('no operating hours configured means always open (24/7)', () => {
    expect(coverageSlots({ ...base, hours: null as never, shifts: [], absences: [] }).every((s) => s.open && s.gap)).toBe(true)
  })
  it('overlap hours', () => expect(overlapHours(at(8), at(12), at(10), at(20))).toBe(2))
})
