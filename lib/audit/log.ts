import { db } from '@/lib/db/client'

export interface AuditLogInput {
  tenantId?: string | null
  actorUserId?: string | null
  action: string
  resource: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

/** Never pass secrets/tokens/passwords in `metadata` - audit logs are read by managers/CEO_ADMIN. */
export async function writeAuditLog(input: AuditLogInput) {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata as any,
      ipAddress: input.ipAddress ?? null,
    },
  })
}
