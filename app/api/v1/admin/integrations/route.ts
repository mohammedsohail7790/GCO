import { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, created, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { listAdapterKeys } from '@/lib/integrations/registry'

// Same permission the existing webhook-secret rotation route already gates
// on (INTEGRATION_MANAGE: ['CEO_ADMIN']) - no new permission invented, and
// no weaker parallel access path for this same class of secret-adjacent
// data. Manager does not have INTEGRATION_MANAGE today, so this endpoint
// does not grant Manager integration access either, consistent with the
// confirmed policy that CRM-management permissions never imply
// integration-secret access.
const PERMISSION = 'INTEGRATION_MANAGE'

// Every field a caller can set on creation. `status` defaults to ACTIVE but
// may be created DISABLED for staged provisioning (client access arranged
// before the integration is allowed to receive live traffic) - this reuses
// the existing IntegrationStatus enum rather than adding a new field or a
// separate enable/disable route, which Phase 11 scope deliberately excludes
// unless required for safe provisioning (see docs/client-tenant-provisioning.md).
const CreateSchema = z.object({
  tenantId: z.string().min(1),
  adapterKey: z.string().min(1),
  name: z.string().min(1).max(200),
  config: z.record(z.unknown()).default({}),
  status: z.enum(['ACTIVE', 'DISABLED', 'DEGRADED']).default('ACTIVE'),
  // Same optional-secret pattern as the existing rotation endpoint: supply a
  // secret issued by the client's own platform, or omit it to have GCO
  // generate a strong random one. Either way it is returned exactly once,
  // in this response only.
  secret: z.string().min(16).max(200).optional(),
})

// Safe fields only - webhookSecret and secretRef are never selected into any
// ordinary read, matching the discipline already established in
// app/api/v1/admin/integrations/[id]/webhook-secret/route.ts and the schema
// comment on Integration.webhookSecret itself.
const SAFE_SELECT = {
  id: true,
  tenantId: true,
  adapterKey: true,
  name: true,
  status: true,
  config: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, slug: true } },
} as const

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, PERMISSION)
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')

    const integrations = await db.integration.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    })

    return ok(integrations)
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, PERMISSION)
    const body = CreateSchema.parse(await req.json())

    if (
      await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    const tenant = await db.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true } })
    if (!tenant) return fail('Tenant not found', 404, 'TENANT_NOT_FOUND')

    // Fails closed on an unregistered/misspelled adapter key rather than
    // persisting an integration that will only fail once a real webhook
    // arrives and lib/integrations/registry.ts::getAdapter() throws deep
    // inside the ingestion pipeline.
    const knownKeys = listAdapterKeys()
    if (!knownKeys.includes(body.adapterKey)) {
      return fail(`Unknown adapterKey "${body.adapterKey}" - no adapter registered for it`, 400, 'UNKNOWN_ADAPTER_KEY')
    }

    const secret = body.secret ?? crypto.randomBytes(32).toString('hex')

    const integration = await db.integration.create({
      data: {
        tenantId: body.tenantId,
        adapterKey: body.adapterKey,
        name: body.name,
        config: body.config as any,
        status: body.status,
        webhookSecret: secret,
      },
      select: SAFE_SELECT,
    })

    await writeAuditLog({
      tenantId: body.tenantId,
      actorUserId: session.sub,
      action: 'integration.create',
      resource: 'integration',
      resourceId: integration.id,
      // Never the secret value itself - only that one was set, and by whom.
      metadata: { adapterKey: body.adapterKey, name: body.name, status: body.status },
    })

    // The secret is returned exactly once, on this response only - the same
    // one-time-disclosure boundary the rotation endpoint already uses.
    // Every other read of this integration (GET above, or any future route)
    // uses SAFE_SELECT and can never return it.
    return created({ ...integration, webhookSecret: secret })
  } catch (err) {
    return handleRouteError(err)
  }
}
