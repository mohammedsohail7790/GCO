// Provider-neutral conversion analytics.
//
// STATUS: no analytics provider is approved or installed. This layer defines the event taxonomy and a strict
// PII-safe payload builder, and emits a browser CustomEvent ("gco:analytics"). It sends NOTHING to any server or
// third party and loads no script. To connect an approved provider later, listen for the event (see
// docs/website-v2-phase-c.md) or define window.gcoAnalytics.track(event).
//
// PII policy: events describe BEHAVIOUR only. Properties are an allow-list of short, token-like strings
// (page path, CTA location, content slug, coarse error type). Anything else - emails, names, company, website,
// messages, phone numbers, lead data, query strings, free text - is dropped by construction.

export const ANALYTICS_EVENTS = [
  'page_view',
  'pilot_cta_click',
  'pilot_form_started',
  'pilot_form_submitted',
  'pilot_form_error',
  'contact_form_started',
  'contact_form_submitted',
  'book_call_click',
  'service_view',
  'industry_view',
  'platform_view',
  'resource_view',
  'resource_cta_click',
] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number]

export const ALLOWED_PROPS = ['path', 'location', 'slug', 'error_type', 'category'] as const
export type AnalyticsProps = Partial<Record<(typeof ALLOWED_PROPS)[number], string>>

/** Token-like only: letters, digits, "_", "-", ".", "/" - no spaces, "@", "?", "=", ":" or "&". Max 64 chars. */
const SAFE_VALUE = /^[a-z0-9/][a-z0-9_\-./]{0,63}$/i

export function sanitizeProps(props: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {}
  if (!props) return out
  for (const key of ALLOWED_PROPS) {
    const v = props[key]
    if (typeof v === 'string' && SAFE_VALUE.test(v)) out[key] = v
  }
  return out
}

export interface AnalyticsEvent {
  name: AnalyticsEventName
  props: AnalyticsProps
}

export function buildEvent(name: string, props?: Record<string, unknown>): AnalyticsEvent | null {
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(name)) return null
  return { name: name as AnalyticsEventName, props: sanitizeProps(props) }
}

declare global {
  interface Window {
    gcoAnalytics?: { track?: (event: AnalyticsEvent) => void }
  }
}

/** Emit an event. Safe to call anywhere on the client; never throws; no network. */
export function trackEvent(name: AnalyticsEventName, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const event = buildEvent(name, props)
    if (!event) return
    window.dispatchEvent(new CustomEvent('gco:analytics', { detail: event }))
    window.gcoAnalytics?.track?.(event)
  } catch {
    /* analytics must never affect the page */
  }
}

/** Maps a CTA's data-cta attribute to its event (used by the single delegated click listener). */
export const CTA_EVENT_BY_KIND: Record<string, AnalyticsEventName> = {
  pilot: 'pilot_cta_click',
  'book-call': 'book_call_click',
  resource: 'resource_cta_click',
}
