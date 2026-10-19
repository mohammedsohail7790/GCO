import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { ok, handleRouteError } from '@/lib/api/response'
import { effectiveRoutes } from '@/lib/notify/service'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'ALERT_ROUTE_MANAGE')
    return ok(await effectiveRoutes())
  } catch (err) {
    return handleRouteError(err)
  }
}

// Only roles that can see operational data may be routed alerts; clients, hunters and operators never are.
const Body = z.object({ role: z.enum(['CEO_ADMIN', 'ASSISTANT', 'MANAGER', 'SUPERVISOR', 'CTO']), minSeverity: z.enum(['critical', 'warning', 'info']), enabled: z.boolean() }).strict()

export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'ALERT_ROUTE_MANAGE')
    const b = Body.parse(await req.json())
    const saved = await db.alertRoute.upsert({ where: { role: b.role }, create: b, update: { minSeverity: b.minSeverity, enabled: b.enabled } })
    await writeAuditLog({ actorUserId: session.sub, action: 'alerts.route_changed', resource: 'alert_route', resourceId: b.role, metadata: { minSeverity: b.minSeverity, enabled: b.enabled } })
    return ok(saved)
  } catch (err) {
    return handleRouteError(err)
  }
}
