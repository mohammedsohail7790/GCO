import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseSchedulingUrl, getBookCallTarget } from '@/lib/config/scheduling'

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
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    if (original === undefined) delete process.env.CALENDLY_SCHEDULING_URL
    else process.env.CALENDLY_SCHEDULING_URL = original
  })

  it('falls back to /contact (internal) when no URL is configured', () => {
    delete process.env.CALENDLY_SCHEDULING_URL
    expect(getBookCallTarget()).toEqual({ href: '/contact', external: false })
    process.env.CALENDLY_SCHEDULING_URL = ''
    expect(getBookCallTarget()).toEqual({ href: '/contact', external: false })
  })

  it('falls back when the configured URL is not a valid Calendly https URL', () => {
    process.env.CALENDLY_SCHEDULING_URL = 'http://calendly.com/gco'
    expect(getBookCallTarget()).toEqual({ href: '/contact', external: false })
  })

  it('uses Calendly (external) when a valid URL is configured', () => {
    process.env.CALENDLY_SCHEDULING_URL = 'https://calendly.com/gco/intro'
    expect(getBookCallTarget()).toEqual({ href: 'https://calendly.com/gco/intro', external: true })
  })
})
