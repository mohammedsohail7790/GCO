import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { writeAuditLog } from '@/lib/audit/log'
import { getAdapter } from '@/lib/integrations/registry'
import { isIntegrationVerified, readVerification, recordVerification } from '@/lib/integrations/verification'

/**
 * CEO-only. Sends a signed, content-free ping to the client's endpoint (outbound proof). The INBOUND proof is the
 * client's own signed ping to the integration's webhook URL (accepted even while the integration is staged DISABLED).
 * Creates no conversation, message or customer-visible traffic. The secret is never returned or logged.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'INTEGRATION_MANAGE')
    const { id } = await params
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)

    const integration = await db.integration.findUnique({ where: { id } })
    if (!integration) return fail('Integration not found', 404)
    const adapter = getAdapter(integration.adapterKey)
    if (!adapter.verifyOutbound) return fail('This adapter does not support verification', 409, 'VERIFICATION_NOT_SUPPORTED')

    const result = await adapter.verifyOutbound((integration.config ?? {}) as Record<string, unknown>, {
      integrationId: integration.id,
      tenantId: integration.tenantId,
      secret: integration.webhookSecret,
    })
    if (result.ok) await recordVerification(integration.id, 'outbound')
    await writeAuditLog({
      tenantId: integration.tenantId,
      actorUserId: session.sub,
      action: 'integration.verify_outbound',
      resource: 'integration',
      resourceId: integration.id,
      metadata: { ok: result.ok, category: result.category ?? null, latencyMs: result.latencyMs ?? null },
    })

    const fresh = await db.integration.findUniqueOrThrow({ where: { id }, select: { config: true, adapterKey: true } })
    const v = readVerification(fresh.config)
    return ok({
      outbound: { ok: result.ok, category: result.category ?? null, latencyMs: result.latencyMs ?? null },
      outboundVerifiedAt: v.outboundAt ?? null,
      inboundVerifiedAt: v.inboundAt ?? null,
      verified: isIntegrationVerified(fresh.adapterKey, fresh.config),
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
