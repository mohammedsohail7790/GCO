// Calendar booking boundary for "Book Closing Call". Mirrors the shape of
// lib/integrations/adapter.ts: one small interface, one real implementation,
// no credentials hardcoded. Calendly only for MVP (see docs/crm.md) - if the
// env vars below are unset, getBookingUrl() returns null and callers must
// show a "not yet configured" state rather than a fake booking flow.

export interface CalendarProvider {
  key: string
  /** Returns a real booking URL, or null if credentials/config are not set. Never fabricated. */
  getBookingUrl(): string | null
}

class CalendlyProvider implements CalendarProvider {
  key = 'calendly'

  getBookingUrl(): string | null {
    const url = process.env.CALENDLY_SCHEDULING_URL
    return url && url.trim().length > 0 ? url : null
  }
}

export function getCalendarProvider(): CalendarProvider {
  return new CalendlyProvider()
}
