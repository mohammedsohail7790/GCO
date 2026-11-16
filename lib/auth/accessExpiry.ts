import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'

/**
 * Disables any active account whose time-limited privileged access (User.accessExpiresAt) has passed. Renewal means
 * extending that date before it passes; immediate revocation is just isActive=false directly and needs no new code.
 * Mirrors lib/crm/leads.ts::releaseExpiredLeads: find a small batch, act on each independently, never let one failure
 * stop the rest. Called from workers/index.ts's hourly sweep - an access expiry has none of the SLA-timer urgency a
 * live conversation assignment does, so an hourly check is deliberately coarse, not a bug.
 */
export async function expirePrivilegedAccess(now = new Date(), batch = 100): Promise<number> {
  const due = await db.user.findMany({
    where: { isActive: true, accessExpiresAt: { lt: now } },
    select: { id: true, email: true, role: true, tenantId: true },
    take: batch,
  })
  let expired = 0
  for (const u of due) {
    try {
      await db.$transaction([
        db.user.update({ where: { id: u.id, isActive: true }, data: { isActive: false } }),
        db.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } }),
      ])
      await writeAuditLog({ tenantId: u.tenantId, actorUserId: null, action: 'auth.access_expired', resource: 'user', resourceId: u.id, metadata: { role: u.role, email: u.email } })
      expired++
    } catch {
      /* already disabled or changed between query and update - leave it, the next sweep will reconcile */
    }
  }
  return expired
}
