import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseSchedulingUrl, getBookCallTarget, GCO_BOOKING_URL } from '@/lib/config/scheduling'

describe('parseSchedulingUrl', () => {
  it.each([
    ['https://calendly.com/gco/intro', 'https://calendly.com/gco/intro'],
    ['  https://calendly.com/gco/intro  ', 'https://calendly.com/gco/intro'],
    ['https://www.calendly.com/gco', 'https://www.calendly.com/gco'],
  ])('accepts %s', (raw, expected) => expect(parseSchedulingUrl(raw)).toBe(expected))

  it.each([
    [''],
    ['   '],
    [undefined],
    [null],
    ['not a url'],
    ['http://calendly.com/gco'], // not https
    ['https://evil.example.com/calendly.com'], // wrong host
    ['https://calendly.com.evil.example/x'], // lookalike host
    ['javascript:alert(1)'],
  ])('rejects %s', (raw) => expect(parseSchedulingUrl(raw as string | null | undefined)).toBeNull())
})

describe('getBookCallTarget (single place Book a Call is decided)', () => {
  const original = process.env.CALENDLY_SCHEDULING_URL
  afterEach(() => {
    if (original === undefined) delete process.env.CALENDLY_SCHEDULING_URL
    else process.env.CALENDLY_SCHEDULING_URL = original
  })

  it('is exactly the official GCO 30-minute event, external, and itself a valid https Calendly URL', () => {
    expect(GCO_BOOKING_URL).toBe('https://calendly.com/cristianidiaghe9/30min')
    expect(getBookCallTarget()).toEqual({ href: 'https://calendly.com/cristianidiaghe9/30min', external: true })
    expect(parseSchedulingUrl(GCO_BOOKING_URL)).toBe(GCO_BOOKING_URL)
  })

  it('cannot be redirected by environment configuration (the CRM closing-call feature keeps its own env var)', () => {
    for (const v of [undefined, '', 'https://calendly.com/gco/intro', 'http://calendly.com/x', 'https://evil.example.com/x']) {
      if (v === undefined) delete process.env.CALENDLY_SCHEDULING_URL
      else process.env.CALENDLY_SCHEDULING_URL = v
      expect(getBookCallTarget().href, String(v)).toBe(GCO_BOOKING_URL)
    }
  })
})
