import { getCalendarProvider } from '@/lib/integrations/calendar/provider'
import { CONTACT_PATH } from '@/lib/content/site'

// One place that decides where every "Book a Call" link points.
// Configure via the existing CALENDLY_SCHEDULING_URL environment variable
// (read through the calendar provider). Only a well-formed https Calendly URL is
// accepted; anything else - including empty - falls back to the contact page.

export interface BookCallTarget {
  href: string
  /** true => opens an external scheduling page in a new tab. */
  external: boolean
}

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
  const url = parseSchedulingUrl(getCalendarProvider().getBookingUrl())
  return url ? { href: url, external: true } : { href: CONTACT_PATH, external: false }
}
