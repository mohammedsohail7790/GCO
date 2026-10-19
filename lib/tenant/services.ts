import type { Industry, ServiceType } from '@prisma/client'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { INDUSTRY_TEMPLATES, resolveWorkspace } from './templates'

export interface TenantServicesView {
  industry: Industry | null
  services: { serviceType: ServiceType; enabled: boolean; config: unknown }[]
  workspace: ReturnType<typeof resolveWorkspace>
}

export async function getTenantServices(tenantId: string): Promise<TenantServicesView | null> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, include: { services: { orderBy: { serviceType: 'asc' } } } })
  if (!t) return null
  const enabled = t.services.filter((s) => s.enabled).map((s) => s.serviceType)
  return {
    industry: t.industry,
    services: t.services.map((s) => ({ serviceType: s.serviceType, enabled: s.enabled, config: s.config })),
    workspace: resolveWorkspace(t.industry, enabled),
  }
}

/**
 * Idempotent: sets the industry and the exact set of purchased services (others are switched off, never deleted,
 * so configuration survives a pause). With `applyIndustryDefaults` the industry's SLA/capacity are written only
 * to a tenant still on the platform defaults - an existing, deliberately tuned client is never overwritten.
 */
export async function setTenantServices(input: {
  tenantId: string
  industry: Industry | null
  services: ServiceType[]
  actorUserId: string | null
  applyIndustryDefaults?: boolean
}): Promise<TenantServicesView> {
  const wanted = new Set(input.services)
  const before = await getTenantServices(input.tenantId)
  await db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: input.tenantId }, data: { industry: input.industry } })
    for (const serviceType of wanted) {
      await tx.tenantService.upsert({
        where: { tenantId_serviceType: { tenantId: input.tenantId, serviceType } },
        create: { tenantId: input.tenantId, serviceType, enabled: true },
        update: { enabled: true },
      })
    }
    await tx.tenantService.updateMany({ where: { tenantId: input.tenantId, serviceType: { notIn: [...wanted] } }, data: { enabled: false } })
    if (input.applyIndustryDefaults && input.industry) {
      const tpl = INDUSTRY_TEMPLATES[input.industry]
      // Only while still on the schema defaults (SLA 120 s, capacity 2).
      await tx.tenant.updateMany({
        where: { id: input.tenantId, defaultResponseSlaSeconds: 120, defaultOperatorCapacity: 2 },
        data: { defaultResponseSlaSeconds: tpl.responseSlaSeconds, defaultOperatorCapacity: tpl.operatorCapacity },
      })
    }
  })
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: 'tenant.services_changed',
    resource: 'tenant',
    resourceId: input.tenantId,
    metadata: {
      industry: { before: before?.industry ?? null, after: input.industry },
      enabled: { before: before?.services.filter((s) => s.enabled).map((s) => s.serviceType) ?? [], after: [...wanted] },
    },
  })
  return (await getTenantServices(input.tenantId))!
}
