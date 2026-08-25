import { describe, it, expect } from 'vitest'
import { resolveTenantScope, ForbiddenError } from '@/lib/auth/tenantGuard'
import type { AccessTokenClaims } from '@/lib/auth/tokens'

function claims(overrides: Partial<AccessTokenClaims>): AccessTokenClaims {
  return { sub: 'user1', role: 'CLIENT', tenantId: 'tenant-a', email: 'x@y.com', ...overrides }
}

describe('resolveTenantScope', () => {
  it('pins a CLIENT to their own tenant regardless of a requested tenantId', () => {
    const session = claims({ role: 'CLIENT', tenantId: 'tenant-a' })
    expect(resolveTenantScope(session, 'tenant-b')).toBe('tenant-a')
  })

  it('rejects a CLIENT session missing a tenant assignment', () => {
    const session = claims({ role: 'CLIENT', tenantId: null })
    expect(() => resolveTenantScope(session, 'tenant-b')).toThrow(ForbiddenError)
  })

  it('lets CEO_ADMIN target any tenant explicitly', () => {
    const session = claims({ role: 'CEO_ADMIN', tenantId: null })
    expect(resolveTenantScope(session, 'tenant-b')).toBe('tenant-b')
  })

  it('blocks a MANAGER from requesting a different tenant than their own', () => {
    const session = claims({ role: 'MANAGER', tenantId: 'tenant-a' })
    expect(() => resolveTenantScope(session, 'tenant-b')).toThrow(ForbiddenError)
  })

  it('lets a MANAGER omit tenantId and defaults to their own', () => {
    const session = claims({ role: 'MANAGER', tenantId: 'tenant-a' })
    expect(resolveTenantScope(session, null)).toBe('tenant-a')
  })

  it('lets ASSISTANT (a global operational role, no tenant of its own) target any tenant explicitly', () => {
    const session = claims({ role: 'ASSISTANT', tenantId: null })
    expect(resolveTenantScope(session, 'tenant-b')).toBe('tenant-b')
  })

  it('rejects ASSISTANT with no tenantId requested and none on the session (no implicit global default)', () => {
    const session = claims({ role: 'ASSISTANT', tenantId: null })
    expect(resolveTenantScope(session, null)).toBe('')
  })

  it('blocks an OPERATOR from requesting a different tenant than their own', () => {
    const session = claims({ role: 'OPERATOR', tenantId: 'tenant-a' })
    expect(() => resolveTenantScope(session, 'tenant-b')).toThrow(ForbiddenError)
  })
})
