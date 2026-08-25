import type { AccessTokenClaims } from './tokens'

export class ForbiddenError extends Error {
  status = 403
}

/**
 * Resolves the tenantId a request is allowed to operate on.
 *
 * CLIENT users are always pinned to session.tenantId regardless of what the
 * request claims - a CLIENT can never widen scope by editing a query param
 * or request body. This is the server-side enforcement point; never trust
 * a tenantId supplied by the client for a CLIENT-role caller.
 *
 * MANAGER and OPERATOR are tenant-scoped roles (they belong to, or run
 * operations for, exactly one client relationship - see the User model:
 * these roles always carry a tenantId). They may not cross into another
 * tenant's data even if a tenantId is supplied in the request.
 *
 * CEO_ADMIN and ASSISTANT are global/operational roles (their permissions -
 * system health, queue recovery, cross-tenant ticket triage - are inherently
 * cross-tenant, and their User rows carry no tenantId). They may target any
 * tenant explicitly via the request, or omit it for a global view.
 */
export function resolveTenantScope(
  session: AccessTokenClaims,
  requestedTenantId: string | null,
): string {
  if (session.role === 'CLIENT') {
    if (!session.tenantId) {
      throw new ForbiddenError('Client session missing tenant assignment')
    }
    return session.tenantId
  }

  if (session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT') {
    return requestedTenantId ?? session.tenantId ?? ''
  }

  // MANAGER / OPERATOR: tenant-scoped internal staff.
  if (requestedTenantId && session.tenantId && requestedTenantId !== session.tenantId) {
    throw new ForbiddenError('Cannot access another tenant\'s data')
  }
  if (!session.tenantId && !requestedTenantId) {
    throw new ForbiddenError('No tenant context available for this request')
  }
  return requestedTenantId ?? session.tenantId!
}
