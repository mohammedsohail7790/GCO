import { describe, it, expect } from 'vitest'
import { isValidTimezone, isWithinOperatingHours, validateOperatingHours } from '@/lib/tenant/settings'

const weekdays = { mon: { open: '09:00', close: '17:00' }, tue: { open: '09:00', close: '17:00' }, wed: { open: '09:00', close: '17:00' }, thu: { open: '09:00', close: '17:00' }, fri: { open: '09:00', close: '17:00' } }

describe('operating hours', () => {
  it('validates shape, times and days', () => {
    expect(validateOperatingHours(null)).toBeNull()
    expect(validateOperatingHours(weekdays)).toBeNull()
    expect(validateOperatingHours({ mon: { open: '9:00', close: '17:00' } })).toMatch(/HH:MM/)
    expect(validateOperatingHours({ mon: { open: '17:00', close: '09:00' } })).toMatch(/after/)
    expect(validateOperatingHours({ funday: { open: '09:00', close: '10:00' } })).toMatch(/Unknown day/)
    expect(validateOperatingHours({ mon: { open: '09:00', close: '10:00', extra: 1 } })).toMatch(/Unexpected/)
    expect(validateOperatingHours([1])).toMatch(/object/)
  })
  it('timezone validation', () => {
    expect(isValidTimezone('Europe/Dublin')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
  it('no hours means always open; closed days and times outside the window are closed', () => {
    const wed10 = new Date('2026-10-14T10:00:00Z') // Wednesday
    expect(isWithinOperatingHours('UTC', null, wed10)).toBe(true)
    expect(isWithinOperatingHours('UTC', weekdays, wed10)).toBe(true)
    expect(isWithinOperatingHours('UTC', weekdays, new Date('2026-10-14T17:00:00Z'))).toBe(false) // close is exclusive
    expect(isWithinOperatingHours('UTC', weekdays, new Date('2026-10-14T08:59:00Z'))).toBe(false)
    expect(isWithinOperatingHours('UTC', weekdays, new Date('2026-10-17T10:00:00Z'))).toBe(false) // Saturday
  })
  it('honours the timezone', () => {
    // 10:00 UTC on Wednesday is 03:00 in Los Angeles (closed) and 11:00 in Dublin (open, BST)
    const t = new Date('2026-10-14T10:00:00Z')
    expect(isWithinOperatingHours('America/Los_Angeles', weekdays, t)).toBe(false)
    expect(isWithinOperatingHours('Europe/Dublin', weekdays, t)).toBe(true)
  })
})
