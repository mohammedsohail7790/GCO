// Finding F2 (docs/readiness/19, 22): optionally REQUIRE two-factor sign-in for named roles. Off unless REQUIRE_TWO_FACTOR_ROLES is set
// (for example "CEO_ADMIN,ASSISTANT,MANAGER,CTO"). Enrol every account in those roles BEFORE turning it on: setup needs a signed-in session,
// so a role-holder without two-factor is refused at sign-in and cannot enrol alone. Recovery path is break-glass (docs/readiness/21).
import type { Role } from '@prisma/client'

const KNOWN_ROLES: readonly string[] = ['CEO_ADMIN', 'MANAGER', 'ASSISTANT', 'OPERATOR', 'CLIENT', 'HUNTER', 'SUPERVISOR', 'CTO']

export function rolesRequiringTwoFactor(raw: string | undefined = process.env.REQUIRE_TWO_FACTOR_ROLES): Set<string> {
  const out = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const r = part.trim().toUpperCase()
    if (KNOWN_ROLES.includes(r)) out.add(r)
  }
  return out
}

/** True when this role must have two-factor on and the account does not. */
export function twoFactorEnrolmentRequired(role: Role, totpEnabledAt: Date | null, raw?: string): boolean {
  return !totpEnabledAt && rolesRequiringTwoFactor(raw).has(role)
}
