import { describe, it, expect } from 'vitest'
import { can, assertCan } from '@/lib/auth/rbac'

describe('RBAC permission matrix', () => {
  it('operator applications (applicant personal data): CEO_ADMIN can view and manage; CTO can view only (CEO decision, 16 Nov)', () => {
    expect(can('CEO_ADMIN', 'CAREER_VIEW')).toBe(true)
    expect(can('CEO_ADMIN', 'CAREER_MANAGE')).toBe(true)
    expect(can('CTO', 'CAREER_VIEW')).toBe(true)
    expect(can('CTO', 'CAREER_MANAGE')).toBe(false) // view-only: cannot change an applicant's status
    for (const role of ['MANAGER', 'ASSISTANT', 'OPERATOR', 'CLIENT', 'HUNTER'] as const) {
      expect(can(role, 'CAREER_VIEW')).toBe(false)
      expect(can(role, 'CAREER_MANAGE')).toBe(false)
    }
  })

  it('leads: CEO_ADMIN and MANAGER can view and manage; CTO can view only, never edit a lead (CEO decision, 16 Nov)', () => {
    expect(can('CEO_ADMIN', 'LEAD_VIEW_TEAM')).toBe(true)
    expect(can('MANAGER', 'LEAD_VIEW_TEAM')).toBe(true)
    expect(can('CTO', 'LEAD_VIEW_TEAM')).toBe(true)
    expect(can('CEO_ADMIN', 'LEAD_MANAGE')).toBe(true)
    expect(can('MANAGER', 'LEAD_MANAGE')).toBe(true)
    expect(can('CTO', 'LEAD_MANAGE')).toBe(false) // view-only: cannot change a lead's stage, notes or discovery
    for (const role of ['ASSISTANT', 'OPERATOR', 'CLIENT', 'HUNTER'] as const) {
      expect(can(role, 'LEAD_VIEW_TEAM')).toBe(false)
      expect(can(role, 'LEAD_MANAGE')).toBe(false)
    }
  })

  it('CTO still has no billing, revenue or full administrative access, even with the new view-only CRM scope', () => {
    for (const perm of ['VIEW_REVENUE', 'TENANT_MANAGE', 'USER_MANAGE', 'PERMISSION_MANAGE', 'AI_CONFIG_MANAGE'] as const) {
      expect(can('CTO', perm)).toBe(false)
    }
  })

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

  it('escalation: only operators raise; supervisors and management handle; clients only view client-facing items', () => {
    expect(can('OPERATOR', 'ESCALATION_CREATE')).toBe(true)
    for (const r of ['MANAGER', 'ASSISTANT', 'CEO_ADMIN', 'CLIENT', 'HUNTER'] as const) expect(can(r, 'ESCALATION_CREATE')).toBe(false)

    for (const r of ['MANAGER', 'ASSISTANT', 'CEO_ADMIN'] as const) expect(can(r, 'ESCALATION_HANDLE')).toBe(true)
    for (const r of ['OPERATOR', 'CLIENT', 'HUNTER'] as const) expect(can(r, 'ESCALATION_HANDLE')).toBe(false)

    // Client-decision level is GCO management only: a tenant MANAGER (supervisor) cannot resolve it.
    expect(can('CEO_ADMIN', 'ESCALATION_MANAGE_CLIENT_DECISION')).toBe(true)
    expect(can('ASSISTANT', 'ESCALATION_MANAGE_CLIENT_DECISION')).toBe(true)
    expect(can('MANAGER', 'ESCALATION_MANAGE_CLIENT_DECISION')).toBe(false)

    expect(can('CLIENT', 'ESCALATION_VIEW_CLIENT')).toBe(true)
    expect(can('OPERATOR', 'ESCALATION_VIEW_CLIENT')).toBe(false)
  })
})
