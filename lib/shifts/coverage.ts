import { isWithinOperatingHours, type OperatingHours } from '@/lib/tenant/settings'

const HOUR = 3_600_000

export interface Span { operatorId: string; startsAt: Date; endsAt: Date }

export interface CoverageSlot { start: string; open: boolean; staffed: number; gap: boolean }

/**
 * Pure. Hourly coverage over [from, to): a slot is "open" when the client's operating hours say so, "staffed" counts distinct
 * operators on a (non-cancelled) shift that overlaps the slot and are not absent, and it is a gap when open and nobody is staffed.
 */
export function coverageSlots(opts: {
  from: Date
  to: Date
  timezone: string
  hours: OperatingHours | null
  shifts: Span[]
  absences: Span[]
}): CoverageSlot[] {
  const out: CoverageSlot[] = []
  for (let t = opts.from.getTime(); t < opts.to.getTime(); t += HOUR) {
    const start = new Date(t)
    const end = new Date(t + HOUR)
    const overlaps = (s: Span) => s.startsAt < end && s.endsAt > start
    const absent = new Set(opts.absences.filter(overlaps).map((a) => a.operatorId))
    const staffed = new Set(opts.shifts.filter(overlaps).map((s) => s.operatorId).filter((id) => !absent.has(id))).size
    const open = isWithinOperatingHours(opts.timezone, opts.hours, start)
    out.push({ start: start.toISOString(), open, staffed, gap: open && staffed === 0 })
  }
  return out
}

/** Hours of [a,b) overlapping [from,to). */
export const overlapHours = (a: Date, b: Date, from: Date, to: Date) => Math.max(0, Math.min(b.getTime(), to.getTime()) - Math.max(a.getTime(), from.getTime())) / HOUR
