import { describe, it, expect } from 'vitest'
import { can, assertCan } from '@/lib/auth/rbac'

describe('RBAC permission matrix', () => {
  it('only CEO_ADMIN can manage tenants', () => {
    expect(can('CEO_ADMIN', 'TENANT_MANAGE')).toBe(true)
    expect(can('MANAGER', 'TENANT_MANAGE')).toBe(false)
    expect(can('CLIENT', 'TENANT_MANAGE')).toBe(false)
  })

  it('managers cannot access revenue/audit logs (CEO_ADMIN only)', () => {
    expect(can('MANAGER', 'VIEW_REVENUE')).toBe(false)
    expect(can('MANAGER', 'VIEW_AUDIT_LOGS')).toBe(false)
    expect(can('CEO_ADMIN', 'VIEW_REVENUE')).toBe(true)
  })

  it('only operators can handle conversations directly', () => {
    expect(can('OPERATOR', 'CONVERSATION_HANDLE')).toBe(true)
    expect(can('MANAGER', 'CONVERSATION_HANDLE')).toBe(false)
    expect(can('CLIENT', 'CONVERSATION_HANDLE')).toBe(false)
  })

  it('clients can create and view only their own tickets, not manage others', () => {
    expect(can('CLIENT', 'TICKET_CREATE')).toBe(true)
    expect(can('CLIENT', 'TICKET_MANAGE')).toBe(false)
  })

  it('assertCan throws a 403-shaped error for disallowed roles', () => {
    expect(() => assertCan('CLIENT', 'TENANT_MANAGE')).toThrow()
    try {
      assertCan('CLIENT', 'TENANT_MANAGE')
    } catch (err) {
      expect((err as any).status).toBe(403)
    }
  })
})
