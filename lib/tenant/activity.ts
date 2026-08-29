import { db } from '@/lib/db/client'

/**
 * Thrown when an operation targets a tenant that is not in the ACTIVE state
 * (SUSPENDED or ARCHIVED). Used to stop a tenant's traffic cleanly - see
 * prisma/schema.prisma's TenantStatus enum. `status` carries an HTTP status
 * that the API error handler (lib/api/response.ts::handleRouteError) surfaces
 * for 4xx responses.
 */
export class TenantInactiveError extends Error {
  status = 409
  constructor(tenantId: string, status: string) {
    super(`Tenant ${tenantId} is not active (${status})`)
    this.name = 'TenantInactiveError'
  }
}

/**
 * Returns true if the tenant exists and is ACTIVE. A missing tenant is treated
 * as "not usable" (returns false) so callers can fail closed rather than
 * accidentally process traffic for a tenant that no longer resolves.
 */
export async function isTenantActive(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true } })
  return tenant?.status === 'ACTIVE'
}

/**
 * Enforces that a tenant is ACTIVE, throwing TenantInactiveError otherwise.
 * This is the single enforcement point for Tenant.status used by the webhook
 * ingress path, login, and the ingest worker.
 */
export async function assertTenantActive(tenantId: string): Promise<void> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true } })
  if (!tenant || tenant.status !== 'ACTIVE') {
    throw new TenantInactiveError(tenantId, tenant?.status ?? 'UNKNOWN')
  }
}

/**
 * Returns true if the tenant has reached (or exceeded) its optional per-tenant
 * message-volume cap (Tenant.messageCap, null = uncapped). A cap of 0 means the
 * tenant is fully capped (accepts no further messages). Counts billable usage
 * records, so it never double-counts against the idempotent ledger.
 */
export async function isMessageCapReached(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { messageCap: true } })
  if (!tenant || tenant.messageCap == null) return false
  const used = await db.usageRecord.count({ where: { tenantId } })
  return used >= tenant.messageCap
}
