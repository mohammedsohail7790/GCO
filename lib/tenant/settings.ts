// Per-client operating settings: response SLA, operator capacity default, timezone and operating hours.
// Operating hours are informational and feed the alerts (e.g. "no operator" is not critical outside hours);
// they never block routing or message handling.
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Day = (typeof DAYS)[number]
export type DayHours = { open: string; close: string }
export type OperatingHours = Partial<Record<Day, DayHours>>

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
export const toMinutes = (s: string) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3, 5), 10)

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz.length > 0 && tz.length <= 64
  } catch {
    return false
  }
}

/** Returns an error message, or null when the hours object is acceptable. null/undefined hours (24/7) are valid. */
export function validateOperatingHours(h: unknown): string | null {
  if (h === null || h === undefined) return null
  if (typeof h !== 'object' || Array.isArray(h)) return 'Operating hours must be an object keyed by day.'
  for (const [day, v] of Object.entries(h as Record<string, unknown>)) {
    if (!(DAYS as readonly string[]).includes(day)) return `Unknown day "${day}".`
    if (!v || typeof v !== 'object') return `Hours for ${day} must be {open, close}.`
    const { open, close, ...rest } = v as Record<string, unknown>
    if (Object.keys(rest).length) return `Unexpected fields for ${day}.`
    if (typeof open !== 'string' || typeof close !== 'string' || !HHMM.test(open) || !HHMM.test(close)) return `Use HH:MM (24h) for ${day}.`
    if (toMinutes(close) <= toMinutes(open)) return `Closing time must be after opening time for ${day}.`
  }
  return null
}

/** Is `now` inside the tenant's operating hours? No hours configured = always open. */
export function isWithinOperatingHours(timezone: string, hours: OperatingHours | null | undefined, now: Date = new Date()): boolean {
  if (!hours || Object.keys(hours).length === 0) return true
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = get('weekday').toLowerCase().slice(0, 3) as Day
  const today = hours[day]
  if (!today) return false
  const minutes = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10)
  return minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)
}
