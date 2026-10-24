import { createRequire } from 'module'
import { describe, it, expect, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const { securityHeaders } = require('../../lib/config/securityHeaders') as { securityHeaders: () => { key: string; value: string }[] }
const saved = { hsts: process.env.HSTS_MAX_AGE_SECONDS, rt: process.env.NEXT_PUBLIC_REALTIME_URL }

describe('security headers (finding F1)', () => {
  afterEach(() => {
    if (saved.hsts === undefined) delete process.env.HSTS_MAX_AGE_SECONDS; else process.env.HSTS_MAX_AGE_SECONDS = saved.hsts
    if (saved.rt === undefined) delete process.env.NEXT_PUBLIC_REALTIME_URL; else process.env.NEXT_PUBLIC_REALTIME_URL = saved.rt
  })
  const get = (k: string) => securityHeaders().find((h) => h.key === k)?.value

  it('keeps the existing four headers', () => {
    expect(get('X-Frame-Options')).toBe('DENY')
    expect(get('X-Content-Type-Options')).toBe('nosniff')
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(get('Permissions-Policy')).toContain('camera=()')
  })

  it('sends the CSP report-only (never enforcing) and forbids framing, objects and foreign form targets', () => {
    expect(get('Content-Security-Policy')).toBeUndefined()
    const csp = get('Content-Security-Policy-Report-Only')!
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('allows the realtime origin for connections only when configured', () => {
    delete process.env.NEXT_PUBLIC_REALTIME_URL
    expect(get('Content-Security-Policy-Report-Only')).toContain("connect-src 'self';")
    process.env.NEXT_PUBLIC_REALTIME_URL = 'wss://app.example.test/realtime'
    expect(get('Content-Security-Policy-Report-Only')).toContain("connect-src 'self' wss://app.example.test;")
  })

  it('sends HSTS only when HSTS_MAX_AGE_SECONDS is a positive integer, without includeSubDomains or preload', () => {
    delete process.env.HSTS_MAX_AGE_SECONDS
    expect(get('Strict-Transport-Security')).toBeUndefined()
    process.env.HSTS_MAX_AGE_SECONDS = 'abc'
    expect(get('Strict-Transport-Security')).toBeUndefined()
    process.env.HSTS_MAX_AGE_SECONDS = '0'
    expect(get('Strict-Transport-Security')).toBeUndefined()
    process.env.HSTS_MAX_AGE_SECONDS = '300'
    expect(get('Strict-Transport-Security')).toBe('max-age=300')
  })
})
