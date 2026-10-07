// One place that decides where every public "Book a Call" link points.
//
// GCO has ONE official booking event. The destination is a constant, not environment configuration: it cannot be
// pointed somewhere else by a stray env var, and it needs no deploy-time setup. (The sales CRM's own
// "Book Closing Call" feature is separate and keeps using CALENDLY_SCHEDULING_URL via the calendar provider.)

/** The official GCO 30-minute booking event. The only booking destination for public GCO CTAs. */
export const GCO_BOOKING_URL = 'https://calendly.com/cristianidiaghe9/30min'

export interface BookCallTarget {
  href: string
  /** true => opens an external scheduling page in a new tab. */
  external: boolean
}

/** Accepts only a well-formed https Calendly URL (used to guard the constant above in tests and by any future override). */
export function parseSchedulingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.toLowerCase()
    const isCalendly = host === 'calendly.com' || host.endsWith('.calendly.com')
    return url.protocol === 'https:' && isCalendly ? url.toString() : null
  } catch {
    return null
  }
}

export function getBookCallTarget(): BookCallTarget {
  return { href: GCO_BOOKING_URL, external: true }
}
