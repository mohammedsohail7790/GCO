import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { writeAuditLog } from '@/lib/audit/log'
import { isProductionAdapter } from '@/lib/integrations/registry'
import { clearVerification } from '@/lib/integrations/verification'

// Moves an integration between the client's SANDBOX and PRODUCTION environments. Only a PRODUCTION integration can be activated by the
// go-live, and a change here always clears earlier verification, so the new target must be proven again before anyone goes live.
// Promoting needs the typed confirmation "production" so it cannot happen by a stray click or a scripted default.
const Schema = z.object({
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  confirm: z.string().max(20).optional(),
}).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'INTEGRATION_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)

    const integ = await db.integration.findUnique({ where: { id }, select: { id: true, tenantId: true, adapterKey: true, status: true, environment: true } })
    if (!integ) return fail('Integration not found', 404)
    if (integ.environment === body.environment) return ok({ id, environment: integ.environment, changed: false })

    if (body.environment === 'PRODUCTION') {
      if (!isProductionAdapter(integ.adapterKey)) return fail('A development adapter simulates delivery and can never be PRODUCTION', 409, 'SIMULATION_CANNOT_BE_PRODUCTION')
      if (body.confirm?.trim().toLowerCase() !== 'production') return fail('Type "production" to confirm the integration now points at the client\'s production environment', 400, 'CONFIRMATION_REQUIRED')
    } else if (integ.status === 'ACTIVE') {
      return fail('This integration is live. Disable it before moving it back to SANDBOX', 409, 'INTEGRATION_ACTIVE')
    }

    await db.integration.update({ where: { id }, data: { environment: body.environment } })
    await clearVerification(id) // the target changed: connectivity must be proven again for the new environment
    await writeAuditLog({
      tenantId: integ.tenantId,
      actorUserId: session.sub,
      action: 'integration.environment_changed',
      resource: 'integration',
      resourceId: id,
      metadata: { from: integ.environment, to: body.environment },
    })
    return ok({ id, environment: body.environment, changed: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
