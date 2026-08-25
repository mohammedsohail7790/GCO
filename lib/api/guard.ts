import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan, type PermissionKey } from '@/lib/auth/rbac'
import type { AccessTokenClaims } from '@/lib/auth/tokens'

/** Loads the session and asserts the caller has the given permission. Throws (401/403) otherwise. */
export async function requirePermission(
  req: NextRequest,
  permission: PermissionKey,
): Promise<AccessTokenClaims> {
  const session = await getSession(req)
  assertCan(session.role, permission)
  return session
}
