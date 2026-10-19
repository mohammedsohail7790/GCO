import { describe, it, expect } from 'vitest'
import { PERMISSIONS, can, type PermissionKey } from '@/lib/auth/rbac'
import { resolveTenantScope, ForbiddenError } from '@/lib/auth/tenantGuard'
import type { AccessTokenClaims } from '@/lib/auth/tokens'

const claims = (o: Partial<AccessTokenClaims>): AccessTokenClaims => ({ sub: 'u', role: 'SUPERVISOR', tenantId: 'tenant-a', email: 'x@y.com', ...o })
const holding = (role: 'SUPERVISOR' | 'CTO') => (Object.keys(PERMISSIONS) as PermissionKey[]).filter((k) => can(role, k)).sort()

describe('SUPERVISOR and CTO permission sets (exact - any drift fails this test)', () => {
  it('SUPERVISOR: operational team-lead permissions only', () => {
    expect(holding('SUPERVISOR')).toEqual(
      [
        'VIEW_OPERATOR_DETAIL', 'VIEW_CONVERSATION_CONTENT', 'CONVERSATION_REASSIGN', 'QUEUE_INSPECT', 'ESCALATION_HANDLE', 'LANGUAGE_MANAGE', 'QA_REVIEW',
        'CONVERSATION_RESOLVE', 'CONVERSATION_REOPEN', 'CONVERSATION_NOTE_ADD', 'CONVERSATION_SEARCH', 'OPS_ALERTS_VIEW', 'TENANT_SETTINGS_VIEW', 'VIEW_TENANT_ANALYTICS',
      ].sort(),
    )
  })
  it('CTO: technical permissions only', () => {
    expect(holding('CTO')).toEqual(['VIEW_SYSTEM_METRICS', 'VIEW_AUDIT_LOGS', 'INTEGRATION_MANAGE', 'QUEUE_INSPECT', 'QUEUE_RECOVER', 'OPS_ALERTS_VIEW'].sort())
  })
  it('neither role touches money, sales, onboarding, staff management or personal applicant data', () => {
    const forbidden: PermissionKey[] = ['VIEW_REVENUE', 'PAYOUT_MANAGE', 'EARNINGS_VIEW_OPERATOR', 'EARNINGS_VIEW_OWN', 'COMMISSION_VIEW_TEAM', 'REVENUE_RECORD', 'USER_MANAGE', 'OPERATOR_MANAGE', 'ONBOARDING_VIEW', 'ONBOARDING_MANAGE', 'ONBOARDING_GO_LIVE', 'STAFF_INVITE', 'CAREER_VIEW', 'TENANT_MANAGE', 'TENANT_SETTINGS_MANAGE', 'VIEW_ALL_TENANTS', 'BILLING_VIEW']
    for (const role of ['SUPERVISOR', 'CTO'] as const) for (const k of forbidden) expect(can(role, k), `${role} must not hold ${k}`).toBe(false)
  })
  it('the CTO cannot read conversation content', () => {
    expect(can('CTO', 'VIEW_CONVERSATION_CONTENT')).toBe(false)
    expect(can('CTO', 'ESCALATION_HANDLE')).toBe(false)
  })
})

describe('tenant scope for the new roles', () => {
  it('a SUPERVISOR is pinned to their own tenant', () => {
    expect(() => resolveTenantScope(claims({}), 'tenant-b')).toThrow(ForbiddenError)
    expect(resolveTenantScope(claims({}), null)).toBe('tenant-a')
  })
  it('a SUPERVISOR with no tenant has no scope', () => {
    expect(() => resolveTenantScope(claims({ tenantId: null }), null)).toThrow(ForbiddenError)
  })
  it('the CTO may target any tenant (global technical role)', () => {
    expect(resolveTenantScope(claims({ role: 'CTO', tenantId: null }), 'tenant-b')).toBe('tenant-b')
  })
})

describe('billing view', () => {
  it('is limited to CEO, manager and client', () => {
    expect((['CEO_ADMIN', 'MANAGER', 'ASSISTANT', 'OPERATOR', 'CLIENT', 'HUNTER', 'SUPERVISOR', 'CTO'] as const).filter((r) => can(r, 'BILLING_VIEW'))).toEqual(['CEO_ADMIN', 'MANAGER', 'CLIENT'])
  })
})
