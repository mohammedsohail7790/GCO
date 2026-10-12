import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isValidTimezone, validateOperatingHours } from '@/lib/tenant/settings'

const view = (t: { id: string; name: string; defaultResponseSlaSeconds: number; defaultOperatorCapacity: number; timezone: string; operatingHours: unknown }) => ({
  tenantId: t.id, name: t.name, responseSlaSeconds: t.defaultResponseSlaSeconds, operatorCapacity: t.defaultOperatorCapacity, timezone: t.timezone, operatingHours: t.operatingHours,
})

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TENANT_SETTINGS_VIEW')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    const t = await db.tenant.findUnique({ where: { id: tenantId } })
    if (!t) return fail('Tenant not found', 404)
    return ok(view(t))
  } catch (err) {
    return handleRouteError(err)
  }
}

const Patch = z
  .object({
    tenantId: z.string().max(100).optional(),
    responseSlaSeconds: z.number().int().min(30).max(3600).optional(),
    operatorCapacity: z.number().int().min(1).max(20).optional(),
    timezone: z.string().max(64).optional(),
    operatingHours: z.unknown().optional(),
  })
  .strict()

// Changes how a client is served (deadlines, default capacity, hours): CEO/assistant only, audited with old -> new values.
export async function PATCH(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TENANT_SETTINGS_MANAGE')
    const body = Patch.parse(await req.json())
    const tenantId = resolveTenantScope(session, body.tenantId ?? null)
    const t = await db.tenant.findUnique({ where: { id: tenantId } })
    if (!t) return fail('Tenant not found', 404)
    if (body.timezone !== undefined && !isValidTimezone(body.timezone)) return fail('Unknown timezone (use an IANA name such as Europe/Dublin)', 400)
    if ('operatingHours' in body) {
      const err = validateOperatingHours(body.operatingHours)
      if (err) return fail(err, 400)
    }
    const data = {
      ...(body.responseSlaSeconds !== undefined ? { defaultResponseSlaSeconds: body.responseSlaSeconds } : {}),
      ...(body.operatorCapacity !== undefined ? { defaultOperatorCapacity: body.operatorCapacity } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...('operatingHours' in body ? { operatingHours: (body.operatingHours ?? null) as never } : {}),
    }
    if (Object.keys(data).length === 0) return fail('Nothing to change', 400)
    const updated = await db.tenant.update({ where: { id: tenantId }, data })
    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: 'tenant.settings_changed',
      resource: 'tenant',
      resourceId: tenantId,
      metadata: { changed: Object.keys(data), before: { sla: t.defaultResponseSlaSeconds, capacity: t.defaultOperatorCapacity, timezone: t.timezone }, after: { sla: updated.defaultResponseSlaSeconds, capacity: updated.defaultOperatorCapacity, timezone: updated.timezone } },
    })
    return ok(view(updated))
  } catch (err) {
    return handleRouteError(err)
  }
}
