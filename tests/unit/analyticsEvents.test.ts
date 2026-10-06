import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ANALYTICS_EVENTS, ALLOWED_PROPS, CTA_EVENT_BY_KIND, buildEvent, sanitizeProps, trackEvent } from '@/lib/analytics/events'

describe('analytics event taxonomy', () => {
  it('defines exactly the approved events', () => {
    expect([...ANALYTICS_EVENTS].sort()).toEqual(
      ['page_view', 'pilot_cta_click', 'pilot_form_started', 'pilot_form_submitted', 'pilot_form_error', 'contact_form_started', 'contact_form_submitted', 'book_call_click', 'service_view', 'industry_view', 'platform_view', 'resource_view', 'resource_cta_click'].sort(),
    )
    expect(CTA_EVENT_BY_KIND).toEqual({ pilot: 'pilot_cta_click', 'book-call': 'book_call_click', resource: 'resource_cta_click' })
  })
  it('rejects unknown event names', () => {
    expect(buildEvent('page_viewed')).toBeNull()
    expect(buildEvent('form_content')).toBeNull()
  })
})

describe('NO-PII payloads', () => {
  it('only allow-listed, token-like properties survive', () => {
    expect([...ALLOWED_PROPS].sort()).toEqual(['category', 'error_type', 'location', 'path', 'slug'])
    expect(sanitizeProps({ path: '/services/chat-moderation', location: 'hero', slug: '24-7-chat-coverage', error_type: 'validation', category: 'chat-operations' })).toEqual({
      path: '/services/chat-moderation',
      location: 'hero',
      slug: '24-7-chat-coverage',
      error_type: 'validation',
      category: 'chat-operations',
    })
  })

  it.each([
    ['email', 'jane.doe@acme.com'],
    ['email in location', 'a@b.co'],
    ['company/name with space', 'Acme Corp'],
    ['free-text message', 'Hi, we need help with our chat volume'],
    ['phone number', '+44 20 7946 0958'],
    ['website url', 'https://acme.com/about'],
    ['query string', '/pilot?email=jane@acme.com'],
    ['equals/ampersand', 'a=b&c=d'],
    ['too long', 'x'.repeat(65)],
    ['empty', ''],
  ])('drops %s', (_label, value) => {
    expect(sanitizeProps({ location: value, slug: value, path: value, error_type: value, category: value })).toEqual({})
  })

  it('drops every non-allow-listed key even with a safe value', () => {
    expect(sanitizeProps({ email: 'ok', company: 'ok', message: 'ok', phone: 'ok', website: 'ok', lead_id: 'ok', token: 'ok', name: 'ok' })).toEqual({})
  })

  it('drops non-string values', () => {
    expect(sanitizeProps({ location: 123 as unknown as string, slug: { a: 1 } as unknown as string, path: ['/x'] as unknown as string })).toEqual({})
  })
})

describe('trackEvent (browser): emits locally, sends nothing anywhere', () => {
  let target: EventTarget
  const received: any[] = []
  const net = { fetch: vi.fn(), beacon: vi.fn(), xhr: vi.fn() }
  beforeEach(() => {
    received.length = 0
    target = new EventTarget()
    target.addEventListener('gco:analytics', (e) => received.push((e as CustomEvent).detail))
    vi.stubGlobal('window', Object.assign(target, { gcoAnalytics: undefined }))
    vi.stubGlobal('fetch', net.fetch)
    vi.stubGlobal('navigator', { sendBeacon: net.beacon })
    vi.stubGlobal('XMLHttpRequest', net.xhr)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('emits a CustomEvent with sanitised props', () => {
    trackEvent('pilot_cta_click', { location: 'hero', path: '/', email: 'x@y.com', message: 'secret' })
    expect(received).toEqual([{ name: 'pilot_cta_click', props: { location: 'hero', path: '/' } }])
  })

  it('form events carry no form content; errors carry only a coarse type', () => {
    trackEvent('pilot_form_started')
    trackEvent('pilot_form_submitted', { email: 'a@b.co', company: 'Acme', message: 'hello', website: 'acme.com' })
    trackEvent('pilot_form_error', { error_type: 'validation' })
    trackEvent('contact_form_started')
    trackEvent('contact_form_submitted', { email: 'a@b.co' })
    expect(received).toEqual([
      { name: 'pilot_form_started', props: {} },
      { name: 'pilot_form_submitted', props: {} },
      { name: 'pilot_form_error', props: { error_type: 'validation' } },
      { name: 'contact_form_started', props: {} },
      { name: 'contact_form_submitted', props: {} },
    ])
    expect(JSON.stringify(received)).not.toMatch(/@|Acme|hello|acme\.com/)
  })

  it('performs no network activity', () => {
    for (const e of ANALYTICS_EVENTS) trackEvent(e, { location: 'x', slug: 'y', path: '/z' })
    expect(net.fetch).not.toHaveBeenCalled()
    expect(net.beacon).not.toHaveBeenCalled()
    expect(net.xhr).not.toHaveBeenCalled()
  })

  it('forwards to an optional window.gcoAnalytics.track hook, and never throws if it fails', () => {
    const track = vi.fn(() => {
      throw new Error('provider down')
    })
    ;(globalThis as any).window.gcoAnalytics = { track }
    expect(() => trackEvent('resource_view', { slug: 'a-b' })).not.toThrow()
    expect(track).toHaveBeenCalledWith({ name: 'resource_view', props: { slug: 'a-b' } })
  })

  it('is a no-op on the server', () => {
    vi.unstubAllGlobals()
    expect(() => trackEvent('page_view', { path: '/' })).not.toThrow()
  })
})
