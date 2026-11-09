import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { isValidTimezone } from '@/lib/tenant/settings'

const Schema = z.object({ timezone: z.string().max(64).nullable() }).strict()

/** Set the IANA time zone an operator works in (null clears it). Display only: shifts stay stored in UTC. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())
    if (body.timezone !== null && !isValidTimezone(body.timezone)) return fail('Use a time zone name such as "Europe/Rome" or "Asia/Kolkata"', 400)
    // Keep the name as given (resolvedOptions() would turn "Asia/Kolkata" into the legacy "Asia/Calcutta"); only fix the case when it
    // matches a listed zone ("europe/rome" -> "Europe/Rome").
    const timezone = body.timezone === null ? null : (Intl.supportedValuesOf('timeZone').find((z) => z.toLowerCase() === body.timezone!.toLowerCase()) ?? body.timezone)
    const operator = await db.operator.findUnique({ where: { id } })
    // Tenant scope: a MANAGER/SUPERVISOR can only touch operators of their own tenant (resolveTenantScope refuses others with 403).
    const scope = resolveTenantScope(session, operator?.tenantId ?? null)
    if (!operator || operator.tenantId !== scope) return fail('Operator not found', 404)
    await assertOperatorInTeam(session, id)
    await db.operator.update({ where: { id }, data: { timezone } })
    await writeAuditLog({ tenantId: operator.tenantId, actorUserId: session.sub, action: 'operator.timezone_set', resource: 'operator', resourceId: id, metadata: { timezone } })
    return ok({ id, timezone })
  } catch (err) {
    return handleRouteError(err)
  }
}
